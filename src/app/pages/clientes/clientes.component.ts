import { Component, OnInit, inject, signal, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

// Angular Material Modules
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialogTitle, MatDialogContent, MatDialogActions, MAT_DIALOG_DATA, MatDialogRef, MatDialog } from '@angular/material/dialog';import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

// 1. Define el modelo actualizado
export interface Cliente {
  id: number;
  nombre: string;
  telefono: string;
  email: string;
  direccion: string;
  permiteWhatsapp: boolean; 
  frecuenciaRecordatorio?: 'semanal' | 'quincenal' | 'mensual'; 
  loyaltyStatus?: 'Bronce' | 'Plata' | 'Oro'; // Sugerencia de Fidelidad
}

// 2. Simulador de Servicio/Datos
const MOCK_CLIENTES: Cliente[] = [
  { id: 1, nombre: 'Ana García', telefono: '5512345678', email: 'ana@mail.com', direccion: 'Calle Falsa 123', permiteWhatsapp: true, frecuenciaRecordatorio: 'semanal', loyaltyStatus: 'Oro' },
  { id: 2, nombre: 'Luis Martínez', telefono: '5587654321', email: 'luis@mail.com', direccion: 'Av. Siempre Viva 45', permiteWhatsapp: false, loyaltyStatus: 'Bronce' },
  { id: 3, nombre: 'Elena Rodríguez', telefono: '5599887766', email: 'elena@mail.com', direccion: 'Blvd. Principal 1', permiteWhatsapp: true, frecuenciaRecordatorio: 'quincenal', loyaltyStatus: 'Plata' },
  { id: 4, nombre: 'Carlos López', telefono: '5511223344', email: 'carlos@mail.com', direccion: 'Carr. Panorámica 5', permiteWhatsapp: true, frecuenciaRecordatorio: 'mensual', loyaltyStatus: 'Oro' },
];

// =============================================================
// COMPONENTE PRINCIPAL: CLIENTES COMPONENT
// =============================================================

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatListModule, MatIconModule, MatButtonModule,
    MatInputModule, MatProgressSpinnerModule, MatSnackBarModule, MatFormFieldModule, MatSelectModule, MatDialogModule
  ],
  templateUrl: './clientes.component.html', // Asumo que existe un archivo HTML
  styleUrl: './clientes.component.scss'
})
export class ClientesComponent implements OnInit {
  // Inyecciones de dependencias
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);

  // Signals para el estado de la lista
  items = signal<Cliente[]>([]);
  loading = signal<boolean>(false);
  q = signal<string>('');
  page = signal<number>(1);
  pageSize = 10;
  hasMore = signal<boolean>(false);
  loadingMore = signal<boolean>(false);
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadClientes();
  }

  // --- LÓGICA BASE ---

  loadClientes(reset: boolean = true): void {
    this.loading.set(true);
    this.error.set(null);
    if (reset) {
        this.page.set(1);
        this.items.set([]);
    }

    setTimeout(() => {
      let filtered = MOCK_CLIENTES.filter(c => 
        c.nombre.toLowerCase().includes(this.q().toLowerCase()) ||
        c.email.toLowerCase().includes(this.q().toLowerCase())
      );
      
      const startIndex = (this.page() - 1) * this.pageSize;
      const endIndex = startIndex + this.pageSize;
      const newItems = filtered.slice(startIndex, endIndex);

      this.items.update(currentItems => reset ? newItems : [...currentItems, ...newItems]);
      this.hasMore.set(filtered.length > this.items().length);
      
      this.loading.set(false);
      this.loadingMore.set(false);
    }, 500);
  }

  onQInput(term: string): void {
    this.q.set(term);
    this.loadClientes();
  }
  
  // --- FUNCIONALIDADES CLAVE SOLICITADAS ---

  /**
   * 2. Enviar Recordatorio Programado (por WhatsApp)
   */
  onSendProgrammedReminder(cliente: Cliente): void {
    if (!cliente.permiteWhatsapp) {
      this.snackBar.open(`🚫 ${cliente.nombre} no permite mensajes por WhatsApp.`, 'Cerrar');
      return;
    }
    
    // Lógica para iniciar el proceso de envío programado (ej. llamado a un API gateway de WhatsApp)
    console.log(`[WA] Enviando recordatorio programado a: ${cliente.nombre} (Frecuencia: ${cliente.frecuenciaRecordatorio})`);
    this.snackBar.open(`Recordatorio de lavado programado enviado (simulado) a ${cliente.nombre}`, 'OK', { duration: 3000 });
  }

  /**
   * 3. Abrir Sección para Envío de Mensajes Masivos (Whatsapp)
   */
  onMassMessage(): void {
    const activeWhatsappClientsCount = this.items().filter(c => c.permiteWhatsapp).length;

    this.dialog.open(MassMessageDialogComponent, {
        width: '500px',
        data: { activeWhatsappClientsCount: activeWhatsappClientsCount }
    });
  }

  /**
   * 4. Navegar para ver los Pedidos del Cliente
   */
  onViewOrders(cliente: Cliente, event: MouseEvent): void {
    event.stopPropagation(); 
    
    // Navegación a la futura ruta de pedidos (ej. /pedidos/cliente/:id)
    this.router.navigate(['/pedidos/cliente', cliente.id]); 
    this.snackBar.open(`Navegando a Pedidos de ${cliente.nombre}...`, 'OK', { duration: 3000 });
  }

  /**
   * Notificación Automática de Estatus de Pedido (Lógica Backend/Servicio)
   * Esta función sería llamada desde el servicio de pedidos cuando el estatus cambie.
   */
  simulateOrderStatusUpdate(clienteId: number, status: string): void {
    const cliente = this.items().find(c => c.id === clienteId);
    
    if (cliente && cliente.permiteWhatsapp) {
        // Usar plantillas de WhatsApp para notificaciones transaccionales
        console.log(`[BACKEND WA] Notificación automática a ${cliente.nombre}: Su pedido está ahora en estatus "${status}".`);
    }
  }

  /**
   * 5. Sugerencia: Ajustar Estatus de Fidelidad
   */
  onSetLoyaltyStatus(cliente: Cliente): void {
      this.snackBar.open(`Ajustando estatus de fidelidad (${cliente.loyaltyStatus}) para ${cliente.nombre}...`, 'Cerrar', { duration: 2000 });
      // Aquí se abriría un modal para cambiar el estatus y guardar el dato.
  }

  // --- Funciones CRUD (Mantenidas) ---
  onNewCliente(): void {
    this.snackBar.open('Abriendo formulario de Nuevo Cliente...', 'Cerrar', { duration: 2000 });
  }
  onEditCliente(cliente: Cliente, event: MouseEvent): void {
    event.stopPropagation();
    this.snackBar.open(`Abriendo formulario de Edición para ${cliente.nombre}`, 'Cerrar', { duration: 2000 });
  }
  onDelete(cliente: Cliente, event: MouseEvent): void {
    event.stopPropagation();
    this.snackBar.open(`Eliminado cliente ${cliente.nombre} (simulado)`, 'Deshacer', { duration: 4000 });
  }
}

// =============================================================
// COMPONENTE DE DIÁLOGO: ENVÍO MASIVO (Corregido con @Inject)
// =============================================================

@Component({
  selector: 'app-mass-message-dialog',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    MatButtonModule, 
    MatInputModule, 
    MatFormFieldModule, 
    MatSelectModule,
    
    // Componentes individuales del diálogo para standalone
    MatDialogTitle, 
    MatDialogContent, 
    MatDialogActions
  ],
  template: `
    <h2 mat-dialog-title>Enviar Mensaje Masivo por WhatsApp 🚀</h2>
    <div mat-dialog-content>
        <p>Este mensaje se enviará a **{{ data.activeWhatsappClientsCount }}** clientes que tienen la opción de WhatsApp activa.</p>
        
        <mat-form-field appearance="fill" style="width: 100%;">
            <mat-label>Plantilla del Mensaje</mat-label>
            <mat-select [(ngModel)]="selectedTemplate">
                <mat-option value="promo_navidad">🎄 Promoción de Navidad</mat-option>
                <mat-option value="aviso_horario">⚠️ Aviso de Horario Festivo</mat-option>
                <mat-option value="recordatorio_general">🌟 Mensaje de Fidelidad</mat-option>
            </mat-select>
        </mat-form-field>

        <mat-form-field appearance="fill" style="width: 100%;">
            <mat-label>Contenido del Mensaje</mat-label>
            <textarea matInput rows="5" placeholder="Escribe tu mensaje..."></textarea>
        </mat-form-field>
    </div>
    <div mat-dialog-actions>
      <button mat-button (click)="onClose()">Cancelar</button>
      <button mat-flat-button color="primary" mat-dialog-close="true">Enviar a {{ data.activeWhatsappClientsCount }} Clientes</button>
    </div>
  `,
})
export class MassMessageDialogComponent {
  selectedTemplate: string = 'promo_navidad';
  
  // CORRECCIÓN: Inyección usando @Inject() para el token MAT_DIALOG_DATA
  constructor(
    public dialogRef: MatDialogRef<MassMessageDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { activeWhatsappClientsCount: number }
  ) {}

  onClose(): void {
    this.dialogRef.close();
  }
}