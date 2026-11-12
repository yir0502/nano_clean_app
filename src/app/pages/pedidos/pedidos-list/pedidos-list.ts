import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

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
import { EntregaDialogComponent } from '../dialogs/entrega-dialog.component';

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
  updatingStatusId = signal<string | null>(null);

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

  getNextStatusInfo(estado: string): { next: Pedido['estado']; label: string; icon: string; colorClass: string } | null {
    switch (estado) {
      case 'recibido':
        return { next: 'lavando', label: 'Iniciar Lavado', icon: 'local_laundry_service', colorClass: 'btn-lavando' };
      case 'lavando':
        return { next: 'secando', label: 'Pasar a Secado', icon: 'dry', colorClass: 'btn-secando' };
      case 'secando':
        return { next: 'doblando', label: 'Pasar a Doblado', icon: 'layers', colorClass: 'btn-doblando' };
      case 'doblando':
        return { next: 'listo', label: 'Marcar Listo', icon: 'check_circle', colorClass: 'btn-listo' };
      case 'listo':
        return { next: 'entregado', label: 'Entregar Pedido', icon: 'inventory_2', colorClass: 'btn-entregar' };
      default:
        return null;
    }
  }

  async avanzarEstado(pedido: Pedido, event: MouseEvent) {
    event.stopPropagation();
    const nextInfo = this.getNextStatusInfo(pedido.estado);
    if (!nextInfo) return;

    if (nextInfo.next === 'entregado' && Number(pedido.saldo_pendiente) > 0) {
      const dialogRef = this.dialog.open(EntregaDialogComponent, {
        data: {
          nombreCliente: pedido.cliente_nombre || 'Cliente',
          folio: pedido.folio,
          saldoPendiente: Number(pedido.saldo_pendiente),
          montoTotal: Number(pedido.monto_total)
        },
        disableClose: true,
        width: '400px',
        panelClass: 'custom-modal-panel'
      });

      const resultado = await firstValueFrom(dialogRef.afterClosed());
      if (!resultado) return;

      if (resultado === 'registrar') {
        const cats = await this.api.listCategorias('ingreso');
        const catId = cats.length > 1 ? cats[1].id : (cats.length > 0 ? cats[0].id : undefined);
        await this.api.updatePedido(pedido.id, { estado: 'entregado' });
        this.pedidos.update(list => list.map(item => item.id === pedido.id ? { ...item, estado: 'entregado' } : item));
        this.router.navigate(['/movimientos/nuevo'], {
          queryParams: {
            monto: Number(pedido.saldo_pendiente).toFixed(2),
            descripcion: `Liquidación Pedido ${pedido.cliente_nombre || ''} (Folio: ${pedido.folio})`,
            tipo: 'ingreso',
            cliente_id: pedido.cliente_id || undefined,
            pedido_id: pedido.id,
            sucursal_id: pedido.sucursal_id || undefined,
            categoria_id: catId
          }
        });
        return;
      }
    }

    this.updatingStatusId.set(pedido.id);
    try {
      await this.api.updatePedido(pedido.id, { estado: nextInfo.next });
      this.pedidos.update(list => list.map(item => item.id === pedido.id ? { ...item, estado: nextInfo.next as any } : item));

      if (nextInfo.next === 'listo') {
        const snackRef = this.snack.open(
          `Pedido ${pedido.folio} marcado como LISTO`,
          pedido.cliente_telefono ? 'Notificar WhatsApp' : 'OK',
          { duration: 5000 }
        );
        if (pedido.cliente_telefono) {
          snackRef.onAction().subscribe(() => {
            this.pedidoActions.sendWhatsapp({ ...pedido, estado: 'listo' });
          });
        }
      } else {
        this.snack.open(`Pedido ${pedido.folio}: estado actualizado a ${nextInfo.next}`, 'OK', { duration: 2000 });
      }
    } catch (err: any) {
      this.snack.open(err?.message || 'Error al actualizar estado', 'Cerrar', { duration: 3000 });
    } finally {
      this.updatingStatusId.set(null);
    }
  }
}