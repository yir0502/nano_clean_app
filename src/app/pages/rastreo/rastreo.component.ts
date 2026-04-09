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
  error = signal<string | null>(null);
  pedido = signal<PedidoRastreo | null>(null);
  canjeando = signal(false);
  canjeOk = signal<string | null>(null);

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
  }



  // Calcula si un paso ya se completó para pintarlo de color
  isStepActive(stepId: string): boolean {
    const estadoActual = this.pedido()?.estado;
    if (!estadoActual) return false;

    // El orden aquí es CRÍTICO para saber qué círculos pintar
    const estadosOrdenados = this.pedidoActions.estadosProduccion;

    return estadosOrdenados.indexOf(stepId) <= estadosOrdenados.indexOf(estadoActual);
  }

  getLoyaltyMessage(): string {
    const monedero = this.pedido()?.lealtad?.monedero ?? 0;

    if (monedero >= 60) {
      return '¡Felicidades! Has alcanzado el límite máximo. Canjéalo ahora para poder seguir acumulando en tus siguientes visitas.';
    }

    const count = this.pedido()?.lealtad?.servicios_en_ciclo ?? 0;

    if (count === 0) {
      return '¡Empieza a acumular saldo desde hoy y gana bonos especiales!';
    } else if (count === 1 || count === 2) {
      return 'Sigue acumulando tu saldo o gástalo ahora mismo.';
    } else if (count === 3) {
      return '¡Estás a solo un servicio de tu bono especial de $30.00 MXN!';
    } else {
      return '¡Felicidades! Has desbloqueado tu bono. Úsalo ahora.';
    }
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
    if (!estadoActual) return 0;
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
