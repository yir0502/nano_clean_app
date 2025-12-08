import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';

// Material
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

// Servicios
import { ApiClientService } from '../../../core/api-client.service';
import { Pedido } from '../../../core/models';

@Component({
  selector: 'app-pedido-form',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, 
    MatButtonModule, MatIconModule, MatDatepickerModule, MatNativeDateModule,
    MatSnackBarModule, MatProgressSpinnerModule
  ],
  templateUrl: './pedido-form.html', // Asegúrate de que este archivo exista
  styleUrls: ['./pedido-form.scss']  // Asegúrate de que este archivo exista
})
export class PedidoFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(ApiClientService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private snack = inject(MatSnackBar);
  public location = inject(Location);

  loading = signal<boolean>(false);
  saving = signal<boolean>(false);
  isEdit = signal<boolean>(false);
  pedidoId = signal<string | null>(null);
  
  // Para la foto de evidencia
  selectedFile: File | null = null;
  previewUrl: string | null = null;

  form = this.fb.group({
    // Datos del Cliente (Manuales por ahora)
    cliente_nombre: ['', Validators.required],
    cliente_telefono: ['', [Validators.required, Validators.minLength(10)]],
    
    // Datos del Pedido
    descripcion: ['', Validators.required],
    monto_total: [0, [Validators.required, Validators.min(1)]],
    fecha_entrega_estimada: [new Date(), Validators.required],
    
    // Evidencia (Nota opcional)
    evidencia_nota: ['']
  });

  titulo = computed(() => this.isEdit() ? 'Editar Pedido' : 'Nuevo Pedido');

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'nuevo') {
      this.isEdit.set(true);
      this.pedidoId.set(id);
      this.loadPedido(id);
    }
  }

  async loadPedido(id: string) {
    this.loading.set(true);
    try {
      // Como no tenemos getById, buscamos en la lista (temporal)
      // Idealmente el backend debería tener un endpoint GET /pedidos/:id
      const lista = await this.api.listPedidos({ limit: 1000 }); 
      const found = lista.find(p => p.id === id);
      
      if (found) {
        this.form.patchValue({
          cliente_nombre: found.cliente_nombre, // Si viene del join
          cliente_telefono: found.cliente_telefono,
          descripcion: found.descripcion,
          monto_total: Number(found.monto_total),
          fecha_entrega_estimada: found.fecha_entrega_estimada ? new Date(found.fecha_entrega_estimada + 'T00:00:00') : new Date()
        });
        // Nota: En edición no permitimos cambiar cliente fácilmente en este flujo simple
        this.form.controls.cliente_nombre.disable(); 
      }
    } catch (e) {
      this.snackBar('Error cargando pedido');
    } finally {
      this.loading.set(false);
    }
  }

  // Selección de archivo
  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      // Crear preview
      const reader = new FileReader();
      reader.onload = () => { this.previewUrl = reader.result as string; };
      reader.readAsDataURL(file);
    }
  }

  async save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);

    const v = this.form.getRawValue();
    // Ajuste de fecha a string YYYY-MM-DD
    const fechaEntrega = v.fecha_entrega_estimada ? new Date(v.fecha_entrega_estimada).toISOString().split('T')[0] : '';

    try {
      let pedidoGuardado: Pedido;

      if (this.isEdit() && this.pedidoId()) {
        // UPDATE
        pedidoGuardado = await this.api.updatePedido(this.pedidoId()!, {
          descripcion: v.descripcion!,
          monto_total: v.monto_total!,
          fecha_entrega_estimada: fechaEntrega
        });
        this.snackBar('Pedido actualizado');
      } else {
        // CREATE
        // Primero necesitamos crear o buscar el cliente en el backend.
        // Como tu requerimiento dice "manual", vamos a enviar los datos 
        // y dejar que el backend (o un paso intermedio) maneje la creación del cliente.
        // **Por simplicidad ahora:** Asumimos que primero creamos el cliente o usamos uno existente.
        
        // HACK TEMPORAL: Para cumplir el requerimiento rápido, creamos el cliente "al vuelo"
        // En producción, esto debería ser un autocompletado.
        const clienteNuevo = await this.api.createCliente({
          nombre: v.cliente_nombre,
          telefono: v.cliente_telefono,
          permite_whatsapp: true 
        });

        pedidoGuardado = await this.api.createPedido({
          cliente_id: clienteNuevo.id, // ID del cliente recién creado
          descripcion: v.descripcion!,
          monto_total: v.monto_total!,
          fecha_entrega_estimada: fechaEntrega,
          estado: 'pendiente'
        });
      }

      // SUBIR EVIDENCIA (Si hay foto)
      if (this.selectedFile && pedidoGuardado.id) {
        await this.api.uploadEvidencia(
          pedidoGuardado.id, 
          this.selectedFile, 
          'ingreso', 
          v.evidencia_nota || 'Foto inicial'
        );
      }

      this.snackBar('Pedido guardado correctamente');
      this.router.navigateByUrl('/pedidos');

    } catch (e: any) {
      console.error(e);
      this.snackBar('Error al guardar: ' + (e.message || 'Desconocido'));
    } finally {
      this.saving.set(false);
    }
  }

  snackBar(msg: string) {
    this.snack.open(msg, 'OK', { duration: 3000 });
  }
}