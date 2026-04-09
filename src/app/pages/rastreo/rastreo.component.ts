import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiClientService } from '../../core/api-client.service';
import { PedidoActionsService } from '../../core/pedido-actions.service';
import { Pedido } from '../../core/models';

import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

export interface LealtadInfo {
  apto: boolean;
  monedero?: number;
  contador_servicios?: number;
  servicios_en_ciclo?: number;
  servicios_para_proxima?: number;
  proxima_ganancia?: number;
  puede_canjear?: boolean;
}

export interface PedidoRastreo {
  folio: string;
  cliente: string;
  descripcion?: string;
  estado: string;
  total: number;
  pendiente: number;
  fecha_entrega?: string;
  descuento_aplicado?: number;
  promo_canjeada?: boolean;
  fotos?: { url: string; nota?: string }[];
  lealtad?: LealtadInfo;
}

@Component({
  selector: 'app-rastreo',
  standalone: true,
  imports: [
    CommonModule, RouterLink,
    MatCardModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule, MatChipsModule,
    MatSnackBarModule
  ],
  templateUrl: './rastreo.component.html',
  styleUrls: ['./rastreo.component.scss']
})
export class RastreoComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiClientService);
  private snack = inject(MatSnackBar);
  public pedidoActions = inject(PedidoActionsService);

  loading = signal(true);
  error = signal<string|null>(null);
  pedido = signal<PedidoRastreo|null>(null);
  canjeando = signal(false);
  canjeOk = signal<string|null>(null);

  // --- CAMBIO 1: Agregamos los pasos nuevos al Array visual ---
  steps = [
    { id: 'recibido', label: 'Recibido', icon: 'inventory' },
    { id: 'lavando', label: 'Lavando', icon: 'local_laundry_service' },
    { id: 'secando', label: 'Secando', icon: 'dry' },       // <--- NUEVO
    { id: 'doblando', label: 'Doblando', icon: 'layers' },  // <--- NUEVO
    { id: 'listo', label: 'Listo', icon: 'check_circle' },
    { id: 'entregado', label: 'Entregado', icon: 'sentiment_satisfied_alt' }
  ];

  async ngOnInit() {
    const folio = this.route.snapshot.paramMap.get('folio');
    if (!folio) {
      this.error.set('No se especificó un número de pedido.');
      this.loading.set(false);
      return;
    }

    try {
      const data = await this.api.getPedidoPublico(folio);
      this.pedido.set(data as any);
    } catch (e) {
      this.error.set('No encontramos este pedido. Verifica el enlace.');
    } finally {
      this.loading.set(false);
    }

    // Iniciar tour solo si el pedido cargó correctamente
    if (this.pedido()) {
      this.scrollTour();
    }
  }

  /** Tour automático: baja hasta el final y regresa al inicio */
  private scrollTour() {
    // Aumentamos el delay inicial para permitir que las imágenes y el layout se estabilicen
    setTimeout(async () => {
      const pageBottom = document.documentElement.scrollHeight - window.innerHeight;
      
      // Si la página es corta (ej. carga lenta), reintentamos obtener la altura un poco después
      if (pageBottom <= 100) {
        await new Promise(r => setTimeout(r, 1000));
      }
      
      const realBottom = document.documentElement.scrollHeight - window.innerHeight;
      if (realBottom <= 50) return; 

      await this.smoothScroll(realBottom, 3500); // Bajamos un poco más lento para que se aprecie
      await new Promise<void>(r => setTimeout(r, 1200)); // Pausa más larga al fondo
      await this.smoothScroll(0, 2500);           // Subimos de regreso
    }, 1500); // 1.5s de espera inicial
  }

  /** Scroll animado con easing: aceelera y desacelera suavemente */
  private smoothScroll(target: number, duration: number): Promise<void> {
    return new Promise(resolve => {
      const start = window.scrollY;
      const distance = target - start;
      if (Math.abs(distance) < 5) { resolve(); return; }

      const startTime = performance.now();
      const ease = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        window.scrollTo(0, start + distance * ease(progress));
        if (progress < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  // Calcula si un paso ya se completó para pintarlo de color
  isStepActive(stepId: string): boolean {
    const estadoActual = this.pedido()?.estado;
    if(!estadoActual) return false;
    
    // El orden aquí es CRÍTICO para saber qué círculos pintar
    const estadosOrdenados = this.pedidoActions.estadosProduccion;
    
    return estadosOrdenados.indexOf(stepId) <= estadosOrdenados.indexOf(estadoActual);
  }

  copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      this.snack.open(`${label} copiada al portapapeles`, 'OK', { duration: 2000 });
    }).catch(err => {
      console.error('Error al copiar', err);
      this.snack.open('Error al copiar', 'Cerrar');
    });
  }

  isCurrent(stepId: string): boolean {
    // Compara si el ID del paso es IGUAL al estado del pedido
    return this.pedido()?.estado === stepId;
  }

  getProgressPercent(): number {
    const estadoActual = this.pedido()?.estado;
    if(!estadoActual) return 0;
    const estadosOrdenados = this.pedidoActions.estadosProduccion;
    const idx = estadosOrdenados.indexOf(estadoActual);
    if (idx < 0) return 0;
    return (idx / (estadosOrdenados.length - 1)) * 100;
  }

  async canjearPromo() {
    const folio = this.pedido()?.folio;
    if (!folio) return;
    this.canjeando.set(true);
    try {
      const result = await this.api.canjearPromo(folio);
      this.canjeOk.set(result.mensaje || '¡Descuento aplicado!');
      // Refrescar datos del pedido
      const data = await this.api.getPedidoPublico(folio);
      this.pedido.set(data as any);
    } catch (e: any) {
      this.snack.open(e.message || 'Error al canjear', 'Cerrar', { duration: 4000 });
    } finally {
      this.canjeando.set(false);
    }
  }

  selectedPhoto = signal<string | null>(null);

  openPhoto(url: string) {
    this.selectedPhoto.set(url);
  }

  closePhoto() {
    this.selectedPhoto.set(null);
  }
}