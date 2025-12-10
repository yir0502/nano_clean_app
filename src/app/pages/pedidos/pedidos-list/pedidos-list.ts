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
import { MatSnackBar } from '@angular/material/snack-bar';

import { ApiClientService } from '../../../core/api-client.service';
import { Pedido } from '../../../core/models';

@Component({
  selector: 'app-pedidos-list',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatListModule,
    MatTabsModule, MatFormFieldModule, MatInputModule, MatProgressSpinnerModule, MatChipsModule
],
  templateUrl: './pedidos-list.html', // Asegúrate que exista
  styleUrls: ['./pedidos-list.scss']  // Asegúrate que exista
})
export class PedidosListComponent implements OnInit {
  private api = inject(ApiClientService);
  private router = inject(Router);
  private snack = inject(MatSnackBar);
  
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
    console.log(estado);
   switch (estado) {
      case 'recibido': return 'warn';
      case 'lavando': return 'accent';
      case 'listo': return 'primary';
      case 'entregado': return 'completed';
      case 'cancelado': return 'canceled';
      default: return '';
    }
    
  }

  async deletePedido(pedido: Pedido, event: MouseEvent) {
    event.stopPropagation(); // Evita entrar al detalle del pedido
    
    const confirmacion = confirm(`¿Estás seguro de eliminar el pedido ${pedido.folio}? Esta acción no se puede deshacer.`);
    if (!confirmacion) return;

    try {
      await this.api.deletePedido(pedido.id);
      
      // Actualizamos la lista localmente para que desaparezca al instante
      this.pedidos.update(prev => prev.filter(p => p.id !== pedido.id));
      
      this.snack.open('Pedido eliminado correctamente', 'OK', { duration: 3000 });
    } catch (e) {
      this.snack.open('Error al eliminar el pedido', 'Cerrar', { duration: 3000 });
    }
  }


  // Acción rápida: Enviar WhatsApp
  sendWhatsapp(pedido: Pedido, event: MouseEvent) {
    event.stopPropagation();
    
    if (!pedido.cliente_telefono) return;

    const baseUrl = window.location.origin; 
    const urlRastreo = `${baseUrl}/rastreo/${pedido.folio}`;
    
    const estadoLimpio = pedido.estado.replace('_', ' ');
    const estadoFormato = estadoLimpio.charAt(0).toUpperCase() + estadoLimpio.slice(1);

    const msg = `Hola *${pedido.cliente_nombre}* \uD83D\uDC4B

Tu pedido *${pedido.folio}* está: *${estadoFormato}*.

Puedes ver los detalles, saldo y fotos aquí \uD83D\uDC47:
${urlRastreo}

¡Gracias por tu confianza! \u2764\uFE0F
- Lavandería Nano Clean \uD83E\uDD16`;

    // Limpiar teléfono
    const telefono = pedido.cliente_telefono.replace(/\D/g, '');
    
    // Usar api.whatsapp.com asegura mejor compatibilidad de codificación
    const link = `https://api.whatsapp.com/send?phone=${telefono}&text=${encodeURIComponent(msg)}`;
    
    window.open(link, '_blank');
  }

  goToDetail(pedido: Pedido) {
    this.router.navigate(['/pedidos', pedido.id]);
  }
}