import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import {
  Chart as ChartJS,
  type ChartData,
  type ChartOptions,
  type TooltipItem,
  registerables,
} from 'chart.js';
import { NgChartsModule } from 'ng2-charts';

import { ApiClientService } from '../../core/api-client.service';
import {
  type DashboardReciente,
  DashboardService,
  type DashboardUIResponse,
} from '../../core/dashboard.service';
import type { ClientStatsResponse, Pedido } from '../../core/models';
import { PedidoActionsService } from '../../core/pedido-actions.service';
import {
  type AggregatedFinancialSeries,
  CLIENTE_SEGMENT_COLORS,
  type ClientesSegmentSummary,
  DEUDA_SEVERITY_COLORS,
  type DeudaSeveritySummary,
  PEDIDO_ACTIVE_STAGES,
  type PedidoStageMeta,
  type ResumenChartInsights,
  type ResumenRange,
  aggregateFinancialSeries,
  buildClientesSegmentSummary,
  buildResumenChartInsights,
  calculateDeudaSeverity,
  calculateRangeDates,
  createHorizontalGradient,
  createVerticalGradient,
  formatCurrencyMXN,
  formatCurrentMonthLabel,
  formatPaymentMethod,
  formatRecentMovementDate,
  getPedidoStageMeta,
} from './resumen.helpers';

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

export interface ActiveOrderCardVm {
  pedido: Pedido;
  stage: PedidoStageMeta;
  dueDateLabel: string;
  hasDebt: boolean;
  isPaid: boolean;
  formattedSaldo: string;
}

export interface RecentMovementCardVm {
  item: DashboardReciente;
  isEgreso: boolean;
  formattedAmount: string;
  formattedDate: string;
  paymentMethodLabel: string;
  trimmedNote: string;
}

@Component({
  selector: 'app-resumen',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, MatButtonModule, NgChartsModule],
  templateUrl: './resumen.component.html',
  styleUrls: ['./resumen.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResumenComponent implements OnInit {
  private readonly dash = inject(DashboardService);
  private readonly api = inject(ApiClientService);
  readonly pedidoActions = inject(PedidoActionsService);

  private fetchSeq = 0;

  readonly mainChartType: 'line' = 'line';
  readonly activeStages = PEDIDO_ACTIVE_STAGES;
  readonly currentMonthLabel = formatCurrentMonthLabel();
  readonly rangeOptions: ReadonlyArray<{ value: ResumenRange; label: string }> = [
    { value: '3m', label: '3m' },
    { value: '6m', label: '6m' },
    { value: '12m', label: '12m' },
  ];

  readonly loading = signal<boolean>(true);
  readonly rangeLoading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly range = signal<ResumenRange>('3m');

  readonly pedidosActivos = signal<Pedido[]>([]);
  readonly pedidosConDeuda = signal<Pedido[]>([]);
  readonly clientStats = signal<ClientStatsResponse | null>(null);
  readonly dashboardData = signal<DashboardUIResponse | null>(null);

  readonly ingresosMes = computed<number>(() =>
    this.toFiniteNumber(this.dashboardData()?.kpis_mes?.ingresos)
  );
  readonly egresosMes = computed<number>(() =>
    this.toFiniteNumber(this.dashboardData()?.kpis_mes?.egresos)
  );
  readonly balanceMes = computed<number>(() =>
    this.toFiniteNumber(this.dashboardData()?.kpis_mes?.balance)
  );

  readonly balanceSubtitle = computed<string>(() => {
    const ingresos = this.ingresosMes();
    const egresos = this.egresosMes();
    const balance = this.balanceMes();
    if (ingresos > 0) {
      const margin = Math.round((balance / ingresos) * 100);
      return `Margen neto: ${margin}% sobre ingresos`;
    }
    if (egresos > 0) {
      return 'Sin ingresos registrados en el mes';
    }
    return 'Sin movimientos en el mes';
  });

  readonly deudaSummary = computed<DeudaSeveritySummary>(() =>
    calculateDeudaSeverity(this.pedidosConDeuda())
  );
  readonly deudaTotal = computed<number>(() => this.deudaSummary().totalAdeudado);
  readonly deudaCount = computed<number>(() => this.deudaSummary().totalPedidos);
  readonly deudaSubtitle = computed<string>(() => {
    const count = this.deudaCount();
    if (count === 0) {
      return 'Sin saldos pendientes';
    }
    return count === 1
      ? '1 pedido con saldo pendiente'
      : `${count} pedidos con saldo pendiente`;
  });

  readonly clientesSummary = computed<ClientesSegmentSummary>(() =>
    buildClientesSegmentSummary(this.clientStats())
  );

  readonly activeOrdersCountLabel = computed<string>(() => {
    const count = this.pedidosActivos().length;
    return count === 1 ? '1 activo' : `${count} activos`;
  });

  readonly activeOrderCards = computed<ActiveOrderCardVm[]>(() =>
    this.pedidosActivos().map((pedido) => {
      const saldo = this.toFiniteNumber(pedido.saldo_pendiente);
      const montoTotal = this.toFiniteNumber(pedido.monto_total);
      const hasDebt = saldo > 0;
      const isPaid = saldo === 0 && montoTotal > 0;
      return {
        pedido,
        stage: getPedidoStageMeta(pedido.estado),
        dueDateLabel: pedido.fecha_entrega_estimada
          ? formatRecentMovementDate(null, pedido.fecha_entrega_estimada)
          : 'Sin fecha',
        hasDebt,
        isPaid,
        formattedSaldo: formatCurrencyMXN(saldo),
      };
    })
  );

  readonly aggregatedSeries = computed<AggregatedFinancialSeries>(() =>
    aggregateFinancialSeries(this.dashboardData()?.por_dia ?? [], this.range())
  );

  readonly rangeSubtitle = computed<string>(() => {
    const current = this.range();
    if (current === '3m') {
      return 'Últimos 3 meses · Vista semanal';
    }
    if (current === '6m') {
      return 'Últimos 6 meses · Vista mensual';
    }
    return 'Últimos 12 meses · Vista mensual';
  });

  readonly chartInsights = computed<ResumenChartInsights>(() =>
    buildResumenChartInsights({
      balanceNetoRango: this.aggregatedSeries().balanceNetoRango,
      deudaSummary: this.deudaSummary(),
      clientesSummary: this.clientesSummary(),
      sucursalesMes: this.dashboardData()?.por_sucursal_mes,
      ingresosCategoriasMes: this.dashboardData()?.por_categoria_mes?.ingreso,
      egresosCategoriasMes: this.dashboardData()?.por_categoria_mes?.egreso,
    })
  );

  readonly hasLineData = computed<boolean>(() => {
    const serie = this.aggregatedSeries();
    return serie.labels.length > 0 && (serie.totalIngresos > 0 || serie.totalEgresos > 0);
  });

  readonly lineData = computed<ChartData<'line'>>(() => {
    const serie = this.aggregatedSeries();
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

  readonly hasDeudasData = computed<boolean>(() => this.deudaSummary().totalPedidos > 0);

  readonly deudasDoughnutData = computed<ChartData<'doughnut'>>(() => {
    const summary = this.deudaSummary();
    return {
      labels: ['Día a día', 'Atraso leve', 'Riesgo crítico'],
      datasets: [
        {
          data: [summary.dia, summary.leves, summary.graves],
          backgroundColor: [
            DEUDA_SEVERITY_COLORS.dia,
            DEUDA_SEVERITY_COLORS.leves,
            DEUDA_SEVERITY_COLORS.graves,
          ],
          borderColor: '#ffffff',
          borderWidth: 3,
          borderRadius: 6,
          hoverOffset: 6,
        },
      ],
    };
  });

  readonly hasClientesData = computed<boolean>(() => this.clientesSummary().total > 0);

  readonly clientesDoughnutData = computed<ChartData<'doughnut'>>(() => {
    const summary = this.clientesSummary();
    return {
      labels: ['Activos (0-15d)', 'En riesgo (16-45d)', 'Inactivos (+45d)'],
      datasets: [
        {
          data: [summary.activosCount, summary.riesgoCount, summary.inactivosCount],
          backgroundColor: [
            CLIENTE_SEGMENT_COLORS.active_0_15,
            CLIENTE_SEGMENT_COLORS.risk_16_45,
            CLIENTE_SEGMENT_COLORS.lost_45plus,
          ],
          borderColor: '#ffffff',
          borderWidth: 3,
          borderRadius: 6,
          hoverOffset: 6,
        },
      ],
    };
  });

  readonly hasSucursalData = computed<boolean>(() =>
    (this.dashboardData()?.por_sucursal_mes ?? []).some(
      (s) => this.toFiniteNumber(s.ingresos) > 0 || this.toFiniteNumber(s.egresos) > 0
    )
  );

  readonly sucursalBarData = computed<ChartData<'bar'>>(() => {
    const sucursales = this.dashboardData()?.por_sucursal_mes ?? [];
    return {
      labels: sucursales.map((s) => s.nombre?.trim() || 'Sin sucursal'),
      datasets: [
        {
          label: 'Ingresos',
          data: sucursales.map((s) => this.toFiniteNumber(s.ingresos)),
          backgroundColor: createVerticalGradient(
            '#10b981',
            'rgba(16, 185, 129, 0.48)',
            '#10b981'
          ),
          borderRadius: { topLeft: 8, topRight: 8, bottomLeft: 0, bottomRight: 0 },
          borderSkipped: 'bottom',
          maxBarThickness: 38,
        },
        {
          label: 'Egresos',
          data: sucursales.map((s) => this.toFiniteNumber(s.egresos)),
          backgroundColor: createVerticalGradient(
            '#ef4444',
            'rgba(239, 68, 68, 0.48)',
            '#ef4444'
          ),
          borderRadius: { topLeft: 8, topRight: 8, bottomLeft: 0, bottomRight: 0 },
          borderSkipped: 'bottom',
          maxBarThickness: 38,
        },
      ],
    };
  });

  private readonly sortedIngresosCat = computed(() =>
    [...(this.dashboardData()?.por_categoria_mes?.ingreso ?? [])]
      .filter((c) => this.toFiniteNumber(c.total) > 0)
      .sort((a, b) => this.toFiniteNumber(b.total) - this.toFiniteNumber(a.total))
  );

  readonly hasBarIngresoData = computed<boolean>(() => this.sortedIngresosCat().length > 0);

  readonly barIngresoData = computed<ChartData<'bar'>>(() => {
    const categories = this.sortedIngresosCat();
    return {
      labels: categories.map((c) => c.nombre?.trim() || 'Sin categoría'),
      datasets: [
        {
          label: 'Ingresos',
          data: categories.map((c) => this.toFiniteNumber(c.total)),
          backgroundColor: createHorizontalGradient('#0ea5e9', '#10b981', '#10b981'),
          borderRadius: { topLeft: 0, topRight: 8, bottomLeft: 0, bottomRight: 8 },
          borderSkipped: 'left',
          maxBarThickness: 26,
        },
      ],
    };
  });

  readonly ingresoChartHeight = computed<number>(() =>
    Math.max(210, this.sortedIngresosCat().length * 38 + 38)
  );

  private readonly sortedEgresosCat = computed(() =>
    [...(this.dashboardData()?.por_categoria_mes?.egreso ?? [])]
      .filter((c) => this.toFiniteNumber(c.total) > 0)
      .sort((a, b) => this.toFiniteNumber(b.total) - this.toFiniteNumber(a.total))
  );

  readonly hasBarEgresoData = computed<boolean>(() => this.sortedEgresosCat().length > 0);

  readonly barEgresoData = computed<ChartData<'bar'>>(() => {
    const categories = this.sortedEgresosCat();
    return {
      labels: categories.map((c) => c.nombre?.trim() || 'Sin categoría'),
      datasets: [
        {
          label: 'Egresos',
          data: categories.map((c) => this.toFiniteNumber(c.total)),
          backgroundColor: createHorizontalGradient('#fb7185', '#dc2626', '#ef4444'),
          borderRadius: { topLeft: 0, topRight: 8, bottomLeft: 0, bottomRight: 8 },
          borderSkipped: 'left',
          maxBarThickness: 26,
        },
      ],
    };
  });

  readonly egresoChartHeight = computed<number>(() =>
    Math.max(210, this.sortedEgresosCat().length * 38 + 38)
  );

  readonly recentMovements = computed<DashboardReciente[]>(() =>
    (this.dashboardData()?.recientes ?? []).slice(0, 5)
  );

  readonly recentMovementCards = computed<RecentMovementCardVm[]>(() =>
    this.recentMovements().map((item) => {
      const isEgreso = item.tipo === 'egreso';
      const absAmount = Math.abs(this.toFiniteNumber(item.monto));
      const signedAmount = isEgreso ? -absAmount : absAmount;
      return {
        item,
        isEgreso,
        formattedAmount: formatCurrencyMXN(signedAmount, { showSign: true }),
        formattedDate: formatRecentMovementDate(item.created_at, item.fecha),
        paymentMethodLabel: formatPaymentMethod(item.metodo_pago, ''),
        trimmedNote: (item.nota ?? '').trim(),
      };
    })
  );

  readonly lineOptions: ChartOptions<'line'> = {
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

  readonly deudasOptions: ChartOptions<'doughnut'> = this.createDoughnutOptions(
    'pedido',
    'pedidos'
  );

  readonly clientesOptions: ChartOptions<'doughnut'> = this.createDoughnutOptions(
    'cliente',
    'clientes'
  );

  readonly sucursalBarOptions: ChartOptions<'bar'> = {
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
          label: (ctx: TooltipItem<'bar'>): string =>
            ` ${ctx.dataset.label ?? ''}: ${formatCurrencyMXN(Number(ctx.parsed.y) || 0)}`,
        },
      },
    },
    scales: {
      x: {
        border: { display: false },
        grid: { display: false },
        ticks: {
          color: '#334155',
          font: { family: FONT_FAMILY, size: 11.5, weight: 600 },
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

  readonly barIngresoOptions: ChartOptions<'bar'> = this.createHorizontalCategoryOptions();

  readonly barEgresoOptions: ChartOptions<'bar'> = this.createHorizontalCategoryOptions();

  ngOnInit(): void {
    void this.loadAll();
  }

  async loadAll(): Promise<void> {
    const seq = ++this.fetchSeq;
    this.loading.set(true);
    this.rangeLoading.set(false);
    this.error.set(null);

    try {
      const { desde, hasta } = calculateRangeDates(this.range());
      const [pedidos, deudas, statsClientes, dashResp] = await Promise.all([
        this.api.listPedidos({ activo: true, limit: 4 }),
        this.api.listPedidos({ deuda: true }),
        this.api.getClientStats(),
        this.dash.get({
          desde,
          hasta,
          include: 'mes,recientes',
          limit_recientes: 5,
        }),
      ]);

      if (seq !== this.fetchSeq) {
        return;
      }

      this.pedidosActivos.set(Array.isArray(pedidos) ? pedidos.slice(0, 4) : []);
      this.pedidosConDeuda.set(Array.isArray(deudas) ? deudas : []);
      this.clientStats.set(statsClientes ?? null);
      this.dashboardData.set(dashResp ?? null);
    } catch (err: unknown) {
      if (seq !== this.fetchSeq) {
        return;
      }
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'No se pudo cargar el resumen financiero';
      this.error.set(message);
    } finally {
      if (seq === this.fetchSeq) {
        this.loading.set(false);
      }
    }
  }

  reload(): void {
    void this.loadAll();
  }

  async setRange(nextRange: ResumenRange): Promise<void> {
    if (this.range() === nextRange && !this.error()) {
      return;
    }

    this.range.set(nextRange);
    const seq = ++this.fetchSeq;
    this.rangeLoading.set(true);
    this.error.set(null);

    try {
      const { desde, hasta } = calculateRangeDates(nextRange);
      const dashResp = await this.dash.get({
        desde,
        hasta,
        include: 'mes,recientes',
        limit_recientes: 5,
      });

      if (seq !== this.fetchSeq) {
        return;
      }

      this.dashboardData.set(dashResp ?? null);
    } catch (err: unknown) {
      if (seq !== this.fetchSeq) {
        return;
      }
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'No se pudo actualizar el rango seleccionado';
      this.error.set(message);
    } finally {
      if (seq === this.fetchSeq) {
        this.rangeLoading.set(false);
      }
    }
  }

  sendWhatsapp(pedido: Pedido, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.pedidoActions.sendWhatsapp(pedido);
  }

  stopEventPropagation(event: Event): void {
    event.stopPropagation();
  }

  formatMxn(value: number): string {
    return formatCurrencyMXN(value);
  }

  trackByOrderId(_index: number, vm: ActiveOrderCardVm): string {
    return vm.pedido.id;
  }

  trackByMovementId(_index: number, vm: RecentMovementCardVm): string {
    return vm.item.id;
  }

  private toFiniteNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private createDoughnutOptions(
    unitSingular: string,
    unitPlural: string
  ): ChartOptions<'doughnut'> {
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
              const count = Number(ctx.parsed) || 0;
              const total = ctx.dataset.data.reduce(
                (acc, item) => acc + (Number(item) || 0),
                0
              );
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              const unit = count === 1 ? unitSingular : unitPlural;
              return ` ${ctx.label}: ${count} ${unit} (${pct}%)`;
            },
          },
        },
      },
    };
  }

  private createHorizontalCategoryOptions(): ChartOptions<'bar'> {
    return {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...DARK_TOOLTIP_BASE,
          callbacks: {
            label: (ctx: TooltipItem<'bar'>): string =>
              ` ${ctx.dataset.label ?? ''}: ${formatCurrencyMXN(Number(ctx.parsed.x) || 0)}`,
          },
        },
      },
      scales: {
        x: {
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
        y: {
          border: { display: false },
          grid: { display: false },
          ticks: {
            autoSkip: false,
            color: '#334155',
            font: { family: FONT_FAMILY, size: 11.5, weight: 600 },
          },
        },
      },
    };
  }
}
