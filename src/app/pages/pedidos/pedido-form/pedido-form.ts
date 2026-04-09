import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule, FormControl } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { of, firstValueFrom } from 'rxjs';

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
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete'; // <--- Nuevo
import { MatChipsModule } from '@angular/material/chips'; // <--- Nuevo

// Servicios y Modelos
import { ApiClientService } from '../../../core/api-client.service';
import { Cliente, Sucursal } from '../../../core/models';
import { A11yModule } from "@angular/cdk/a11y";
import { EntregaDialogComponent, EntregaDialogResult } from '../entrega-dialog.component';
import { AccionPedidoDialogComponent, AccionPedidoDialogData } from '../accion-pedido-dialog.component';

interface FotoPreview {
  file?: File;
  url: string;
  id?: string;
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
    A11yModule, MatDialogModule
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
  private dialog = inject(MatDialog);
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

  // Para guardar el folio y usarlo en el mensaje
  currentFolio = signal<string>('');

  // Estados del pedido para la UI
  readonly ESTADOS = ['recibido', 'lavando', 'secando', 'doblando', 'listo', 'entregado', 'cancelado'];

  form = this.fb.group({
    // Cliente
    cliente_nombre: ['', Validators.required],
    cliente_telefono: ['', [Validators.required, Validators.minLength(10)]],
    cliente_id: [''],

    // Pedido
    sucursal_id: ['', Validators.required],
    descripcion: ['',],
    monto_total: [0],
    saldo_pendiente: [0],

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
          if (!val || typeof val !== 'string') return of({ data: [], count: 0 });
          return this.api.listClientes({ q: val, limit: 5 });
        })
      )
      .subscribe(res => this.clientesFiltrados.set(res.data));

    // Escuchar cambios en teléfono para validar existencia
    this.form.get('cliente_telefono')?.valueChanges
      .pipe(
        debounceTime(500),
        distinctUntilChanged(),
        switchMap(val => {
          if (!val || val.length < 10) return of({ data: [], count: 0 });
          // Buscamos si existe alguien con ese teléfono
          return this.api.listClientes({ q: val, limit: 1 });
        })
      )
      .subscribe(res => {
        // Si encontramos un cliente por teléfono y NO hemos seleccionado uno explícitamente
        if (res.data.length > 0 && !this.selectedCliente()) {
          const c = res.data[0];
          // Autocompletamos instantáneamente en lugar de arrojar una alerta
          this.selectCliente(c);
          this.snack.open(`Cliente vinculado con exito`, 'Cerrar', { duration: 3000 });
        }
      });

    this.form.get('monto_total')?.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe((val) => {
        // Al escribir el total, sugerimos el mismo valor como saldo pendiente
        if (val) {
          this.form.get('saldo_pendiente')?.setValue(val, { emitEvent: false });
        }
      });
  }

  // --- LÓGICA DE PROMOCIÓN Y LEALTAD ---

  // Progreso del cliente en el ciclo de 4 servicios (0-3)
  get serviciosEnCiclo(): number {
    return (this.selectedCliente()?.contador_servicios ?? 0) % 4;
  }

  get proximaGanancia(): number {
    return this.serviciosEnCiclo === 3 ? 30 : 10;
  }

  get promoProgressPercent(): number {
    return (this.serviciosEnCiclo / 4) * 100;
  }

  // Toggle: cambia apto_promociones del cliente en tiempo real
  async toggleAptitudPromo(nuevoValor: boolean) {
    const c = this.selectedCliente();
    if (!c?.id) return;
    try {
      const updated = await this.api.updateCliente(c.id, { apto_promociones: nuevoValor });
      // Fusionamos con el cliente actual para mantener el resto de sus datos (monedero, etc)
      this.selectedCliente.set({ ...c, ...updated });
      this.snack.open(
        nuevoValor ? 'Cliente inscrito en el programa de lealtad' : 'Cliente excluido del programa de lealtad',
        'OK', { duration: 3000 }
      );
    } catch {
      this.snack.open('Error al actualizar el estado de lealtad', 'Cerrar');
    }
  }

  async ngOnInit() {
    await this.loadSucursales();

    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'nuevo') {
      this.isEdit.set(true);
      this.pedidoId.set(id);
      this.form.controls.saldo_pendiente.disable(); // El motor bidireccional se encargará de esto en edición
      await this.loadPedido(id);
    } else {
      // Default: sucursal 1 y fecha +3 días
      if (this.sucursales().length) this.form.patchValue({ sucursal_id: this.sucursales()[0].id });
      const f = new Date(); f.setDate(f.getDate() + 3);
      this.form.patchValue({ fecha_entrega_estimada: f });
    }
  }

  // --- LOGICA CLIENTES ---

  displayCliente(cliente: any): string {
    // Angular Material le pasará el objeto del evento OptionSelected, o un string si se patchea
    if (typeof cliente === 'string') return cliente;
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
    try { this.sucursales.set(await this.api.listSucursales({ activo: 1 })); } catch { }
  }

  async loadPedido(id: string) {
    this.loading.set(true);
    try {
      // 1. Cargar Pedido
      // (Usamos listPedidos porque no tenemos getById, idealmente crear getPedido(id))
      const lista = await this.api.listPedidos({ limit: 1000, q: '' });
      const p = lista.find(x => x.id === id);

      if (!p) throw new Error('Pedido no encontrado');

      // Guardamos el folio en la señal
      this.currentFolio.set(p.folio || '');

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
      }, { emitEvent: false });

      // Si tiene cliente ID, cargamos sus datos completos para obetner monedero
      if (p.cliente_id) {
        try {
          // Necesitamos el monedero real
          const clienteRes = await this.api.listClientes({ q: p.cliente_nombre || '', limit: 1 });
          const clienteReal = clienteRes.data.find(c => c.id === p.cliente_id);
          if (clienteReal) {
            this.selectedCliente.set(clienteReal);
          } else {
            this.selectedCliente.set({ id: p.cliente_id, nombre: p.cliente_nombre || '', telefono: p.cliente_telefono || '', permite_whatsapp: true, frecuencia_recordatorio: 0, monedero: 0 });
          }
        } catch {
          this.selectedCliente.set({ id: p.cliente_id, nombre: p.cliente_nombre || '', telefono: p.cliente_telefono || '', permite_whatsapp: true, frecuencia_recordatorio: 0, monedero: 0 });
        }

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

      // 1. Crear Cliente si no existe
      if (!clientId) {
        const nuevoCliente = await this.api.createCliente({
          nombre: v.cliente_nombre || '',
          telefono: v.cliente_telefono || '',
          permite_whatsapp: true,
          apto_promociones: false // Por defecto inicia inactivo al crear cliente rápido
        });
        clientId = nuevoCliente.id;
      }

      // 2. Payload
      const payload: any = {
        cliente_id: clientId,
        cliente_nombre: v.cliente_nombre, // Importante para el mensaje
        sucursal_id: v.sucursal_id,
        descripcion: v.descripcion,
        monto_total: v.monto_total,
        saldo_pendiente: v.saldo_pendiente,
        fecha_entrega_estimada: v.fecha_entrega_estimada ? new Date(v.fecha_entrega_estimada).toISOString().split('T')[0] : null,
        estado: v.estado
      };

      let pedidoId = this.pedidoId();
      let folioFinal = this.currentFolio(); // Usamos el que ya teníamos

      // 3. Guardar / Actualizar
      if (this.isEdit() && pedidoId) {
        await this.api.updatePedido(pedidoId, payload);
      } else {
        const nuevo = await this.api.createPedido(payload);
        pedidoId = nuevo.id;
        folioFinal = nuevo.folio || ''; // Si es nuevo, tomamos el folio generado
      }

      // 4. Subir Fotos
      const nuevasFotos = this.fotos().filter(f => f.file);
      if (pedidoId && nuevasFotos.length > 0) {
        const uploads = nuevasFotos.map(f =>
          this.api.uploadEvidencia(pedidoId!, f.file!, 'ingreso', v.evidencia_nota || '')
        );
        await Promise.all(uploads);
      }

      // --- LOGICA DE NOTIFICACIONES Y FLUJO ---

      const esEntregado = v.estado === 'entregado';
      const esListo = v.estado === 'listo';
      const montoTotal = Number(v.monto_total) || 0;
      const saldoPend = Number(v.saldo_pendiente) || 0;
      const anticipo = montoTotal - saldoPend;
      const nombreCliente = v.cliente_nombre || 'Cliente';
      const telefonoCliente = v.cliente_telefono || '';
      const todayShort = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });
      const detalleStr = payload.descripcion ? `(${payload.descripcion})` : `(Folio: ${folioFinal})`;

      // CASO 1: ENTREGADO -> Diálogo obligatorio para decidir cobro o deuda
      if (esEntregado && saldoPend > 0) {
        const dialogRef = this.dialog.open(EntregaDialogComponent, {
          data: {
            nombreCliente,
            folio: folioFinal,
            saldoPendiente: saldoPend,
            montoTotal: montoTotal
          },
          disableClose: true,
          width: '400px'
        });

        const resultado: EntregaDialogResult | undefined = await firstValueFrom(dialogRef.afterClosed());

        if (resultado === 'registrar') {
          // Buscar movimiento existente (anticipo previo)
          const movs = await this.api.listMovimientos({ pedido_id: pedidoId });
          if (movs && movs.length > 0) {
            const targetMov = movs[0];
            const oldNota = targetMov.nota ? targetMov.nota : `Pedido ${nombreCliente} ${detalleStr}`;
            const nuevaNota = `${oldNota} | Liquidacion: $${saldoPend.toFixed(2)} (${todayShort})`;
            const globalTotal = Number(targetMov.monto) + saldoPend;

            this.router.navigate(['/movimientos', targetMov.id], {
              queryParams: {
                monto: globalTotal.toFixed(2),
                nota: nuevaNota
              }
            });
          } else {
            // Obtener categoría de ingreso por defecto
            const cats = await this.api.listCategorias('ingreso');
            const catId = cats.length > 1 ? cats[1].id : (cats.length > 0 ? cats[0].id : undefined);
            this.router.navigate(['/movimientos/nuevo'], {
              queryParams: {
                monto: saldoPend.toFixed(2),
                descripcion: `Pedido ${nombreCliente} ${detalleStr}. Liquidacion: $${saldoPend.toFixed(2)} (${todayShort})`,
                tipo: 'ingreso',
                cliente_id: clientId,
                pedido_id: pedidoId,
                sucursal_id: v.sucursal_id || undefined,
                categoria_id: catId
              }
            });
          }
        } else {
          // 'deuda' o cerrado sin selección → queda en deudas automáticamente
          this.snack.open('Pedido entregado. El saldo pendiente quedó registrado en Deudas.', 'OK', { duration: 4000 });
          this.router.navigateByUrl('/pedidos');
        }

        // CASO 2: NUEVO PEDIDO CON ANTICIPO -> Diálogo obligatorio
      } else if (!this.isEdit() && anticipo > 0) {
        const acciones: any[] = [
          { texto: 'Registrar Ingreso', icono: 'payments', valor: 'registrar', color: 'primary' }
        ];
        if (telefonoCliente) {
          acciones.push({ texto: 'Avisar por WhatsApp', icono: 'chat', valor: 'whatsapp', color: 'whatsapp' });
        }

        const dialogRef = this.dialog.open(AccionPedidoDialogComponent, {
          data: {
            titulo: '¡Pedido Guardado!',
            mensaje: `Pedido ${folioFinal} creado con abono de $${anticipo.toFixed(2)}. ¿Qué deseas hacer?`,
            acciones
          } as AccionPedidoDialogData,
          disableClose: true,
          width: '400px'
        });

        const resultado = await firstValueFrom(dialogRef.afterClosed());

        if (resultado === 'registrar') {
          const cats = await this.api.listCategorias('ingreso');
          const catId = cats.length > 1 ? cats[1].id : (cats.length > 0 ? cats[0].id : undefined);
          this.router.navigate(['/movimientos/nuevo'], {
            queryParams: {
              monto: anticipo.toFixed(2),
              descripcion: `Pedido ${nombreCliente} ${detalleStr}. Anticipo: $${anticipo.toFixed(2)} (${todayShort})`,
              tipo: 'ingreso',
              cliente_id: clientId,
              pedido_id: pedidoId,
              sucursal_id: v.sucursal_id || undefined,
              categoria_id: catId
            }
          });
        } else if (resultado === 'whatsapp') {
          this.abrirWhatsapp(telefonoCliente, nombreCliente, folioFinal, 'recibido', montoTotal);
          this.router.navigateByUrl('/pedidos');
        } else {
          this.router.navigateByUrl('/pedidos');
        }

        // CASO 3: LISTO -> Diálogo obligatorio para WhatsApp
      } else if (esListo) {
        const acciones: any[] = [];
        if (telefonoCliente) {
          acciones.push({ texto: 'Avisar por WhatsApp', icono: 'chat', valor: 'whatsapp', color: 'whatsapp' });
        }

        const dialogRef = this.dialog.open(AccionPedidoDialogComponent, {
          data: {
            titulo: '¡Pedido Listo!',
            mensaje: `El pedido ${folioFinal} para ${nombreCliente} está listo para entregar. ¿Deseas avisarle al cliente?`,
            acciones
          } as AccionPedidoDialogData,
          disableClose: true,
          width: '400px'
        });

        const resultado = await firstValueFrom(dialogRef.afterClosed());

        if (resultado === 'whatsapp') {
          this.abrirWhatsapp(telefonoCliente, nombreCliente, folioFinal, 'listo', montoTotal);
        }
        this.router.navigateByUrl('/pedidos');

        // CASO 4: NUEVO PEDIDO SIN ANTICIPO (recibido) -> Sugerir WhatsApp
      } else if (!this.isEdit() && telefonoCliente) {
        const dialogRef = this.dialog.open(AccionPedidoDialogComponent, {
          data: {
            titulo: '¡Pedido Registrado!',
            mensaje: `Pedido ${folioFinal} creado para ${nombreCliente}. ¿Deseas enviarle confirmación?`,
            acciones: [
              { texto: 'Enviar Confirmación WhatsApp', icono: 'chat', valor: 'whatsapp', color: 'whatsapp' }
            ]
          } as AccionPedidoDialogData,
          disableClose: true,
          width: '400px'
        });

        const resultado = await firstValueFrom(dialogRef.afterClosed());

        if (resultado === 'whatsapp') {
          this.abrirWhatsapp(telefonoCliente, nombreCliente, folioFinal, 'recibido', montoTotal);
        }
        this.router.navigateByUrl('/pedidos');

      } else {
        // CASO 5: OTROS ESTADOS (edición, sin teléfono, etc.)
        const msj = this.isEdit() ? 'Pedido actualizado' : `Pedido generado ${folioFinal}`;
        this.snack.open(msj, 'OK', { duration: 3000 });
        this.router.navigateByUrl('/pedidos');
      }

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

  // --- WhatsApp ---
  private abrirWhatsapp(
    telefono: string,
    nombre: string,
    folio: string,
    estado: string,
    monto: number
  ) {
    if (!telefono) return;
    let msg = '';
    const montoStr = `$${monto.toFixed(2)}`;
    const baseUrl = globalThis.location.origin;
    const urlRastreo = `${baseUrl}/rastreo/${folio}`;

    switch (estado) {
      case 'recibido':
        msg = `Hola *${nombre}* 👋\n\nTu pedido *${folio}* ha sido recibido.\n\nPuedes ver los detalles, saldo y fotos aquí:\n${urlRastreo}\n\n¡Gracias por tu confianza! \n- Lavandería Nano Clean`;
        break;
      case 'listo':
        msg = `¡Hola *${nombre}*! 👋\n\nTu pedido *${folio}* ya está *LISTO* por un total de ${montoStr}\n\nPuedes pasar a recogerlo en un plazo máximo de 2 semanas o tambien puedes solicitar envio a domicilio.\n\n¡Gracias por tu preferencia! 🙏`;
        break;
      case 'entregado':
        msg = `¡Hola *${nombre}*! 👋\n\nGracias por tu preferencia, tu pedido *${folio}* ha sido entregado.\n\n¡Esperamos verte pronto! 🌟`;
        break;
      default:
        msg = `¡Hola *${nombre}*! 👋\n\nTe escribimos de Nano Clean respecto a tu pedido *${folio}*.\n\nTotal: *${montoStr}*\n\n¡Gracias por tu preferencia! 🙏`;
    }

    const tel = telefono.replace(/\D/g, '');
    window.open(`https://api.whatsapp.com/send?phone=${tel}&text=${encodeURIComponent(msg)}`, '_blank');
  }
}