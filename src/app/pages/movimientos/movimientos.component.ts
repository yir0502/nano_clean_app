import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DATE_LOCALE, MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Subject, firstValueFrom, map, of, switchMap, timer } from 'rxjs';

import { ApiClientService } from '../../core/api-client.service';
import {
  Categoria,
  Movimiento,
  MovimientosQueryParams,
  MovimientosTotales,
  Sucursal,
} from '../../core/models';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { MovimientosApiService } from './movimientos-api.service';
import {
  FiltroAvanzadoChip,
  PaginacionMeta,
  PresetDetectado,
  PresetRango,
  calcularMetaPaginacion,
  calcularRangoPreset,
  construirChipsFiltrosAvanzados,
  detectarPresetActivo,
  formatDateIsoLocal,
  formatMetodoPagoLabel,
} from './movimientos.helpers';

type TipoFiltro = 'todos' | 'ingreso' | 'egreso';

@Component({
  selector: 'app-movimientos',
  standalone: true,
  providers: [{ provide: MAT_DATE_LOCALE, useValue: 'es-MX' }],
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './movimientos.component.html',
  styleUrls: ['./movimientos.component.scss'],
})
export class MovimientosComponent implements OnInit {
  private readonly movimientosApi = inject(MovimientosApiService);
  private readonly api = inject(ApiClientService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  private readonly rangoInicial = calcularRangoPreset('mes');
  private readonly searchTrigger$ = new Subject<{ term: string; immediate: boolean }>();
  private fetchSeq = 0;
  private pendingRangeChange = false;

  readonly pageSizeOptions = [10, 20, 50];
  readonly skeletonRows = [1, 2, 3, 4, 5];
  readonly tiposFiltro: ReadonlyArray<{ id: TipoFiltro; label: string }> = [
    { id: 'todos', label: 'Todos' },
    { id: 'ingreso', label: 'Ingresos' },
    { id: 'egreso', label: 'Egresos' },
  ];
  readonly presets: ReadonlyArray<{ id: PresetRango; label: string }> = [
    { id: 'hoy', label: 'Hoy' },
    { id: '7d', label: '7d' },
    { id: '30d', label: '30d' },
    { id: 'mes', label: 'Mes' },
  ];
  readonly metodos: ReadonlyArray<{ id: string; label: string }> = [
    { id: '', label: 'Todos' },
    { id: 'efectivo', label: 'Efectivo' },
    { id: 'transferencia', label: 'Transferencia' },
    { id: 'tarjeta', label: 'Tarjeta' },
    { id: 'mercado_pago', label: 'Mercado Pago' },
    { id: 'otro', label: 'Otro' },
  ];

  loading = signal<boolean>(true);
  error = signal<string | null>(null);
  items = signal<Movimiento[]>([]);
  totalCount = signal<number>(0);
  totales = signal<MovimientosTotales>({ ingresos: 0, egresos: 0, balance: 0 });

  page = signal<number>(0);
  pageSize = signal<number>(20);

  filtrosAvanzadosAbiertos = signal<boolean>(false);
  expandedNotes = signal<Record<string, boolean>>({});

  catsIngreso = signal<Categoria[]>([]);
  catsEgreso = signal<Categoria[]>([]);
  sucursales = signal<Sucursal[]>([]);

  tipo = signal<TipoFiltro>('todos');
  categoriaId = signal<string>('');
  sucursalId = signal<string>('');
  metodoPago = signal<string>('');
  qInput = signal<string>('');
  q = signal<string>('');
  desde = signal<Date>(this.rangoInicial.desde);
  hasta = signal<Date>(this.rangoInicial.hasta);

  totalIngresos = computed<number>(() => this.totales().ingresos);
  totalEgresos = computed<number>(() => this.totales().egresos);
  totalBalance = computed<number>(() => this.totales().balance);
  totalMovimientosPeriodo = computed<number>(
    () => this.totales().total_movimientos ?? this.totalCount()
  );
  ingresosCount = computed<number | null>(() => this.totales().ingresos_count ?? null);
  egresosCount = computed<number | null>(() => this.totales().egresos_count ?? null);

  presetActivo = computed<PresetDetectado>(() =>
    detectarPresetActivo(this.desde(), this.hasta())
  );

  catsFiltradas = computed<Categoria[]>(() => {
    const tipoActual = this.tipo();
    if (tipoActual === 'ingreso') {
      return this.catsIngreso();
    }
    if (tipoActual === 'egreso') {
      return this.catsEgreso();
    }
    const seen = new Set<string>();
    const out: Categoria[] = [];
    for (const c of [...this.catsIngreso(), ...this.catsEgreso()]) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        out.push(c);
      }
    }
    return out;
  });

  private readonly catsById = computed<Map<string, string>>(() => {
    const mapById = new Map<string, string>();
    for (const c of [...this.catsIngreso(), ...this.catsEgreso()]) {
      if (!mapById.has(c.id)) {
        mapById.set(c.id, c.nombre);
      }
    }
    return mapById;
  });

  paginacionMeta = computed<PaginacionMeta>(() =>
    calcularMetaPaginacion(this.totalCount(), this.page(), this.pageSize())
  );

  filtrosAvanzadosChips = computed<FiltroAvanzadoChip[]>(() =>
    construirChipsFiltrosAvanzados({
      presetActivo: this.presetActivo(),
      desde: this.desde(),
      hasta: this.hasta(),
      categoriaId: this.categoriaId(),
      categorias: [...this.catsIngreso(), ...this.catsEgreso()],
      sucursalId: this.sucursalId(),
      sucursales: this.sucursales(),
      metodoPago: this.metodoPago(),
    })
  );

  filtrosAvanzadosCount = computed<number>(() => this.filtrosAvanzadosChips().length);

  ngOnInit(): void {
    this.setupSearchDebounce();
    void this.init();
  }

  private setupSearchDebounce(): void {
    this.searchTrigger$
      .pipe(
        switchMap(({ term, immediate }) =>
          immediate ? of(term) : timer(300).pipe(map(() => term))
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((term) => {
        const normalized = term.trim();
        if (normalized === this.q()) {
          return;
        }
        this.q.set(normalized);
        this.page.set(0);
        void this.fetchPage();
      });
  }

  private async init(): Promise<void> {
    const rawQ = this.route.snapshot.queryParams['q'];
    const initialQ = typeof rawQ === 'string' ? rawQ.trim() : '';
    if (initialQ) {
      this.qInput.set(initialQ);
      this.q.set(initialQ);
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const [catsIn, catsEg, sucs] = await Promise.all([
        this.api.listCategorias('ingreso'),
        this.api.listCategorias('egreso'),
        this.api.listSucursales({ activo: 1 }),
      ]);
      this.catsIngreso.set(catsIn);
      this.catsEgreso.set(catsEg);
      this.sucursales.set(sucs);
    } catch (e: unknown) {
      console.error('Error cargando catalogos de movimientos:', e);
    }

    await this.fetchPage();
  }

  reload(): void {
    void this.fetchPage();
  }

  async fetchPage(): Promise<void> {
    const seq = ++this.fetchSeq;
    this.loading.set(true);
    this.error.set(null);

    try {
      const tipoValue = this.tipo();
      const params: MovimientosQueryParams = {
        desde: formatDateIsoLocal(this.desde()),
        hasta: formatDateIsoLocal(this.hasta()),
        ...(tipoValue !== 'todos' ? { tipo: tipoValue } : {}),
        categoria_id: this.categoriaId() || undefined,
        sucursal_id: this.sucursalId() || undefined,
        metodo_pago: this.metodoPago() || undefined,
        q: this.q() || undefined,
        limit: this.pageSize(),
        offset: this.page() * this.pageSize(),
      };

      const res = await this.movimientosApi.listarPaginados(params);
      if (seq !== this.fetchSeq) {
        return;
      }

      const safeItems = Array.isArray(res.data) ? res.data : [];
      const parsedCount = Number(res.count);
      const safeCount = Number.isFinite(parsedCount) ? Math.max(0, parsedCount) : 0;
      const safeTotales = res.totales ?? { ingresos: 0, egresos: 0, balance: 0 };

      this.items.set(safeItems);
      this.totalCount.set(safeCount);
      const nextTotales: MovimientosTotales = {
        ingresos: Number(safeTotales.ingresos) || 0,
        egresos: Number(safeTotales.egresos) || 0,
        balance: Number(safeTotales.balance) || 0,
        ...(typeof safeTotales.total_movimientos === 'number'
          ? { total_movimientos: safeTotales.total_movimientos }
          : {}),
        ...(typeof safeTotales.ingresos_count === 'number'
          ? { ingresos_count: safeTotales.ingresos_count }
          : {}),
        ...(typeof safeTotales.egresos_count === 'number'
          ? { egresos_count: safeTotales.egresos_count }
          : {}),
      };
      this.totales.set(nextTotales);
    } catch (e: unknown) {
      if (seq !== this.fetchSeq) {
        return;
      }
      const msg = e instanceof Error && e.message ? e.message : 'Error cargando movimientos';
      this.error.set(msg);
    } finally {
      if (seq === this.fetchSeq) {
        this.loading.set(false);
      }
    }
  }

  setPreset(p: PresetRango): void {
    const { desde, hasta } = calcularRangoPreset(p);
    this.desde.set(desde);
    this.hasta.set(hasta);
    this.pendingRangeChange = false;
    this.page.set(0);
    void this.fetchPage();
  }

  onStartDateChange(d: Date | null, pickerOpen = false): void {
    if (!d || Number.isNaN(d.getTime())) {
      return;
    }
    const normalized = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    this.desde.set(normalized);
    if (pickerOpen) {
      // Espera al cierre o fecha fin para no interrumpir la seleccion en el calendario
      this.pendingRangeChange = true;
      return;
    }
    if (normalized > this.hasta()) {
      this.hasta.set(normalized);
    }
    this.pendingRangeChange = false;
    this.page.set(0);
    void this.fetchPage();
  }

  onEndDateChange(d: Date | null, _pickerOpen = false): void {
    if (!d || Number.isNaN(d.getTime())) {
      return;
    }
    const normalized = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    this.hasta.set(normalized);
    if (normalized < this.desde()) {
      this.desde.set(normalized);
    }
    this.pendingRangeChange = false;
    this.page.set(0);
    void this.fetchPage();
  }

  onDateRangeClosed(): void {
    if (!this.pendingRangeChange) {
      return;
    }
    this.pendingRangeChange = false;
    if (this.desde() > this.hasta()) {
      this.hasta.set(this.desde());
    }
    this.page.set(0);
    void this.fetchPage();
  }

  onTipoChange(val: TipoFiltro): void {
    if (this.tipo() === val) {
      return;
    }
    this.tipo.set(val);
    this.categoriaId.set('');
    this.page.set(0);
    void this.fetchPage();
  }

  onKpiClick(target: TipoFiltro): void {
    if (this.tipo() === target && this.page() === 0) {
      return;
    }
    if (this.tipo() !== target) {
      this.tipo.set(target);
      this.categoriaId.set('');
    }
    this.page.set(0);
    void this.fetchPage();
  }

  onCategoriaChange(val: string): void {
    this.categoriaId.set(val);
    this.page.set(0);
    void this.fetchPage();
  }

  onSucursalChange(val: string): void {
    this.sucursalId.set(val);
    this.page.set(0);
    void this.fetchPage();
  }

  onMetodoChange(val: string): void {
    this.metodoPago.set(val);
    this.page.set(0);
    void this.fetchPage();
  }

  onQInputEvent(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const value = target ? target.value : '';
    this.qInput.set(value);
    this.searchTrigger$.next({ term: value, immediate: false });
  }

  onSearchSubmit(): void {
    this.searchTrigger$.next({ term: this.qInput(), immediate: true });
  }

  limpiarBusqueda(): void {
    this.qInput.set('');
    this.searchTrigger$.next({ term: '', immediate: true });
  }

  toggleFiltrosAvanzados(): void {
    this.filtrosAvanzadosAbiertos.update((v) => !v);
  }

  removerChip(key: FiltroAvanzadoChip['key']): void {
    switch (key) {
      case 'rango': {
        const rango = calcularRangoPreset('mes');
        this.desde.set(rango.desde);
        this.hasta.set(rango.hasta);
        break;
      }
      case 'categoria':
        this.categoriaId.set('');
        break;
      case 'sucursal':
        this.sucursalId.set('');
        break;
      case 'metodo':
        this.metodoPago.set('');
        break;
    }
    this.page.set(0);
    void this.fetchPage();
  }

  limpiarFiltros(): void {
    const rango = calcularRangoPreset('mes');
    this.desde.set(rango.desde);
    this.hasta.set(rango.hasta);
    this.pendingRangeChange = false;
    this.tipo.set('todos');
    this.categoriaId.set('');
    this.sucursalId.set('');
    this.metodoPago.set('');
    this.qInput.set('');
    this.q.set('');
    this.searchTrigger$.next({ term: '', immediate: true });
    this.page.set(0);
    void this.fetchPage();
  }

  onPageChange(nextPage: number): void {
    const meta = this.paginacionMeta();
    if (nextPage < 0 || nextPage >= meta.totalPages || nextPage === this.page()) {
      return;
    }
    this.page.set(nextPage);
    void this.fetchPage();
  }

  onPageSizeSelect(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    if (!target) {
      return;
    }
    this.onPageSizeChange(Number(target.value));
  }

  onPageSizeChange(nextSize: number): void {
    if (!Number.isFinite(nextSize) || nextSize <= 0 || nextSize === this.pageSize()) {
      return;
    }
    this.pageSize.set(nextSize);
    this.page.set(0);
    void this.fetchPage();
  }

  toggleNota(id: string, ev?: Event): void {
    ev?.stopPropagation();
    this.expandedNotes.update((curr) => ({ ...curr, [id]: !curr[id] }));
  }

  isNotaExpandida(id: string): boolean {
    return Boolean(this.expandedNotes()[id]);
  }

  async onDelete(m: Movimiento, ev?: Event): Promise<void> {
    ev?.stopPropagation();

    const montoAbs = Math.abs(Number(m.monto) || 0);
    const text = `¿Eliminar el ${m.tipo} de ${montoAbs.toLocaleString('es-MX', {
      style: 'currency',
      currency: 'MXN',
      maximumFractionDigits: 2,
    })}?`;

    const dialogData: ConfirmDialogData = {
      message: text,
      icon: 'delete_outline',
      color: 'warn',
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: dialogData,
      width: '360px',
      panelClass: 'custom-modal-panel',
    });

    const ok = await firstValueFrom(dialogRef.afterClosed(), { defaultValue: false });
    if (!ok) {
      return;
    }

    try {
      this.snack.open('Eliminando...', '', { duration: 1000 });
      await this.api.deleteMovimiento(m.id);
      if (this.items().length <= 1 && this.page() > 0) {
        this.page.update((p) => p - 1);
      }
      this.snack.open('Movimiento eliminado', 'OK', { duration: 2000 });
      await this.fetchPage();
    } catch (e: unknown) {
      console.error('Error al eliminar movimiento:', e);
      const msg = e instanceof Error && e.message ? e.message : 'No se pudo eliminar';
      this.snack.open(msg, 'OK', { duration: 4000 });
    }
  }

  catNombre(m: Movimiento): string {
    if (m.categoria_nombre && m.categoria_nombre.trim()) {
      return m.categoria_nombre;
    }
    return this.catsById().get(m.categoria_id || '') || 'Sin categoría';
  }

  formatMetodo(metodo?: string | null): string {
    return formatMetodoPagoLabel(metodo);
  }

  montoAbs(m: Movimiento): number {
    return Math.abs(Number(m.monto) || 0);
  }

  trackByMovimientoId(_index: number, m: Movimiento): string {
    return m.id;
  }
}
