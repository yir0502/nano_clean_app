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
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

import { ApiClientService } from '../../../core/api-client.service';
import { PedidoActionsService } from '../../../core/pedido-actions.service';
import { Pedido } from '../../../core/models';

@Component({
  selector: 'app-pedidos-list',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatListModule,
    MatTabsModule, MatFormFieldModule, MatInputModule, MatProgressSpinnerModule, MatChipsModule, MatTooltipModule, MatDialogModule
  ],
  templateUrl: './pedidos-list.html',
  styleUrls: ['./pedidos-list.scss']
})
export class PedidosListComponent implements OnInit {
  private api = inject(ApiClientService);
  private router = inject(Router);
  private snack = inject(MatSnackBar);
  public pedidoActions = inject(PedidoActionsService);
  private dialog = inject(MatDialog);

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
      const isActivo = this.activeTab() === 0;

      const data = await this.api.listPedidos({
        activo: isActivo,
        q: this.q() || undefined,
        limit: 50
      });
      this.pedidos.set(data);
    } catch (e) {
      console.error(e);
    } finally {
      this.loading.set(false);
    }
  }

  async deletePedido(pedido: Pedido, event: MouseEvent) {
    event.stopPropagation(); // Evita entrar al detalle del pedido

    const dialogData: ConfirmDialogData = {
      title: 'Eliminar pedido',
      message: `¿Estás seguro de eliminar el pedido ${pedido.folio}? Esta acción no se puede deshacer.`,
      icon: 'delete_forever',
      color: 'warn'
    };
    
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: dialogData,
      width: '360px',
      panelClass: 'custom-modal-panel'
    });

    const confirmacion = await dialogRef.afterClosed().toPromise();
    if (!confirmacion) return;

    try {
      await this.api.deletePedido(pedido.id);
      // Actualizamos la lista localmente para que desaparezca al instante
      this.pedidos.update(prev => prev.filter(p => p.id !== pedido.id));
      this.snack.open('Pedido eliminado correctamente', 'OK', { duration: 3000 });
    } catch (e) {
      // El snack global lo maneja
    }
  }

  goToDetail(pedido: Pedido) {
    this.router.navigate(['/pedidos', pedido.id]);
  }
}