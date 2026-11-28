import type { PedidoEstadoFilter } from '../../core/models';
import { formatLocalIsoDate } from '../analisis/analisis.helpers';

export {
  formatCurrencyMXN,
  getPedidoStageMeta,
  PEDIDO_ACTIVE_STAGES,
} from '../resumen/resumen.helpers';

export type {
  FormatCurrencyOptions,
  PedidoActiveStageKey,
  PedidoActiveStageMeta,
  PedidoStageKey,
  PedidoStageMeta,
} from '../resumen/resumen.helpers';

export { formatLocalIsoDate } from '../analisis/analisis.helpers';

export type HistorialDatePreset = 'todo' | 'hoy' | '7d' | 'mes' | 'custom';

export interface HistorialDateRange {
  desde: string;
  hasta: string;
}

export type OrderUrgencyTone = 'overdue' | 'today' | 'tomorrow' | 'upcoming';

export interface OrderUrgencyInfo {
  label: string;
  tone: OrderUrgencyTone;
  daysDiff: number;
}

export interface NextStatusAction {
  next: PedidoEstadoFilter;
  label: string;
  icon: string;
  colorClass: string;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const FOLIO_PATTERN = /\b(LAV-[A-Z0-9]{4,8})\b/i;
const STRICT_ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATETIME_PATTERN =
  /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/i;
const TICKET_PREFIX_PATTERN = /^(?:folio|ticket|pedido|orden|cod(?:igo)?|id)\s*[:#=-]\s*#?(.+)$/i;
const HASH_CODE_PATTERN = /^#([A-Z0-9_-]{3,})$/i;
const JSON_SCAN_KEYS: readonly string[] = ['folio', 'codigo', 'code', 'q', 'id', 'pedido_id', 'pedidoId'];
const URL_QUERY_SCAN_KEYS: readonly string[] = ['folio', 'q', 'codigo', 'code', 'pedido', 'id'];
const IGNORED_PEDIDO_ROUTE_SEGMENTS = new Set(['nuevo', 'lista', 'historial']);
const SHORT_MONTHS_ES: readonly string[] = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeExtractedToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  const folioMatch = FOLIO_PATTERN.exec(trimmed);
  if (folioMatch) {
    return folioMatch[1].toUpperCase();
  }
  return trimmed;
}

function readJsonStringField(obj: object, keys: readonly string[]): string | null {
  const entries = new Map<string, unknown>(Object.entries(obj));
  for (const key of keys) {
    const value = entries.get(key);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

export function calculateHistorialDateRange(
  preset: HistorialDatePreset,
  referenceDate: Date = new Date()
): HistorialDateRange {
  if (preset === 'todo' || preset === 'custom') {
    return { desde: '', hasta: '' };
  }

  const ref = Number.isNaN(referenceDate.getTime()) ? new Date() : referenceDate;
  const end = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const todayIso = formatLocalIsoDate(end);

  if (preset === 'hoy') {
    return { desde: todayIso, hasta: todayIso };
  }

  if (preset === '7d') {
    const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6);
    return { desde: formatLocalIsoDate(start), hasta: todayIso };
  }

  const startOfMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  return { desde: formatLocalIsoDate(startOfMonth), hasta: todayIso };
}

export function parseLocalDateInput(value: string | null | undefined): Date | null {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  const match = STRICT_ISO_DATE_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function formatLocalDateFromInput(value: string | Date | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return '';
    }
    return formatLocalIsoDate(value);
  }

  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  // Evita pasar YYYY-MM-DD por new Date(iso), que interpreta medianoche UTC y desplaza la fecha local
  if (STRICT_ISO_DATE_PATTERN.test(trimmed)) {
    return parseLocalDateInput(trimmed) ? trimmed : '';
  }

  const isoMatch = ISO_DATETIME_PATTERN.exec(trimmed);
  if (!isoMatch || !parseLocalDateInput(isoMatch[1])) {
    return '';
  }

  const hours = Number(isoMatch[2]);
  const minutes = Number(isoMatch[3]);
  const seconds = isoMatch[4] !== undefined ? Number(isoMatch[4]) : 0;
  if (hours > 23 || minutes > 59 || seconds > 59) {
    return '';
  }

  let normalized = trimmed.replace(/\s+/, 'T');
  if (/[+-]\d{2}$/.test(normalized)) {
    normalized = `${normalized}:00`;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return formatLocalIsoDate(parsed);
}

export function extractScannedOrderQuery(raw: string): string {
  if (!raw || typeof raw !== 'string') {
    return '';
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const extracted = readJsonStringField(parsed, JSON_SCAN_KEYS);
        if (extracted) {
          return normalizeExtractedToken(extracted);
        }
      }
    } catch {
      // Continuar con heuristica de texto plano si el JSON no es valido
    }
  }

  const directFolioMatch = FOLIO_PATTERN.exec(trimmed);
  if (directFolioMatch) {
    return directFolioMatch[1].toUpperCase();
  }

  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('?')) {
    try {
      const url = new URL(trimmed, 'https://nanoclean.local');

      for (const key of URL_QUERY_SCAN_KEYS) {
        const param = url.searchParams.get(key);
        if (param && param.trim()) {
          return normalizeExtractedToken(param);
        }
      }

      const pedidosMatch = /\/pedidos\/([^/?#]+)/i.exec(url.pathname);
      if (pedidosMatch) {
        const segment = safeDecodeUriComponent(pedidosMatch[1]).trim();
        if (segment && !IGNORED_PEDIDO_ROUTE_SEGMENTS.has(segment.toLowerCase())) {
          return normalizeExtractedToken(segment);
        }
      }

      const rastreoMatch = /\/rastreo\/(?:[^/?#]+\/)?([^/?#]+)/i.exec(url.pathname);
      if (rastreoMatch) {
        const segment = safeDecodeUriComponent(rastreoMatch[1]).trim();
        if (segment) {
          return normalizeExtractedToken(segment);
        }
      }
    } catch {
      // Continuar con extraccion por prefijo si la URL es malformada
    }
  }

  const ticketPrefixMatch = TICKET_PREFIX_PATTERN.exec(trimmed);
  if (ticketPrefixMatch) {
    return normalizeExtractedToken(ticketPrefixMatch[1]);
  }

  const hashMatch = HASH_CODE_PATTERN.exec(trimmed);
  if (hashMatch) {
    return normalizeExtractedToken(hashMatch[1]);
  }

  return trimmed;
}

export function getOrderUrgencyInfo(
  fechaEntregaEstimada: string | null | undefined,
  referenceDate: Date = new Date()
): OrderUrgencyInfo | null {
  const localIso = formatLocalDateFromInput(fechaEntregaEstimada);
  const targetDate = parseLocalDateInput(localIso);
  if (!targetDate) {
    return null;
  }

  const ref = Number.isNaN(referenceDate.getTime()) ? new Date() : referenceDate;
  const targetUtc = Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const refUtc = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const daysDiff = Math.round((targetUtc - refUtc) / MS_PER_DAY);

  if (daysDiff < 0) {
    return { label: 'Vencido', tone: 'overdue', daysDiff };
  }

  if (daysDiff === 0) {
    return { label: 'Hoy', tone: 'today', daysDiff };
  }

  if (daysDiff === 1) {
    return { label: 'Mañana', tone: 'tomorrow', daysDiff };
  }

  const dayStr = String(targetDate.getDate()).padStart(2, '0');
  const monthStr = SHORT_MONTHS_ES[targetDate.getMonth()] ?? '';
  const label = `${dayStr} ${monthStr}`.trim();

  return { label, tone: 'upcoming', daysDiff };
}

export function getNextStatusAction(estado: string): NextStatusAction | null {
  const normalized = typeof estado === 'string' ? estado.trim().toLowerCase() : '';

  switch (normalized) {
    case 'recibido':
      return {
        next: 'lavando',
        label: 'Iniciar lavado',
        icon: 'local_laundry_service',
        colorClass: 'btn-lavando',
      };
    case 'lavando':
      return {
        next: 'secando',
        label: 'Pasar a secado',
        icon: 'dry',
        colorClass: 'btn-secando',
      };
    case 'secando':
      return {
        next: 'doblando',
        label: 'Pasar a doblado',
        icon: 'layers',
        colorClass: 'btn-doblando',
      };
    case 'doblando':
      return {
        next: 'listo',
        label: 'Marcar listo',
        icon: 'check_circle',
        colorClass: 'btn-listo',
      };
    case 'en_proceso':
      return {
        next: 'listo',
        label: 'Marcar listo',
        icon: 'check_circle',
        colorClass: 'btn-listo',
      };
    case 'listo':
      return {
        next: 'entregado',
        label: 'Entregar',
        icon: 'inventory_2',
        colorClass: 'btn-entregar',
      };
    case 'entregado':
    case 'cancelado':
    default:
      return null;
  }
}

export function canJumpToReady(estado: string): boolean {
  const normalized = typeof estado === 'string' ? estado.trim().toLowerCase() : '';
  return normalized === 'recibido' || normalized === 'lavando' || normalized === 'secando';
}

export function calculateOrderCardProgress(estado: string): number {
  const normalized = typeof estado === 'string' ? estado.trim().toLowerCase() : '';

  switch (normalized) {
    case 'recibido':
      return 20;
    case 'lavando':
      return 40;
    case 'en_proceso':
      return 50;
    case 'secando':
      return 60;
    case 'doblando':
      return 80;
    case 'listo':
    case 'entregado':
      return 100;
    case 'cancelado':
    default:
      return 0;
  }
}

export function isValidDateRange(desde: string, hasta: string): boolean {
  const cleanDesde = typeof desde === 'string' ? desde.trim() : '';
  const cleanHasta = typeof hasta === 'string' ? hasta.trim() : '';

  if (!cleanDesde && !cleanHasta) {
    return true;
  }

  const desdeDate = cleanDesde ? parseLocalDateInput(cleanDesde) : null;
  if (cleanDesde && !desdeDate) {
    return false;
  }

  const hastaDate = cleanHasta ? parseLocalDateInput(cleanHasta) : null;
  if (cleanHasta && !hastaDate) {
    return false;
  }

  if (desdeDate && hastaDate) {
    return desdeDate.getTime() <= hastaDate.getTime();
  }

  return true;
}
