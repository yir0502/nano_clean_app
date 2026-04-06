import { Component, OnInit, inject, signal, Inject, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
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
import { ClienteDialogComponent } from './cliente-dialog.component';

// Charts
import { NgChartsModule } from 'ng2-charts';
import type { ChartConfiguration, ChartData, ChartType } from 'chart.js';
import { Chart as ChartJS, registerables } from 'chart.js';
ChartJS.register(...registerables);

@Component({
  selector: 'app-campaign-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatInputModule, MatFormFieldModule, MatSelectModule, MatDialogModule, MatDialogTitle, MatDialogContent, MatDialogActions],
  template: `
    <h2 mat-dialog-title>⚙️ Plantillas de Campaña</h2>
    <div mat-dialog-content class="form-cols">
      <p class="mb-4 text-gray-600" style="font-size: 13px;">Usa <strong>[Nombre]</strong> para personalizar. Los textos quedarán guardados en tu dispositivo.</p>
      
      <h3>Mensaje Promocional</h3>
      <mat-form-field appearance="outline" style="width: 100%">
        <mat-label>Plantilla de texto</mat-label>
        <textarea matInput rows="3" [(ngModel)]="data.promoMsg"></textarea>
      </mat-form-field>

      <mat-form-field appearance="outline" style="width: 100%">
        <mat-label>Link de Imágen / Página (Opcional)</mat-label>
        <input matInput [(ngModel)]="data.promoLink" placeholder="https://imgur.com/...jpg">
        <mat-hint>Pegar link para crear vista previa en WhatsApp.</mat-hint>
      </mat-form-field>
      
      <h3 style="margin-top: 16px;">Recordatorio </h3>
      <mat-form-field appearance="outline" style="width: 100%">
        <mat-label>Plantilla para inactivos</mat-label>
        <textarea matInput rows="3" [(ngModel)]="data.remMsg"></textarea>
      </mat-form-field>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" [mat-dialog-close]="data">Guardar Plantillas</button>
    </div>
  `,
  styles: [`
    .form-cols { display: flex; flex-direction: column; gap: 4px; padding-top: 10px; min-width: 320px; }
    h3 { font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #3f51b5; }
  `]
})
export class CampaignSettingsDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: any) {}
}

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatListModule, MatIconModule, MatButtonModule,
    MatInputModule, MatProgressSpinnerModule, MatSnackBarModule, MatFormFieldModule, MatSelectModule, MatDialogModule, MatTooltipModule,
    MatMenuModule, NgChartsModule
  ],
  templateUrl: './clientes.component.html',
  styleUrl: './clientes.component.scss'
})
export class ClientesComponent implements OnInit, AfterViewInit, OnDestroy {
  private api = inject(ApiClientService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);

  @ViewChild('infiniteAnchor') infiniteAnchor!: ElementRef;
  private observer?: IntersectionObserver;

  items = signal<Cliente[]>([]);
  loading = signal<boolean>(false);
  q = signal<string>('');
  totalCount = signal<number>(0);
  
  page = 1;
  pageSize = 20;
  hasMore = signal<boolean>(true);
  loadingMore = signal<boolean>(false);

  // Stats
  statsData: any = null;
  doughnutData: ChartData<'doughnut'> = { labels: [], datasets: [] };
  doughnutOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'right' } }
  };
  barData: ChartData<'bar'> = { labels: [], datasets: [] };
  barOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true, maintainAspectRatio: false,
    plugins: { 
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw} clientes` } }
    },
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    datasets: { bar: { maxBarThickness: 32, borderRadius: 6 } }
  };

  // Nuevas Gráficas
  whatsappData: ChartData<'pie'> = { labels: [], datasets: [] };
  whatsappOptions: ChartConfiguration<'pie'>['options'] = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: window.innerWidth < 600 ? 'bottom' : 'right' } }
  };

  frecuenciaData: ChartData<'bar'> = { labels: [], datasets: [] };
  frecuenciaOptions: ChartConfiguration<'bar'>['options'] = {
    indexAxis: 'y',
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    datasets: { bar: { maxBarThickness: 24, borderRadius: 4 } }
  };

  // CRM
  currentFilter = signal<'todos' | '0-15' | '16-45' | '45plus' | 'falta_promo'>('todos');
  promoMessage = signal<string>(localStorage.getItem('nc_promo_msg') || '¡Hola [Nombre]! 🌟 Aprovecha nuestra promo este mes en Nano Clean. 🫧');
  promoLink = signal<string>(localStorage.getItem('nc_promo_link') || '');
  reminderMessage = signal<string>(localStorage.getItem('nc_rem_msg') || '¡Hola [Nombre] 👋! Notamos que hace unos días no nos visitas. ¿Tienes prendas listas? ¡Te esperamos en Nano Clean! 💙');

  ngOnInit(): void {
    this.loadStats();
    this.loadClientes(true);
  }

  async loadStats() {
    try {
      const stats = await this.api.getClientStats();
      this.statsData = stats;

      this.doughnutData = {
        labels: ['0-15 Días (Activos)', '16-45 Días (En Riesgo)', '+45 Días (Perdidos)'],
        datasets: [{
          data: [stats.segmentos.active_0_15, stats.segmentos.risk_16_45, stats.segmentos.lost_45plus],
          backgroundColor: ['#4caf50', '#ffc107', '#f44336'],
          hoverOffset: 4
        }]
      };

      this.barData = {
        labels: ['Promo Vigente', 'Falta Promo'],
        datasets: [{
          data: [stats.total - stats.faltan_promo, stats.faltan_promo],
          backgroundColor: ['#2196f3', '#9e9e9e'],
          borderWidth: 0
        }]
      };

      this.whatsappData = {
        labels: ['WA Activo', 'Sin WA'],
        datasets: [{
          data: [stats.con_whatsapp, stats.total - stats.con_whatsapp],
          backgroundColor: ['#2ed573', '#dcdde1']
        }]
      };

      this.frecuenciaData = {
        labels: ['Cada 7 días', 'Cada 15 días', 'Cada 30 días', 'Otros'],
        datasets: [{
          label: 'Clientes',
          data: [stats.frecuencias['7'], stats.frecuencias['15'], stats.frecuencias['30'], stats.frecuencias['otros']],
          backgroundColor: '#3f51b5'
        }]
      };

      // Ajuste de leyenda dinámico
      const isMobile = window.innerWidth < 600;
      if (this.doughnutOptions?.plugins?.legend) this.doughnutOptions.plugins.legend.position = isMobile ? 'bottom' : 'right';
      if (this.whatsappOptions?.plugins?.legend) this.whatsappOptions.plugins.legend.position = isMobile ? 'bottom' : 'right';

    } catch (e) {
      console.error('Error cargando stats', e);
    }
  }

  ngAfterViewInit(): void {
    this.setupInfiniteScroll();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private setupInfiniteScroll() {
    this.observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && this.hasMore() && !this.loading() && !this.loadingMore()) {
        this.loadClientes();
      }
    }, { threshold: 0.1 });

    if (this.infiniteAnchor) {
      this.observer.observe(this.infiniteAnchor.nativeElement);
    }
  }

  // --- CARGA DE DATOS ---
  async loadClientes(reset: boolean = false) {
    if (this.loading() || this.loadingMore()) return;

    if (reset) { 
      this.page = 1; 
      this.hasMore.set(true); 
      this.loading.set(true); 
    } else { 
      this.loadingMore.set(true); 
    }

    try {
      const offset = (this.page - 1) * this.pageSize;
      const filterParam = this.currentFilter() !== 'todos' ? this.currentFilter() : undefined;
      const res = await this.api.listClientes({ q: this.q(), limit: this.pageSize, offset, filter: filterParam });
      const data = res.data;
      const count = res.count;

      this.totalCount.set(count);

      if (reset) this.items.set(data);
      else this.items.update(curr => [...curr, ...data]);

      if (this.items().length >= count || data.length < this.pageSize) {
        this.hasMore.set(false);
      } else {
        this.page++;
      }

    } catch (e: any) {
      this.snackBar.open('Error cargando clientes', 'Cerrar');
    } finally {
      this.loading.set(false); 
      this.loadingMore.set(false);
    }
  }

  onQInput(term: string): void {
    this.q.set(term);
    this.loadClientes(true);
  }

  setFilter(f: 'todos' | '0-15' | '16-45' | '45plus' | 'falta_promo') {
    this.currentFilter.set(f);
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
          const updated = await this.api.updateCliente(cliente.id, result);
          this.items.update(list => list.map(c => c.id === cliente.id ? { ...c, ...updated } : c));
          this.snackBar.open('Cliente actualizado', 'OK', { duration: 2500 });
        } else {
          // Create
          const nuevo = await this.api.createCliente(result);
          this.items.update(list => [nuevo, ...list]);
          this.totalCount.update(c => c + 1);
          this.snackBar.open('Cliente registrado', 'OK', { duration: 2500 });
        }
      } catch (e: any) {
        this.snackBar.open(e.message || 'Error al guardar', 'Cerrar', { duration: 3000 });
      } finally {
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

  // --- LÓGICA DE NEGOCIO ---  // Helpers Visuales
  getStatusColor(fechaUltimaVisita?: string): string {
    if (!fechaUltimaVisita) return '#9e9e9e'; 
    const diff = new Date().getTime() - new Date(fechaUltimaVisita).getTime();
    const dias = diff / (1000 * 3600 * 24);
    if (dias <= 15) return '#4caf50'; 
    if (dias <= 45) return '#ffc107'; 
    return '#f44336';                 
  }

  hasPromoThisMonth(c: Cliente): boolean {
    if (!c.fecha_ultima_promo) return false;
    const date = new Date(c.fecha_ultima_promo);
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }

  isInactiveMoreThan15Days(c: Cliente): boolean {
    if (!c.ultima_visita) return false;
    const diff = new Date().getTime() - new Date(c.ultima_visita).getTime();
    return (diff / (1000 * 3600 * 24)) > 15;
  }

  // --- CRM Acciones ---

  openCampaignSettings() {
    const dialogRef = this.dialog.open(CampaignSettingsDialogComponent, {
      width: '500px',
      data: { 
        promoMsg: this.promoMessage(), 
        promoLink: this.promoLink(),
        remMsg: this.reminderMessage() 
      }
    });

    dialogRef.afterClosed().subscribe(res => {
      if (!res) return;
      this.promoMessage.set(res.promoMsg);
      this.promoLink.set(res.promoLink);
      this.reminderMessage.set(res.remMsg);
      
      localStorage.setItem('nc_promo_msg', res.promoMsg);
      localStorage.setItem('nc_promo_link', res.promoLink || '');
      localStorage.setItem('nc_rem_msg', res.remMsg);
      this.snackBar.open('Plantillas guardadas', 'OK', { duration: 2000 });
    });
  }

  async sendPromo(cliente: Cliente, event: MouseEvent) {
    event.stopPropagation();
    if (!cliente.telefono) {
      this.snackBar.open('El cliente no tiene teléfono.', 'Cerrar', { duration: 3000 });
      return;
    }

    let rawMsg = this.promoMessage().replace('[Nombre]', cliente.nombre.split(' ')[0]);
    if (this.promoLink()) {
      rawMsg += `\n\nVer Promo: ${this.promoLink()}`;
    }

    const tel = cliente.telefono.replace(/\D/g, '');
    window.open(`https://api.whatsapp.com/send?phone=${tel}&text=${encodeURIComponent(rawMsg)}`, '_blank');

    // Marcamos como enviado hoy si no lo estaba
    if (!this.hasPromoThisMonth(cliente)) {
      try {
        const today = new Date().toISOString();
        const newCount = (cliente.invitaciones_enviadas || 0) + 1;
        await this.api.updateCliente(cliente.id, { 
          fecha_ultima_promo: today,
          invitaciones_enviadas: newCount
        });
        this.items.update(list => list.map(c => c.id === cliente.id ? { ...c, fecha_ultima_promo: today, invitaciones_enviadas: newCount } : c));
        // Si estamos en filtro falta_promo, lo quitamos visualmente
        if (this.currentFilter() === 'falta_promo') {
          this.items.update(list => list.filter(c => c.id !== cliente.id));
        }
      } catch (e) {
        console.error('No se pudo guardar la fecha promocional', e);
      }
    }
  }

  sendReminder(cliente: Cliente, event: MouseEvent) {
    event.stopPropagation();
    if (!cliente.telefono) {
      this.snackBar.open('El cliente no tiene teléfono.', 'Cerrar', { duration: 3000 });
      return;
    }

    const rawMsg = this.reminderMessage().replace('[Nombre]', cliente.nombre.split(' ')[0]);
    const tel = cliente.telefono.replace(/\D/g, '');
    window.open(`https://api.whatsapp.com/send?phone=${tel}&text=${encodeURIComponent(rawMsg)}`, '_blank');

    // Incrementar contador de invitaciones
    const newCount = (cliente.invitaciones_enviadas || 0) + 1;
    this.api.updateCliente(cliente.id, { invitaciones_enviadas: newCount }).then(updated => {
      this.items.update(list => list.map(c => c.id === cliente.id ? { ...c, invitaciones_enviadas: newCount } : c));
    }).catch(err => console.error('Error al actualizar contador de invitaciones', err));
  }

  onViewOrders(cliente: Cliente, event: MouseEvent) {
    event.stopPropagation();
    this.router.navigate(['/movimientos'], { queryParams: { q: cliente.nombre } });
  }
}
