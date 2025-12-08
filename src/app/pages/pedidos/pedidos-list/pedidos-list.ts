import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';

import { ApiClientService } from '../../../core/api-client.service';
import { Pedido } from '../../../core/models';

@Component({
  selector: 'app-pedidos-list',
  standalone: true,
  imports: [
    CommonModule, RouterLink, FormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatListModule,
    MatTabsModule, MatFormFieldModule, MatInputModule, MatProgressSpinnerModule, MatChipsModule
  ],
  templateUrl: './pedidos-list.html', // Asegúrate que exista
  styleUrls: ['./pedidos-list.scss']  // Asegúrate que exista
})
export class PedidosListComponent implements OnInit {
  private api = inject(ApiClientService);
  private router = inject(Router);

  // Estado
  activeTab = signal<number>(0); // 0 = Activos, 1 = Historial
  loading = signal<boolean>(true);
  pedidos = signal<Pedido[]>([]);
  q = signal<string>('');

  ngOnInit() {
    this.reload();
  }

  onTabChange(index: number) {
    this.activeTab.set(index);
    this.reload();
  }

  async reload() {
    this.loading.set(true);
    try {
      // Si tab es 0 (Activos) -> activo=true, Si tab es 1 (Historial) -> activo=false
      const isActivo = this.activeTab() === 0;
      
      const data = await this.api.listPedidos({
        activo: isActivo,
        q: this.q() || undefined,
        limit: 50 // Traemos 50 por ahora
      });
      this.pedidos.set(data);
    } catch (e) {
      console.error(e);
    } finally {
      this.loading.set(false);
    }
  }

  // Helpers visuales
  getStatusColor(estado: string): string {
    switch (estado) {
      case 'pendiente': return 'warn';
      case 'en_proceso': return 'accent';
      case 'listo': return 'primary';
      default: return ''; // gris
    }
  }

  // Acción rápida: Enviar WhatsApp
  sendWhatsapp(pedido: Pedido, event: MouseEvent) {
    event.stopPropagation();
    if (!pedido.cliente_telefono) return;
    
    // Aquí irá la URL pública en el futuro
    const urlRastreo = `https://micleanapp.com/rastreo/${pedido.folio}`; 
    const msg = `Hola ${pedido.cliente_nombre}, tu pedido ${pedido.folio} está en estado: ${pedido.estado.toUpperCase()}. Ver detalles: ${urlRastreo}`;
    
    // Abrir API de WhatsApp directamente en el dispositivo
    const link = `https://wa.me/${pedido.cliente_telefono.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`;
    window.open(link, '_blank');
  }

  goToDetail(pedido: Pedido) {
    this.router.navigate(['/pedidos', pedido.id]);
  }
}