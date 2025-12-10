import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiClientService } from '../../core/api-client.service';

import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';

@Component({
  selector: 'app-rastreo',
  standalone: true,
  imports: [
    CommonModule, RouterLink,
    MatCardModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule, MatChipsModule
  ],
  templateUrl: './rastreo.component.html',
  styleUrls: ['./rastreo.component.scss']
})
export class RastreoComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiClientService);

  loading = signal(true);
  error = signal<string|null>(null);
  pedido = signal<any>(null);

  // Pasos para la barra de progreso visual
  steps = [
    { id: 'recibido', label: 'Recibido', icon: 'inventory' },
    { id: 'lavando', label: 'Lavando', icon: 'local_laundry_service' },
    { id: 'listo', label: 'Listo', icon: 'check_circle' },
    { id: 'entregado', label: 'Entregado', icon: 'sentiment_satisfied_alt' }
  ];

  async ngOnInit() {
    console.log('RastreoComponent initialized');
    
    const folio = this.route.snapshot.paramMap.get('folio');
    if (!folio) {
      this.error.set('No se especificó un número de pedido.');
      console.log('FOLIO NO ESPECIFICADO');
      
      this.loading.set(false);
      return;
    }

    try {
      const data = await this.api.getPedidoPublico(folio);
      this.pedido.set(data);
    } catch (e) {
      this.error.set('No encontramos este pedido. Verifica el enlace.');
    } finally {
      this.loading.set(false);
    }
  }

  // Calcula si un paso ya se completó para pintarlo de color
  isStepActive(stepId: string): boolean {
    const estado = this.pedido()?.estado;
    const estados = ['recibido', 'lavando', 'listo', 'entregado'];
    return estados.indexOf(stepId) <= estados.indexOf(estado);
  }
}