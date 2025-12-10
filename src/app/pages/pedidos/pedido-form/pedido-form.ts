import { Component, OnInit, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule, FormControl } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { of } from 'rxjs';

// Material Modules
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete'; // <--- Nuevo
import { MatChipsModule } from '@angular/material/chips'; // <--- Nuevo

// Servicios y Modelos
import { ApiClientService } from '../../../core/api-client.service';
import { Pedido, Cliente, Sucursal, PedidoEvidencia } from '../../../core/models';
import { A11yModule } from "@angular/cdk/a11y";

interface FotoPreview {
  file?: File;
  url: string;
  id?: string; // Si ya existe en BD
}

@Component({
  selector: 'app-pedido-form',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatIconModule, MatDatepickerModule, MatNativeDateModule,
    MatSnackBarModule, MatProgressSpinnerModule, MatSelectModule,
    MatAutocompleteModule, MatChipsModule,
    A11yModule
],
  templateUrl: './pedido-form.html',
  styleUrls: ['./pedido-form.scss']
})
export class PedidoFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(ApiClientService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private snack = inject(MatSnackBar);
  public location = inject(Location);

  // Estados
  loading = signal<boolean>(false);
  saving = signal<boolean>(false);
  isEdit = signal<boolean>(false);
  pedidoId = signal<string | null>(null);
  
  // Datos
  sucursales = signal<Sucursal[]>([]);
  clientesFiltrados = signal<Cliente[]>([]);
  fotos = signal<FotoPreview[]>([]); // Lista de fotos (nuevas y existentes)
  
  // Cliente seleccionado del autocompletado
  selectedCliente = signal<Cliente | null>(null);

  // Estados del pedido para la UI
  readonly ESTADOS = ['recibido', 'lavando', 'listo', 'entregado', 'cancelado'];

  form = this.fb.group({
    // Cliente
    cliente_nombre: ['', Validators.required],
    cliente_telefono: ['', [Validators.required, Validators.minLength(10)]],
    cliente_id: [''],

    // Pedido
    sucursal_id: ['', Validators.required],
    descripcion: ['', ],
    monto_total: [null as number | null],
    saldo_pendiente: [null as number | null],
    fecha_entrega_estimada: [new Date(), Validators.required],
    estado: ['recibido'],
    
    // Nota global para evidencias nuevas
    evidencia_nota: [''] 
  });

  titulo = computed(() => this.isEdit() ? `Editar Pedido` : 'Nuevo Pedido');

  constructor() {
    // Escuchar cambios en el nombre para autocompletar
    this.form.get('cliente_nombre')?.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap(val => {
          if (!val || typeof val !== 'string') return of([]);
          return this.api.listClientes({ q: val, limit: 5 });
        })
      )
      .subscribe(data => this.clientesFiltrados.set(data));

    // Escuchar cambios en teléfono para validar existencia
    this.form.get('cliente_telefono')?.valueChanges
      .pipe(
        debounceTime(500),
        distinctUntilChanged(),
        switchMap(val => {
          if (!val || val.length < 10) return of([]);
          // Buscamos si existe alguien con ese teléfono
          return this.api.listClientes({ q: val, limit: 1 });
        })
      )
      .subscribe(matches => {
        // Si encontramos un cliente por teléfono y NO hemos seleccionado uno explícitamente
        if (matches.length > 0 && !this.selectedCliente()) {
          const c = matches[0];
          this.snack.open(`El cliente ${c.nombre} ya existe con este número.`, 'Usar', { duration: 5000 })
            .onAction().subscribe(() => this.selectCliente(c));
        }
      });
  }

  async ngOnInit() {
    await this.loadSucursales();

    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'nuevo') {
      this.isEdit.set(true);
      this.pedidoId.set(id);
      await this.loadPedido(id);
    } else {
      // Default: sucursal 1 y fecha +3 días
      if (this.sucursales().length) this.form.patchValue({ sucursal_id: this.sucursales()[0].id });
      const f = new Date(); f.setDate(f.getDate() + 3);
      this.form.patchValue({ fecha_entrega_estimada: f });
    }
  }

  // --- LOGICA CLIENTES ---

  displayCliente(cliente: Cliente): string {
    return cliente && cliente.nombre ? cliente.nombre : '';
  }

  selectCliente(c: Cliente) {
    this.selectedCliente.set(c);
    this.form.patchValue({
      cliente_nombre: c.nombre,
      cliente_telefono: c.telefono,
      cliente_id: c.id
    });
    // Bloqueamos edición rápida para no corromper datos del cliente accidentalmente
    // (Si quieren editar cliente, mejor ir a la sección clientes)
    this.form.controls.cliente_nombre.disable(); 
    this.form.controls.cliente_telefono.disable();
  }

  clearCliente() {
    this.selectedCliente.set(null);
    this.form.patchValue({ cliente_nombre: '', cliente_telefono: '', cliente_id: '' });
    this.form.controls.cliente_nombre.enable();
    this.form.controls.cliente_telefono.enable();
  }

  // --- LOGICA FOTOS ---

  onFileSelected(event: any) {
    const files = event.target.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        reader.onload = (e: any) => {
          this.fotos.update(prev => [...prev, {
            file: file,
            url: e.target.result
          }]);
        };
        reader.readAsDataURL(file);
      }
    }
  }

  async removeFoto(index: number) {
    const foto = this.fotos()[index];

    // CASO A: Es una foto YA guardada en el servidor (tiene ID)
    if (foto.id && this.pedidoId()) {
      
      const confirmacion = confirm('¿Eliminar esta evidencia permanentemente?');
      if (!confirmacion) return;

      this.loading.set(true); // Bloqueamos un poco la UI para evitar doble click
      try {
        await this.api.deleteEvidencia(this.pedidoId()!, foto.id);
        
        this.snack.open('Evidencia eliminada', 'OK', { duration: 2000 });
        
        // Actualizamos la lista visualmente quitando el elemento
        this.fotos.update(prev => prev.filter((_, i) => i !== index));
        
      } catch (e: any) {
        this.snack.open('Error al eliminar evidencia', 'Cerrar');
      } finally {
        this.loading.set(false);
      }

    } else {
      // CASO B: Es una foto nueva (local) que aún no se guarda
      // Simplemente la sacamos del array
      this.fotos.update(prev => prev.filter((_, i) => i !== index));
    }
  }

  // --- CARGA DE DATOS ---

  async loadSucursales() {
    try { this.sucursales.set(await this.api.listSucursales({ activo: 1 })); } catch {}
  }

  async loadPedido(id: string) {
    this.loading.set(true);
    try {
      // 1. Cargar Pedido
      // (Usamos listPedidos porque no tenemos getById, idealmente crear getPedido(id))
      const lista = await this.api.listPedidos({ limit: 1000, q: '' }); 
      const p = lista.find(x => x.id === id);
      
      if (!p) throw new Error('Pedido no encontrado');

      // 2. Cargar Evidencias existentes
      const evidencias = await this.api.listEvidencias(id);
      
      // 3. Patch Formulario
      this.form.patchValue({
        cliente_nombre: p.cliente_nombre,
        cliente_telefono: p.cliente_telefono,
        cliente_id: p.cliente_id,
        sucursal_id: p.sucursal_id,
        descripcion: p.descripcion,
        monto_total: Number(p.monto_total),
        saldo_pendiente: Number(p.saldo_pendiente),
        fecha_entrega_estimada: p.fecha_entrega_estimada ? new Date(p.fecha_entrega_estimada + 'T00:00:00') : new Date(),
        estado: p.estado
      });

      // Si tiene cliente ID, simulamos selección
      if (p.cliente_id) {
        this.selectedCliente.set({ id: p.cliente_id, nombre: p.cliente_nombre || '', telefono: p.cliente_telefono || '', permite_whatsapp: true, frecuencia_recordatorio: 0 }); // Mock parcial para UI
        this.form.controls.cliente_nombre.disable();
        this.form.controls.cliente_telefono.disable();
      }

      // 4. Cargar fotos al estado
      const fotosExistentes: FotoPreview[] = evidencias.map(e => ({
        url: e.url,
        id: e.id
      }));
      this.fotos.set(fotosExistentes);

    } catch (e) {
      this.snack.open('Error al cargar pedido', 'Cerrar');
      this.location.back();
    } finally {
      this.loading.set(false);
    }
  }

  // --- GUARDADO ---

  async save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);

    try {
      const v = this.form.getRawValue();
      let clientId = v.cliente_id;

      // 1. Si no hay ID de cliente, creamos uno nuevo
      if (!clientId) {
        const nuevoCliente = await this.api.createCliente({
          nombre: v.cliente_nombre,
          telefono: v.cliente_telefono,
          permite_whatsapp: true
        });
        clientId = nuevoCliente.id;
      }

      // 2. Preparar payload del pedido
      const payload: any = {
        cliente_id: clientId,
        sucursal_id: v.sucursal_id,
        descripcion: v.descripcion,
        monto_total: v.monto_total,
        saldo_pendiente: v.saldo_pendiente, // Guardamos saldo también
        fecha_entrega_estimada: v.fecha_entrega_estimada ? new Date(v.fecha_entrega_estimada).toISOString().split('T')[0] : null,
        estado: v.estado
      };

      let pedidoId = this.pedidoId();

      // 3. Crear o Actualizar Pedido
      if (this.isEdit() && pedidoId) {
        await this.api.updatePedido(pedidoId, payload);
        this.snack.open('Pedido actualizado', 'OK', { duration: 2000 });
      } else {
        const nuevo = await this.api.createPedido(payload);
        pedidoId = nuevo.id;
        this.snack.open('Pedido generado con folio: ' + nuevo.folio, 'OK', { duration: 3000 });
      }

      // 4. Subir Fotos Nuevas (Las que tienen propiedad 'file')
      const nuevasFotos = this.fotos().filter(f => f.file);
      if (pedidoId && nuevasFotos.length > 0) {
        const uploads = nuevasFotos.map(f => 
          this.api.uploadEvidencia(pedidoId!, f.file!, 'ingreso', v.evidencia_nota || '')
        );
        await Promise.all(uploads);
      }

      this.router.navigateByUrl('/pedidos');

    } catch (e: any) {
      console.error(e);
      this.snack.open('Error: ' + (e.message || 'Ocurrió un problema'), 'Cerrar');
    } finally {
      this.saving.set(false);
    }
  }

  // Helper para estado visual
  setStatus(estado: string) {
    this.form.patchValue({ estado });
  }
}