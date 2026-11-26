import { Component, HostListener, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, firstValueFrom, takeUntil } from 'rxjs';

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
import { QrScannerDialogComponent } from '../dialogs/qr-scanner-dialog.component';
import { TicketDialogComponent, TicketDialogData } from '../dialogs/ticket-dialog.component';

import { ApiClientService } from '../../../core/api-client.service';
import { PedidoActionsService } from '../../../core/pedido-actions.service';
import { Pedido, PedidoUpdatePayload } from '../../../core/models';

@Component({
  selector: 'app-pedidos-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatTooltipModule,
    MatDialogModule,
  ],
  templateUrl: './pedidos-list.html',
  styleUrls: ['./pedidos-list.scss'],
})
export class PedidosListComponent implements OnInit, OnDestroy {
  private api = inject(ApiClientService);
  private router = inject(Router);
  private snack = inject(MatSnackBar);
  public pedidoActions = inject(PedidoActionsService);
  private dialog = inject(MatDialog);

  protected readonly Number = Number;

  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();

  private scanBuffer = '';
  private lastScanKeyTime = 0;

  activeTab = signal<number>(0);
  loading = signal<boolean>(true);
  pedidos = signal<Pedido[]>([]);
  q = signal<string>('');
  updatingStatusId = signal<string | null>(null);
  sendingWaId = signal<string | null>(null);

  ngOnInit(): void {
    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((term) => {
        this.q.set(term);
        void this.reload();
      });

    void this.reload();
    void this.api.listCategorias('ingreso').catch(() => {});
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('window:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const tagName = target?.tagName?.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea' || target?.isContentEditable) {
      return;
    }

    const now = performance.now();
    if (now - this.lastScanKeyTime > 65) {
      this.scanBuffer = '';
    }
    this.lastScanKeyTime = now;

    if (event.key === 'Enter') {
      if (this.scanBuffer.length >= 6) {
        event.preventDefault();
        const capturado = this.scanBuffer;
        this.scanBuffer = '';
        void this.procesarCodigoEscaneado(capturado);
      } else {
        this.scanBuffer = '';
      }
      return;
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      this.scanBuffer += event.key;
    }
  }

  onSearchInput(valor: string): void {
    this.searchSubject.next(valor);
  }

  limpiarBusqueda(): void {
    this.q.set('');
    void this.reload();
  }

  async abrirEscanerQr(): Promise<void> {
    const ref = this.dialog.open(QrScannerDialogComponent, {
      width: '390px',
    });
    const resultado: string | null | undefined = await firstValueFrom(ref.afterClosed());
    if (resultado) {
      await this.procesarCodigoEscaneado(resultado);
    }
  }

  private async procesarCodigoEscaneado(raw: string): Promise<void> {
    const match = /\b(LAV-[A-Z0-9]{4,8})\b/i.exec(raw.trim());
    const termino = match ? match[1].toUpperCase() : raw.trim();
    this.q.set(termino);

    this.loading.set(true);
    try {
      const activos = await this.api.listPedidos({ activo: true, q: termino, limit: 10 });
      if (activos.length > 0) {
        this.activeTab.set(0);
        this.pedidos.set(activos);
        this.snack.open(`Pedido ${activos[0].folio} localizado`, 'OK', { duration: 2500 });
        return;
      }

      const historial = await this.api.listPedidos({ activo: false, q: termino, limit: 10 });
      if (historial.length > 0) {
        this.activeTab.set(1);
        this.pedidos.set(historial);
        this.snack.open(`Pedido ${historial[0].folio} encontrado en historial`, 'OK', { duration: 2500 });
        return;
      }

      this.pedidos.set([]);
      this.snack.open(`No se encontró ningún pedido para "${termino}"`, 'Cerrar', { duration: 3000 });
    } finally {
      this.loading.set(false);
    }
  }

  onTabChange(index: number): void {
    this.activeTab.set(index);
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const isActivo = this.activeTab() === 0;
      const data = await this.api.listPedidos({
        activo: isActivo,
        q: this.q() || undefined,
        limit: 50,
      });
      this.pedidos.set(data);
    } catch (e) {
      console.error(e);
    } finally {
      this.loading.set(false);
    }
  }

  abrirTicket(pedido: Pedido, event: MouseEvent): void {
    event.stopPropagation();
    this.dialog.open(TicketDialogComponent, {
      data: { pedido, esCreacion: false } as TicketDialogData,
      width: '390px',
    });
  }

  async notificarWhatsapp(pedido: Pedido, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    if (!pedido.cliente_telefono) {
      this.snack.open('Este cliente no tiene teléfono registrado', 'OK', { duration: 2500 });
      return;
    }

    if (pedido.whatsapp_automatico) {
      this.sendingWaId.set(pedido.id);
      try {
        const res = await this.api.notificarPedidoWhatsapp(pedido.id);
        if (res.ok) {
          this.snack.open(`Notificación enviada por WhatsApp (${pedido.folio})`, 'OK', { duration: 2500 });
          return;
        }
      } catch {
        // Fallback a apertura directa si el proveedor externo falla temporalmente
      } finally {
        this.sendingWaId.set(null);
      }
    }

    this.pedidoActions.sendWhatsapp(pedido);
  }

  async deletePedido(pedido: Pedido, event: MouseEvent): Promise<void> {
    event.stopPropagation();

    const dialogData: ConfirmDialogData = {
      title: 'Eliminar pedido',
      message: `¿Estás seguro de eliminar el pedido ${pedido.folio}? Esta acción no se puede deshacer.`,
      icon: 'delete_forever',
      color: 'warn',
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: dialogData,
      width: '360px',
      panelClass: 'custom-modal-panel',
    });

    const confirmacion = await firstValueFrom(dialogRef.afterClosed());
    if (!confirmacion) return;

    try {
      await this.api.deletePedido(pedido.id);
      this.pedidos.update((prev) => prev.filter((p) => p.id !== pedido.id));
      this.snack.open('Pedido eliminado correctamente', 'OK', { duration: 3000 });
    } catch {
      // Manejado por ApiClientService
    }
  }

  goToDetail(pedido: Pedido): void {
    this.router.navigate(['/pedidos', pedido.id]);
  }

  getNextStatusInfo(estado: string): { next: Pedido['estado']; label: string; icon: string; colorClass: string } | null {
    switch (estado) {
      case 'recibido':
        return { next: 'lavando', label: 'Lavado', icon: 'local_laundry_service', colorClass: 'btn-lavando' };
      case 'lavando':
        return { next: 'secando', label: 'Secado', icon: 'dry', colorClass: 'btn-secando' };
      case 'secando':
        return { next: 'doblando', label: 'Doblado', icon: 'layers', colorClass: 'btn-doblando' };
      case 'doblando':
        return { next: 'listo', label: 'Marcar Listo', icon: 'check_circle', colorClass: 'btn-listo' };
      case 'listo':
        return { next: 'entregado', label: 'Entregar', icon: 'inventory_2', colorClass: 'btn-entregar' };
      default:
        return null;
    }
  }

  puedeSaltarAListo(estado: string): boolean {
    return estado === 'recibido' || estado === 'lavando' || estado === 'secando';
  }

  async marcarListoDirecto(pedido: Pedido, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    await this.aplicarTransicionEstado(pedido, 'listo');
  }

  async avanzarEstado(pedido: Pedido, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    const nextInfo = this.getNextStatusInfo(pedido.estado);
    if (!nextInfo) return;
    await this.aplicarTransicionEstado(pedido, nextInfo.next);
  }

  private async aplicarTransicionEstado(pedido: Pedido, nuevoEstado: Pedido['estado']): Promise<void> {
    const payload: PedidoUpdatePayload = { estado: nuevoEstado };
    const saldoPendiente = Number(pedido.saldo_pendiente) || 0;

    if (nuevoEstado === 'entregado' && saldoPendiente > 0) {
      const dialogRef = this.dialog.open(EntregaDialogComponent, {
        data: {
          nombreCliente: pedido.cliente_nombre || 'Cliente',
          folio: pedido.folio,
          saldoPendiente,
          montoTotal: Number(pedido.monto_total) || 0,
        },
        disableClose: true,
        width: '400px',
        panelClass: 'custom-modal-panel',
      });

      const decision = await firstValueFrom(dialogRef.afterClosed());
      if (!decision) return;

      if (decision.accion === 'cobrar') {
        payload.monto_cobrado = saldoPendiente;
        payload.metodo_pago = decision.metodoPago || 'efectivo';
        if (decision.categoriaIngresoId) {
          payload.categoria_ingreso_id = decision.categoriaIngresoId;
        }
      }
    }

    this.updatingStatusId.set(pedido.id);
    try {
      const actualizado = await this.api.updatePedido(pedido.id, payload);

      if (nuevoEstado === 'entregado' && this.activeTab() === 0) {
        this.pedidos.update((list) => list.filter((item) => item.id !== pedido.id));
        const msj = payload.monto_cobrado
          ? `Pedido ${pedido.folio} entregado y cobro registrado en caja`
          : saldoPendiente > 0
            ? `Pedido ${pedido.folio} entregado (saldo enviado a Deudas)`
            : `Pedido ${pedido.folio} entregado`;
        this.snack.open(msj, 'OK', { duration: 3500 });
        return;
      }

      this.pedidos.update((list) =>
        list.map((item) => (item.id === pedido.id ? { ...item, ...actualizado, estado: nuevoEstado } : item))
      );

      if (nuevoEstado === 'listo') {
        if (actualizado.whatsapp_disparado) {
          this.snack.open(`Pedido ${pedido.folio} LISTO y cliente notificado por WhatsApp`, 'OK', { duration: 3500 });
        } else {
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
        }
      } else {
        this.snack.open(`Pedido ${pedido.folio}: estatus actualizado a ${nuevoEstado}`, 'OK', { duration: 2000 });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al actualizar estatus';
      this.snack.open(msg, 'Cerrar', { duration: 3000 });
    } finally {
      this.updatingStatusId.set(null);
    }
  }
}
