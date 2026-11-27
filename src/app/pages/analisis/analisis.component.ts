import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  Chart as ChartJS,
  type ChartData,
  type ChartOptions,
  type TooltipItem,
  registerables,
} from 'chart.js';
import { NgChartsModule } from 'ng2-charts';

import { ApiClientService } from '../../core/api-client.service';
import { DashboardService, type DashboardUIResponse } from '../../core/dashboard.service';
import type {
  RepartoSocioConfig,
  Sucursal,
  SucursalRepartoConfig,
  SucursalRepartoPayload,
} from '../../core/models';
import {
  type AnalisisFlowSeries,
  type AnalisisGranularity,
  type AnalisisPreset,
  type BalanceInsightPill,
  type CategoryDoughnutSummary,
  EGRESO_DOUGHNUT_PALETTE,
  INGRESO_DOUGHNUT_PALETTE,
  type LegacyRepartoDraft,
  type RepartoDistributionResult,
  type RepartoSourceMode,
  aggregateAnalisisFlow,
  buildBalanceRangeInsight,
  buildCategoryDoughnutSummary,
  buildRepartoShareText,
  buildWhatsAppShareUrl,
  calculateAnalisisRange,
  calculateNetMarginPct,
  calculateRepartoDistribution,
  createVerticalGradient,
  determineAnalisisGranularity,
  formatCurrencyMXN,
  formatCurrentMonthLabel,
  formatRangePeriodLabel,
  readLegacyRepartoDraft,
  round2,
  splitRemainingEqually,
} from './analisis.helpers';

ChartJS.register(...registerables);

const FONT_FAMILY = "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
ChartJS.defaults.font.family = FONT_FAMILY;

const DARK_TOOLTIP_BASE = {
  backgroundColor: 'rgba(15, 23, 42, 0.94)',
  titleColor: '#f8fafc',
  bodyColor: '#e2e8f0',
  borderColor: 'rgba(148, 163, 184, 0.24)',
  borderWidth: 1,
  cornerRadius: 12,
  padding: 12,
  boxPadding: 5,
  usePointStyle: true,
  titleFont: { family: FONT_FAMILY, size: 12, weight: 700 },
  bodyFont: { family: FONT_FAMILY, size: 12, weight: 500 },
};

const REPARTO_SOURCE_STORAGE_KEY = 'nano_clean_reparto_use_mes_actual';
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface DraftSumStatus {
  text: string;
  tone: 'valid' | 'warn' | 'error';
}

@Component({
  selector: 'app-analisis',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatSnackBarModule, NgChartsModule],
  templateUrl: './analisis.component.html',
  styleUrls: ['./analisis.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalisisComponent implements OnInit {
  private readonly api = inject(ApiClientService);
  private readonly dash = inject(DashboardService);
  private readonly snack = inject(MatSnackBar);

  private initSeq = 0;
  private dashFetchSeq = 0;
  private repartoFetchSeq = 0;
  private socioIdSeq = 0;

  readonly flowChartType: 'line' = 'line';
  readonly maxSocios = 20;
  readonly currentMonthLabel = formatCurrentMonthLabel();

  readonly presetOptions: ReadonlyArray<{ value: Exclude<AnalisisPreset, 'custom'>; label: string }> = [
    { value: 'mes', label: 'Mes' },
    { value: '3m', label: '3m' },
    { value: '6m', label: '6m' },
    { value: '12m', label: '12m' },
  ];

  readonly loading = signal<boolean>(true);
  readonly rangeLoading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly sucursales = signal<Sucursal[]>([]);
  readonly sucursalId = signal<string>('');
  readonly preset = signal<AnalisisPreset>('mes');
  readonly showCustomRange = signal<boolean>(false);
  readonly customRangeError = signal<string | null>(null);

  private readonly initialRange = calculateAnalisisRange('mes');
  readonly desde = signal<string>(this.initialRange.desde);
  readonly hasta = signal<string>(this.initialRange.hasta);

  readonly dashboardData = signal<DashboardUIResponse | null>(null);

  readonly repartoSourceMode = signal<RepartoSourceMode>('mes');
  readonly repartoConfig = signal<SucursalRepartoConfig>(this.createEmptyRepartoConfig(''));
  readonly repartoLoading = signal<boolean>(false);
  readonly repartoLoadError = signal<string | null>(null);
  readonly editingReparto = signal<boolean>(false);
  readonly savingReparto = signal<boolean>(false);
  readonly repartoSaveError = signal<string | null>(null);

  readonly draftCapitalPct = signal<number>(0);
  readonly draftSocios = signal<RepartoSocioConfig[]>([]);
  readonly legacyDraft = signal<LegacyRepartoDraft | null>(null);

  readonly activeSucursalNombre = computed<string>(() => {
    const id = this.sucursalId();
    if (!id) {
      return '';
    }
    return this.sucursales().find((s) => s.id === id)?.nombre ?? '';
  });

  readonly rangePeriodLabel = computed<string>(() =>
    formatRangePeriodLabel(this.desde(), this.hasta())
  );

  readonly totalIngresos = computed<number>(() =>
    this.toFiniteNumber(this.dashboardData()?.totales?.ingresos)
  );

  readonly totalEgresos = computed<number>(() =>
    this.toFiniteNumber(this.dashboardData()?.totales?.egresos)
  );

  readonly totalBalance = computed<number>(() =>
    this.toFiniteNumber(this.dashboardData()?.totales?.balance)
  );

  readonly netMarginPct = computed<number | null>(() =>
    calculateNetMarginPct(this.totalIngresos(), this.totalBalance())
  );

  readonly balanceSubtitle = computed<string>(() => {
    const margin = this.netMarginPct();
    if (margin !== null) {
      return `Margen neto: ${margin}% sobre ingresos`;
    }
    if (this.totalEgresos() > 0) {
      return 'Sin ingresos registrados en el periodo';
    }
    return 'Sin movimientos en el periodo';
  });

  readonly granularity = computed<AnalisisGranularity>(() =>
    determineAnalisisGranularity(this.preset(), this.desde(), this.hasta())
  );

  readonly flowSeries = computed<AnalisisFlowSeries>(() =>
    aggregateAnalisisFlow(this.dashboardData()?.por_dia, this.granularity())
  );

  readonly flowTitle = computed<string>(() =>
    this.granularity() === 'weekly' ? 'Flujo semanal' : 'Flujo mensual'
  );

  readonly flowSubtitle = computed<string>(() => {
    const period = this.rangePeriodLabel();
    const view = this.granularity() === 'weekly' ? 'Vista semanal' : 'Vista mensual';
    return period ? `${period} · ${view}` : view;
  });

  readonly flowInsight = computed<BalanceInsightPill>(() =>
    buildBalanceRangeInsight(this.flowSeries().balanceNetoRango)
  );

  readonly hasFlowData = computed<boolean>(() => {
    const serie = this.flowSeries();
    return (
      serie.labels.length > 0 &&
      (serie.ingresos.some((v) => v > 0) || serie.egresos.some((v) => v > 0))
    );
  });

  readonly flowChartData = computed<ChartData<'line'>>(() => {
    const serie = this.flowSeries();
    return {
      labels: serie.labels,
      datasets: [
        {
          label: 'Ingresos',
          data: serie.ingresos,
          fill: true,
          tension: 0.35,
          borderColor: '#10b981',
          borderWidth: 2.5,
          backgroundColor: createVerticalGradient(
            'rgba(16, 185, 129, 0.28)',
            'rgba(16, 185, 129, 0.01)',
            'rgba(16, 185, 129, 0.14)'
          ),
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: '#10b981',
          pointBorderWidth: 2,
          pointHoverBackgroundColor: '#10b981',
          pointHoverBorderColor: '#ffffff',
          pointHoverBorderWidth: 2,
        },
        {
          label: 'Egresos',
          data: serie.egresos,
          fill: true,
          tension: 0.35,
          borderColor: '#ef4444',
          borderWidth: 2.5,
          backgroundColor: createVerticalGradient(
            'rgba(239, 68, 68, 0.22)',
            'rgba(239, 68, 68, 0.01)',
            'rgba(239, 68, 68, 0.12)'
          ),
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: '#ef4444',
          pointBorderWidth: 2,
          pointHoverBackgroundColor: '#ef4444',
          pointHoverBorderColor: '#ffffff',
          pointHoverBorderWidth: 2,
        },
      ],
    };
  });

  readonly ingresosDoughnutSummary = computed<CategoryDoughnutSummary>(() =>
    buildCategoryDoughnutSummary(
      this.dashboardData()?.por_categoria?.ingreso,
      INGRESO_DOUGHNUT_PALETTE,
      'ingreso'
    )
  );

  readonly hasIngresosDonut = computed<boolean>(
    () => this.ingresosDoughnutSummary().rows.length > 0
  );

  readonly ingresosDoughnutData = computed<ChartData<'doughnut'>>(() => {
    const summary = this.ingresosDoughnutSummary();
    return {
      labels: summary.labels,
      datasets: [
        {
          data: summary.values,
          backgroundColor: summary.colors,
          borderColor: '#ffffff',
          borderWidth: 3,
          borderRadius: 6,
          hoverOffset: 6,
        },
      ],
    };
  });

  readonly egresosDoughnutSummary = computed<CategoryDoughnutSummary>(() =>
    buildCategoryDoughnutSummary(
      this.dashboardData()?.por_categoria?.egreso,
      EGRESO_DOUGHNUT_PALETTE,
      'egreso'
    )
  );

  readonly hasEgresosDonut = computed<boolean>(
    () => this.egresosDoughnutSummary().rows.length > 0
  );

  readonly egresosDoughnutData = computed<ChartData<'doughnut'>>(() => {
    const summary = this.egresosDoughnutSummary();
    return {
      labels: summary.labels,
      datasets: [
        {
          data: summary.values,
          backgroundColor: summary.colors,
          borderColor: '#ffffff',
          borderWidth: 3,
          borderRadius: 6,
          hoverOffset: 6,
        },
      ],
    };
  });

  readonly repartoBaseBalance = computed<number>(() => {
    if (this.repartoSourceMode() === 'mes') {
      return this.toFiniteNumber(this.dashboardData()?.kpis_mes?.balance);
    }
    return this.totalBalance();
  });

  readonly repartoPeriodLabel = computed<string>(() =>
    this.repartoSourceMode() === 'mes' ? this.currentMonthLabel : this.rangePeriodLabel()
  );

  readonly savedDistribution = computed<RepartoDistributionResult>(() => {
    const cfg = this.repartoConfig();
    return calculateRepartoDistribution(this.repartoBaseBalance(), cfg.capital_pct, cfg.socios);
  });

  readonly draftDistribution = computed<RepartoDistributionResult>(() =>
    calculateRepartoDistribution(
      this.repartoBaseBalance(),
      this.draftCapitalPct(),
      this.draftSocios()
    )
  );

  readonly activeDistribution = computed<RepartoDistributionResult>(() =>
    this.editingReparto() ? this.draftDistribution() : this.savedDistribution()
  );

  readonly isRepartoEmpty = computed<boolean>(() => {
    const cfg = this.repartoConfig();
    return !cfg.configurado && cfg.socios.length === 0 && cfg.capital_pct === 0;
  });

  readonly hasLegacyDraftToImport = computed<boolean>(
    () => (this.legacyDraft()?.socios.length ?? 0) > 0
  );

  readonly draftSumStatus = computed<DraftSumStatus>(() => {
    const dist = this.draftDistribution();
    if (dist.isValidSum) {
      return { text: '100% asignado', tone: 'valid' };
    }
    if (dist.remainingPct > 0.01) {
      return { text: `Falta ${dist.remainingPct}% por asignar`, tone: 'warn' };
    }
    return {
      text: `Excede 100% por ${round2(Math.abs(dist.remainingPct))}%`,
      tone: 'error',
    };
  });

  readonly draftValidationError = computed<string | null>(() => {
    const cap = this.draftCapitalPct();
    if (!Number.isFinite(cap) || cap < 0 || cap > 100) {
      return 'El porcentaje de capital debe estar entre 0% y 100%.';
    }
    for (const socio of this.draftSocios()) {
      if (!socio.nombre.trim()) {
        return 'Cada socio debe tener un nombre.';
      }
      if (!Number.isFinite(socio.pct) || socio.pct < 0 || socio.pct > 100) {
        return 'Cada porcentaje de socio debe estar entre 0% y 100%.';
      }
    }
    return null;
  });

  readonly canSaveReparto = computed<boolean>(
    () =>
      !this.savingReparto() &&
      Boolean(this.sucursalId()) &&
      this.draftDistribution().isValidSum &&
      this.draftValidationError() === null
  );

  readonly flowChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'end',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 8,
          boxHeight: 8,
          padding: 14,
          color: '#475569',
          font: { family: FONT_FAMILY, size: 12, weight: 600 },
        },
      },
      tooltip: {
        ...DARK_TOOLTIP_BASE,
        callbacks: {
          label: (ctx: TooltipItem<'line'>): string =>
            ` ${ctx.dataset.label ?? ''}: ${formatCurrencyMXN(Number(ctx.parsed.y) || 0)}`,
          afterBody: (items: TooltipItem<'line'>[]): string[] => {
            let ingresos = 0;
            let egresos = 0;
            for (const item of items) {
              const val = Number(item.parsed.y) || 0;
              if (item.datasetIndex === 0) {
                ingresos = val;
              } else if (item.datasetIndex === 1) {
                egresos = val;
              }
            }
            return [
              `Balance neto: ${formatCurrencyMXN(ingresos - egresos, { showSign: true })}`,
            ];
          },
        },
      },
    },
    scales: {
      x: {
        border: { display: false },
        grid: { display: false },
        ticks: {
          color: '#64748b',
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 7,
          font: { family: FONT_FAMILY, size: 11, weight: 500 },
        },
      },
      y: {
        beginAtZero: true,
        border: { display: false, dash: [4, 4] },
        grid: { color: 'rgba(148, 163, 184, 0.22)' },
        ticks: {
          color: '#64748b',
          maxTicksLimit: 5,
          font: { family: FONT_FAMILY, size: 11, weight: 500 },
          callback: (value: string | number): string => formatCurrencyMXN(Number(value) || 0),
        },
      },
    },
  };

  readonly categoryDoughnutOptions: ChartOptions<'doughnut'> = this.createCategoryDoughnutOptions();

  ngOnInit(): void {
    this.restoreLegacyPreferences();
    void this.loadInitial();
  }

  async loadInitial(): Promise<void> {
    const seq = ++this.initSeq;
    this.loading.set(true);
    this.error.set(null);

    try {
      const sucs = await this.api.listSucursales({ activo: 1 });
      if (seq !== this.initSeq) {
        return;
      }

      const list = Array.isArray(sucs) ? sucs : [];
      this.sucursales.set(list);

      if (list.length === 0) {
        this.sucursalId.set('');
        this.dashboardData.set(null);
        this.repartoConfig.set(this.createEmptyRepartoConfig(''));
        return;
      }

      const currentId = this.sucursalId();
      const targetId = list.some((s) => s.id === currentId) ? currentId : list[0].id;
      this.sucursalId.set(targetId);

      await this.loadBranchData(targetId, true);
    } catch (err: unknown) {
      if (seq !== this.initSeq) {
        return;
      }
      this.error.set(this.extractMessage(err, 'No se pudo cargar el análisis financiero'));
    } finally {
      if (seq === this.initSeq) {
        this.loading.set(false);
      }
    }
  }

  async reload(): Promise<void> {
    if (this.sucursales().length === 0 || !this.sucursalId()) {
      await this.loadInitial();
      return;
    }

    const seq = ++this.initSeq;
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.loadBranchData(this.sucursalId(), true);
    } finally {
      if (seq === this.initSeq) {
        this.loading.set(false);
      }
    }
  }

  async onSucursalChange(nextId: string): Promise<void> {
    const trimmed = nextId.trim();
    if (!trimmed || trimmed === this.sucursalId()) {
      return;
    }
    this.sucursalId.set(trimmed);
    this.editingReparto.set(false);
    this.repartoSaveError.set(null);
    await this.loadBranchData(trimmed, false);
  }

  onSucursalSelectEvent(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLSelectElement) {
      void this.onSucursalChange(target.value);
    }
  }

  async setPreset(nextPreset: Exclude<AnalisisPreset, 'custom'>): Promise<void> {
    this.preset.set(nextPreset);
    this.showCustomRange.set(false);
    this.customRangeError.set(null);

    const { desde, hasta } = calculateAnalisisRange(nextPreset);
    this.desde.set(desde);
    this.hasta.set(hasta);

    const id = this.sucursalId();
    if (id) {
      await this.loadDashboard(id, false);
    }
  }

  activateCustomRange(): void {
    this.preset.set('custom');
    this.showCustomRange.set(true);
    this.customRangeError.set(null);
  }

  onStartDateInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      void this.applyCustomDates(target.value, this.hasta());
    }
  }

  onEndDateInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      void this.applyCustomDates(this.desde(), target.value);
    }
  }

  async applyCustomDates(nextDesde: string, nextHasta: string): Promise<void> {
    this.preset.set('custom');
    this.showCustomRange.set(true);
    this.desde.set(nextDesde);
    this.hasta.set(nextHasta);

    if (!ISO_DATE_PATTERN.test(nextDesde) || !ISO_DATE_PATTERN.test(nextHasta)) {
      this.customRangeError.set('Selecciona ambas fechas para consultar el rango.');
      return;
    }

    if (nextDesde > nextHasta) {
      this.customRangeError.set('La fecha inicial debe ser anterior o igual a la fecha final.');
      return;
    }

    this.customRangeError.set(null);
    const id = this.sucursalId();
    if (id) {
      await this.loadDashboard(id, false);
    }
  }

  setRepartoSourceMode(mode: RepartoSourceMode): void {
    if (this.repartoSourceMode() === mode) {
      return;
    }
    this.repartoSourceMode.set(mode);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(REPARTO_SOURCE_STORAGE_KEY, JSON.stringify(mode === 'mes'));
      }
    } catch {
      // Ignorar bloqueo de almacenamiento en navegadores restringidos
    }
  }

  retryLoadReparto(): void {
    const id = this.sucursalId();
    if (id) {
      void this.loadReparto(id);
    }
  }

  startConfigureReparto(): void {
    this.repartoSaveError.set(null);
    this.draftCapitalPct.set(0);
    this.draftSocios.set([
      { id: this.nextSocioId(), nombre: 'Socio 1', pct: 50 },
      { id: this.nextSocioId(), nombre: 'Socio 2', pct: 50 },
    ]);
    this.editingReparto.set(true);
  }

  importLegacyReparto(): void {
    const draft = this.legacyDraft();
    if (!draft || draft.socios.length === 0) {
      return;
    }
    this.repartoSaveError.set(null);
    this.draftCapitalPct.set(0);
    this.draftSocios.set(draft.socios.map((s) => ({ ...s })));
    this.editingReparto.set(true);
  }

  openRepartoEditor(): void {
    this.repartoSaveError.set(null);
    this.syncDraftFromConfig(this.repartoConfig());
    this.editingReparto.set(true);
  }

  cancelRepartoEditor(): void {
    this.repartoSaveError.set(null);
    this.syncDraftFromConfig(this.repartoConfig());
    this.editingReparto.set(false);
  }

  onDraftCapitalInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.setDraftCapitalPct(this.parseNumericInput(target.value));
    }
  }

  setDraftCapitalPct(value: number): void {
    this.draftCapitalPct.set(value);
  }

  onDraftSocioNameInput(id: string, event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.updateDraftSocioName(id, target.value);
    }
  }

  updateDraftSocioName(id: string, nombre: string): void {
    this.draftSocios.update((list) =>
      list.map((socio) => (socio.id === id ? { ...socio, nombre } : socio))
    );
  }

  onDraftSocioPctInput(id: string, event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.updateDraftSocioPct(id, this.parseNumericInput(target.value));
    }
  }

  updateDraftSocioPct(id: string, pct: number): void {
    this.draftSocios.update((list) =>
      list.map((socio) => (socio.id === id ? { ...socio, pct } : socio))
    );
  }

  addDraftSocio(): void {
    const current = this.draftSocios();
    if (current.length >= this.maxSocios) {
      return;
    }
    const nextIndex = current.length + 1;
    this.draftSocios.set([
      ...current,
      { id: this.nextSocioId(), nombre: `Socio ${nextIndex}`, pct: 0 },
    ]);
  }

  removeDraftSocio(id: string): void {
    this.draftSocios.update((list) => list.filter((socio) => socio.id !== id));
  }

  distributeRemainingEqually(): void {
    this.draftSocios.set(splitRemainingEqually(this.draftCapitalPct(), this.draftSocios()));
  }

  async saveReparto(): Promise<void> {
    if (!this.canSaveReparto()) {
      return;
    }

    const targetSucursalId = this.sucursalId();
    const payload: SucursalRepartoPayload = {
      capital_pct: round2(this.draftCapitalPct()),
      socios: this.draftSocios().map((socio) => ({
        id: socio.id,
        nombre: socio.nombre.trim(),
        pct: round2(socio.pct),
      })),
    };

    this.savingReparto.set(true);
    this.repartoSaveError.set(null);

    try {
      const saved = await this.api.saveSucursalReparto(targetSucursalId, payload);
      if (this.sucursalId() !== targetSucursalId) {
        return;
      }
      this.repartoConfig.set(saved);
      this.syncDraftFromConfig(saved);
      this.editingReparto.set(false);
      this.snack.open('Acuerdo de reparto guardado', 'OK', { duration: 2500 });
    } catch (err: unknown) {
      if (this.sucursalId() !== targetSucursalId) {
        return;
      }
      this.repartoSaveError.set(
        this.extractMessage(err, 'No se pudo guardar el acuerdo de reparto')
      );
    } finally {
      this.savingReparto.set(false);
    }
  }

  async copyRepartoSummary(): Promise<void> {
    const text = this.buildCurrentShareText();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        this.fallbackCopyText(text);
      }
      this.snack.open('Resumen copiado al portapapeles', 'OK', { duration: 2500 });
    } catch {
      try {
        this.fallbackCopyText(text);
        this.snack.open('Resumen copiado al portapapeles', 'OK', { duration: 2500 });
      } catch {
        this.snack.open('No se pudo copiar el resumen', 'Cerrar', { duration: 3000 });
      }
    }
  }

  shareRepartoWhatsapp(): void {
    const url = buildWhatsAppShareUrl(this.buildCurrentShareText());
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  formatMxn(value: number): string {
    return formatCurrencyMXN(value);
  }

  socioInitial(nombre: string): string {
    const trimmed = nombre.trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : 'S';
  }

  trackBySucursalId(_index: number, sucursal: Sucursal): string {
    return sucursal.id;
  }

  trackBySocioId(_index: number, socio: { id: string }): string {
    return socio.id;
  }

  trackBySegmentId(_index: number, seg: { id: string }): string {
    return seg.id;
  }

  trackByCategoryRow(_index: number, row: { nombre: string }): string {
    return row.nombre;
  }

  private async loadBranchData(sucursalId: string, isInitial: boolean): Promise<void> {
    await Promise.all([
      this.loadDashboard(sucursalId, isInitial),
      this.loadReparto(sucursalId),
    ]);
  }

  private async loadDashboard(sucursalId: string, isInitial: boolean): Promise<void> {
    const seq = ++this.dashFetchSeq;
    this.rangeLoading.set(!isInitial);
    this.error.set(null);

    try {
      const resp = await this.dash.get({
        desde: this.desde(),
        hasta: this.hasta(),
        sucursal_id: sucursalId,
        include: 'mes',
      });
      if (seq !== this.dashFetchSeq) {
        return;
      }
      this.dashboardData.set(resp ?? null);
    } catch (err: unknown) {
      if (seq !== this.dashFetchSeq) {
        return;
      }
      this.error.set(this.extractMessage(err, 'No se pudo cargar el análisis de la sucursal'));
    } finally {
      if (seq === this.dashFetchSeq) {
        this.rangeLoading.set(false);
      }
    }
  }

  private async loadReparto(sucursalId: string): Promise<void> {
    const seq = ++this.repartoFetchSeq;
    this.repartoLoading.set(true);
    this.repartoLoadError.set(null);

    try {
      const cfg = await this.api.getSucursalReparto(sucursalId);
      if (seq !== this.repartoFetchSeq) {
        return;
      }
      const normalized: SucursalRepartoConfig = {
        sucursal_id: cfg.sucursal_id || sucursalId,
        capital_pct: this.toFiniteNumber(cfg.capital_pct),
        socios: Array.isArray(cfg.socios) ? cfg.socios : [],
        updated_at: cfg.updated_at ?? null,
        configurado: Boolean(cfg.configurado),
      };
      this.repartoConfig.set(normalized);
      if (!this.editingReparto()) {
        this.syncDraftFromConfig(normalized);
      }
    } catch (err: unknown) {
      if (seq !== this.repartoFetchSeq) {
        return;
      }
      this.repartoConfig.set(this.createEmptyRepartoConfig(sucursalId));
      this.repartoLoadError.set(
        this.extractMessage(err, 'No se pudo cargar la configuración de reparto')
      );
    } finally {
      if (seq === this.repartoFetchSeq) {
        this.repartoLoading.set(false);
      }
    }
  }

  private restoreLegacyPreferences(): void {
    const draft = readLegacyRepartoDraft();
    if (!draft) {
      this.legacyDraft.set(null);
      return;
    }
    if (draft.useMesActual !== null) {
      this.repartoSourceMode.set(draft.useMesActual ? 'mes' : 'rango');
    }
    this.legacyDraft.set(draft.socios.length > 0 ? draft : null);
  }

  private syncDraftFromConfig(cfg: SucursalRepartoConfig): void {
    this.draftCapitalPct.set(this.toFiniteNumber(cfg.capital_pct));
    this.draftSocios.set(cfg.socios.map((s) => ({ ...s })));
  }

  private buildCurrentShareText(): string {
    return buildRepartoShareText({
      sucursalNombre: this.activeSucursalNombre() || 'Sucursal',
      periodLabel: this.repartoPeriodLabel(),
      sourceMode: this.repartoSourceMode(),
      distribution: this.savedDistribution(),
    });
  }

  private fallbackCopyText(text: string): void {
    if (typeof document === 'undefined') {
      throw new Error('Portapapeles no disponible');
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    try {
      textarea.select();
      const copied = document.execCommand('copy');
      if (!copied) {
        throw new Error('No se pudo copiar');
      }
    } finally {
      document.body.removeChild(textarea);
    }
  }

  private nextSocioId(): string {
    this.socioIdSeq += 1;
    return `socio-${this.socioIdSeq}-${Date.now()}`;
  }

  private createEmptyRepartoConfig(sucursalId: string): SucursalRepartoConfig {
    return {
      sucursal_id: sucursalId,
      capital_pct: 0,
      socios: [],
      updated_at: null,
      configurado: false,
    };
  }

  private parseNumericInput(raw: string): number {
    const trimmed = raw.trim();
    if (!trimmed) {
      return 0;
    }
    return Number(trimmed);
  }

  private toFiniteNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private extractMessage(err: unknown, fallback: string): string {
    if (err instanceof Error && err.message) {
      return err.message;
    }
    return fallback;
  }

  private createCategoryDoughnutOptions(): ChartOptions<'doughnut'> {
    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: {
          ...DARK_TOOLTIP_BASE,
          callbacks: {
            label: (ctx: TooltipItem<'doughnut'>): string => {
              const amount = Number(ctx.parsed) || 0;
              const total = ctx.dataset.data.reduce(
                (acc, item) => acc + (Number(item) || 0),
                0
              );
              const pct = total > 0 ? round2((amount / total) * 100) : 0;
              return ` ${ctx.label}: ${formatCurrencyMXN(amount)} (${pct}%)`;
            },
          },
        },
      },
    };
  }
}
