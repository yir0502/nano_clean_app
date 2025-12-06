import { Component, OnInit, inject, signal, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

// Material Modules
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialog, MAT_DIALOG_DATA, MatDialogTitle, MatDialogContent, MatDialogActions } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip'; // Importante para tooltips
import { MatMenuModule } from '@angular/material/menu';

// Servicios y Componentes
import { ApiClientService } from '../../core/api-client.service';
import { Cliente } from '../../core/models';
import { ClienteDialogComponent } from './cliente-dialog.component'; // <--- Importar el nuevo dialog

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatListModule, MatIconModule, MatButtonModule,
    MatInputModule, MatProgressSpinnerModule, MatSnackBarModule, MatFormFieldModule, MatSelectModule, MatDialogModule, MatTooltipModule,
    MatMenuModule
  ],
  templateUrl: './clientes.component.html',
  styleUrl: './clientes.component.scss'
})
export class ClientesComponent implements OnInit {
  private api = inject(ApiClientService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);

  items = signal<Cliente[]>([]);
  loading = signal<boolean>(false);
  q = signal<string>('');
  
  page = 1;
  pageSize = 20;
  hasMore = signal<boolean>(true);
  loadingMore = signal<boolean>(false);

  ngOnInit(): void {
    this.loadClientes(true);
  }

  // --- CARGA DE DATOS ---
  async loadClientes(reset: boolean = false) {
    if (reset) { this.page = 1; this.hasMore.set(true); this.loading.set(true); } 
    else { this.loadingMore.set(true); }

    try {
      const offset = (this.page - 1) * this.pageSize;
      const data = await this.api.listClientes({ q: this.q(), limit: this.pageSize, offset });

      if (reset) this.items.set(data);
      else this.items.update(curr => [...curr, ...data]);

      if (data.length < this.pageSize) this.hasMore.set(false);
      else this.page++;

    } catch (e: any) {
      this.snackBar.open('Error cargando clientes', 'Cerrar');
    } finally {
      this.loading.set(false); this.loadingMore.set(false);
    }
  }

  onQInput(term: string): void {
    this.q.set(term);
    this.loadClientes(true);
  }

  // --- CRUD REAL ---
  
  // 1. Abrir Modal para Crear/Editar
  openClienteDialog(cliente?: Cliente, event?: MouseEvent) {
    event?.stopPropagation(); // Evitar que el click se propague si está en una lista

    const dialogRef = this.dialog.open(ClienteDialogComponent, {
      width: '500px',
      data: cliente || null
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) return; // Cancelado

      this.loading.set(true);
      try {
        if (cliente) {
          // Update
          await this.api.updateCliente(cliente.id, result);
          this.snackBar.open('Cliente actualizado', 'OK', { duration: 2500 });
        } else {
          // Create
          await this.api.createCliente(result);
          this.snackBar.open('Cliente registrado', 'OK', { duration: 2500 });
        }
        this.loadClientes(true); // Recargar lista para ver cambios
      } catch (e: any) {
        this.snackBar.open(e.message || 'Error al guardar', 'Cerrar', { duration: 3000 });
        this.loading.set(false);
      }
    });
  }

  async onDelete(cliente: Cliente, event: MouseEvent) {
    event.stopPropagation();
    if (!confirm(`¿Eliminar a ${cliente.nombre}?`)) return;

    try {
      await this.api.deleteCliente(cliente.id);
      this.items.update(list => list.filter(c => c.id !== cliente.id));
      this.snackBar.open('Cliente eliminado', 'OK', { duration: 2500 });
    } catch (e) {
      this.snackBar.open('No se pudo eliminar', 'Cerrar');
    }
  }

  // --- LÓGICA DE NEGOCIO ---

  // Semáforo de Retención 🚦
  getStatusColor(fechaUltimaVisita?: string): string {
    if (!fechaUltimaVisita) return '#9e9e9e'; // Gris (Nuevo/Sin datos)
    
    // Calcular diferencia en días
    const diff = new Date().getTime() - new Date(fechaUltimaVisita).getTime();
    const dias = diff / (1000 * 3600 * 24);

    if (dias <= 15) return '#4caf50'; // Verde (Activo)
    if (dias <= 45) return '#ffc107'; // Amarillo (Riesgo)
    return '#f44336';                 // Rojo (Perdido)
  }

  // Mensajes Masivos
  onMassMessage() {
    // Solo obtenemos el conteo visual
    const count = this.items().filter(c => (c as any).permite_whatsapp).length; 
    
    const dialogRef = this.dialog.open(MassMessageDialogComponent, {
      width: '500px',
      data: { count }
    });

    dialogRef.afterClosed().subscribe(async (res) => {
      if (!res) return; // Si canceló o cerró sin enviar

      this.loading.set(true);
      try {
        // Llamada REAL al backend
        const response = await this.api.sendMassMessage({ 
            message: res.message || 'Hola, tenemos ofertas...', // Dato que viene del dialog
            template: res.template 
        });
        
        this.snackBar.open(`Éxito: ${response.message}`, 'Genial', { duration: 4000 });
      } catch (e) {
        this.snackBar.open('Error al enviar mensajes', 'Cerrar');
      } finally {
        this.loading.set(false);
      }
    });
  }

  onSendProgrammedReminder(cliente: Cliente, event: MouseEvent) {
    event.stopPropagation();
    if (!(cliente as any).permite_whatsapp) {
      this.snackBar.open('Este cliente no acepta mensajes de WA', 'Cerrar', { duration: 3000 });
      return;
    }
    // Aquí conectarías con tu backend para forzar el envío
    this.snackBar.open(`Recordatorio enviado a ${cliente.nombre}`, 'OK', { duration: 3000 });
  }

  onViewOrders(cliente: Cliente, event: MouseEvent) {
    event.stopPropagation();
    // Navegar a pedidos filtrados por este cliente
    this.router.navigate(['/movimientos'], { queryParams: { q: cliente.nombre } });
  }
}

// --- Componente Inline para Mensaje Masivo (Reutilizado) ---
@Component({
  selector: 'app-mass-message-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatInputModule, MatFormFieldModule, MatSelectModule, MatDialogModule, MatDialogTitle, MatDialogContent, MatDialogActions],
  template: `
    <h2 mat-dialog-title>📢 Envío Masivo</h2>
    <div mat-dialog-content>
      <p class="mb-4 text-gray-600">Se enviará a <strong>{{ data.count }}</strong> clientes con WhatsApp activo.</p>
      
      <mat-form-field appearance="outline" style="width: 100%; margin-bottom: 12px">
        <mat-label>Plantilla</mat-label>
        <mat-select [(value)]="template">
          <mat-option value="promo">🎉 Promoción Mensual</mat-option>
          <mat-option value="recordatorio">⏰ Recordatorio General</mat-option>
          <mat-option value="aviso">⚠️ Aviso de Horario</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" style="width: 100%">
        <mat-label>Mensaje personalizado</mat-label>
        <textarea matInput rows="4" placeholder="Hola [Nombre], aprovecha..."></textarea>
      </mat-form-field>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" [mat-dialog-close]="{ message: 'Mensaje enviado', template: template }">Enviar Masivo</button>
    </div>
  `
})
export class MassMessageDialogComponent {
  template = 'promo';
  constructor(@Inject(MAT_DIALOG_DATA) public data: any) {}
}