import type { Color, ScriptableContext } from 'chart.js';
import type {
  DashboardCategory,
  DashboardDay,
  DashboardSucursalMes,
} from '../../core/dashboard.service';
import type { ClientStatsResponse, Pedido } from '../../core/models';

export type ResumenRange = '3m' | '6m' | '12m';

export type PedidoActiveStageKey = 'recibido' | 'lavando' | 'secando' | 'doblando' | 'listo';
export type PedidoStageKey = PedidoActiveStageKey | 'entregado' | 'cancelado';

export interface PedidoStageMeta {
  key: PedidoStageKey;
  index: number;
  percent: number;
  label: string;
  cssClass: string;
  icon: string;
}

export interface PedidoActiveStageMeta extends PedidoStageMeta {
  key: PedidoActiveStageKey;
}

export const PEDIDO_ACTIVE_STAGES: ReadonlyArray<PedidoActiveStageMeta> = [
  {
    key: 'recibido',
    index: 0,
    percent: 20,
    label: 'Recibido',
    cssClass: 'stage--recibido',
    icon: 'inventory_2',
  },
  {
    key: 'lavando',
    index: 1,
    percent: 40,
    label: 'Lavando',
    cssClass: 'stage--lavando',
    icon: 'local_laundry_service',
  },
  {
    key: 'secando',
    index: 2,
    percent: 60,
    label: 'Secando',
    cssClass: 'stage--secando',
    icon: 'air',
  },
  {
    key: 'doblando',
    index: 3,
    percent: 80,
    label: 'Doblando',
    cssClass: 'stage--doblando',
    icon: 'checkroom',
  },
  {
    key: 'listo',
    index: 4,
    percent: 100,
    label: 'Listo',
    cssClass: 'stage--listo',
    icon: 'check_circle',
  },
];

const PEDIDO_STAGE_LOOKUP: Record<string, PedidoStageMeta> = {
  recibido: PEDIDO_ACTIVE_STAGES[0],
  lavando: PEDIDO_ACTIVE_STAGES[1],
  secando: PEDIDO_ACTIVE_STAGES[2],
  doblando: PEDIDO_ACTIVE_STAGES[3],
  listo: PEDIDO_ACTIVE_STAGES[4],
  entregado: {
    key: 'entregado',
    index: 4,
    percent: 100,
    label: 'Entregado',
    cssClass: 'stage--entregado',
    icon: 'task_alt',
  },
  cancelado: {
    key: 'cancelado',
    index: 0,
    percent: 0,
    label: 'Cancelado',
    cssClass: 'stage--cancelado',
    icon: 'cancel',
  },
};

export function getPedidoStageMeta(estado: Pedido['estado'] | string | null | undefined): PedidoStageMeta {
  if (!estado) {
    return PEDIDO_ACTIVE_STAGES[0];
  }
  const normalized = estado.trim().toLowerCase();
  return PEDIDO_STAGE_LOOKUP[normalized] ?? PEDIDO_ACTIVE_STAGES[0];
}

export type DeudaSeverityKey = 'dia' | 'leves' | 'graves';

export interface BreakdownItem<K extends string = string> {
  key: K;
  label: string;
  count: number;
  percent: number;
  color: string;
}

export interface DeudaSeveritySummary {
  dia: number;
  leves: number;
  graves: number;
  totalPedidos: number;
  totalAdeudado: number;
  riesgoCriticoPercent: number;
  breakdown: BreakdownItem<DeudaSeverityKey>[];
}

export const DEUDA_SEVERITY_COLORS: Readonly<Record<DeudaSeverityKey, string>> = {
  dia: '#10b981',
  leves: '#f59e0b',
  graves: '#ef4444',
};

export type ClienteSegmentKey = 'active_0_15' | 'risk_16_45' | 'lost_45plus';

export interface ClientesSegmentSummary {
  total: number;
  activosCount: number;
  riesgoCount: number;
  inactivosCount: number;
  activosPercent: number;
  breakdown: BreakdownItem<ClienteSegmentKey>[];
}

export const CLIENTE_SEGMENT_COLORS: Readonly<Record<ClienteSegmentKey, string>> = {
  active_0_15: '#10b981',
  risk_16_45: '#f59e0b',
  lost_45plus: '#ef4444',
};

export interface AggregatedFinancialSeries {
  labels: string[];
  ingresos: number[];
  egresos: number[];
  balances: number[];
  totalIngresos: number;
  totalEgresos: number;
  balanceNetoRango: number;
}

export type BalanceInsightTone = 'positive' | 'negative' | 'neutral';
export type InsightTone = BalanceInsightTone | 'warning' | 'info';

export interface ChartInsightPill {
  text: string;
  tone: InsightTone;
}

export interface BalanceInsightPill {
  text: string;
  tone: BalanceInsightTone;
}

export interface ResumenChartInsights {
  balanceRango: BalanceInsightPill;
  carteraDeuda: ChartInsightPill;
  clientesActivos: ChartInsightPill;
  sucursalLider: ChartInsightPill;
  topIngresoCategoria: ChartInsightPill;
  topEgresoCategoria: ChartInsightPill;
}

export interface FormatCurrencyOptions {
  showSign?: boolean;
  decimals?: number;
}

export interface GradientChartLike {
  ctx?: {
    createLinearGradient?: (x0: number, y0: number, x1: number, y1: number) => CanvasGradient;
  } | null;
  chartArea?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  } | null;
}

export type ChartGradientContext =
  | ScriptableContext<'line'>
  | ScriptableContext<'bar'>
  | { chart?: GradientChartLike | null };

export type ChartGradientFn = (context: ChartGradientContext) => Color;

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DEUDA_LEVE_MAX_DAYS = 7;

const PAYMENT_METHOD_LABELS: Readonly<Record<string, string>> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  mercado_pago: 'Mercado Pago',
  mercadopago: 'Mercado Pago',
  otro: 'Otro',
};

function toSafeNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function toSafeNonNegativeInt(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.floor(num)) : 0;
}

function calcPercent(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0 || part <= 0) {
    return 0;
  }
  return Math.round((part / total) * 100);
}

function formatDateLocalIso(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIsoDateParts(raw: string | null | undefined): { year: number; month: number; day: number } | null {
  if (!raw || typeof raw !== 'string') {
    return null;
  }
  const match = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const check = new Date(year, month - 1, day);
  if (
    Number.isNaN(check.getTime()) ||
    check.getFullYear() !== year ||
    check.getMonth() !== month - 1 ||
    check.getDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function calculateDeudaSeverity(
  pedidos: ReadonlyArray<Pedido>,
  referenceDate: Date = new Date()
): DeudaSeveritySummary {
  const ref = Number.isNaN(referenceDate.getTime()) ? new Date() : referenceDate;
  const refUtc = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate());

  let dia = 0;
  let leves = 0;
  let graves = 0;
  let totalAdeudado = 0;

  for (const pedido of pedidos) {
    const saldo = Number(pedido.saldo_pendiente);
    if (!Number.isFinite(saldo) || saldo <= 0) {
      continue;
    }
    totalAdeudado += saldo;

    const parts = parseIsoDateParts(pedido.fecha_entrega_estimada);
    if (!parts) {
      dia++;
      continue;
    }

    const dueUtc = Date.UTC(parts.year, parts.month - 1, parts.day);
    if (refUtc <= dueUtc) {
      dia++;
      continue;
    }

    const diffDays = Math.ceil((refUtc - dueUtc) / MS_PER_DAY);
    if (diffDays <= DEUDA_LEVE_MAX_DAYS) {
      leves++;
    } else {
      graves++;
    }
  }

  const totalPedidos = dia + leves + graves;
  const riesgoCriticoPercent = calcPercent(graves, totalPedidos);

  return {
    dia,
    leves,
    graves,
    totalPedidos,
    totalAdeudado,
    riesgoCriticoPercent,
    breakdown: [
      {
        key: 'dia',
        label: 'Día a día',
        count: dia,
        percent: calcPercent(dia, totalPedidos),
        color: DEUDA_SEVERITY_COLORS.dia,
      },
      {
        key: 'leves',
        label: 'Atraso leve (1-7 días)',
        count: leves,
        percent: calcPercent(leves, totalPedidos),
        color: DEUDA_SEVERITY_COLORS.leves,
      },
      {
        key: 'graves',
        label: 'Riesgo crítico (+7 días)',
        count: graves,
        percent: riesgoCriticoPercent,
        color: DEUDA_SEVERITY_COLORS.graves,
      },
    ],
  };
}

export function buildClientesSegmentSummary(
  stats: ClientStatsResponse | null | undefined
): ClientesSegmentSummary {
  const activosCount = toSafeNonNegativeInt(stats?.segmentos?.active_0_15);
  const riesgoCount = toSafeNonNegativeInt(stats?.segmentos?.risk_16_45);
  const inactivosCount = toSafeNonNegativeInt(stats?.segmentos?.lost_45plus);
  const segmentSum = activosCount + riesgoCount + inactivosCount;
  const total = toSafeNonNegativeInt(stats?.total) || segmentSum;
  const denom = segmentSum > 0 ? segmentSum : total;
  const activosPercent = calcPercent(activosCount, denom);

  return {
    total,
    activosCount,
    riesgoCount,
    inactivosCount,
    activosPercent,
    breakdown: [
      {
        key: 'active_0_15',
        label: 'Activos (0-15 días)',
        count: activosCount,
        percent: activosPercent,
        color: CLIENTE_SEGMENT_COLORS.active_0_15,
      },
      {
        key: 'risk_16_45',
        label: 'En riesgo (16-45 días)',
        count: riesgoCount,
        percent: calcPercent(riesgoCount, denom),
        color: CLIENTE_SEGMENT_COLORS.risk_16_45,
      },
      {
        key: 'lost_45plus',
        label: 'Inactivos (+45 días)',
        count: inactivosCount,
        percent: calcPercent(inactivosCount, denom),
        color: CLIENTE_SEGMENT_COLORS.lost_45plus,
      },
    ],
  };
}

export function calculateRangeDates(
  range: ResumenRange,
  referenceDate: Date = new Date()
): { desde: string; hasta: string } {
  const ref = Number.isNaN(referenceDate.getTime()) ? new Date() : referenceDate;
  const end = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  const monthsBack = range === '3m' ? 3 : range === '6m' ? 6 : 12;
  start.setMonth(start.getMonth() - monthsBack);

  return {
    desde: formatDateLocalIso(start),
    hasta: formatDateLocalIso(end),
  };
}

function buildWeekBucket(fechaIso: string): { key: string; label: string } | null {
  const parts = parseIsoDateParts(fechaIso);
  if (!parts) {
    return null;
  }
  const date = new Date(parts.year, parts.month - 1, parts.day);
  const mondayOffset = (date.getDay() + 6) % 7;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - mondayOffset);
  const key = formatDateLocalIso(monday);
  const shortLabel = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short' })
    .format(monday)
    .replace(/\./g, '');
  return { key, label: `Sem ${shortLabel}` };
}

function buildMonthBucket(fechaIso: string): { key: string; label: string } | null {
  const parts = parseIsoDateParts(fechaIso);
  if (!parts) {
    return null;
  }
  const key = `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}`;
  const label = new Intl.DateTimeFormat('es-MX', { month: 'short', year: '2-digit' })
    .format(new Date(parts.year, parts.month - 1, 1))
    .replace(/\./g, '');
  return { key, label };
}

export function aggregateFinancialSeries(
  porDia: ReadonlyArray<DashboardDay>,
  range: ResumenRange
): AggregatedFinancialSeries {
  const mode = range === '3m' ? 'weekly' : 'monthly';
  const buckets = new Map<string, { label: string; ingresos: number; egresos: number }>();

  for (const item of porDia) {
    const bucketInfo = mode === 'weekly' ? buildWeekBucket(item.fecha) : buildMonthBucket(item.fecha);
    if (!bucketInfo) {
      continue;
    }
    const existing = buckets.get(bucketInfo.key) ?? {
      label: bucketInfo.label,
      ingresos: 0,
      egresos: 0,
    };
    existing.ingresos += toSafeNumber(item.ingresos);
    existing.egresos += toSafeNumber(item.egresos);
    buckets.set(bucketInfo.key, existing);
  }

  const ordered = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);

  const labels: string[] = [];
  const ingresos: number[] = [];
  const egresos: number[] = [];
  const balances: number[] = [];
  let totalIngresos = 0;
  let totalEgresos = 0;

  for (const bucket of ordered) {
    const bal = bucket.ingresos - bucket.egresos;
    labels.push(bucket.label);
    ingresos.push(bucket.ingresos);
    egresos.push(bucket.egresos);
    balances.push(bal);
    totalIngresos += bucket.ingresos;
    totalEgresos += bucket.egresos;
  }

  return {
    labels,
    ingresos,
    egresos,
    balances,
    totalIngresos,
    totalEgresos,
    balanceNetoRango: totalIngresos - totalEgresos,
  };
}

export function formatCurrencyMXN(value: number, options?: FormatCurrencyOptions): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  const rawDecimals = options?.decimals ?? 0;
  const decimals = Number.isFinite(rawDecimals)
    ? Math.min(6, Math.max(0, Math.floor(rawDecimals)))
    : 0;
  const abs = Math.abs(safeValue);
  const roundedZero = Number(abs.toFixed(decimals)) === 0;

  const formatted = new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(roundedZero ? 0 : abs);

  if (roundedZero) {
    return `$${formatted}`;
  }
  if (safeValue < 0) {
    return `-$${formatted}`;
  }
  if (options?.showSign) {
    return `+$${formatted}`;
  }
  return `$${formatted}`;
}

export function formatPaymentMethod(
  method: string | null | undefined,
  fallback = 'Sin método'
): string {
  if (!method) {
    return fallback;
  }
  const normalized = method.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return PAYMENT_METHOD_LABELS[normalized] ?? fallback;
}

function hasRealTimeComponent(raw: string): boolean {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return false;
  }
  // Placeholder sin zona horaria generado cuando solo existe fecha de negocio
  if (/^\d{4}-\d{2}-\d{2}[T\s]00:00(?::00(?:\.0+)?)?$/.test(trimmed)) {
    return false;
  }
  return /[T\s]\d{2}:\d{2}/.test(trimmed);
}

function parseFlexibleDate(raw: string): { date: Date; includeTime: boolean } | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const includeTime = hasRealTimeComponent(trimmed);
  if (!includeTime) {
    const parts = parseIsoDateParts(trimmed);
    if (!parts) {
      return null;
    }
    return {
      date: new Date(parts.year, parts.month - 1, parts.day),
      includeTime: false,
    };
  }

  const normalized = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(trimmed)
    ? trimmed.replace(/\s+/, 'T')
    : trimmed;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return { date: parsed, includeTime: true };
}

export function formatRecentMovementDate(
  createdAt: string | null | undefined,
  fecha: string
): string {
  const primary = createdAt ? parseFlexibleDate(createdAt) : null;
  const resolved = primary ?? parseFlexibleDate(fecha);
  if (!resolved) {
    return '';
  }

  const { date, includeTime } = resolved;
  const dayPart = new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
  })
    .format(date)
    .replace(/\./g, '');

  if (!includeTime) {
    return dayPart;
  }

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${dayPart}, ${hours}:${minutes}`;
}

export function formatCurrentMonthLabel(date: Date = new Date()): string {
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const month = new Intl.DateTimeFormat('es-MX', { month: 'long' }).format(safeDate);
  const capitalized = month.charAt(0).toUpperCase() + month.slice(1);
  return `${capitalized} ${safeDate.getFullYear()}`;
}

export function buildBalanceRangeInsight(balanceNetoRango: number): BalanceInsightPill {
  const safe = Number.isFinite(balanceNetoRango) ? balanceNetoRango : 0;
  const rounded = Math.round(safe);
  if (rounded === 0) {
    return { text: '$0', tone: 'neutral' };
  }
  if (rounded > 0) {
    return {
      text: formatCurrencyMXN(safe, { showSign: true }),
      tone: 'positive',
    };
  }
  return {
    text: formatCurrencyMXN(safe, { showSign: true }),
    tone: 'negative',
  };
}

export function buildDeudaRiskInsight(summary: DeudaSeveritySummary): ChartInsightPill {
  if (summary.totalPedidos === 0 || summary.graves === 0) {
    return { text: 'Al día', tone: 'positive' };
  }
  return {
    text: `${summary.riesgoCriticoPercent}% riesgo crítico`,
    tone: 'negative',
  };
}

export function buildClientesActiveInsight(summary: ClientesSegmentSummary): ChartInsightPill {
  if (summary.total === 0) {
    return { text: 'Sin clientes', tone: 'neutral' };
  }
  const tone: InsightTone =
    summary.activosPercent >= 50
      ? 'positive'
      : summary.activosPercent >= 25
        ? 'warning'
        : 'negative';
  return {
    text: `${summary.activosPercent}% activos`,
    tone,
  };
}

export function buildTopSucursalInsight(
  sucursales: ReadonlyArray<DashboardSucursalMes> | null | undefined
): ChartInsightPill {
  if (!sucursales || sucursales.length === 0) {
    return { text: 'Sin datos', tone: 'neutral' };
  }

  let leader: DashboardSucursalMes | null = null;
  let leaderIngresos = -1;
  let leaderBalance = -Infinity;

  for (const s of sucursales) {
    const ing = toSafeNumber(s.ingresos);
    const bal = toSafeNumber(s.balance);
    if (ing <= 0) {
      continue;
    }
    if (ing > leaderIngresos || (ing === leaderIngresos && bal > leaderBalance)) {
      leader = s;
      leaderIngresos = ing;
      leaderBalance = bal;
    }
  }

  if (leader) {
    const nombre = leader.nombre?.trim() || 'Sin sucursal';
    return {
      text: `Líder: ${nombre} (${formatCurrencyMXN(leaderIngresos)})`,
      tone: 'info',
    };
  }

  let fallbackLeader: DashboardSucursalMes | null = null;
  let maxEgresos = 0;
  for (const s of sucursales) {
    const egr = toSafeNumber(s.egresos);
    if (egr > maxEgresos) {
      fallbackLeader = s;
      maxEgresos = egr;
    }
  }

  if (!fallbackLeader) {
    return { text: 'Sin datos', tone: 'neutral' };
  }

  const nombre = fallbackLeader.nombre?.trim() || 'Sin sucursal';
  return {
    text: `${nombre} (${formatCurrencyMXN(maxEgresos)})`,
    tone: 'neutral',
  };
}

export function buildTopCategoryInsight(
  categories: ReadonlyArray<DashboardCategory> | null | undefined,
  tipo: 'ingreso' | 'egreso'
): ChartInsightPill {
  if (!categories || categories.length === 0) {
    return { text: 'Sin datos', tone: 'neutral' };
  }

  let top: DashboardCategory | null = null;
  let topTotal = 0;
  let sumTotal = 0;

  for (const c of categories) {
    const val = toSafeNumber(c.total);
    if (val <= 0) {
      continue;
    }
    sumTotal += val;
    if (val > topTotal) {
      top = c;
      topTotal = val;
    }
  }

  if (!top || sumTotal <= 0) {
    return { text: 'Sin datos', tone: 'neutral' };
  }

  const nombre = top.nombre?.trim() || 'Sin categoría';
  const percent = calcPercent(topTotal, sumTotal);
  return {
    text: `${nombre}: ${formatCurrencyMXN(topTotal)} (${percent}%)`,
    tone: tipo === 'ingreso' ? 'positive' : 'negative',
  };
}

export function buildResumenChartInsights(params: {
  balanceNetoRango: number;
  deudaSummary: DeudaSeveritySummary;
  clientesSummary: ClientesSegmentSummary;
  sucursalesMes?: ReadonlyArray<DashboardSucursalMes> | null;
  ingresosCategoriasMes?: ReadonlyArray<DashboardCategory> | null;
  egresosCategoriasMes?: ReadonlyArray<DashboardCategory> | null;
}): ResumenChartInsights {
  return {
    balanceRango: buildBalanceRangeInsight(params.balanceNetoRango),
    carteraDeuda: buildDeudaRiskInsight(params.deudaSummary),
    clientesActivos: buildClientesActiveInsight(params.clientesSummary),
    sucursalLider: buildTopSucursalInsight(params.sucursalesMes),
    topIngresoCategoria: buildTopCategoryInsight(params.ingresosCategoriasMes, 'ingreso'),
    topEgresoCategoria: buildTopCategoryInsight(params.egresosCategoriasMes, 'egreso'),
  };
}

export function createVerticalGradient(
  topColor: string,
  bottomColor: string,
  fallback: string
): ChartGradientFn {
  return (context: ChartGradientContext): Color => {
    const chart = context?.chart;
    const area = chart?.chartArea;
    const ctx = chart?.ctx;

    if (!area || !ctx || typeof ctx.createLinearGradient !== 'function') {
      return fallback;
    }
    if (!Number.isFinite(area.top) || !Number.isFinite(area.bottom) || area.top === area.bottom) {
      return fallback;
    }

    try {
      const gradient = ctx.createLinearGradient(0, area.top, 0, area.bottom);
      gradient.addColorStop(0, topColor);
      gradient.addColorStop(1, bottomColor);
      return gradient;
    } catch {
      return fallback;
    }
  };
}

export function createHorizontalGradient(
  startColor: string,
  endColor: string,
  fallback: string
): ChartGradientFn {
  return (context: ChartGradientContext): Color => {
    const chart = context?.chart;
    const area = chart?.chartArea;
    const ctx = chart?.ctx;

    if (!area || !ctx || typeof ctx.createLinearGradient !== 'function') {
      return fallback;
    }
    if (!Number.isFinite(area.left) || !Number.isFinite(area.right) || area.left === area.right) {
      return fallback;
    }

    try {
      const gradient = ctx.createLinearGradient(area.left, 0, area.right, 0);
      gradient.addColorStop(0, startColor);
      gradient.addColorStop(1, endColor);
      return gradient;
    } catch {
      return fallback;
    }
  };
}
