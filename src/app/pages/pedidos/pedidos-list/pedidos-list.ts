import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiClientService } from '../../../core/api-client.service';
import type {
  Pedido,
  PedidoEstadoFilter,
  PedidosPaginadosQueryParams,
  PedidosPorEstadoCount,
  PedidosResumen,
  PedidoUpdatePayload,
  Sucursal,
} from '../../../core/models';
import { PedidoActionsService } from '../../../core/pedido-actions.service';
import {
  ConfirmDialogComponent,
  type ConfirmDialogData,
} from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import {
  EntregaDialogComponent,
  type EntregaDialogData,
  type EntregaDialogResponse,
} from '../dialogs/entrega-dialog.component';
import { QrScannerDialogComponent } from '../dialogs/qr-scanner-dialog.component';
import { TicketDialogComponent, type TicketDialogData } from '../dialogs/ticket-dialog.component';
import {
  PEDIDO_ACTIVE_STAGES,
  type HistorialDatePreset,
  type NextStatusAction,
  type OrderUrgencyInfo,
  type PedidoActiveStageKey,
  type PedidoActiveStageMeta,
  type PedidoStageMeta,
  calculateHistorialDateRange,
  calculateOrderCardProgress,
  canJumpToReady,
  extractScannedOrderQuery,
  formatCurrencyMXN,
  formatLocalDateFromInput,
  getNextStatusAction,
  getOrderUrgencyInfo,
  getPedidoStageMeta,
  isValidDateRange,
  parseLocalDateInput,
} from '../pedidos.helpers';

export type PedidosVista = 'activos' | 'historial';

export interface OrderCardVm {
  pedido: Pedido;
  stage: PedidoStageMeta;
  progress: number;
  urgency: OrderUrgencyInfo | null;
  effectiveDateLabel: string;
  nextAction: NextStatusAction | null;
  canJumpReady: boolean;
  montoTotal: number;
  saldoPendiente: number;
  formattedTotal: string;
  formattedSaldo: string;
  hasDebt: boolean;
  isPaid: boolean;
  descripcionBreve: string;
}

export interface PaginationMeta {
  from: number;
  to: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
}

const ACTIVOS_LIMIT = 100;
const SEARCH_DEBOUNCE_MS = 300;
const SCAN_INTER_KEY_MS = 65;
const SCAN_MIN_LENGTH = 6;

const EMPTY_POR_ESTADO: PedidosPorEstadoCount = {
  recibido: 0,
  lavando: 0,
  secando: 0,
  doblando: 0,
  listo: 0,
  entregado: 0,
  cancelado: 0,
};

const EMPTY_RESUMEN: PedidosResumen = {
  total: 0,
  en_proceso: 0,
  listos: 0,
  por_cobrar_count: 0,
  por_cobrar_monto: 0,
  por_estado: EMPTY_POR_ESTADO,
};

@Component({
  selector: 'app-pedidos-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatIconModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatDialogModule,
  ],
  templateUrl: './pedidos-list.html',
  styleUrls: ['./pedidos-list.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PedidosListComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiClientService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  readonly pedidoActions = inject(PedidoActionsService);

  private fetchSeq = 0;
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private scanBuffer = '';
  private lastScanKeyTime = 0;

  readonly activeStages: ReadonlyArray<PedidoActiveStageMeta> = PEDIDO_ACTIVE_STAGES;
  readonly limitOptions: ReadonlyArray<number> = [20, 50, 100];
  readonly skeletonItems: ReadonlyArray<number> = [1, 2, 3, 4];

  readonly historialPresets: ReadonlyArray<{ value: HistorialDatePreset; label: string }> = [
    { value: 'todo', label: 'Todo' },
    { value: 'hoy', label: 'Hoy' },
    { value: '7d', label: '7d' },
    { value: 'mes', label: 'Mes' },
    { value: 'custom', label: 'Personalizado' },
  ];

  readonly historialEstados: ReadonlyArray<{ value: '' | 'entregado' | 'cancelado'; label: string }> = [
    { value: '', label: 'Todos' },
    { value: 'entregado', label: 'Entregado' },
    { value: 'cancelado', label: 'Cancelado' },
  ];

  readonly vista = signal<PedidosVista>('activos');
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly pedidos = signal<Pedido[]>([]);
  readonly totalCount = signal<number>(0);
  readonly resumen = signal<PedidosResumen>(EMPTY_RESUMEN);
  readonly sucursales = signal<Sucursal[]>([]);

  readonly qInput = signal<string>('');
  readonly q = signal<string>('');
  readonly sucursalId = signal<string>('');
  readonly estadoFiltro = signal<PedidoEstadoFilter | ''>('');
  readonly soloPorCobrar = signal<boolean>(false);

  readonly historialPreset = signal<HistorialDatePreset>('todo');
  readonly desde = signal<string>('');
  readonly hasta = signal<string>('');
  readonly dateRangeError = signal<string | null>(null);

  readonly limit = signal<number>(20);
  readonly offset = signal<number>(0);

  readonly processingId = signal<string | null>(null);
  readonly sendingWaId = signal<string | null>(null);

  readonly esActivos = computed<boolean>(() => this.vista() === 'activos');
  readonly esHistorial = computed<boolean>(() => this.vista() === 'historial');

  readonly isEnProcesoActive = computed<boolean>(
    () => this.esActivos() && this.estadoFiltro() === '' && !this.soloPorCobrar()
  );

  readonly enProcesoSubtitle = computed<string>(() => {
    const total = this.resumen().total;
    return total === 1 ? '1 activo en total' : `${total} activos en total`;
  });

  readonly porCobrarSubtitle = computed<string>(() => {
    const count = this.resumen().por_cobrar_count;
    if (count === 0) {
      return 'Sin saldos pendientes';
    }
    return count === 1 ? '1 pedido con saldo' : `${count} pedidos con saldo`;
  });

  readonly hasActiveFilters = computed<boolean>(() => {
    if (this.q().trim() !== '' || this.sucursalId() !== '' || this.estadoFiltro() !== '') {
      return true;
    }
    if (this.esActivos() && this.soloPorCobrar()) {
      return true;
    }
    if (
      this.esHistorial() &&
      (this.historialPreset() !== 'todo' || this.desde() !== '' || this.hasta() !== '')
    ) {
      return true;
    }
    return false;
  });

  readonly paginationMeta = computed<PaginationMeta>(() => {
    const total = this.totalCount();
    const currentLimit = this.limit();
    const currentOffset = this.offset();
    const visibleCount = this.pedidos().length;
    if (total === 0 || visibleCount === 0) {
      return { from: 0, to: 0, total, canPrev: false, canNext: false };
    }
    const from = Math.min(currentOffset + 1, total);
    const to = Math.min(currentOffset + visibleCount, total);
    return {
      from,
      to,
      total,
      canPrev: currentOffset > 0,
      canNext: currentOffset + currentLimit < total,
    };
  });

  readonly orderCards = computed<OrderCardVm[]>(() => {
    const isActivos = this.esActivos();
    return this.pedidos().map((pedido) => {
      const montoTotal = this.toFiniteNumber(pedido.monto_total);
      const saldoPendiente = this.toFiniteNumber(pedido.saldo_pendiente);
      const hasDebt = saldoPendiente > 0;
      const isPaid = saldoPendiente === 0 && montoTotal > 0;
      return {
        pedido,
        stage: getPedidoStageMeta(pedido.estado),
        progress: calculateOrderCardProgress(pedido.estado),
        urgency: isActivos ? getOrderUrgencyInfo(pedido.fecha_entrega_estimada) : null,
        effectiveDateLabel: isActivos ? '' : this.formatEffectiveDate(pedido),
        nextAction: isActivos ? getNextStatusAction(pedido.estado) : null,
        canJumpReady: isActivos ? canJumpToReady(pedido.estado) : false,
        montoTotal,
        saldoPendiente,
        formattedTotal: formatCurrencyMXN(montoTotal),
        formattedSaldo: formatCurrencyMXN(saldoPendiente),
        hasDebt,
        isPaid,
        descripcionBreve: (pedido.descripcion ?? '').trim(),
      };
    });
  });

  ngOnInit(): void {
    void this.cargarCatalogos();
    void this.fetchPedidos();
  }

  ngOnDestroy(): void {
    this.cancelPendingSearchTimer();
  }

  @HostListener('window:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    const target = event.target;
    if (target instanceof HTMLElement) {
      const tagName = target.tagName.toLowerCase();
      if (
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        target.isContentEditable
      ) {
        return;
      }
    }

    const now = performance.now();
    if (now - this.lastScanKeyTime > SCAN_INTER_KEY_MS) {
      this.scanBuffer = '';
    }
    this.lastScanKeyTime = now;

    if (event.key === 'Enter') {
      if (this.scanBuffer.length >= SCAN_MIN_LENGTH) {
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

  setVista(next: PedidosVista): void {
    if (next === this.vista()) {
      return;
    }
    this.vista.set(next);
    this.estadoFiltro.set('');
    this.soloPorCobrar.set(false);
    this.dateRangeError.set(null);
    this.offset.set(0);
    if (next === 'historial' && this.historialPreset() === 'custom' && !isValidDateRange(this.desde(), this.hasta())) {
      this.historialPreset.set('todo');
      this.desde.set('');
      this.hasta.set('');
    }
    void this.fetchPedidos();
  }

  onSearchInput(valor: string): void {
    this.qInput.set(valor);
    this.cancelPendingSearchTimer();
    this.searchDebounceTimer = setTimeout(() => {
      this.searchDebounceTimer = null;
      const normalized = this.qInput().trim();
      if (normalized === this.q()) {
        return;
      }
      this.q.set(normalized);
      this.offset.set(0);
      void this.fetchPedidos();
    }, SEARCH_DEBOUNCE_MS);
  }

  onSearchInputEvent(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    this.onSearchInput(target.value);
  }

  onSearchSubmit(): void {
    this.cancelPendingSearchTimer();
    const normalized = this.qInput().trim();
    if (!normalized && this.q() === '') {
      return;
    }
    this.q.set(normalized);
    this.offset.set(0);
    void this.fetchPedidos();
  }

  limpiarBusqueda(): void {
    this.cancelPendingSearchTimer();
    const hadCommittedQuery = this.q() !== '';
    this.qInput.set('');
    this.q.set('');
    if (hadCommittedQuery) {
      this.offset.set(0);
      void this.fetchPedidos();
    }
  }

  onSucursalChange(sucursalId: string): void {
    if (sucursalId === this.sucursalId()) {
      return;
    }
    this.sucursalId.set(sucursalId);
    this.offset.set(0);
    void this.fetchPedidos();
  }

  onSucursalSelectEvent(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }
    this.onSucursalChange(target.value);
  }

  onEstadoChange(estado: PedidoEstadoFilter | ''): void {
    if (estado === this.estadoFiltro()) {
      return;
    }
    this.estadoFiltro.set(estado);
    this.offset.set(0);
    void this.fetchPedidos();
  }

  onKpiEnProcesoClick(): void {
    if (this.estadoFiltro() === '' && !this.soloPorCobrar()) {
      return;
    }
    this.estadoFiltro.set('');
    this.soloPorCobrar.set(false);
    this.offset.set(0);
    void this.fetchPedidos();
  }

  toggleListosKpi(): void {
    const nextEstado: PedidoEstadoFilter | '' = this.estadoFiltro() === 'listo' ? '' : 'listo';
    this.estadoFiltro.set(nextEstado);
    this.offset.set(0);
    void this.fetchPedidos();
  }

  toggleSoloPorCobrar(): void {
    this.soloPorCobrar.update((prev) => !prev);
    this.offset.set(0);
    void this.fetchPedidos();
  }

  setHistorialPreset(preset: HistorialDatePreset): void {
    this.historialPreset.set(preset);
    this.dateRangeError.set(null);

    if (preset === 'custom') {
      return;
    }

    const range = calculateHistorialDateRange(preset);
    this.desde.set(range.desde);
    this.hasta.set(range.hasta);
    this.offset.set(0);
    void this.fetchPedidos();
  }

  onDesdeChange(value: string): void {
    this.desde.set(value.trim());
    this.applyCustomDateRange();
  }

  onHastaChange(value: string): void {
    this.hasta.set(value.trim());
    this.applyCustomDateRange();
  }

  onDesdeInputEvent(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    this.onDesdeChange(target.value);
  }

  onHastaInputEvent(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    this.onHastaChange(target.value);
  }

  limpiarFiltros(): void {
    this.cancelPendingSearchTimer();
    this.qInput.set('');
    this.q.set('');
    this.sucursalId.set('');
    this.estadoFiltro.set('');
    this.soloPorCobrar.set(false);
    this.historialPreset.set('todo');
    this.desde.set('');
    this.hasta.set('');
    this.dateRangeError.set(null);
    this.offset.set(0);
    void this.fetchPedidos();
  }

  prevPage(): void {
    if (!this.paginationMeta().canPrev) {
      return;
    }
    this.offset.set(Math.max(0, this.offset() - this.limit()));
    void this.fetchPedidos();
  }

  nextPage(): void {
    if (!this.paginationMeta().canNext) {
      return;
    }
    this.offset.set(this.offset() + this.limit());
    void this.fetchPedidos();
  }

  onLimitChange(nextLimit: number): void {
    if (!this.limitOptions.includes(nextLimit) || nextLimit === this.limit()) {
      return;
    }
    this.limit.set(nextLimit);
    this.offset.set(0);
    void this.fetchPedidos();
  }

  onLimitSelectEvent(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }
    this.onLimitChange(Number(target.value));
  }

  reload(): void {
    void this.fetchPedidos();
  }

  async fetchPedidos(): Promise<void> {
    if (this.esHistorial() && !isValidDateRange(this.desde(), this.hasta())) {
      this.dateRangeError.set('La fecha inicial no puede ser mayor que la fecha final.');
      return;
    }

    const seq = ++this.fetchSeq;
    this.loading.set(true);
    this.error.set(null);

    const isActivos = this.esActivos();
    const params: PedidosPaginadosQueryParams = {
      activo: isActivos,
      q: this.q() || undefined,
      sucursal_id: this.sucursalId() || undefined,
      estado: this.estadoFiltro() || undefined,
      limit: isActivos ? ACTIVOS_LIMIT : this.limit(),
      offset: isActivos ? 0 : this.offset(),
    };

    if (isActivos && this.soloPorCobrar()) {
      params.solo_por_cobrar = true;
    }

    if (!isActivos) {
      if (this.desde()) {
        params.desde = this.desde();
      }
      if (this.hasta()) {
        params.hasta = this.hasta();
      }
    }

    try {
      const res = await this.api.listPedidosPaginados(params);
      if (seq !== this.fetchSeq) {
        return;
      }

      const data = Array.isArray(res?.data) ? res.data : [];
      const count = typeof res?.count === 'number' && Number.isFinite(res.count) ? res.count : data.length;
      this.pedidos.set(data);
      this.totalCount.set(count);
      this.resumen.set(this.normalizeResumen(res?.resumen));
    } catch (err: unknown) {
      if (seq !== this.fetchSeq) {
        return;
      }
      const msg = err instanceof Error ? err.message : 'No se pudieron cargar los pedidos.';
      this.error.set(msg);
    } finally {
      if (seq === this.fetchSeq) {
        this.loading.set(false);
      }
    }
  }

  async abrirEscanerQr(): Promise<void> {
    const ref = this.dialog.open<QrScannerDialogComponent, undefined, string | null | undefined>(
      QrScannerDialogComponent,
      { width: '390px' }
    );
    const resultado = await firstValueFrom(ref.afterClosed());
    if (resultado) {
      await this.procesarCodigoEscaneado(resultado);
    }
  }

  async procesarCodigoEscaneado(raw: string): Promise<void> {
    const termino = extractScannedOrderQuery(raw);
    if (!termino) {
      return;
    }

    this.cancelPendingSearchTimer();

    this.sucursalId.set('');
    this.estadoFiltro.set('');
    this.soloPorCobrar.set(false);
    this.historialPreset.set('todo');
    this.desde.set('');
    this.hasta.set('');
    this.dateRangeError.set(null);
    this.offset.set(0);
    this.qInput.set(termino);
    this.q.set(termino);

    const seq = ++this.fetchSeq;
    this.loading.set(true);
    this.error.set(null);

    try {
      const activosRes = await this.api.listPedidosPaginados({
        activo: true,
        q: termino,
        limit: ACTIVOS_LIMIT,
        offset: 0,
      });
      if (seq !== this.fetchSeq) {
        return;
      }

      const activosData = Array.isArray(activosRes?.data) ? activosRes.data : [];
      if (activosData.length > 0) {
        this.vista.set('activos');
        this.pedidos.set(activosData);
        this.totalCount.set(
          typeof activosRes?.count === 'number' ? activosRes.count : activosData.length
        );
        this.resumen.set(this.normalizeResumen(activosRes?.resumen));
        this.snack.open(`Pedido ${activosData[0].folio} localizado`, 'OK', { duration: 2500 });
        return;
      }

      const historialRes = await this.api.listPedidosPaginados({
        activo: false,
        q: termino,
        limit: this.limit(),
        offset: 0,
      });
      if (seq !== this.fetchSeq) {
        return;
      }

      const historialData = Array.isArray(historialRes?.data) ? historialRes.data : [];
      if (historialData.length > 0) {
        this.vista.set('historial');
        this.pedidos.set(historialData);
        this.totalCount.set(
          typeof historialRes?.count === 'number' ? historialRes.count : historialData.length
        );
        this.resumen.set(this.normalizeResumen(historialRes?.resumen));
        this.snack.open(`Pedido ${historialData[0].folio} encontrado en historial`, 'OK', {
          duration: 2500,
        });
        return;
      }

      this.vista.set('activos');
      this.pedidos.set([]);
      this.totalCount.set(0);
      this.resumen.set(this.normalizeResumen(activosRes?.resumen));
      this.snack.open(`No se encontró ningún pedido para "${termino}"`, 'Cerrar', {
        duration: 3000,
      });
    } catch (err: unknown) {
      if (seq !== this.fetchSeq) {
        return;
      }
      const msg = err instanceof Error ? err.message : 'No se pudo localizar el código escaneado.';
      this.error.set(msg);
    } finally {
      if (seq === this.fetchSeq) {
        this.loading.set(false);
      }
    }
  }

  abrirTicket(pedido: Pedido, event: MouseEvent): void {
    event.stopPropagation();
    this.dialog.open<TicketDialogComponent, TicketDialogData>(TicketDialogComponent, {
      data: { pedido, esCreacion: false },
      width: '390px',
    });
  }

  async notificarWhatsapp(pedido: Pedido, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    if (this.sendingWaId() === pedido.id) {
      return;
    }

    if (!pedido.cliente_telefono) {
      this.snack.open('Este cliente no tiene teléfono registrado', 'OK', { duration: 2500 });
      return;
    }

    if (pedido.whatsapp_automatico) {
      this.sendingWaId.set(pedido.id);
      try {
        const res = await this.api.notificarPedidoWhatsapp(pedido.id);
        if (res.ok) {
          this.snack.open(`Notificación enviada por WhatsApp (${pedido.folio})`, 'OK', {
            duration: 2500,
          });
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
    if (this.processingId() === pedido.id) {
      return;
    }

    const dialogData: ConfirmDialogData = {
      title: 'Eliminar pedido',
      message: `¿Estás seguro de eliminar el pedido ${pedido.folio}? Esta acción no se puede deshacer.`,
      icon: 'delete_forever',
      color: 'warn',
    };

    const dialogRef = this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean | undefined>(
      ConfirmDialogComponent,
      {
        data: dialogData,
        width: '360px',
        panelClass: 'custom-modal-panel',
      }
    );

    const confirmacion = await firstValueFrom(dialogRef.afterClosed());
    if (!confirmacion) {
      return;
    }

    this.processingId.set(pedido.id);
    try {
      await this.api.deletePedido(pedido.id);
      this.pedidos.update((prev) => prev.filter((item) => item.id !== pedido.id));
      this.totalCount.update((prev) => Math.max(0, prev - 1));
      this.applyResumenDeletion(pedido);
      this.snack.open('Pedido eliminado correctamente', 'OK', { duration: 3000 });
      if (this.esHistorial() && this.pedidos().length === 0 && this.offset() > 0 && this.totalCount() > 0) {
        this.offset.set(Math.max(0, this.offset() - this.limit()));
        void this.fetchPedidos();
      }
    } catch {
      // Manejado por ApiClientService
    } finally {
      this.processingId.set(null);
    }
  }

  goToDetail(pedido: Pedido): void {
    void this.router.navigate(['/pedidos', pedido.id]);
  }

  async avanzarEstado(pedido: Pedido, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    const nextAction = getNextStatusAction(pedido.estado);
    if (!nextAction) {
      return;
    }
    await this.aplicarTransicionEstado(pedido, nextAction.next);
  }

  async marcarListoDirecto(pedido: Pedido, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    await this.aplicarTransicionEstado(pedido, 'listo');
  }

  getStageCount(stageKey: PedidoActiveStageKey): number {
    return this.resumen().por_estado[stageKey] ?? 0;
  }

  formatCurrency(value: number): string {
    return formatCurrencyMXN(value);
  }

  trackByOrderCard(_index: number, card: OrderCardVm): string {
    return card.pedido.id;
  }

  trackBySucursalId(_index: number, sucursal: Sucursal): string {
    return sucursal.id;
  }

  trackByStageKey(_index: number, stage: PedidoActiveStageMeta): string {
    return stage.key;
  }

  trackByIndex(index: number): number {
    return index;
  }

  private async cargarCatalogos(): Promise<void> {
    try {
      const sucs = await this.api.listSucursales({ activo: 1 });
      this.sucursales.set(Array.isArray(sucs) ? sucs : []);
    } catch {
      this.sucursales.set([]);
    }

    try {
      await this.api.listCategorias('ingreso');
    } catch {
      // Precarga no bloqueante para EntregaDialogComponent
    }
  }

  private applyCustomDateRange(): void {
    if (!isValidDateRange(this.desde(), this.hasta())) {
      this.dateRangeError.set('La fecha inicial no puede ser mayor que la fecha final.');
      return;
    }
    this.dateRangeError.set(null);
    this.offset.set(0);
    void this.fetchPedidos();
  }

  private async aplicarTransicionEstado(
    pedido: Pedido,
    nuevoEstado: Pedido['estado']
  ): Promise<void> {
    if (this.processingId() === pedido.id) {
      return;
    }

    const payload: PedidoUpdatePayload = { estado: nuevoEstado };
    const saldoPendiente = this.toFiniteNumber(pedido.saldo_pendiente);

    if (nuevoEstado === 'entregado' && saldoPendiente > 0) {
      const dialogData: EntregaDialogData = {
        nombreCliente: pedido.cliente_nombre || 'Cliente',
        folio: pedido.folio,
        saldoPendiente,
        montoTotal: this.toFiniteNumber(pedido.monto_total),
      };

      const dialogRef = this.dialog.open<
        EntregaDialogComponent,
        EntregaDialogData,
        EntregaDialogResponse | undefined
      >(EntregaDialogComponent, {
        data: dialogData,
        disableClose: true,
        width: '400px',
        panelClass: 'custom-modal-panel',
      });

      const decision = await firstValueFrom(dialogRef.afterClosed());
      if (!decision) {
        return;
      }

      if (decision.accion === 'cobrar') {
        payload.monto_cobrado = saldoPendiente;
        payload.metodo_pago = decision.metodoPago || 'efectivo';
        if (decision.categoriaIngresoId) {
          payload.categoria_ingreso_id = decision.categoriaIngresoId;
        }
      }
    }

    this.processingId.set(pedido.id);
    try {
      const actualizado = await this.api.updatePedido(pedido.id, payload);
      const cobradoEnEntrega = Boolean(payload.monto_cobrado);
      this.applyResumenTransition(pedido, nuevoEstado, cobradoEnEntrega);

      if (nuevoEstado === 'entregado' && this.esActivos()) {
        this.pedidos.update((list) => list.filter((item) => item.id !== pedido.id));
        this.totalCount.update((prev) => Math.max(0, prev - 1));
        const msj = cobradoEnEntrega
          ? `Pedido ${pedido.folio} entregado y cobro registrado en caja`
          : saldoPendiente > 0
            ? `Pedido ${pedido.folio} entregado (saldo enviado a Deudas)`
            : `Pedido ${pedido.folio} entregado`;
        this.snack.open(msj, 'OK', { duration: 3500 });
        return;
      }

      const filtroActual = this.estadoFiltro();
      if (filtroActual && filtroActual !== nuevoEstado) {
        this.pedidos.update((list) => list.filter((item) => item.id !== pedido.id));
        this.totalCount.update((prev) => Math.max(0, prev - 1));
      } else {
        this.pedidos.update((list) =>
          list.map((item) =>
            item.id === pedido.id ? { ...item, ...actualizado, estado: nuevoEstado } : item
          )
        );
      }

      if (nuevoEstado === 'listo') {
        if (actualizado.whatsapp_disparado) {
          this.snack.open(`Pedido ${pedido.folio} listo y cliente notificado por WhatsApp`, 'OK', {
            duration: 3500,
          });
        } else {
          const snackRef = this.snack.open(
            `Pedido ${pedido.folio} marcado como listo`,
            pedido.cliente_telefono ? 'Notificar WhatsApp' : 'OK',
            { duration: 5000 }
          );
          if (pedido.cliente_telefono) {
            snackRef.onAction().subscribe(() => {
              this.pedidoActions.sendWhatsapp({ ...pedido, ...actualizado, estado: 'listo' });
            });
          }
        }
      } else {
        const meta = getPedidoStageMeta(nuevoEstado);
        this.snack.open(`Pedido ${pedido.folio}: estatus actualizado a ${meta.label}`, 'OK', {
          duration: 2000,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al actualizar estatus';
      this.snack.open(msg, 'Cerrar', { duration: 3000 });
    } finally {
      this.processingId.set(null);
    }
  }

  private applyResumenTransition(
    prevPedido: Pedido,
    nuevoEstado: Pedido['estado'],
    cobradoEnEntrega: boolean
  ): void {
    const prevEstado = prevPedido.estado;
    if (prevEstado === nuevoEstado) {
      return;
    }

    const saldoAnterior = this.toFiniteNumber(prevPedido.saldo_pendiente);
    const wasActive = this.isActiveStage(prevEstado);
    const isNowActive = this.isActiveStage(nuevoEstado);

    this.resumen.update((curr) => {
      const porEstado: PedidosPorEstadoCount = { ...curr.por_estado };
      const prevCount = porEstado[prevEstado];
      if (typeof prevCount === 'number') {
        porEstado[prevEstado] = Math.max(0, prevCount - 1);
      }
      if (this.esActivos() ? isNowActive : !isNowActive) {
        const nextCount = porEstado[nuevoEstado];
        if (typeof nextCount === 'number') {
          porEstado[nuevoEstado] = nextCount + 1;
        }
      }

      let total = curr.total;
      let enProceso = curr.en_proceso;
      let listos = curr.listos;
      let porCobrarCount = curr.por_cobrar_count;
      let porCobrarMonto = curr.por_cobrar_monto;

      if (this.esActivos()) {
        if (wasActive && !isNowActive) {
          total = Math.max(0, total - 1);
          if (prevEstado === 'listo') {
            listos = Math.max(0, listos - 1);
          } else {
            enProceso = Math.max(0, enProceso - 1);
          }
          if (saldoAnterior > 0) {
            porCobrarCount = Math.max(0, porCobrarCount - 1);
            porCobrarMonto = Math.max(0, Number((porCobrarMonto - saldoAnterior).toFixed(2)));
          }
        } else if (wasActive && isNowActive) {
          if (prevEstado !== 'listo' && nuevoEstado === 'listo') {
            enProceso = Math.max(0, enProceso - 1);
            listos = listos + 1;
          } else if (prevEstado === 'listo' && nuevoEstado !== 'listo') {
            listos = Math.max(0, listos - 1);
            enProceso = enProceso + 1;
          }
          if (cobradoEnEntrega && saldoAnterior > 0) {
            porCobrarCount = Math.max(0, porCobrarCount - 1);
            porCobrarMonto = Math.max(0, Number((porCobrarMonto - saldoAnterior).toFixed(2)));
          }
        }
      }

      return {
        total,
        en_proceso: enProceso,
        listos,
        por_cobrar_count: porCobrarCount,
        por_cobrar_monto: porCobrarMonto,
        por_estado: porEstado,
      };
    });
  }

  private applyResumenDeletion(pedido: Pedido): void {
    const saldo = this.toFiniteNumber(pedido.saldo_pendiente);
    const estado = pedido.estado;

    this.resumen.update((curr) => {
      const porEstado: PedidosPorEstadoCount = { ...curr.por_estado };
      const currentStageCount = porEstado[estado];
      if (typeof currentStageCount === 'number') {
        porEstado[estado] = Math.max(0, currentStageCount - 1);
      }

      const total = Math.max(0, curr.total - 1);
      const listos = estado === 'listo' ? Math.max(0, curr.listos - 1) : curr.listos;
      const enProceso =
        this.isActiveStage(estado) && estado !== 'listo'
          ? Math.max(0, curr.en_proceso - 1)
          : curr.en_proceso;
      const porCobrarCount =
        saldo > 0 ? Math.max(0, curr.por_cobrar_count - 1) : curr.por_cobrar_count;
      const porCobrarMonto =
        saldo > 0
          ? Math.max(0, Number((curr.por_cobrar_monto - saldo).toFixed(2)))
          : curr.por_cobrar_monto;

      return {
        total,
        en_proceso: enProceso,
        listos,
        por_cobrar_count: porCobrarCount,
        por_cobrar_monto: porCobrarMonto,
        por_estado: porEstado,
      };
    });
  }

  private normalizeResumen(raw: PedidosResumen | null | undefined): PedidosResumen {
    if (!raw) {
      return EMPTY_RESUMEN;
    }
    const porEstado = raw.por_estado;
    return {
      total: this.toFiniteNumber(raw.total),
      en_proceso: this.toFiniteNumber(raw.en_proceso),
      listos: this.toFiniteNumber(raw.listos),
      por_cobrar_count: this.toFiniteNumber(raw.por_cobrar_count),
      por_cobrar_monto: this.toFiniteNumber(raw.por_cobrar_monto),
      por_estado: {
        recibido: this.toFiniteNumber(porEstado?.recibido),
        lavando: this.toFiniteNumber(porEstado?.lavando),
        secando: this.toFiniteNumber(porEstado?.secando),
        doblando: this.toFiniteNumber(porEstado?.doblando),
        listo: this.toFiniteNumber(porEstado?.listo),
        entregado: this.toFiniteNumber(porEstado?.entregado),
        cancelado: this.toFiniteNumber(porEstado?.cancelado),
      },
    };
  }

  private isActiveStage(estado: Pedido['estado']): boolean {
    return estado !== 'entregado' && estado !== 'cancelado';
  }

  private formatEffectiveDate(pedido: Pedido): string {
    const raw =
      pedido.fecha_entregado ||
      pedido.updated_at ||
      pedido.created_at ||
      pedido.fecha_entrega_estimada;
    const localIso = formatLocalDateFromInput(raw);
    const parsed = parseLocalDateInput(localIso);
    if (!parsed) {
      return '';
    }
    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
      .format(parsed)
      .replace(/\./g, '');
  }

  private cancelPendingSearchTimer(): void {
    if (this.searchDebounceTimer !== null) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
  }

  private toFiniteNumber(value: unknown): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }
}
