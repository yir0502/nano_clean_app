import type { DashboardCategory, DashboardDay } from '../../core/dashboard.service';
import type { RepartoSocioConfig } from '../../core/models';
import {
  buildTopCategoryInsight,
  formatCurrencyMXN,
  type ChartInsightPill,
} from '../resumen/resumen.helpers';

export {
  buildBalanceRangeInsight,
  buildTopCategoryInsight,
  createVerticalGradient,
  formatCurrencyMXN,
  formatCurrentMonthLabel,
} from '../resumen/resumen.helpers';

export type {
  BalanceInsightPill,
  ChartGradientFn,
  ChartInsightPill,
} from '../resumen/resumen.helpers';

export type AnalisisPreset = 'mes' | '3m' | '6m' | '12m' | 'custom';
export type AnalisisGranularity = 'weekly' | 'monthly';
export type RepartoSourceMode = 'mes' | 'rango';

export interface AnalisisFlowSeries {
  granularity: AnalisisGranularity;
  labels: string[];
  ingresos: number[];
  egresos: number[];
  balances: number[];
  balanceNetoRango: number;
}

export const INGRESO_DOUGHNUT_PALETTE: readonly string[] = [
  '#10b981',
  '#0ea5e9',
  '#14b8a6',
  '#2563eb',
  '#059669',
  '#06b6d4',
  '#3b82f6',
  '#0d9488',
];

export const EGRESO_DOUGHNUT_PALETTE: readonly string[] = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#dc2626',
  '#d97706',
  '#a855f7',
];

export interface CategoryDoughnutRow {
  nombre: string;
  total: number;
  percent: number;
  color: string;
}

export interface CategoryDoughnutSummary {
  total: number;
  rows: CategoryDoughnutRow[];
  labels: string[];
  values: number[];
  colors: string[];
  insight: ChartInsightPill;
}

export const CAPITAL_SEGMENT_COLOR = '#0f766e';

export const SOCIO_SEGMENT_PALETTE: readonly string[] = [
  '#2563eb',
  '#7c3aed',
  '#d97706',
  '#db2777',
  '#0891b2',
  '#4f46e5',
  '#059669',
  '#ea580c',
];

export interface RepartoSocioCalculated {
  id: string;
  nombre: string;
  pct: number;
  monto: number;
  color: string;
}

export interface RepartoVisualSegment {
  id: string;
  label: string;
  pct: number;
  color: string;
  isCapital: boolean;
}

export interface RepartoDistributionResult {
  baseBalance: number;
  distributableBalance: number;
  hasDistributableProfit: boolean;
  capitalPct: number;
  capitalAmount: number;
  socios: RepartoSocioCalculated[];
  totalPct: number;
  remainingPct: number;
  isValidSum: boolean;
  segments: RepartoVisualSegment[];
}

export interface LegacyRepartoDraft {
  socios: RepartoSocioConfig[];
  useMesActual: boolean | null;
}

export interface RepartoShareTextParams {
  sucursalNombre: string;
  periodLabel: string;
  sourceMode: RepartoSourceMode;
  distribution: RepartoDistributionResult;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const WEEKLY_MAX_DAYS = 95;
const LEGACY_REPARTO_STORAGE_KEY = 'nano_clean_reparto';
const LEGACY_USE_MES_STORAGE_KEY = 'nano_clean_reparto_use_mes_actual';

const LEGACY_SLOTS: ReadonlyArray<{
  id: string;
  nameKey: string;
  pctKey: string;
  fallbackName: string;
}> = [
  { id: 'legacy-a', nameKey: 'aNombre', pctKey: 'aPct', fallbackName: 'Socio A' },
  { id: 'legacy-b', nameKey: 'bNombre', pctKey: 'bPct', fallbackName: 'Socio B' },
  { id: 'legacy-c', nameKey: 'cNombre', pctKey: 'cPct', fallbackName: 'Socio C' },
  { id: 'legacy-d', nameKey: 'dNombre', pctKey: 'dPct', fallbackName: 'Socio D' },
];

interface IsoDateParts {
  year: number;
  month: number;
  day: number;
}

function toSafeNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function parseIsoDateParts(raw: string | null | undefined): IsoDateParts | null {
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

function subtractLocalMonthsClamped(date: Date, monthsBack: number): Date {
  const totalMonths = date.getFullYear() * 12 + date.getMonth() - monthsBack;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const maxDayInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(date.getDate(), maxDayInMonth);
  return new Date(targetYear, targetMonth, clampedDay);
}

function formatShortMonthEsMX(date: Date): string {
  return new Intl.DateTimeFormat('es-MX', { month: 'short' })
    .format(date)
    .replace(/\./g, '');
}

function buildWeekBucket(fechaIso: string): { key: string; label: string } | null {
  const parts = parseIsoDateParts(fechaIso);
  if (!parts) {
    return null;
  }
  const date = new Date(parts.year, parts.month - 1, parts.day);
  const mondayOffset = (date.getDay() + 6) % 7;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - mondayOffset);
  const key = formatLocalIsoDate(monday);
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

export function round2(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function formatLocalIsoDate(date: Date): string {
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = String(safe.getFullYear()).padStart(4, '0');
  const month = String(safe.getMonth() + 1).padStart(2, '0');
  const day = String(safe.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function calculateAnalisisRange(
  preset: Exclude<AnalisisPreset, 'custom'>,
  referenceDate: Date = new Date()
): { desde: string; hasta: string } {
  const ref = Number.isNaN(referenceDate.getTime()) ? new Date() : referenceDate;
  const end = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());

  if (preset === 'mes') {
    const startOfMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    return {
      desde: formatLocalIsoDate(startOfMonth),
      hasta: formatLocalIsoDate(end),
    };
  }

  const monthsBack = preset === '3m' ? 3 : preset === '6m' ? 6 : 12;
  const start = subtractLocalMonthsClamped(end, monthsBack);
  return {
    desde: formatLocalIsoDate(start),
    hasta: formatLocalIsoDate(end),
  };
}

export function formatRangePeriodLabel(desde: string, hasta: string): string {
  const startParts = parseIsoDateParts(desde);
  const endParts = parseIsoDateParts(hasta);

  if (!startParts) {
    if (!endParts) {
      return '';
    }
    const d = new Date(endParts.year, endParts.month - 1, endParts.day);
    return `${endParts.day} ${formatShortMonthEsMX(d)} ${endParts.year}`;
  }

  if (!endParts) {
    const d = new Date(startParts.year, startParts.month - 1, startParts.day);
    return `${startParts.day} ${formatShortMonthEsMX(d)} ${startParts.year}`;
  }

  const s = startParts;
  const e = endParts;
  const startDate = new Date(s.year, s.month - 1, s.day);
  const endDate = new Date(e.year, e.month - 1, e.day);

  if (s.year === e.year && s.month === e.month) {
    const lastDayOfMonth = new Date(s.year, s.month, 0).getDate();
    if (s.day === 1 && e.day === lastDayOfMonth) {
      const monthName = new Intl.DateTimeFormat('es-MX', { month: 'long' }).format(startDate);
      const capitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      return `${capitalized} ${s.year}`;
    }
    if (s.day === e.day) {
      return `${s.day} ${formatShortMonthEsMX(startDate)} ${s.year}`;
    }
    return `${s.day} ${formatShortMonthEsMX(startDate)} - ${e.day} ${formatShortMonthEsMX(endDate)} ${e.year}`;
  }

  if (s.year === e.year) {
    return `${s.day} ${formatShortMonthEsMX(startDate)} - ${e.day} ${formatShortMonthEsMX(endDate)} ${e.year}`;
  }

  return `${s.day} ${formatShortMonthEsMX(startDate)} ${s.year} - ${e.day} ${formatShortMonthEsMX(endDate)} ${e.year}`;
}

export function determineAnalisisGranularity(
  preset: AnalisisPreset,
  desde: string,
  hasta: string
): AnalisisGranularity {
  if (preset === 'mes' || preset === '3m') {
    return 'weekly';
  }
  if (preset === '6m' || preset === '12m') {
    return 'monthly';
  }

  const startParts = parseIsoDateParts(desde);
  const endParts = parseIsoDateParts(hasta);
  if (!startParts || !endParts) {
    return 'weekly';
  }

  const startUtc = Date.UTC(startParts.year, startParts.month - 1, startParts.day);
  const endUtc = Date.UTC(endParts.year, endParts.month - 1, endParts.day);
  const diffDays = Math.abs(Math.round((endUtc - startUtc) / MS_PER_DAY));
  return diffDays <= WEEKLY_MAX_DAYS ? 'weekly' : 'monthly';
}

export function aggregateAnalisisFlow(
  porDia: ReadonlyArray<DashboardDay> | null | undefined,
  granularity: AnalisisGranularity
): AnalisisFlowSeries {
  if (!porDia || porDia.length === 0) {
    return {
      granularity,
      labels: [],
      ingresos: [],
      egresos: [],
      balances: [],
      balanceNetoRango: 0,
    };
  }

  const buckets = new Map<string, { label: string; ingresos: number; egresos: number }>();

  for (const item of porDia) {
    const bucketInfo =
      granularity === 'weekly' ? buildWeekBucket(item.fecha) : buildMonthBucket(item.fecha);
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
  let sumIngresos = 0;
  let sumEgresos = 0;

  for (const bucket of ordered) {
    const ing = round2(bucket.ingresos);
    const egr = round2(bucket.egresos);
    const bal = round2(ing - egr);
    labels.push(bucket.label);
    ingresos.push(ing);
    egresos.push(egr);
    balances.push(bal);
    sumIngresos += ing;
    sumEgresos += egr;
  }

  return {
    granularity,
    labels,
    ingresos,
    egresos,
    balances,
    balanceNetoRango: round2(sumIngresos - sumEgresos),
  };
}

export function buildCategoryDoughnutSummary(
  categories: ReadonlyArray<DashboardCategory> | null | undefined,
  palette: ReadonlyArray<string>,
  tipo: 'ingreso' | 'egreso' = 'ingreso'
): CategoryDoughnutSummary {
  const insight = buildTopCategoryInsight(categories, tipo);
  if (!categories || categories.length === 0) {
    return {
      total: 0,
      rows: [],
      labels: [],
      values: [],
      colors: [],
      insight,
    };
  }

  const effectivePalette = palette.length > 0 ? palette : ['#64748b'];
  const validEntries: Array<{ nombre: string; total: number }> = [];

  for (const category of categories) {
    const amount = toSafeNumber(category.total);
    if (amount <= 0) {
      continue;
    }
    validEntries.push({
      nombre: category.nombre?.trim() || 'Sin categoría',
      total: round2(amount),
    });
  }

  if (validEntries.length === 0) {
    return {
      total: 0,
      rows: [],
      labels: [],
      values: [],
      colors: [],
      insight,
    };
  }

  validEntries.sort((a, b) => b.total - a.total);

  const total = round2(validEntries.reduce((acc, item) => acc + item.total, 0));
  const rows: CategoryDoughnutRow[] = validEntries.map((item, idx) => ({
    nombre: item.nombre,
    total: item.total,
    percent: total > 0 ? round2((item.total / total) * 100) : 0,
    color: effectivePalette[idx % effectivePalette.length],
  }));

  return {
    total,
    rows,
    labels: rows.map((row) => row.nombre),
    values: rows.map((row) => row.total),
    colors: rows.map((row) => row.color),
    insight,
  };
}

export function calculateRepartoDistribution(
  baseBalance: number,
  capitalPct: number,
  socios: ReadonlyArray<RepartoSocioConfig>
): RepartoDistributionResult {
  const safeBaseBalance = Number.isFinite(baseBalance) ? round2(baseBalance) : 0;
  const hasDistributableProfit = safeBaseBalance > 0;
  const distributableBalance = hasDistributableProfit ? safeBaseBalance : 0;
  const safeCapitalPct = Number.isFinite(capitalPct) ? round2(capitalPct) : 0;
  const capitalAmount = hasDistributableProfit
    ? round2((distributableBalance * safeCapitalPct) / 100)
    : 0;

  const calculatedSocios: RepartoSocioCalculated[] = socios.map((socio, idx) => {
    const pct = Number.isFinite(socio.pct) ? round2(socio.pct) : 0;
    const monto = hasDistributableProfit ? round2((distributableBalance * pct) / 100) : 0;
    const color = SOCIO_SEGMENT_PALETTE[idx % SOCIO_SEGMENT_PALETTE.length];
    return {
      id: socio.id,
      nombre: socio.nombre,
      pct,
      monto,
      color,
    };
  });

  const sociosPctSum = calculatedSocios.reduce((acc, socio) => acc + socio.pct, 0);
  const totalPct = round2(safeCapitalPct + sociosPctSum);
  const remainingPct = round2(100 - totalPct);
  const isValidSum = Math.abs(remainingPct) <= 0.01;

  const segments: RepartoVisualSegment[] = [];
  if (safeCapitalPct > 0) {
    segments.push({
      id: 'capital',
      label: 'Capital del negocio',
      pct: safeCapitalPct,
      color: CAPITAL_SEGMENT_COLOR,
      isCapital: true,
    });
  }

  for (const socio of calculatedSocios) {
    if (socio.pct > 0) {
      segments.push({
        id: socio.id,
        label: socio.nombre.trim() || 'Socio',
        pct: socio.pct,
        color: socio.color,
        isCapital: false,
      });
    }
  }

  return {
    baseBalance: safeBaseBalance,
    distributableBalance,
    hasDistributableProfit,
    capitalPct: safeCapitalPct,
    capitalAmount,
    socios: calculatedSocios,
    totalPct,
    remainingPct,
    isValidSum,
    segments,
  };
}

export function splitRemainingEqually(
  capitalPct: number,
  socios: ReadonlyArray<RepartoSocioConfig>
): RepartoSocioConfig[] {
  if (socios.length === 0) {
    return [];
  }

  const clampedCapitalPct = Number.isFinite(capitalPct)
    ? Math.min(Math.max(capitalPct, 0), 100)
    : 0;
  const remainingCentesimas = Math.max(0, 10000 - Math.round(clampedCapitalPct * 100));
  const base = Math.floor(remainingCentesimas / socios.length);
  const residuo = remainingCentesimas - base * socios.length;

  return socios.map((socio, idx) => ({
    ...socio,
    pct: (idx === 0 ? base + residuo : base) / 100,
  }));
}

export function readLegacyRepartoDraft(
  storage?: Pick<Storage, 'getItem'> | null
): LegacyRepartoDraft | null {
  const resolvedStorage =
    storage !== undefined
      ? storage
      : typeof localStorage !== 'undefined'
        ? localStorage
        : null;

  if (!resolvedStorage) {
    return null;
  }

  const socios: RepartoSocioConfig[] = [];
  let useMesActual: boolean | null = null;

  try {
    const rawReparto = resolvedStorage.getItem(LEGACY_REPARTO_STORAGE_KEY);
    if (rawReparto) {
      const parsed: unknown = JSON.parse(rawReparto);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        for (const slot of LEGACY_SLOTS) {
          const rawPct = Number(record[slot.pctKey]);
          if (!Number.isFinite(rawPct) || rawPct <= 0) {
            continue;
          }
          const rawName = record[slot.nameKey];
          const nombre =
            typeof rawName === 'string' && rawName.trim() ? rawName.trim() : slot.fallbackName;
          socios.push({
            id: slot.id,
            nombre,
            pct: round2(rawPct),
          });
        }
      }
    }
  } catch {
    // Ignorar JSON corrupto o bloqueo de almacenamiento en navegadores restringidos
  }

  try {
    const rawUseMes = resolvedStorage.getItem(LEGACY_USE_MES_STORAGE_KEY);
    if (rawUseMes) {
      const parsedUseMes: unknown = JSON.parse(rawUseMes);
      if (typeof parsedUseMes === 'boolean') {
        useMesActual = parsedUseMes;
      }
    }
  } catch {
    // Ignorar preferencia legacy corrupta
  }

  if (socios.length === 0 && useMesActual === null) {
    return null;
  }

  return {
    socios,
    useMesActual,
  };
}

export function buildRepartoShareText(params: RepartoShareTextParams): string {
  const sucursal = params.sucursalNombre.trim() || 'Sucursal';
  const period = params.periodLabel.trim() || 'Sin periodo';
  const sourceLabel = params.sourceMode === 'mes' ? 'Mes actual' : 'Rango filtrado';
  const { distribution } = params;

  const lines: string[] = [
    `Reparto de utilidades - ${sucursal}`,
    `Periodo: ${period} (${sourceLabel})`,
    `Utilidad base: ${formatCurrencyMXN(distribution.baseBalance)}`,
  ];

  if (!distribution.hasDistributableProfit) {
    lines.push('Sin utilidad repartible en este periodo.');
  }

  if (distribution.capitalPct > 0) {
    lines.push(
      `- Capital del negocio (${distribution.capitalPct}%): ${formatCurrencyMXN(distribution.capitalAmount)}`
    );
  }

  for (const socio of distribution.socios) {
    const socioName = socio.nombre.trim() || 'Socio';
    lines.push(`- ${socioName} (${socio.pct}%): ${formatCurrencyMXN(socio.monto)}`);
  }

  return lines.join('\n');
}

export function buildWhatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function calculateNetMarginPct(ingresos: number, balance: number): number | null {
  if (!Number.isFinite(ingresos) || !Number.isFinite(balance) || ingresos <= 0) {
    return null;
  }
  return round2((balance / ingresos) * 100);
}
