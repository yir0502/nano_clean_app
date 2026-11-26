import { Categoria, Sucursal } from '../../core/models';

export type PresetRango = 'hoy' | '7d' | '30d' | 'mes';

export type PresetDetectado = PresetRango | 'personalizado';

export interface PaginacionMeta {
  from: number;
  to: number;
  totalPages: number;
  displayPage: number;
  canPrev: boolean;
  canNext: boolean;
}

export interface FiltroAvanzadoChip {
  key: 'rango' | 'categoria' | 'sucursal' | 'metodo';
  label: string;
  value: string;
}

const METODOS_PAGO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  mercado_pago: 'Mercado Pago',
  otro: 'Otro',
};

const PRESETS_RANGO_ORDEN: ReadonlyArray<PresetRango> = ['hoy', '7d', '30d', 'mes'];

export function formatDateIsoLocal(d: Date): string {
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  // Evita toISOString() porque convierte a UTC y puede desplazar el dia en zonas negativas
  const year = String(d.getFullYear()).padStart(4, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatMetodoPagoLabel(metodo?: string | null): string {
  if (!metodo) {
    return 'Sin especificar';
  }
  const normalized = metodo.trim().toLowerCase();
  return METODOS_PAGO_LABELS[normalized] ?? 'Sin especificar';
}

export function calcularRangoPreset(
  preset: PresetRango,
  base: Date = new Date()
): { desde: Date; hasta: Date } {
  const ref = Number.isNaN(base.getTime()) ? new Date() : base;
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const day = ref.getDate();

  const hasta = new Date(year, month, day);
  let desde: Date;

  switch (preset) {
    case 'hoy':
      desde = new Date(year, month, day);
      break;
    case '7d':
      desde = new Date(year, month, day - 6);
      break;
    case '30d':
      desde = new Date(year, month, day - 29);
      break;
    case 'mes':
      desde = new Date(year, month, 1);
      break;
  }

  return { desde, hasta };
}

export function detectarPresetActivo(
  desde: Date,
  hasta: Date,
  base: Date = new Date()
): PresetDetectado {
  const desdeIso = formatDateIsoLocal(desde);
  const hastaIso = formatDateIsoLocal(hasta);
  if (!desdeIso || !hastaIso) {
    return 'personalizado';
  }

  for (const preset of PRESETS_RANGO_ORDEN) {
    const rango = calcularRangoPreset(preset, base);
    if (
      formatDateIsoLocal(rango.desde) === desdeIso &&
      formatDateIsoLocal(rango.hasta) === hastaIso
    ) {
      return preset;
    }
  }

  return 'personalizado';
}

export function calcularMetaPaginacion(
  totalCount: number,
  page: number,
  pageSize: number
): PaginacionMeta {
  const safeTotal = Number.isFinite(totalCount) ? Math.max(0, Math.floor(totalCount)) : 0;
  const safeSize = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 1;
  const totalPages = Math.max(1, Math.ceil(safeTotal / safeSize));
  const rawPage = Number.isFinite(page) ? Math.floor(page) : 0;
  const safePage = Math.min(Math.max(0, rawPage), totalPages - 1);

  if (safeTotal === 0) {
    return {
      from: 0,
      to: 0,
      totalPages,
      displayPage: 1,
      canPrev: false,
      canNext: false,
    };
  }

  const from = safePage * safeSize + 1;
  const to = Math.min(safeTotal, (safePage + 1) * safeSize);

  return {
    from,
    to,
    totalPages,
    displayPage: safePage + 1,
    canPrev: safePage > 0,
    canNext: safePage + 1 < totalPages,
  };
}

export function construirChipsFiltrosAvanzados(params: {
  presetActivo: PresetDetectado;
  desde: Date;
  hasta: Date;
  categoriaId: string;
  categorias: ReadonlyArray<Categoria>;
  sucursalId: string;
  sucursales: ReadonlyArray<Sucursal>;
  metodoPago: string;
}): FiltroAvanzadoChip[] {
  const chips: FiltroAvanzadoChip[] = [];

  if (params.presetActivo === 'personalizado') {
    const desdeIso = formatDateIsoLocal(params.desde);
    const hastaIso = formatDateIsoLocal(params.hasta);
    if (desdeIso && hastaIso) {
      chips.push({
        key: 'rango',
        label: 'Rango',
        value: `${desdeIso} → ${hastaIso}`,
      });
    }
  }

  const categoriaId = params.categoriaId.trim();
  if (categoriaId) {
    const categoria = params.categorias.find((c) => c.id === categoriaId);
    chips.push({
      key: 'categoria',
      label: 'Categoría',
      value: categoria?.nombre?.trim() || categoriaId,
    });
  }

  const sucursalId = params.sucursalId.trim();
  if (sucursalId) {
    const sucursal = params.sucursales.find((s) => s.id === sucursalId);
    chips.push({
      key: 'sucursal',
      label: 'Sucursal',
      value: sucursal?.nombre?.trim() || sucursalId,
    });
  }

  const metodoPago = params.metodoPago.trim();
  if (metodoPago) {
    chips.push({
      key: 'metodo',
      label: 'Método',
      value: formatMetodoPagoLabel(metodoPago),
    });
  }

  return chips;
}
