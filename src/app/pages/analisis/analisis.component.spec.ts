import { registerLocaleData } from '@angular/common';
import localeEsMX from '@angular/common/locales/es-MX';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar, type MatSnackBarConfig } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { ApiClientService } from '../../core/api-client.service';
import {
  type DashboardQueryParams,
  DashboardService,
  type DashboardUIResponse,
} from '../../core/dashboard.service';
import type {
  RepartoSocioConfig,
  Sucursal,
  SucursalRepartoConfig,
  SucursalRepartoPayload,
} from '../../core/models';
import { AnalisisComponent } from './analisis.component';
import {
  CAPITAL_SEGMENT_COLOR,
  EGRESO_DOUGHNUT_PALETTE,
  INGRESO_DOUGHNUT_PALETTE,
  SOCIO_SEGMENT_PALETTE,
  aggregateAnalisisFlow,
  buildCategoryDoughnutSummary,
  buildRepartoShareText,
  buildWhatsAppShareUrl,
  calculateAnalisisRange,
  calculateNetMarginPct,
  calculateRepartoDistribution,
  determineAnalisisGranularity,
  formatLocalIsoDate,
  readLegacyRepartoDraft,
  splitRemainingEqually,
} from './analisis.helpers';

registerLocaleData(localeEsMX);

const LEGACY_REPARTO_KEY = 'nano_clean_reparto';
const REPARTO_USE_MES_KEY = 'nano_clean_reparto_use_mes_actual';

type ListSucursalesParams = Parameters<ApiClientService['listSucursales']>[0];

interface DashboardServiceStub {
  get: jasmine.Spy<(params?: DashboardQueryParams) => Promise<DashboardUIResponse>>;
}

interface ApiClientStub {
  listSucursales: jasmine.Spy<(params?: ListSucursalesParams) => Promise<Sucursal[]>>;
  getSucursalReparto: jasmine.Spy<(sucursalId: string) => Promise<SucursalRepartoConfig>>;
  saveSucursalReparto: jasmine.Spy<
    (sucursalId: string, payload: SucursalRepartoPayload) => Promise<SucursalRepartoConfig>
  >;
}

interface SnackBarStub {
  open: jasmine.Spy<(message: string, action?: string, config?: MatSnackBarConfig) => void>;
}

interface MemoryStorageStub extends Pick<Storage, 'getItem'> {
  setItem: jasmine.Spy<(key: string, value: string) => void>;
  removeItem: jasmine.Spy<(key: string) => void>;
}

function createMemoryStorage(entries: Record<string, string>): MemoryStorageStub {
  return {
    getItem: (key: string): string | null =>
      Object.prototype.hasOwnProperty.call(entries, key) ? entries[key] : null,
    setItem: jasmine.createSpy('setItem'),
    removeItem: jasmine.createSpy('removeItem'),
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function queryRequired<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) {
    throw new Error(`No se encontro el elemento esperado: ${selector}`);
  }
  return el;
}

function findButtonByText(root: ParentNode, selector: string, text: string): HTMLButtonElement {
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>(selector));
  const match = buttons.find((btn) => (btn.textContent ?? '').includes(text));
  if (!match) {
    throw new Error(`No se encontro boton con texto "${text}" en ${selector}`);
  }
  return match;
}

function makeSucursal(overrides: Partial<Sucursal> = {}): Sucursal {
  return {
    id: 'suc-1',
    org_id: 'org-1',
    nombre: 'Centro',
    activo: true,
    ...overrides,
  };
}

function makeSucursales(count: number): Sucursal[] {
  const nombres = ['Centro', 'Norte', 'Sur', 'Poniente', 'Oriente', 'Polanco'];
  return Array.from({ length: count }, (_, idx) =>
    makeSucursal({
      id: `suc-${idx + 1}`,
      nombre: nombres[idx] ?? `Sucursal ${idx + 1}`,
    })
  );
}

function makeRepartoConfig(
  overrides: Partial<SucursalRepartoConfig> = {}
): SucursalRepartoConfig {
  return {
    sucursal_id: 'suc-1',
    capital_pct: 20,
    socios: [
      { id: 'soc-1', nombre: 'Ana', pct: 50 },
      { id: 'soc-2', nombre: 'Luis', pct: 30 },
    ],
    updated_at: '2026-11-20T10:00:00Z',
    configurado: true,
    ...overrides,
  };
}

function makeEmptyRepartoConfig(sucursalId = 'suc-1'): SucursalRepartoConfig {
  return {
    sucursal_id: sucursalId,
    capital_pct: 0,
    socios: [],
    updated_at: null,
    configurado: false,
  };
}

function makeDashboardResponse(
  overrides: Partial<DashboardUIResponse> = {}
): DashboardUIResponse {
  return {
    range: { desde: '2026-11-01', hasta: '2026-11-27', dias: 27 },
    totales: { ingresos: 50000, egresos: 15000, balance: 35000 },
    por_dia: [
      { fecha: '2026-11-03', ingresos: 12000, egresos: 3000, balance: 9000 },
      { fecha: '2026-11-10', ingresos: 18000, egresos: 6000, balance: 12000 },
      { fecha: '2026-11-17', ingresos: 20000, egresos: 6000, balance: 14000 },
    ],
    por_categoria: {
      ingreso: [
        { categoria_id: 'cat-2', nombre: 'Edredones', total: 10000 },
        { categoria_id: 'cat-1', nombre: 'Lavado por kilo', total: 40000 },
      ],
      egreso: [
        { categoria_id: 'cat-4', nombre: 'Servicios', total: 4500 },
        { categoria_id: 'cat-3', nombre: 'Insumos', total: 10500 },
      ],
    },
    kpis_mes: { ingresos: 25000, egresos: 5000, balance: 20000 },
    por_categoria_mes: {
      ingreso: [
        { categoria_id: 'cat-1', nombre: 'Lavado por kilo', total: 20000 },
        { categoria_id: 'cat-2', nombre: 'Edredones', total: 5000 },
      ],
      egreso: [
        { categoria_id: 'cat-3', nombre: 'Insumos', total: 3500 },
        { categoria_id: 'cat-4', nombre: 'Servicios', total: 1500 },
      ],
    },
    meta: { items: 3 },
    ...overrides,
  };
}

describe('analisis.helpers', () => {
  it('formatLocalIsoDate formatea fechas locales sin desfase UTC y maneja fecha invalida', () => {
    expect(formatLocalIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(formatLocalIsoDate(new Date(2026, 4, 31, 23, 59, 59))).toBe('2026-05-31');
    expect(formatLocalIsoDate(new Date(2024, 1, 29, 0, 0, 1))).toBe('2024-02-29');

    const fallback = formatLocalIsoDate(new Date('invalid-date'));
    expect(/^\d{4}-\d{2}-\d{2}$/.test(fallback)).toBeTrue();
  });

  it('calculateAnalisisRange calcula mes, 3m, 6m y 12m sin desfase UTC ni desbordamiento de fin de mes', () => {
    const may31Late = new Date(2026, 4, 31, 23, 59, 59);
    expect(calculateAnalisisRange('mes', may31Late)).toEqual({
      desde: '2026-05-01',
      hasta: '2026-05-31',
    });
    expect(calculateAnalisisRange('3m', may31Late)).toEqual({
      desde: '2026-02-28',
      hasta: '2026-05-31',
    });
    expect(calculateAnalisisRange('6m', may31Late)).toEqual({
      desde: '2025-11-30',
      hasta: '2026-05-31',
    });
    expect(calculateAnalisisRange('12m', may31Late)).toEqual({
      desde: '2025-05-31',
      hasta: '2026-05-31',
    });

    const leapMay31 = new Date(2024, 4, 31, 23, 30, 0);
    expect(calculateAnalisisRange('3m', leapMay31)).toEqual({
      desde: '2024-02-29',
      hasta: '2024-05-31',
    });

    const leapFeb29 = new Date(2024, 1, 29, 12, 0, 0);
    expect(calculateAnalisisRange('12m', leapFeb29)).toEqual({
      desde: '2023-02-28',
      hasta: '2024-02-29',
    });

    const jan31 = new Date(2026, 0, 31, 22, 15, 0);
    expect(calculateAnalisisRange('3m', jan31)).toEqual({
      desde: '2025-10-31',
      hasta: '2026-01-31',
    });
  });

  it('determineAnalisisGranularity resuelve weekly para mes, 3m y <=95 dias, y monthly para 6m, 12m y >=96 dias', () => {
    expect(determineAnalisisGranularity('mes', '2026-01-01', '2026-12-31')).toBe('weekly');
    expect(determineAnalisisGranularity('3m', '2026-01-01', '2026-12-31')).toBe('weekly');
    expect(determineAnalisisGranularity('6m', '2026-11-01', '2026-11-10')).toBe('monthly');
    expect(determineAnalisisGranularity('12m', '2026-11-01', '2026-11-10')).toBe('monthly');

    expect(determineAnalisisGranularity('custom', '2026-01-01', '2026-04-06')).toBe('weekly');
    expect(determineAnalisisGranularity('custom', '2026-01-01', '2026-04-07')).toBe('monthly');
    expect(determineAnalisisGranularity('custom', '2026-04-07', '2026-01-01')).toBe('monthly');
    expect(determineAnalisisGranularity('custom', 'fecha-invalida', '2026-04-07')).toBe('weekly');
  });

  it('aggregateAnalisisFlow agrupa semanal y mensualmente en orden cronologico y calcula balances', () => {
    const empty = aggregateAnalisisFlow(null, 'weekly');
    expect(empty).toEqual({
      granularity: 'weekly',
      labels: [],
      ingresos: [],
      egresos: [],
      balances: [],
      balanceNetoRango: 0,
    });

    const weekly = aggregateAnalisisFlow(
      [
        { fecha: '2026-11-23', ingresos: 500.25, egresos: 100.1, balance: 400.15 },
        { fecha: '2026-11-22', ingresos: 300.5, egresos: 50.25, balance: 250.25 },
        { fecha: '2026-11-18', ingresos: 700, egresos: 150, balance: 550 },
        { fecha: 'fecha-invalida', ingresos: 9999, egresos: 9999, balance: 0 },
      ],
      'weekly'
    );

    expect(weekly.granularity).toBe('weekly');
    expect(weekly.labels.length).toBe(2);
    expect(weekly.labels[0].startsWith('Sem ')).toBeTrue();
    expect(weekly.labels[1].startsWith('Sem ')).toBeTrue();
    expect(weekly.ingresos).toEqual([1000.5, 500.25]);
    expect(weekly.egresos).toEqual([200.25, 100.1]);
    expect(weekly.balances).toEqual([800.25, 400.15]);
    expect(weekly.balanceNetoRango).toBe(1200.4);

    const monthly = aggregateAnalisisFlow(
      [
        { fecha: '2026-02-10', ingresos: 900, egresos: 300, balance: 600 },
        { fecha: '2025-12-20', ingresos: 1200, egresos: 400, balance: 800 },
        { fecha: '2026-02-25', ingresos: 600, egresos: 200, balance: 400 },
        { fecha: '2026-01-15', ingresos: 500, egresos: 700, balance: -200 },
      ],
      'monthly'
    );

    expect(monthly.granularity).toBe('monthly');
    expect(monthly.labels.length).toBe(3);
    expect(monthly.labels.every((lbl) => !lbl.startsWith('Sem '))).toBeTrue();
    expect(monthly.ingresos).toEqual([1200, 500, 1500]);
    expect(monthly.egresos).toEqual([400, 700, 500]);
    expect(monthly.balances).toEqual([800, -200, 1000]);
    expect(monthly.balanceNetoRango).toBe(1600);
  });

  it('buildCategoryDoughnutSummary ordena descendente, calcula porcentajes, colores y pildora categoria #1', () => {
    const summary = buildCategoryDoughnutSummary(
      [
        { categoria_id: 'c2', nombre: 'Planchado', total: 2500 },
        { categoria_id: 'c0', nombre: 'Ignorada cero', total: 0 },
        { categoria_id: 'cneg', nombre: 'Ignorada negativa', total: -300 },
        { categoria_id: 'c1', nombre: 'Lavado', total: 7500 },
      ],
      INGRESO_DOUGHNUT_PALETTE,
      'ingreso'
    );

    expect(summary.total).toBe(10000);
    expect(summary.labels).toEqual(['Lavado', 'Planchado']);
    expect(summary.values).toEqual([7500, 2500]);
    expect(summary.colors).toEqual([INGRESO_DOUGHNUT_PALETTE[0], INGRESO_DOUGHNUT_PALETTE[1]]);
    expect(summary.rows).toEqual([
      { nombre: 'Lavado', total: 7500, percent: 75, color: INGRESO_DOUGHNUT_PALETTE[0] },
      { nombre: 'Planchado', total: 2500, percent: 25, color: INGRESO_DOUGHNUT_PALETTE[1] },
    ]);
    expect(summary.insight).toEqual({
      text: 'Lavado: $7,500 (75%)',
      tone: 'positive',
    });

    const egresoSummary = buildCategoryDoughnutSummary(
      [
        { categoria_id: 'e1', nombre: '   ', total: 1000 },
        { categoria_id: 'e2', nombre: 'Renta', total: 4000 },
      ],
      EGRESO_DOUGHNUT_PALETTE,
      'egreso'
    );
    expect(egresoSummary.total).toBe(5000);
    expect(egresoSummary.labels).toEqual(['Renta', 'Sin categoría']);
    expect(egresoSummary.insight).toEqual({
      text: 'Renta: $4,000 (80%)',
      tone: 'negative',
    });

    const emptySummary = buildCategoryDoughnutSummary([], INGRESO_DOUGHNUT_PALETTE, 'ingreso');
    expect(emptySummary.total).toBe(0);
    expect(emptySummary.rows).toEqual([]);
    expect(emptySummary.insight).toEqual({ text: 'Sin datos', tone: 'neutral' });
  });

  it('calculateRepartoDistribution cubre balances positivos, cero y negativos, con y sin capital, validez y segmentos', () => {
    const socios: RepartoSocioConfig[] = [
      { id: 's1', nombre: 'Ana', pct: 50 },
      { id: 's2', nombre: 'Luis', pct: 30 },
    ];

    const withCapital = calculateRepartoDistribution(10000, 20, socios);
    expect(withCapital.baseBalance).toBe(10000);
    expect(withCapital.distributableBalance).toBe(10000);
    expect(withCapital.hasDistributableProfit).toBeTrue();
    expect(withCapital.capitalPct).toBe(20);
    expect(withCapital.capitalAmount).toBe(2000);
    expect(withCapital.totalPct).toBe(100);
    expect(withCapital.remainingPct).toBe(0);
    expect(withCapital.isValidSum).toBeTrue();
    expect(withCapital.socios).toEqual([
      { id: 's1', nombre: 'Ana', pct: 50, monto: 5000, color: SOCIO_SEGMENT_PALETTE[0] },
      { id: 's2', nombre: 'Luis', pct: 30, monto: 3000, color: SOCIO_SEGMENT_PALETTE[1] },
    ]);
    expect(withCapital.segments).toEqual([
      {
        id: 'capital',
        label: 'Capital del negocio',
        pct: 20,
        color: CAPITAL_SEGMENT_COLOR,
        isCapital: true,
      },
      { id: 's1', label: 'Ana', pct: 50, color: SOCIO_SEGMENT_PALETTE[0], isCapital: false },
      { id: 's2', label: 'Luis', pct: 30, color: SOCIO_SEGMENT_PALETTE[1], isCapital: false },
    ]);

    const withoutCapital = calculateRepartoDistribution(8000, 0, [
      { id: 's1', nombre: 'Ana', pct: 60 },
      { id: 's2', nombre: 'Luis', pct: 40 },
      { id: 's3', nombre: 'Cero', pct: 0 },
    ]);
    expect(withoutCapital.capitalPct).toBe(0);
    expect(withoutCapital.capitalAmount).toBe(0);
    expect(withoutCapital.isValidSum).toBeTrue();
    expect(withoutCapital.segments.some((seg) => seg.isCapital)).toBeFalse();
    expect(withoutCapital.segments.map((seg) => seg.id)).toEqual(['s1', 's2']);

    const zeroBalance = calculateRepartoDistribution(0, 20, socios);
    expect(zeroBalance.hasDistributableProfit).toBeFalse();
    expect(zeroBalance.distributableBalance).toBe(0);
    expect(zeroBalance.capitalAmount).toBe(0);
    expect(zeroBalance.socios.every((s) => s.monto === 0)).toBeTrue();

    const negativeBalance = calculateRepartoDistribution(-4500, 20, socios);
    expect(negativeBalance.baseBalance).toBe(-4500);
    expect(negativeBalance.distributableBalance).toBe(0);
    expect(negativeBalance.hasDistributableProfit).toBeFalse();
    expect(negativeBalance.capitalAmount).toBe(0);
    expect(negativeBalance.socios.every((s) => s.monto === 0)).toBeTrue();

    const invalidSum = calculateRepartoDistribution(10000, 15, [
      { id: 's1', nombre: 'Ana', pct: 50 },
    ]);
    expect(invalidSum.totalPct).toBe(65);
    expect(invalidSum.remainingPct).toBe(35);
    expect(invalidSum.isValidSum).toBeFalse();
  });

  it('splitRemainingEqually reparte con precision exacta al 100% colocando el residuo en el indice 0', () => {
    const threeSocios: RepartoSocioConfig[] = [
      { id: 's1', nombre: 'Ana', pct: 0 },
      { id: 's2', nombre: 'Luis', pct: 0 },
      { id: 's3', nombre: 'Sofia', pct: 0 },
    ];

    const cap0 = splitRemainingEqually(0, threeSocios);
    expect(cap0.map((s) => s.pct)).toEqual([33.34, 33.33, 33.33]);
    expect(calculateRepartoDistribution(1000, 0, cap0).totalPct).toBe(100);

    const cap20 = splitRemainingEqually(20, threeSocios);
    expect(cap20.map((s) => s.pct)).toEqual([26.68, 26.66, 26.66]);
    expect(calculateRepartoDistribution(1000, 20, cap20).totalPct).toBe(100);

    const cap100 = splitRemainingEqually(100, threeSocios);
    expect(cap100.map((s) => s.pct)).toEqual([0, 0, 0]);
    expect(calculateRepartoDistribution(1000, 100, cap100).totalPct).toBe(100);

    expect(splitRemainingEqually(25, [])).toEqual([]);
  });

  it('readLegacyRepartoDraft lee JSON valido, omite slots en 0, tolera corrupto y null sin mutar storage', () => {
    const validStorage = createMemoryStorage({
      [LEGACY_REPARTO_KEY]: JSON.stringify({
        aNombre: '  Carlos  ',
        aPct: 60,
        bNombre: '',
        bPct: 40,
        cNombre: 'Inactivo',
        cPct: 0,
        dNombre: 'Negativo',
        dPct: -5,
      }),
      [REPARTO_USE_MES_KEY]: JSON.stringify(false),
    });

    const parsed = readLegacyRepartoDraft(validStorage);
    expect(parsed).toEqual({
      socios: [
        { id: 'legacy-a', nombre: 'Carlos', pct: 60 },
        { id: 'legacy-b', nombre: 'Socio B', pct: 40 },
      ],
      useMesActual: false,
    });
    expect(validStorage.setItem).not.toHaveBeenCalled();
    expect(validStorage.removeItem).not.toHaveBeenCalled();

    const zeroSlotsStorage = createMemoryStorage({
      [LEGACY_REPARTO_KEY]: JSON.stringify({
        aNombre: 'A',
        aPct: 0,
        bNombre: 'B',
        bPct: 0,
      }),
    });
    expect(readLegacyRepartoDraft(zeroSlotsStorage)).toBeNull();
    expect(zeroSlotsStorage.setItem).not.toHaveBeenCalled();

    const corruptStorage = createMemoryStorage({
      [LEGACY_REPARTO_KEY]: '{json-corrupto',
      [REPARTO_USE_MES_KEY]: 'no-booleano',
    });
    expect(readLegacyRepartoDraft(corruptStorage)).toBeNull();
    expect(corruptStorage.setItem).not.toHaveBeenCalled();

    expect(readLegacyRepartoDraft(null)).toBeNull();
  });

  it('buildRepartoShareText, buildWhatsAppShareUrl y calculateNetMarginPct generan formatos exactos', () => {
    const positiveDist = calculateRepartoDistribution(10000, 20, [
      { id: 's1', nombre: 'Ana', pct: 50 },
      { id: 's2', nombre: 'Luis', pct: 30 },
    ]);
    const positiveText = buildRepartoShareText({
      sucursalNombre: 'Centro',
      periodLabel: 'Noviembre 2026',
      sourceMode: 'mes',
      distribution: positiveDist,
    });
    expect(positiveText).toBe(
      [
        'Reparto de utilidades - Centro',
        'Periodo: Noviembre 2026 (Mes actual)',
        'Utilidad base: $10,000',
        '- Capital del negocio (20%): $2,000',
        '- Ana (50%): $5,000',
        '- Luis (30%): $3,000',
      ].join('\n')
    );

    const negativeDist = calculateRepartoDistribution(-2000, 0, [
      { id: 's1', nombre: 'Ana', pct: 100 },
    ]);
    const negativeText = buildRepartoShareText({
      sucursalNombre: 'Norte',
      periodLabel: '1 nov - 27 nov 2026',
      sourceMode: 'rango',
      distribution: negativeDist,
    });
    expect(negativeText).toBe(
      [
        'Reparto de utilidades - Norte',
        'Periodo: 1 nov - 27 nov 2026 (Rango filtrado)',
        'Utilidad base: -$2,000',
        'Sin utilidad repartible en este periodo.',
        '- Ana (100%): $0',
      ].join('\n')
    );

    expect(buildWhatsAppShareUrl(positiveText)).toBe(
      `https://wa.me/?text=${encodeURIComponent(positiveText)}`
    );

    expect(calculateNetMarginPct(50000, 35000)).toBe(70);
    expect(calculateNetMarginPct(10000, -2500)).toBe(-25);
    expect(calculateNetMarginPct(0, 1000)).toBeNull();
    expect(calculateNetMarginPct(-100, 50)).toBeNull();
    expect(calculateNetMarginPct(Number.NaN, 100)).toBeNull();
  });
});

describe('AnalisisComponent', () => {
  let fixture: ComponentFixture<AnalisisComponent>;
  let component: AnalisisComponent;
  let dashStub: DashboardServiceStub;
  let apiStub: ApiClientStub;
  let snackStub: SnackBarStub;

  let prevLegacyReparto: string | null = null;
  let prevUseMesActual: string | null = null;
  let originalClipboardDescriptor: PropertyDescriptor | undefined;
  let clipboardOverridden = false;

  beforeEach(() => {
    prevLegacyReparto = localStorage.getItem(LEGACY_REPARTO_KEY);
    prevUseMesActual = localStorage.getItem(REPARTO_USE_MES_KEY);
    localStorage.removeItem(LEGACY_REPARTO_KEY);
    localStorage.removeItem(REPARTO_USE_MES_KEY);
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();

    if (prevLegacyReparto !== null) {
      localStorage.setItem(LEGACY_REPARTO_KEY, prevLegacyReparto);
    } else {
      localStorage.removeItem(LEGACY_REPARTO_KEY);
    }

    if (prevUseMesActual !== null) {
      localStorage.setItem(REPARTO_USE_MES_KEY, prevUseMesActual);
    } else {
      localStorage.removeItem(REPARTO_USE_MES_KEY);
    }

    if (clipboardOverridden) {
      if (originalClipboardDescriptor) {
        Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor);
      } else {
        Reflect.deleteProperty(navigator, 'clipboard');
      }
      clipboardOverridden = false;
      originalClipboardDescriptor = undefined;
    }
  });

  async function flushAsync(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function mockClipboardWriteText(
    impl: (text: string) => Promise<void> = () => Promise.resolve()
  ): jasmine.Spy<(text: string) => Promise<void>> {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return spyOn(navigator.clipboard, 'writeText').and.callFake(impl);
    }
    const spy = jasmine.createSpy<(text: string) => Promise<void>>('writeText').and.callFake(impl);
    originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: spy },
    });
    clipboardOverridden = true;
    return spy;
  }

  async function setupComponent(options?: {
    sucursales?: Sucursal[];
    sucursalesError?: Error;
    dashboard?: DashboardUIResponse;
    dashError?: Error;
    reparto?: SucursalRepartoConfig;
    repartoError?: Error;
    legacyStorage?: { reparto?: string; useMesActual?: string };
    skipInitialFlush?: boolean;
  }): Promise<void> {
    if (options?.legacyStorage?.reparto !== undefined) {
      localStorage.setItem(LEGACY_REPARTO_KEY, options.legacyStorage.reparto);
    }
    if (options?.legacyStorage?.useMesActual !== undefined) {
      localStorage.setItem(REPARTO_USE_MES_KEY, options.legacyStorage.useMesActual);
    }

    const defaultSucursales = options?.sucursales ?? makeSucursales(3);

    dashStub = {
      get: jasmine.createSpy('get').and.callFake(() => {
        if (options?.dashError) {
          return Promise.reject(options.dashError);
        }
        return Promise.resolve(options?.dashboard ?? makeDashboardResponse());
      }),
    };

    apiStub = {
      listSucursales: jasmine.createSpy('listSucursales').and.callFake(() => {
        if (options?.sucursalesError) {
          return Promise.reject(options.sucursalesError);
        }
        return Promise.resolve(defaultSucursales);
      }),
      getSucursalReparto: jasmine
        .createSpy('getSucursalReparto')
        .and.callFake((sucursalId: string) => {
          if (options?.repartoError) {
            return Promise.reject(options.repartoError);
          }
          if (options?.reparto) {
            return Promise.resolve(options.reparto);
          }
          return Promise.resolve(makeRepartoConfig({ sucursal_id: sucursalId }));
        }),
      saveSucursalReparto: jasmine
        .createSpy('saveSucursalReparto')
        .and.callFake((sucursalId: string, payload: SucursalRepartoPayload) =>
          Promise.resolve({
            sucursal_id: sucursalId,
            capital_pct: payload.capital_pct,
            socios: payload.socios.map((s) => ({ ...s })),
            updated_at: '2026-11-27T12:00:00Z',
            configurado: true,
          })
        ),
    };

    snackStub = {
      open: jasmine.createSpy('open'),
    };

    await TestBed.configureTestingModule({
      imports: [AnalisisComponent],
      providers: [
        { provide: LOCALE_ID, useValue: 'es-MX' },
        provideNoopAnimations(),
        { provide: DashboardService, useValue: dashStub },
        { provide: ApiClientService, useValue: apiStub },
        { provide: MatSnackBar, useValue: snackStub },
      ],
    })
      .overrideProvider(MatSnackBar, { useValue: snackStub })
      .compileComponents();

    fixture = TestBed.createComponent(AnalisisComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    if (!options?.skipInitialFlush) {
      await flushAsync();
    }
  }

  describe('Selector de sucursal y control anti-race', () => {
    it('renderiza chips clicables con <= 4 sucursales y no renderiza select', async () => {
      await setupComponent({ sucursales: makeSucursales(4) });

      const host = fixture.nativeElement as HTMLElement;
      const chips = Array.from(host.querySelectorAll<HTMLButtonElement>('.branch-chip-btn'));
      expect(chips.length).toBe(4);
      expect(chips.map((btn) => btn.querySelector('span')?.textContent?.trim())).toEqual([
        'Centro',
        'Norte',
        'Sur',
        'Poniente',
      ]);
      expect(chips[0].classList.contains('active')).toBeTrue();
      expect(host.querySelector('select.branch-select')).toBeNull();
    });

    it('renderiza select cuando hay > 4 sucursales y no renderiza chips', async () => {
      await setupComponent({ sucursales: makeSucursales(5) });

      const host = fixture.nativeElement as HTMLElement;
      expect(host.querySelectorAll('.branch-chip-btn').length).toBe(0);

      const selectEl = queryRequired<HTMLSelectElement>(host, 'select.branch-select');
      expect(selectEl.options.length).toBe(5);
      expect(selectEl.value).toBe('suc-1');

      dashStub.get.calls.reset();
      apiStub.getSucursalReparto.calls.reset();

      selectEl.value = 'suc-4';
      selectEl.dispatchEvent(new Event('change'));
      await flushAsync();

      expect(component.sucursalId()).toBe('suc-4');
      expect(component.activeSucursalNombre()).toBe('Poniente');
      expect(dashStub.get).toHaveBeenCalledOnceWith({
        desde: component.desde(),
        hasta: component.hasta(),
        sucursal_id: 'suc-4',
        include: 'mes',
      });
      expect(apiStub.getSucursalReparto).toHaveBeenCalledOnceWith('suc-4');
    });

    it('cambiar sucursal invoca en paralelo DashboardService.get con include mes y getSucursalReparto', async () => {
      await setupComponent({ sucursales: makeSucursales(3) });

      dashStub.get.calls.reset();
      apiStub.getSucursalReparto.calls.reset();

      const host = fixture.nativeElement as HTMLElement;
      const chips = Array.from(host.querySelectorAll<HTMLButtonElement>('.branch-chip-btn'));
      chips[1].click();
      await flushAsync();

      expect(component.sucursalId()).toBe('suc-2');
      expect(dashStub.get).toHaveBeenCalledOnceWith({
        desde: component.desde(),
        hasta: component.hasta(),
        sucursal_id: 'suc-2',
        include: 'mes',
      });
      expect(apiStub.getSucursalReparto).toHaveBeenCalledOnceWith('suc-2');

      dashStub.get.calls.reset();
      apiStub.getSucursalReparto.calls.reset();
      chips[1].click();
      await flushAsync();
      expect(dashStub.get).not.toHaveBeenCalled();
      expect(apiStub.getSucursalReparto).not.toHaveBeenCalled();
    });

    it('descarta respuestas lentas obsoletas de sucursales anteriores (dashFetchSeq y repartoFetchSeq)', async () => {
      await setupComponent({ sucursales: makeSucursales(3) });

      const dashSuc2 = createDeferred<DashboardUIResponse>();
      const dashSuc3 = createDeferred<DashboardUIResponse>();
      const repartoSuc2 = createDeferred<SucursalRepartoConfig>();
      const repartoSuc3 = createDeferred<SucursalRepartoConfig>();

      dashStub.get.calls.reset();
      apiStub.getSucursalReparto.calls.reset();
      dashStub.get.and.returnValues(dashSuc2.promise, dashSuc3.promise);
      apiStub.getSucursalReparto.and.returnValues(repartoSuc2.promise, repartoSuc3.promise);

      void component.onSucursalChange('suc-2');
      void component.onSucursalChange('suc-3');
      fixture.detectChanges();

      dashSuc3.resolve(
        makeDashboardResponse({
          totales: { ingresos: 80000, egresos: 20000, balance: 60000 },
          kpis_mes: { ingresos: 40000, egresos: 10000, balance: 30000 },
        })
      );
      repartoSuc3.resolve(
        makeRepartoConfig({
          sucursal_id: 'suc-3',
          capital_pct: 10,
          socios: [{ id: 'soc-3', nombre: 'Elena', pct: 90 }],
        })
      );
      await flushAsync();

      expect(component.sucursalId()).toBe('suc-3');
      expect(component.totalBalance()).toBe(60000);
      expect(component.repartoConfig().sucursal_id).toBe('suc-3');
      expect(component.repartoConfig().socios[0].nombre).toBe('Elena');
      expect(component.rangeLoading()).toBeFalse();
      expect(component.repartoLoading()).toBeFalse();

      dashSuc2.resolve(
        makeDashboardResponse({
          totales: { ingresos: 999999, egresos: 0, balance: 999999 },
          kpis_mes: { ingresos: 999999, egresos: 0, balance: 999999 },
        })
      );
      repartoSuc2.resolve(
        makeRepartoConfig({
          sucursal_id: 'suc-2',
          capital_pct: 50,
          socios: [{ id: 'soc-old', nombre: 'Obsoleto', pct: 50 }],
        })
      );
      await flushAsync();

      expect(component.sucursalId()).toBe('suc-3');
      expect(component.totalBalance()).toBe(60000);
      expect(component.repartoConfig().sucursal_id).toBe('suc-3');
      expect(component.repartoConfig().socios[0].nombre).toBe('Elena');
      expect(component.error()).toBeNull();
      expect(component.repartoLoadError()).toBeNull();
    });

    it('ignora errores tardios de peticiones obsoletas de sucursal anterior', async () => {
      await setupComponent({ sucursales: makeSucursales(3) });

      const dashSuc2 = createDeferred<DashboardUIResponse>();
      const dashSuc3 = createDeferred<DashboardUIResponse>();
      const repartoSuc2 = createDeferred<SucursalRepartoConfig>();
      const repartoSuc3 = createDeferred<SucursalRepartoConfig>();

      dashStub.get.calls.reset();
      apiStub.getSucursalReparto.calls.reset();
      dashStub.get.and.returnValues(dashSuc2.promise, dashSuc3.promise);
      apiStub.getSucursalReparto.and.returnValues(repartoSuc2.promise, repartoSuc3.promise);

      void component.onSucursalChange('suc-2');
      void component.onSucursalChange('suc-3');

      dashSuc3.resolve(
        makeDashboardResponse({
          totales: { ingresos: 15000, egresos: 5000, balance: 10000 },
        })
      );
      repartoSuc3.resolve(makeRepartoConfig({ sucursal_id: 'suc-3' }));
      await flushAsync();

      dashSuc2.reject(new Error('Fallo tardio dashboard'));
      repartoSuc2.reject(new Error('Fallo tardio reparto'));
      await flushAsync();

      expect(component.error()).toBeNull();
      expect(component.repartoLoadError()).toBeNull();
      expect(component.totalBalance()).toBe(10000);
    });

    it('muestra estado vacio cuando no hay sucursales activas', async () => {
      await setupComponent({ sucursales: [] });

      const host = fixture.nativeElement as HTMLElement;
      const emptyCard = queryRequired<HTMLElement>(host, '.state-card--empty');
      expect(emptyCard.textContent).toContain('Sin sucursales activas');
      expect(host.querySelector('.filter-toolbar')).toBeNull();
      expect(host.querySelector('.kpis-grid')).toBeNull();
      expect(dashStub.get).not.toHaveBeenCalled();
      expect(apiStub.getSucursalReparto).not.toHaveBeenCalled();
    });

    it('muestra estado de error con boton Reintentar y recupera los datos al reintentar', async () => {
      await setupComponent({
        sucursalesError: new Error('Error de red al listar sucursales'),
      });

      const host = fixture.nativeElement as HTMLElement;
      const errorCard = queryRequired<HTMLElement>(host, '.state-card--error');
      expect(errorCard.getAttribute('role')).toBe('alert');
      expect(errorCard.textContent).toContain('Error de red al listar sucursales');

      apiStub.listSucursales.and.resolveTo(makeSucursales(2));
      const retryBtn = queryRequired<HTMLButtonElement>(errorCard, 'button.retry-btn');
      expect(retryBtn.textContent).toContain('Reintentar');

      retryBtn.click();
      await flushAsync();

      expect(host.querySelector('.state-card--error')).toBeNull();
      expect(host.querySelectorAll('.branch-chip-btn').length).toBe(2);
      expect(queryRequired<HTMLElement>(host, '.kpi-card--hero .kpi-value').textContent?.trim()).toBe(
        '$35,000'
      );
    });

    it('muestra error inline de reparto con boton Reintentar sin ocultar KPIs ni graficas', async () => {
      await setupComponent({
        repartoError: new Error('Error al obtener reparto'),
      });

      const host = fixture.nativeElement as HTMLElement;
      expect(queryRequired<HTMLElement>(host, '.kpi-card--hero .kpi-value').textContent?.trim()).toBe(
        '$35,000'
      );
      const inlineErr = queryRequired<HTMLElement>(host, '.reparto-inline-error');
      expect(inlineErr.textContent).toContain('Error al obtener reparto');

      apiStub.getSucursalReparto.and.resolveTo(makeRepartoConfig({ sucursal_id: 'suc-1' }));
      const retryBtn = queryRequired<HTMLButtonElement>(inlineErr, 'button.inline-retry-btn');
      retryBtn.click();
      await flushAsync();

      expect(host.querySelector('.reparto-inline-error')).toBeNull();
      expect(host.querySelectorAll('.socio-card').length).toBe(2);
    });
  });

  describe('Filtros de rango, 3 KPIs y 3 graficas', () => {
    it('cambiar preset a 6m actualiza granularidad mensual y recarga solo DashboardService', async () => {
      await setupComponent();

      dashStub.get.calls.reset();
      apiStub.getSucursalReparto.calls.reset();

      const host = fixture.nativeElement as HTMLElement;
      const btn6m = findButtonByText(host, '.presets-group button.preset-btn', '6m');
      btn6m.click();
      await flushAsync();

      const expected = calculateAnalisisRange('6m');
      expect(component.preset()).toBe('6m');
      expect(component.granularity()).toBe('monthly');
      expect(component.flowTitle()).toBe('Flujo mensual');
      expect(dashStub.get).toHaveBeenCalledOnceWith({
        desde: expected.desde,
        hasta: expected.hasta,
        sucursal_id: 'suc-1',
        include: 'mes',
      });
      expect(apiStub.getSucursalReparto).not.toHaveBeenCalled();
    });

    it('rango personalizado valido asigna preset custom y recarga dashboard; desde > hasta muestra error sin llamar red', async () => {
      await setupComponent();

      const host = fixture.nativeElement as HTMLElement;
      const customBtn = queryRequired<HTMLButtonElement>(host, 'button.preset-btn--custom');
      customBtn.click();
      fixture.detectChanges();

      expect(component.preset()).toBe('custom');
      expect(component.preset()).not.toBe('12m');

      dashStub.get.calls.reset();
      const startInput = queryRequired<HTMLInputElement>(host, 'input[aria-label="Fecha inicial"]');
      const endInput = queryRequired<HTMLInputElement>(host, 'input[aria-label="Fecha final"]');

      startInput.value = '2026-01-10';
      startInput.dispatchEvent(new Event('change'));
      await flushAsync();

      endInput.value = '2026-03-15';
      endInput.dispatchEvent(new Event('change'));
      await flushAsync();

      expect(component.preset()).toBe('custom');
      expect(component.customRangeError()).toBeNull();
      expect(dashStub.get).toHaveBeenCalledWith({
        desde: '2026-01-10',
        hasta: '2026-03-15',
        sucursal_id: 'suc-1',
        include: 'mes',
      });

      dashStub.get.calls.reset();
      await component.applyCustomDates('2026-05-20', '2026-05-01');
      fixture.detectChanges();

      expect(component.preset()).toBe('custom');
      expect(component.customRangeError()).toBe(
        'La fecha inicial debe ser anterior o igual a la fecha final.'
      );
      const errBanner = queryRequired<HTMLElement>(host, '.range-error');
      expect(errBanner.getAttribute('role')).toBe('alert');
      expect(errBanner.textContent).toContain(
        'La fecha inicial debe ser anterior o igual a la fecha final.'
      );
      expect(dashStub.get).not.toHaveBeenCalled();

      await component.applyCustomDates('', '2026-05-01');
      fixture.detectChanges();
      expect(component.customRangeError()).toBe('Selecciona ambas fechas para consultar el rango.');
      expect(dashStub.get).not.toHaveBeenCalled();
    });

    it('hero Balance aplica clase .negativo solo cuando totalBalance < 0 y muestra 3 KPIs', async () => {
      await setupComponent({
        dashboard: makeDashboardResponse({
          totales: { ingresos: 50000, egresos: 15000, balance: 35000 },
        }),
      });

      const host = fixture.nativeElement as HTMLElement;
      const heroCard = queryRequired<HTMLElement>(host, '.kpi-card--hero');
      const ingresoCard = queryRequired<HTMLElement>(host, '.kpi-card--ingreso');
      const egresoCard = queryRequired<HTMLElement>(host, '.kpi-card--egreso');

      expect(heroCard.classList.contains('negativo')).toBeFalse();
      expect(queryRequired<HTMLElement>(heroCard, '.kpi-value').textContent?.trim()).toBe('$35,000');
      expect(queryRequired<HTMLElement>(heroCard, '.kpi-subtitle').textContent?.trim()).toBe(
        'Margen neto: 70% sobre ingresos'
      );
      expect(queryRequired<HTMLElement>(ingresoCard, '.kpi-value').textContent?.trim()).toBe(
        '$50,000'
      );
      expect(queryRequired<HTMLElement>(egresoCard, '.kpi-value').textContent?.trim()).toBe(
        '$15,000'
      );

      fixture.destroy();
      TestBed.resetTestingModule();

      await setupComponent({
        dashboard: makeDashboardResponse({
          totales: { ingresos: 0, egresos: 8000, balance: -8000 },
        }),
      });

      const negHost = fixture.nativeElement as HTMLElement;
      const negHero = queryRequired<HTMLElement>(negHost, '.kpi-card--hero');
      expect(negHero.classList.contains('negativo')).toBeTrue();
      expect(queryRequired<HTMLElement>(negHero, '.kpi-value').textContent?.trim()).toBe('-$8,000');
      expect(queryRequired<HTMLElement>(negHero, '.kpi-subtitle').textContent?.trim()).toBe(
        'Sin ingresos registrados en el periodo'
      );

      fixture.destroy();
      TestBed.resetTestingModule();

      await setupComponent({
        dashboard: makeDashboardResponse({
          totales: { ingresos: 0, egresos: 0, balance: 0 },
        }),
      });

      const zeroHost = fixture.nativeElement as HTMLElement;
      const zeroHero = queryRequired<HTMLElement>(zeroHost, '.kpi-card--hero');
      expect(zeroHero.classList.contains('negativo')).toBeFalse();
      expect(queryRequired<HTMLElement>(zeroHero, '.kpi-subtitle').textContent?.trim()).toBe(
        'Sin movimientos en el periodo'
      );
    });

    it('flowChartType es line y las 2 donas renderizan overlay central, desglose ordenado y pildora #1', async () => {
      await setupComponent();

      expect(component.flowChartType).toBe('line');

      const host = fixture.nativeElement as HTMLElement;
      expect(host.querySelectorAll('.charts-grid canvas').length).toBe(3);

      const ingCard = queryRequired<HTMLElement>(host, '.chart-card--ingresos');
      expect(queryRequired<HTMLElement>(ingCard, '.chart-card__title').textContent?.trim()).toBe(
        'Ingresos por categoría'
      );
      expect(queryRequired<HTMLElement>(ingCard, '.donut-center__value').textContent?.trim()).toBe(
        '$50,000'
      );
      expect(queryRequired<HTMLElement>(ingCard, '.donut-center__label').textContent?.trim()).toBe(
        'Ingresos'
      );
      const ingPill = queryRequired<HTMLElement>(ingCard, '.chart-insight-pill');
      expect(ingPill.textContent?.trim()).toBe('Lavado por kilo: $40,000 (80%)');
      expect(ingPill.classList.contains('tone--positive')).toBeTrue();

      const ingRows = Array.from(ingCard.querySelectorAll<HTMLElement>('.donut-row'));
      expect(ingRows.length).toBe(2);
      expect(ingRows.map((r) => r.querySelector('.donut-row__label')?.textContent?.trim())).toEqual(
        ['Lavado por kilo', 'Edredones']
      );
      expect(ingRows.map((r) => r.querySelector('.donut-row__pct')?.textContent?.trim())).toEqual([
        '80%',
        '20%',
      ]);

      const egrCard = queryRequired<HTMLElement>(host, '.chart-card--egresos');
      expect(queryRequired<HTMLElement>(egrCard, '.chart-card__title').textContent?.trim()).toBe(
        'Egresos por categoría'
      );
      expect(queryRequired<HTMLElement>(egrCard, '.donut-center__value').textContent?.trim()).toBe(
        '$15,000'
      );
      expect(queryRequired<HTMLElement>(egrCard, '.donut-center__label').textContent?.trim()).toBe(
        'Egresos'
      );
      const egrPill = queryRequired<HTMLElement>(egrCard, '.chart-insight-pill');
      expect(egrPill.textContent?.trim()).toBe('Insumos: $10,500 (70%)');
      expect(egrPill.classList.contains('tone--negative')).toBeTrue();

      const egrRows = Array.from(egrCard.querySelectorAll<HTMLElement>('.donut-row'));
      expect(egrRows.length).toBe(2);
      expect(egrRows.map((r) => r.querySelector('.donut-row__label')?.textContent?.trim())).toEqual(
        ['Insumos', 'Servicios']
      );
      expect(egrRows.map((r) => r.querySelector('.donut-row__pct')?.textContent?.trim())).toEqual([
        '70%',
        '30%',
      ]);
    });

    it('renderiza estados vacios en flujo y ambas donas cuando no existen datos', async () => {
      await setupComponent({
        dashboard: makeDashboardResponse({
          por_dia: [],
          por_categoria: { ingreso: [], egreso: [] },
        }),
      });

      const host = fixture.nativeElement as HTMLElement;
      expect(host.querySelectorAll('.charts-grid canvas').length).toBe(0);
      expect(
        queryRequired<HTMLElement>(host, '.chart-card--flow .chart-empty').textContent
      ).toContain('Sin movimientos registrados en este periodo.');
      expect(
        queryRequired<HTMLElement>(host, '.chart-card--ingresos .chart-empty').textContent
      ).toContain('Sin ingresos categorizados en este periodo.');
      expect(
        queryRequired<HTMLElement>(host, '.chart-card--egresos .chart-empty').textContent
      ).toContain('Sin egresos categorizados en este periodo.');
      expect(
        queryRequired<HTMLElement>(host, '.chart-card--ingresos .chart-insight-pill').textContent?.trim()
      ).toBe('Sin datos');
      expect(
        queryRequired<HTMLElement>(host, '.chart-card--egresos .chart-insight-pill').textContent?.trim()
      ).toBe('Sin datos');
    });
  });

  describe('Reparto de Utilidades (modo consulta)', () => {
    it('selector Mes actual | Rango filtrado alterna utilidad base entre kpis_mes.balance y totales.balance y persiste preferencia', async () => {
      await setupComponent({
        dashboard: makeDashboardResponse({
          totales: { ingresos: 50000, egresos: 15000, balance: 35000 },
          kpis_mes: { ingresos: 25000, egresos: 5000, balance: 20000 },
        }),
        reparto: makeRepartoConfig({
          capital_pct: 20,
          socios: [
            { id: 's1', nombre: 'Ana', pct: 50 },
            { id: 's2', nombre: 'Luis', pct: 30 },
          ],
        }),
      });

      const host = fixture.nativeElement as HTMLElement;
      expect(component.repartoSourceMode()).toBe('mes');
      expect(queryRequired<HTMLElement>(host, '.reparto-meta__amount').textContent?.trim()).toBe(
        '$20,000'
      );
      expect(queryRequired<HTMLElement>(host, '.capital-card__amount').textContent?.trim()).toBe(
        '$4,000'
      );

      const segButtons = Array.from(host.querySelectorAll<HTMLButtonElement>('.seg-control .seg-opt'));
      const btnMes = segButtons[0];
      const btnRango = segButtons[1];

      btnRango.click();
      fixture.detectChanges();

      expect(component.repartoSourceMode()).toBe('rango');
      expect(localStorage.getItem(REPARTO_USE_MES_KEY)).toBe('false');
      expect(queryRequired<HTMLElement>(host, '.reparto-meta__amount').textContent?.trim()).toBe(
        '$35,000'
      );
      expect(queryRequired<HTMLElement>(host, '.capital-card__amount').textContent?.trim()).toBe(
        '$7,000'
      );

      btnMes.click();
      fixture.detectChanges();

      expect(component.repartoSourceMode()).toBe('mes');
      expect(localStorage.getItem(REPARTO_USE_MES_KEY)).toBe('true');
      expect(queryRequired<HTMLElement>(host, '.reparto-meta__amount').textContent?.trim()).toBe(
        '$20,000'
      );
    });

    it('muestra aviso Sin utilidad repartible en este periodo con balance negativo o cero, montos $0 y acuerdo visible', async () => {
      await setupComponent({
        dashboard: makeDashboardResponse({
          kpis_mes: { ingresos: 3000, egresos: 7000, balance: -4000 },
          totales: { ingresos: 5000, egresos: 5000, balance: 0 },
        }),
        reparto: makeRepartoConfig({
          capital_pct: 20,
          socios: [
            { id: 's1', nombre: 'Ana', pct: 50 },
            { id: 's2', nombre: 'Luis', pct: 30 },
          ],
        }),
      });

      const host = fixture.nativeElement as HTMLElement;
      const notice = queryRequired<HTMLElement>(host, '.reparto-zero-notice');
      expect(notice.textContent).toContain('Sin utilidad repartible en este periodo');

      expect(queryRequired<HTMLElement>(host, '.reparto-meta__amount').classList.contains('neg')).toBeTrue();
      expect(queryRequired<HTMLElement>(host, '.capital-card__amount').textContent?.trim()).toBe(
        '$0'
      );
      const socioAmounts = Array.from(
        host.querySelectorAll<HTMLElement>('.socio-card__amount')
      ).map((el) => el.textContent?.trim());
      expect(socioAmounts).toEqual(['$0', '$0']);

      expect(host.querySelectorAll('.reparto-bar .reparto-bar__seg').length).toBe(3);
      expect(host.querySelectorAll('.socio-card').length).toBe(2);

      const btnRango = findButtonByText(host, '.seg-control .seg-opt', 'Rango filtrado');
      btnRango.click();
      fixture.detectChanges();

      expect(queryRequired<HTMLElement>(host, '.reparto-zero-notice').textContent).toContain(
        'Sin utilidad repartible en este periodo'
      );
      expect(queryRequired<HTMLElement>(host, '.reparto-meta__amount').textContent?.trim()).toBe('$0');
      expect(queryRequired<HTMLElement>(host, '.capital-card__amount').textContent?.trim()).toBe('$0');
      expect(host.querySelectorAll('.socio-card').length).toBe(2);
    });

    it('oculta tarjeta Capital del negocio cuando capital_pct === 0 y renderiza barra segmentada', async () => {
      await setupComponent({
        reparto: makeRepartoConfig({
          capital_pct: 0,
          socios: [
            { id: 's1', nombre: 'Ana', pct: 60 },
            { id: 's2', nombre: 'Luis', pct: 40 },
          ],
        }),
      });

      const host = fixture.nativeElement as HTMLElement;
      expect(host.querySelector('.capital-card')).toBeNull();

      const segs = Array.from(host.querySelectorAll<HTMLElement>('.reparto-bar .reparto-bar__seg'));
      expect(segs.length).toBe(2);
      expect(segs.map((el) => el.style.width)).toEqual(['60%', '40%']);
      expect(segs.map((el) => el.getAttribute('title'))).toEqual(['Ana (60%)', 'Luis (40%)']);

      fixture.destroy();
      TestBed.resetTestingModule();

      await setupComponent({
        reparto: makeRepartoConfig({
          capital_pct: 25,
          socios: [{ id: 's1', nombre: 'Ana', pct: 75 }],
        }),
      });

      const hostWithCap = fixture.nativeElement as HTMLElement;
      const capCard = queryRequired<HTMLElement>(hostWithCap, '.capital-card');
      expect(capCard.textContent).toContain('Capital del negocio');
      expect(queryRequired<HTMLElement>(capCard, '.pct-pill--capital').textContent?.trim()).toBe(
        '25%'
      );
      const segsWithCap = Array.from(
        hostWithCap.querySelectorAll<HTMLElement>('.reparto-bar .reparto-bar__seg')
      );
      expect(segsWithCap.length).toBe(2);
      expect(segsWithCap.map((el) => el.style.width)).toEqual(['25%', '75%']);
    });

    it('estado no configurado muestra Configurar acuerdo y muestra Importar acuerdo anterior solo con draft legacy sin guardar', async () => {
      await setupComponent({
        reparto: makeEmptyRepartoConfig('suc-1'),
      });

      const hostNoDraft = fixture.nativeElement as HTMLElement;
      const emptyBox = queryRequired<HTMLElement>(hostNoDraft, '.reparto-empty');
      expect(emptyBox.textContent).toContain('Configurar acuerdo');
      expect(emptyBox.textContent).not.toContain('Importar acuerdo anterior');

      const configBtn = findButtonByText(
        hostNoDraft,
        '.reparto-empty__actions button',
        'Configurar acuerdo'
      );
      configBtn.click();
      fixture.detectChanges();
      expect(component.editingReparto()).toBeTrue();
      expect(component.draftSocios().map((s) => s.pct)).toEqual([50, 50]);
      expect(apiStub.saveSucursalReparto).not.toHaveBeenCalled();

      fixture.destroy();
      TestBed.resetTestingModule();

      await setupComponent({
        reparto: makeEmptyRepartoConfig('suc-1'),
        legacyStorage: {
          reparto: JSON.stringify({
            aNombre: 'Mario',
            aPct: 60,
            bNombre: 'Lucia',
            bPct: 40,
          }),
        },
      });

      const hostWithDraft = fixture.nativeElement as HTMLElement;
      const importBtn = findButtonByText(
        hostWithDraft,
        '.reparto-empty__actions button',
        'Importar acuerdo anterior'
      );

      importBtn.click();
      fixture.detectChanges();

      expect(component.editingReparto()).toBeTrue();
      expect(component.draftCapitalPct()).toBe(0);
      expect(component.draftSocios()).toEqual([
        { id: 'legacy-a', nombre: 'Mario', pct: 60 },
        { id: 'legacy-b', nombre: 'Lucia', pct: 40 },
      ]);
      expect(apiStub.saveSucursalReparto).not.toHaveBeenCalled();
    });

    it('Copiar resumen invoca clipboard con buildRepartoShareText y WhatsApp abre URL exacta', async () => {
      await setupComponent({
        dashboard: makeDashboardResponse({
          kpis_mes: { ingresos: 25000, egresos: 5000, balance: 20000 },
        }),
        reparto: makeRepartoConfig({
          capital_pct: 20,
          socios: [
            { id: 's1', nombre: 'Ana', pct: 50 },
            { id: 's2', nombre: 'Luis', pct: 30 },
          ],
        }),
      });

      const expectedText = buildRepartoShareText({
        sucursalNombre: 'Centro',
        periodLabel: component.repartoPeriodLabel(),
        sourceMode: 'mes',
        distribution: component.savedDistribution(),
      });
      expect(expectedText).toContain('Reparto de utilidades - Centro');
      expect(expectedText).toContain('- Capital del negocio (20%): $4,000');
      expect(expectedText).toContain('- Ana (50%): $10,000');
      expect(expectedText).toContain('- Luis (30%): $6,000');

      const writeSpy = mockClipboardWriteText();
      const openSpy = spyOn(window, 'open').and.returnValue(null);

      const host = fixture.nativeElement as HTMLElement;
      const copyBtn = findButtonByText(host, '.reparto-actions button', 'Copiar resumen');
      const whatsappBtn = queryRequired<HTMLButtonElement>(host, 'button.whatsapp-btn');

      copyBtn.click();
      await flushAsync();

      expect(writeSpy).toHaveBeenCalledOnceWith(expectedText);
      expect(snackStub.open).toHaveBeenCalledOnceWith('Resumen copiado al portapapeles', 'OK', {
        duration: 2500,
      });

      whatsappBtn.click();
      expect(openSpy).toHaveBeenCalledOnceWith(
        buildWhatsAppShareUrl(expectedText),
        '_blank',
        'noopener,noreferrer'
      );
    });
  });

  describe('Reparto de Utilidades (edicion en vivo sin recarga)', () => {
    it('edita capital, agrega/quita socios, reparte equitativamente y valida 100% y nombres vacios', async () => {
      await setupComponent({
        dashboard: makeDashboardResponse({
          kpis_mes: { ingresos: 25000, egresos: 5000, balance: 20000 },
        }),
        reparto: makeRepartoConfig({
          capital_pct: 20,
          socios: [
            { id: 's1', nombre: 'Ana', pct: 50 },
            { id: 's2', nombre: 'Luis', pct: 30 },
          ],
        }),
      });

      const host = fixture.nativeElement as HTMLElement;
      const editBtn = findButtonByText(host, '.reparto-actions button', 'Editar acuerdo');
      editBtn.click();
      fixture.detectChanges();

      expect(component.editingReparto()).toBeTrue();
      const saveBtn = (): HTMLButtonElement =>
        queryRequired<HTMLButtonElement>(host, '.editor-footer button.primary-action-btn');
      const sumStatus = (): HTMLElement => queryRequired<HTMLElement>(host, '.sum-status');

      expect(sumStatus().textContent?.trim()).toBe('100% asignado');
      expect(saveBtn().disabled).toBeFalse();

      const capitalInput = queryRequired<HTMLInputElement>(host, '#reparto-capital-input');
      capitalInput.value = '10';
      capitalInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(sumStatus().textContent?.trim()).toBe('Falta 10% por asignar');
      expect(sumStatus().classList.contains('tone--warn')).toBeTrue();
      expect(saveBtn().disabled).toBeTrue();

      capitalInput.value = '35';
      capitalInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(sumStatus().textContent?.trim()).toBe('Excede 100% por 15%');
      expect(sumStatus().classList.contains('tone--error')).toBeTrue();
      expect(saveBtn().disabled).toBeTrue();

      const toolBtns = Array.from(host.querySelectorAll<HTMLButtonElement>('.editor-tools .tool-btn'));
      const addSocioBtn = toolBtns[0];
      const splitBtn = toolBtns[1];

      addSocioBtn.click();
      fixture.detectChanges();
      expect(component.draftSocios().length).toBe(3);

      capitalInput.value = '20';
      capitalInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      splitBtn.click();
      fixture.detectChanges();

      expect(component.draftSocios().map((s) => s.pct)).toEqual([26.68, 26.66, 26.66]);
      expect(sumStatus().textContent?.trim()).toBe('100% asignado');
      expect(sumStatus().classList.contains('tone--valid')).toBeTrue();
      expect(saveBtn().disabled).toBeFalse();

      const firstNameInput = queryRequired<HTMLInputElement>(host, '.editor-socio-row .socio-name-input');
      firstNameInput.value = '   ';
      firstNameInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(component.draftValidationError()).toBe('Cada socio debe tener un nombre.');
      expect(saveBtn().disabled).toBeTrue();

      firstNameInput.value = 'Ana Maria';
      firstNameInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(saveBtn().disabled).toBeFalse();

      const removeBtns = Array.from(host.querySelectorAll<HTMLButtonElement>('.remove-socio-btn'));
      removeBtns[2].click();
      fixture.detectChanges();

      expect(component.draftSocios().length).toBe(2);
      expect(sumStatus().textContent?.trim()).toBe('Falta 26.66% por asignar');
      expect(saveBtn().disabled).toBeTrue();

      splitBtn.click();
      fixture.detectChanges();
      expect(component.draftSocios().map((s) => s.pct)).toEqual([40, 40]);
      expect(saveBtn().disabled).toBeFalse();
    });

    it('guardar acuerdo invoca saveSucursalReparto con payload exacto, actualiza UI sin recargar y muestra snackbar', async () => {
      await setupComponent({
        dashboard: makeDashboardResponse({
          kpis_mes: { ingresos: 25000, egresos: 5000, balance: 20000 },
        }),
        reparto: makeRepartoConfig({
          sucursal_id: 'suc-1',
          capital_pct: 20,
          socios: [
            { id: 's1', nombre: 'Ana', pct: 50 },
            { id: 's2', nombre: 'Luis', pct: 30 },
          ],
        }),
      });

      dashStub.get.calls.reset();
      apiStub.listSucursales.calls.reset();
      apiStub.getSucursalReparto.calls.reset();

      component.openRepartoEditor();
      component.setDraftCapitalPct(10);
      component.updateDraftSocioName('s1', '  Ana Perez  ');
      component.updateDraftSocioPct('s1', 55);
      component.updateDraftSocioPct('s2', 35);
      fixture.detectChanges();

      const host = fixture.nativeElement as HTMLElement;
      const saveBtn = queryRequired<HTMLButtonElement>(host, '.editor-footer button.primary-action-btn');
      expect(saveBtn.disabled).toBeFalse();

      saveBtn.click();
      await flushAsync();

      expect(apiStub.saveSucursalReparto).toHaveBeenCalledOnceWith('suc-1', {
        capital_pct: 10,
        socios: [
          { id: 's1', nombre: 'Ana Perez', pct: 55 },
          { id: 's2', nombre: 'Luis', pct: 35 },
        ],
      });
      expect(component.editingReparto()).toBeFalse();
      expect(component.repartoConfig().capital_pct).toBe(10);
      expect(component.repartoConfig().socios[0].nombre).toBe('Ana Perez');
      expect(queryRequired<HTMLElement>(host, '.capital-card__amount').textContent?.trim()).toBe(
        '$2,000'
      );
      expect(snackStub.open).toHaveBeenCalledOnceWith('Acuerdo de reparto guardado', 'OK', {
        duration: 2500,
      });

      expect(dashStub.get).not.toHaveBeenCalled();
      expect(apiStub.listSucursales).not.toHaveBeenCalled();
      expect(apiStub.getSucursalReparto).not.toHaveBeenCalled();
    });

    it('si saveSucursalReparto falla mantiene editor abierto y muestra error en pantalla', async () => {
      await setupComponent();

      apiStub.saveSucursalReparto.and.rejectWith(new Error('La suma debe ser 100% en servidor'));

      component.openRepartoEditor();
      fixture.detectChanges();

      const host = fixture.nativeElement as HTMLElement;
      const saveBtn = queryRequired<HTMLButtonElement>(host, '.editor-footer button.primary-action-btn');
      saveBtn.click();
      await flushAsync();

      expect(component.editingReparto()).toBeTrue();
      expect(component.savingReparto()).toBeFalse();
      expect(component.repartoSaveError()).toBe('La suma debe ser 100% en servidor');
      const errEl = queryRequired<HTMLElement>(host, '.editor-error');
      expect(errEl.textContent).toContain('La suma debe ser 100% en servidor');
      expect(snackStub.open).not.toHaveBeenCalled();
    });

    it('boton Cancelar cierra el editor y descarta cambios sin llamar a red', async () => {
      await setupComponent({
        reparto: makeRepartoConfig({
          capital_pct: 20,
          socios: [
            { id: 's1', nombre: 'Ana', pct: 50 },
            { id: 's2', nombre: 'Luis', pct: 30 },
          ],
        }),
      });

      component.openRepartoEditor();
      component.setDraftCapitalPct(45);
      component.addDraftSocio();
      fixture.detectChanges();

      const host = fixture.nativeElement as HTMLElement;
      const cancelBtn = queryRequired<HTMLButtonElement>(
        host,
        '.editor-footer button.secondary-action-btn'
      );
      cancelBtn.click();
      fixture.detectChanges();

      expect(component.editingReparto()).toBeFalse();
      expect(component.draftCapitalPct()).toBe(20);
      expect(component.draftSocios().length).toBe(2);
      expect(apiStub.saveSucursalReparto).not.toHaveBeenCalled();
    });
  });
});
