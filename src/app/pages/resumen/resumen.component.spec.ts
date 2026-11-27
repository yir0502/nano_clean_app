import { registerLocaleData } from '@angular/common';
import localeEsMX from '@angular/common/locales/es-MX';
import { Component, LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, RouterLink, provideRouter } from '@angular/router';

import { ApiClientService } from '../../core/api-client.service';
import {
  type DashboardQueryParams,
  type DashboardReciente,
  DashboardService,
  type DashboardUIResponse,
} from '../../core/dashboard.service';
import type { ClientStatsResponse, Pedido } from '../../core/models';
import { PedidoActionsService } from '../../core/pedido-actions.service';
import { ResumenComponent } from './resumen.component';
import {
  CLIENTE_SEGMENT_COLORS,
  DEUDA_SEVERITY_COLORS,
  PEDIDO_ACTIVE_STAGES,
  aggregateFinancialSeries,
  buildClientesSegmentSummary,
  buildResumenChartInsights,
  calculateDeudaSeverity,
  calculateRangeDates,
  createHorizontalGradient,
  createVerticalGradient,
  formatCurrencyMXN,
  formatPaymentMethod,
  formatRecentMovementDate,
  getPedidoStageMeta,
} from './resumen.helpers';

registerLocaleData(localeEsMX);

@Component({ standalone: true, template: '' })
class DummyRouteComponent {}

type ListPedidosParams = Parameters<ApiClientService['listPedidos']>[0];

interface DashboardServiceStub {
  get: jasmine.Spy<(params?: DashboardQueryParams) => Promise<DashboardUIResponse>>;
}

interface ApiClientStub {
  listPedidos: jasmine.Spy<(params?: ListPedidosParams) => Promise<Pedido[]>>;
  getClientStats: jasmine.Spy<() => Promise<ClientStatsResponse>>;
}

interface PedidoActionsStub {
  sendWhatsapp: jasmine.Spy<(pedido: Pedido) => void>;
}

function formatLocalIsoOffset(daysOffset: number, base: Date = new Date()): string {
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + daysOffset);
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function makePedido(overrides: Partial<Pedido> = {}): Pedido {
  return {
    id: 'ped-1',
    org_id: 'org-1',
    folio: 'PED-001',
    cliente_id: 'cli-1',
    cliente_nombre: 'Ana Lopez',
    cliente_telefono: '5512345678',
    sucursal_id: 'suc-1',
    sucursal_nombre: 'Centro',
    estado: 'lavando',
    monto_total: 250,
    saldo_pendiente: 120,
    fecha_entrega_estimada: formatLocalIsoOffset(2),
    ...overrides,
  };
}

function makeReciente(overrides: Partial<DashboardReciente> = {}): DashboardReciente {
  return {
    id: 'mov-1',
    tipo: 'ingreso',
    categoria: 'Lavanderia',
    sucursal_id: 'suc-1',
    sucursal_nombre: 'Centro',
    metodo_pago: 'efectivo',
    nota: 'Pago de servicio',
    pedido_id: null,
    pedido_folio: null,
    fecha: '2026-11-15',
    created_at: '2026-11-15T14:30:00',
    monto: 300,
    ...overrides,
  };
}

function makeClientStats(overrides: Partial<ClientStatsResponse> = {}): ClientStatsResponse {
  return {
    total: 20,
    faltan_promo: 3,
    con_whatsapp: 18,
    frecuencias: { '7': 5, '15': 7, '30': 6, otros: 2 },
    segmentos: {
      active_0_15: 12,
      risk_16_45: 5,
      lost_45plus: 3,
    },
    ...overrides,
  };
}

function makeDashboardResponse(
  overrides: Partial<DashboardUIResponse> = {}
): DashboardUIResponse {
  return {
    range: { desde: '2026-08-20', hasta: '2026-11-20', dias: 92 },
    totales: { ingresos: 60000, egresos: 18000, balance: 42000 },
    por_dia: [
      { fecha: '2026-11-04', ingresos: 4000, egresos: 1000, balance: 3000 },
      { fecha: '2026-11-11', ingresos: 6000, egresos: 1500, balance: 4500 },
      { fecha: '2026-11-18', ingresos: 10000, egresos: 2500, balance: 7500 },
    ],
    por_categoria: {
      ingreso: [
        { categoria_id: 'cat-1', nombre: 'Lavado por kilo', total: 14000 },
        { categoria_id: 'cat-2', nombre: 'Edredones', total: 6000 },
      ],
      egreso: [
        { categoria_id: 'cat-3', nombre: 'Insumos', total: 3500 },
        { categoria_id: 'cat-4', nombre: 'Servicios', total: 1500 },
      ],
    },
    kpis_mes: { ingresos: 20000, egresos: 5000, balance: 15000 },
    por_categoria_mes: {
      ingreso: [
        { categoria_id: 'cat-1', nombre: 'Lavado por kilo', total: 14000 },
        { categoria_id: 'cat-2', nombre: 'Edredones', total: 6000 },
      ],
      egreso: [
        { categoria_id: 'cat-3', nombre: 'Insumos', total: 3500 },
        { categoria_id: 'cat-4', nombre: 'Servicios', total: 1500 },
      ],
    },
    por_sucursal_mes: [
      { sucursal_id: 'suc-1', nombre: 'Centro', ingresos: 13000, egresos: 3000, balance: 10000 },
      { sucursal_id: 'suc-2', nombre: 'Norte', ingresos: 7000, egresos: 2000, balance: 5000 },
    ],
    recientes: [
      makeReciente({
        id: 'mov-1',
        tipo: 'ingreso',
        monto: 450,
        sucursal_nombre: 'Centro',
        metodo_pago: 'mercado_pago',
        nota: '  Pago completo de servicio  ',
        pedido_id: 'ped-10',
        pedido_folio: 'PED-010',
      }),
      makeReciente({
        id: 'mov-2',
        tipo: 'egreso',
        monto: -180,
        categoria: 'Insumos',
        sucursal_nombre: 'Norte',
        metodo_pago: 'transferencia',
        nota: 'Compra de suavizante',
        pedido_id: 'ped-11',
        pedido_folio: null,
      }),
    ],
    meta: { items: 2 },
    ...overrides,
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

describe('resumen.helpers', () => {
  it('getPedidoStageMeta resuelve las 5 etapas activas, entregado, cancelado y fallbacks', () => {
    expect(PEDIDO_ACTIVE_STAGES.length).toBe(5);

    expect(getPedidoStageMeta('recibido')).toEqual(PEDIDO_ACTIVE_STAGES[0]);
    expect(getPedidoStageMeta('lavando')).toEqual(PEDIDO_ACTIVE_STAGES[1]);
    expect(getPedidoStageMeta('secando')).toEqual(PEDIDO_ACTIVE_STAGES[2]);
    expect(getPedidoStageMeta('doblando')).toEqual(PEDIDO_ACTIVE_STAGES[3]);
    expect(getPedidoStageMeta('listo')).toEqual(PEDIDO_ACTIVE_STAGES[4]);

    expect(getPedidoStageMeta('  LAVANDO  ')).toEqual(PEDIDO_ACTIVE_STAGES[1]);

    expect(getPedidoStageMeta('entregado')).toEqual({
      key: 'entregado',
      index: 4,
      percent: 100,
      label: 'Entregado',
      cssClass: 'stage--entregado',
      icon: 'task_alt',
    });
    expect(getPedidoStageMeta('cancelado')).toEqual({
      key: 'cancelado',
      index: 0,
      percent: 0,
      label: 'Cancelado',
      cssClass: 'stage--cancelado',
      icon: 'cancel',
    });

    expect(getPedidoStageMeta(null)).toEqual(PEDIDO_ACTIVE_STAGES[0]);
    expect(getPedidoStageMeta(undefined)).toEqual(PEDIDO_ACTIVE_STAGES[0]);
    expect(getPedidoStageMeta('')).toEqual(PEDIDO_ACTIVE_STAGES[0]);
    expect(getPedidoStageMeta('estado_desconocido')).toEqual(PEDIDO_ACTIVE_STAGES[0]);
  });

  it('calculateDeudaSeverity clasifica umbrales exactos 0d, 7d, 8d e ignora saldos <= 0', () => {
    const refDate = new Date(2026, 10, 20);
    const pedidos: Pedido[] = [
      makePedido({ id: 'p-zero', saldo_pendiente: 0, fecha_entrega_estimada: '2026-10-01' }),
      makePedido({ id: 'p-neg', saldo_pendiente: -50, fecha_entrega_estimada: '2026-10-01' }),
      makePedido({ id: 'p-nan', saldo_pendiente: Number.NaN, fecha_entrega_estimada: '2026-10-01' }),
      makePedido({ id: 'p-fut', saldo_pendiente: 100, fecha_entrega_estimada: '2026-11-25' }),
      makePedido({ id: 'p-0d', saldo_pendiente: 150, fecha_entrega_estimada: '2026-11-20' }),
      makePedido({ id: 'p-nofecha', saldo_pendiente: 50, fecha_entrega_estimada: undefined }),
      makePedido({ id: 'p-badfecha', saldo_pendiente: 75, fecha_entrega_estimada: 'invalida' }),
      makePedido({ id: 'p-1d', saldo_pendiente: 200, fecha_entrega_estimada: '2026-11-19' }),
      makePedido({ id: 'p-7d', saldo_pendiente: 250, fecha_entrega_estimada: '2026-11-13' }),
      makePedido({ id: 'p-8d', saldo_pendiente: 300, fecha_entrega_estimada: '2026-11-12' }),
      makePedido({ id: 'p-30d', saldo_pendiente: 400, fecha_entrega_estimada: '2026-10-21' }),
    ];

    const summary = calculateDeudaSeverity(pedidos, refDate);
    expect(summary.dia).toBe(4);
    expect(summary.leves).toBe(2);
    expect(summary.graves).toBe(2);
    expect(summary.totalPedidos).toBe(8);
    expect(summary.totalAdeudado).toBe(1525);
    expect(summary.riesgoCriticoPercent).toBe(25);
    expect(summary.breakdown).toEqual([
      {
        key: 'dia',
        label: 'Día a día',
        count: 4,
        percent: 50,
        color: DEUDA_SEVERITY_COLORS.dia,
      },
      {
        key: 'leves',
        label: 'Atraso leve (1-7 días)',
        count: 2,
        percent: 25,
        color: DEUDA_SEVERITY_COLORS.leves,
      },
      {
        key: 'graves',
        label: 'Riesgo crítico (+7 días)',
        count: 2,
        percent: 25,
        color: DEUDA_SEVERITY_COLORS.graves,
      },
    ]);

    const empty = calculateDeudaSeverity([], refDate);
    expect(empty.totalPedidos).toBe(0);
    expect(empty.totalAdeudado).toBe(0);
    expect(empty.riesgoCriticoPercent).toBe(0);
  });

  it('buildClientesSegmentSummary calcula totales, porcentajes y maneja valores nulos o negativos', () => {
    const summary = buildClientesSegmentSummary(makeClientStats());
    expect(summary.total).toBe(20);
    expect(summary.activosCount).toBe(12);
    expect(summary.riesgoCount).toBe(5);
    expect(summary.inactivosCount).toBe(3);
    expect(summary.activosPercent).toBe(60);
    expect(summary.breakdown).toEqual([
      {
        key: 'active_0_15',
        label: 'Activos (0-15 días)',
        count: 12,
        percent: 60,
        color: CLIENTE_SEGMENT_COLORS.active_0_15,
      },
      {
        key: 'risk_16_45',
        label: 'En riesgo (16-45 días)',
        count: 5,
        percent: 25,
        color: CLIENTE_SEGMENT_COLORS.risk_16_45,
      },
      {
        key: 'lost_45plus',
        label: 'Inactivos (+45 días)',
        count: 3,
        percent: 15,
        color: CLIENTE_SEGMENT_COLORS.lost_45plus,
      },
    ]);

    const nullSummary = buildClientesSegmentSummary(null);
    expect(nullSummary.total).toBe(0);
    expect(nullSummary.activosPercent).toBe(0);

    const fallbackTotal = buildClientesSegmentSummary(
      makeClientStats({
        total: 0,
        segmentos: { active_0_15: 3, risk_16_45: 1, lost_45plus: -2 },
      })
    );
    expect(fallbackTotal.total).toBe(4);
    expect(fallbackTotal.inactivosCount).toBe(0);
    expect(fallbackTotal.activosPercent).toBe(75);
  });

  it('aggregateFinancialSeries agrupa semanalmente en 3m y mensualmente en 6m y 12m', () => {
    const weekly = aggregateFinancialSeries(
      [
        { fecha: '2026-11-23', ingresos: 500, egresos: 100, balance: 400 },
        { fecha: '2026-11-22', ingresos: 300, egresos: 50, balance: 250 },
        { fecha: '2026-11-18', ingresos: 700, egresos: 150, balance: 550 },
        { fecha: 'fecha-invalida', ingresos: 9999, egresos: 9999, balance: 0 },
      ],
      '3m'
    );

    expect(weekly.labels.length).toBe(2);
    expect(weekly.labels[0].startsWith('Sem ')).toBeTrue();
    expect(weekly.labels[1].startsWith('Sem ')).toBeTrue();
    expect(weekly.ingresos).toEqual([1000, 500]);
    expect(weekly.egresos).toEqual([200, 100]);
    expect(weekly.balances).toEqual([800, 400]);
    expect(weekly.totalIngresos).toBe(1500);
    expect(weekly.totalEgresos).toBe(300);
    expect(weekly.balanceNetoRango).toBe(1200);

    const monthly6m = aggregateFinancialSeries(
      [
        { fecha: '2026-10-18', ingresos: 800, egresos: 200, balance: 600 },
        { fecha: '2026-09-05', ingresos: 400, egresos: 100, balance: 300 },
        { fecha: '2026-09-25', ingresos: 600, egresos: 250, balance: 350 },
      ],
      '6m'
    );

    expect(monthly6m.labels.length).toBe(2);
    expect(monthly6m.labels[0].startsWith('Sem ')).toBeFalse();
    expect(monthly6m.ingresos).toEqual([1000, 800]);
    expect(monthly6m.egresos).toEqual([350, 200]);
    expect(monthly6m.balances).toEqual([650, 600]);
    expect(monthly6m.balanceNetoRango).toBe(1250);

    const monthly12m = aggregateFinancialSeries(
      [
        { fecha: '2026-01-10', ingresos: 900, egresos: 300, balance: 600 },
        { fecha: '2025-12-20', ingresos: 1200, egresos: 400, balance: 800 },
      ],
      '12m'
    );

    expect(monthly12m.labels.length).toBe(2);
    expect(monthly12m.ingresos).toEqual([1200, 900]);
    expect(monthly12m.egresos).toEqual([400, 300]);
    expect(monthly12m.balanceNetoRango).toBe(1400);
  });

  it('buildResumenChartInsights genera textos y tonos para escenarios positivos, negativos y vacios', () => {
    const refDate = new Date(2026, 10, 20);
    const deudaConCritica = calculateDeudaSeverity(
      [
        makePedido({ id: 'd1', saldo_pendiente: 200, fecha_entrega_estimada: '2026-11-20' }),
        makePedido({ id: 'd2', saldo_pendiente: 300, fecha_entrega_estimada: '2026-11-01' }),
      ],
      refDate
    );
    const clientesAlto = buildClientesSegmentSummary(makeClientStats());

    const positive = buildResumenChartInsights({
      balanceNetoRango: 12500,
      deudaSummary: deudaConCritica,
      clientesSummary: clientesAlto,
      sucursalesMes: [
        { sucursal_id: 's1', nombre: 'Centro', ingresos: 10000, egresos: 5000, balance: 5000 },
        { sucursal_id: 's2', nombre: 'Norte', ingresos: 10000, egresos: 2000, balance: 8000 },
      ],
      ingresosCategoriasMes: [
        { categoria_id: 'c1', nombre: 'Lavado', total: 7500 },
        { categoria_id: 'c2', nombre: 'Planchado', total: 2500 },
      ],
      egresosCategoriasMes: [
        { categoria_id: 'c3', nombre: 'Renta', total: 4000 },
        { categoria_id: 'c4', nombre: 'Insumos', total: 1000 },
      ],
    });

    expect(positive.balanceRango).toEqual({ text: '+$12,500', tone: 'positive' });
    expect(positive.carteraDeuda).toEqual({ text: '50% riesgo crítico', tone: 'negative' });
    expect(positive.clientesActivos).toEqual({ text: '60% activos', tone: 'positive' });
    expect(positive.sucursalLider).toEqual({ text: 'Líder: Norte ($10,000)', tone: 'info' });
    expect(positive.topIngresoCategoria).toEqual({
      text: 'Lavado: $7,500 (75%)',
      tone: 'positive',
    });
    expect(positive.topEgresoCategoria).toEqual({
      text: 'Renta: $4,000 (80%)',
      tone: 'negative',
    });

    const clientesWarning = buildClientesSegmentSummary(
      makeClientStats({
        total: 10,
        segmentos: { active_0_15: 3, risk_16_45: 4, lost_45plus: 3 },
      })
    );
    const negative = buildResumenChartInsights({
      balanceNetoRango: -4500,
      deudaSummary: calculateDeudaSeverity(
        [makePedido({ id: 'd-ok', saldo_pendiente: 100, fecha_entrega_estimada: '2026-11-22' })],
        refDate
      ),
      clientesSummary: clientesWarning,
      sucursalesMes: [
        { sucursal_id: 's1', nombre: 'Sur', ingresos: 0, egresos: 2100, balance: -2100 },
      ],
      ingresosCategoriasMes: [],
      egresosCategoriasMes: [],
    });

    expect(negative.balanceRango).toEqual({ text: '-$4,500', tone: 'negative' });
    expect(negative.carteraDeuda).toEqual({ text: 'Al día', tone: 'positive' });
    expect(negative.clientesActivos).toEqual({ text: '30% activos', tone: 'warning' });
    expect(negative.sucursalLider).toEqual({ text: 'Sur ($2,100)', tone: 'neutral' });

    const empty = buildResumenChartInsights({
      balanceNetoRango: 0,
      deudaSummary: calculateDeudaSeverity([], refDate),
      clientesSummary: buildClientesSegmentSummary(null),
      sucursalesMes: [],
      ingresosCategoriasMes: null,
      egresosCategoriasMes: null,
    });

    expect(empty.balanceRango).toEqual({ text: '$0', tone: 'neutral' });
    expect(empty.carteraDeuda).toEqual({ text: 'Al día', tone: 'positive' });
    expect(empty.clientesActivos).toEqual({ text: 'Sin clientes', tone: 'neutral' });
    expect(empty.sucursalLider).toEqual({ text: 'Sin datos', tone: 'neutral' });
    expect(empty.topIngresoCategoria).toEqual({ text: 'Sin datos', tone: 'neutral' });
    expect(empty.topEgresoCategoria).toEqual({ text: 'Sin datos', tone: 'neutral' });
  });

  it('formatCurrencyMXN formatea positivos, negativos y ceros sin doble signo', () => {
    expect(formatCurrencyMXN(1250)).toBe('$1,250');
    expect(formatCurrencyMXN(1250, { showSign: true })).toBe('+$1,250');
    expect(formatCurrencyMXN(-1250)).toBe('-$1,250');
    expect(formatCurrencyMXN(-1250, { showSign: true })).toBe('-$1,250');
    expect(formatCurrencyMXN(0, { showSign: true })).toBe('$0');
    expect(formatCurrencyMXN(-0, { showSign: true })).toBe('$0');
    expect(formatCurrencyMXN(-0.001, { decimals: 2, showSign: true })).toBe('$0.00');
    expect(formatCurrencyMXN(1250.5, { decimals: 2 })).toBe('$1,250.50');
    expect(formatCurrencyMXN(Number.NaN)).toBe('$0');
    expect(formatCurrencyMXN(Number.POSITIVE_INFINITY)).toBe('$0');
  });

  it('formatPaymentMethod normaliza metodos conocidos y aplica fallback configurable', () => {
    expect(formatPaymentMethod(' efectivo ')).toBe('Efectivo');
    expect(formatPaymentMethod('TARJETA')).toBe('Tarjeta');
    expect(formatPaymentMethod('transferencia')).toBe('Transferencia');
    expect(formatPaymentMethod('mercado_pago')).toBe('Mercado Pago');
    expect(formatPaymentMethod('mercadopago')).toBe('Mercado Pago');
    expect(formatPaymentMethod('otro')).toBe('Otro');
    expect(formatPaymentMethod(null)).toBe('Sin método');
    expect(formatPaymentMethod(undefined)).toBe('Sin método');
    expect(formatPaymentMethod('   ')).toBe('Sin método');
    expect(formatPaymentMethod('cripto')).toBe('Sin método');
    expect(formatPaymentMethod('cripto', '')).toBe('');
  });

  it('formatRecentMovementDate incluye hora real, omite placeholder 00:00 y usa fallback fecha', () => {
    const withTime = formatRecentMovementDate('2026-11-15T14:35:00', '2026-11-10');
    expect(withTime).toContain('15');
    expect(withTime).toContain('14:35');

    const withSpaceTime = formatRecentMovementDate('2026-11-15 09:05:00', '2026-11-10');
    expect(withSpaceTime).toContain('09:05');

    const placeholderMidnight = formatRecentMovementDate('2026-11-15T00:00:00', '2026-11-10');
    expect(placeholderMidnight).toContain('15');
    expect(placeholderMidnight).not.toContain('00:00');

    const fallbackFecha = formatRecentMovementDate(null, '2026-11-08');
    expect(fallbackFecha).toContain('08');
    expect(fallbackFecha).not.toContain(':');

    expect(formatRecentMovementDate(null, 'invalida')).toBe('');
  });

  it('createVerticalGradient y createHorizontalGradient usan fallback sin chartArea y construyen gradiente valido', () => {
    const vFallback = 'rgba(16, 185, 129, 0.14)';
    const hFallback = 'rgba(14, 165, 233, 0.14)';
    const vFn = createVerticalGradient('#10b981', '#059669', vFallback);
    const hFn = createHorizontalGradient('#0ea5e9', '#10b981', hFallback);

    expect(vFn({ chart: null })).toBe(vFallback);
    expect(vFn({ chart: { chartArea: null, ctx: null } })).toBe(vFallback);
    expect(
      vFn({
        chart: {
          chartArea: { left: 0, right: 100, top: 50, bottom: 50 },
          ctx: {
            createLinearGradient: jasmine.createSpy('createLinearGradient'),
          },
        },
      })
    ).toBe(vFallback);

    expect(hFn({ chart: undefined })).toBe(hFallback);
    expect(
      hFn({
        chart: {
          chartArea: { left: 40, right: 40, top: 0, bottom: 100 },
          ctx: {
            createLinearGradient: jasmine.createSpy('createLinearGradient'),
          },
        },
      })
    ).toBe(hFallback);

    const vAddStop = jasmine.createSpy<(offset: number, color: string) => void>('addColorStop');
    const vGradient: CanvasGradient = { addColorStop: vAddStop };
    const vCreateGrad = jasmine
      .createSpy<(x0: number, y0: number, x1: number, y1: number) => CanvasGradient>(
        'createLinearGradient'
      )
      .and.returnValue(vGradient);

    const vResult = vFn({
      chart: {
        chartArea: { left: 10, right: 200, top: 15, bottom: 215 },
        ctx: { createLinearGradient: vCreateGrad },
      },
    });

    expect(vResult).toBe(vGradient);
    expect(vCreateGrad).toHaveBeenCalledOnceWith(0, 15, 0, 215);
    expect(vAddStop).toHaveBeenCalledWith(0, '#10b981');
    expect(vAddStop).toHaveBeenCalledWith(1, '#059669');

    const hAddStop = jasmine.createSpy<(offset: number, color: string) => void>('addColorStop');
    const hGradient: CanvasGradient = { addColorStop: hAddStop };
    const hCreateGrad = jasmine
      .createSpy<(x0: number, y0: number, x1: number, y1: number) => CanvasGradient>(
        'createLinearGradient'
      )
      .and.returnValue(hGradient);

    const hResult = hFn({
      chart: {
        chartArea: { left: 20, right: 320, top: 10, bottom: 180 },
        ctx: { createLinearGradient: hCreateGrad },
      },
    });

    expect(hResult).toBe(hGradient);
    expect(hCreateGrad).toHaveBeenCalledOnceWith(20, 0, 320, 0);
    expect(hAddStop).toHaveBeenCalledWith(0, '#0ea5e9');
    expect(hAddStop).toHaveBeenCalledWith(1, '#10b981');

    const throwingCtx = {
      createLinearGradient: jasmine
        .createSpy<(x0: number, y0: number, x1: number, y1: number) => CanvasGradient>(
          'createLinearGradient'
        )
        .and.throwError('canvas error'),
    };
    expect(
      vFn({
        chart: {
          chartArea: { left: 0, right: 100, top: 0, bottom: 100 },
          ctx: throwingCtx,
        },
      })
    ).toBe(vFallback);
  });
});

describe('ResumenComponent', () => {
  let fixture: ComponentFixture<ResumenComponent>;
  let component: ResumenComponent;
  let router: Router;
  let dashStub: DashboardServiceStub;
  let apiStub: ApiClientStub;
  let pedidoActionsStub: PedidoActionsStub;

  async function flushAsync(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function setupComponent(options?: {
    pedidosActivos?: Pedido[];
    pedidosDeuda?: Pedido[];
    clientStats?: ClientStatsResponse;
    dashboard?: DashboardUIResponse;
    dashError?: Error;
    skipInitialFlush?: boolean;
    customDashPromise?: Promise<DashboardUIResponse>;
    customActivosPromise?: Promise<Pedido[]>;
    customDeudaPromise?: Promise<Pedido[]>;
    customStatsPromise?: Promise<ClientStatsResponse>;
  }): Promise<void> {
    const activosDefault: Pedido[] = [
      makePedido({
        id: 'ped-1',
        folio: 'PED-001',
        estado: 'lavando',
        cliente_nombre: 'Ana Lopez',
        sucursal_nombre: 'Centro',
        monto_total: 250,
        saldo_pendiente: 120,
        fecha_entrega_estimada: '2026-11-25',
      }),
      makePedido({
        id: 'ped-2',
        folio: 'PED-002',
        estado: 'listo',
        cliente_nombre: 'Luis Gomez',
        sucursal_nombre: 'Norte',
        monto_total: 180,
        saldo_pendiente: 0,
        fecha_entrega_estimada: undefined,
      }),
    ];

    const deudaDefault: Pedido[] = [
      makePedido({
        id: 'deu-1',
        folio: 'PED-101',
        saldo_pendiente: 300,
        fecha_entrega_estimada: formatLocalIsoOffset(1),
      }),
      makePedido({
        id: 'deu-2',
        folio: 'PED-102',
        saldo_pendiente: 200,
        fecha_entrega_estimada: formatLocalIsoOffset(-10),
      }),
    ];

    dashStub = {
      get: jasmine.createSpy('get').and.callFake(() => {
        if (options?.customDashPromise) {
          return options.customDashPromise;
        }
        if (options?.dashError) {
          return Promise.reject(options.dashError);
        }
        return Promise.resolve(options?.dashboard ?? makeDashboardResponse());
      }),
    };

    apiStub = {
      listPedidos: jasmine.createSpy('listPedidos').and.callFake((params?: ListPedidosParams) => {
        if (params?.deuda) {
          return options?.customDeudaPromise ?? Promise.resolve(options?.pedidosDeuda ?? deudaDefault);
        }
        return (
          options?.customActivosPromise ??
          Promise.resolve(options?.pedidosActivos ?? activosDefault)
        );
      }),
      getClientStats: jasmine
        .createSpy('getClientStats')
        .and.callFake(
          () => options?.customStatsPromise ?? Promise.resolve(options?.clientStats ?? makeClientStats())
        ),
    };

    pedidoActionsStub = {
      sendWhatsapp: jasmine.createSpy('sendWhatsapp'),
    };

    await TestBed.configureTestingModule({
      imports: [ResumenComponent],
      providers: [
        { provide: LOCALE_ID, useValue: 'es-MX' },
        provideNoopAnimations(),
        provideRouter([
          { path: 'resumen', component: DummyRouteComponent },
          { path: 'pedidos/nuevo', component: DummyRouteComponent },
          { path: 'pedidos/:id', component: DummyRouteComponent },
          { path: 'movimientos', component: DummyRouteComponent },
          { path: 'movimientos/:id', component: DummyRouteComponent },
          { path: 'deudas', component: DummyRouteComponent },
        ]),
        { provide: DashboardService, useValue: dashStub },
        { provide: ApiClientService, useValue: apiStub },
        { provide: PedidoActionsService, useValue: pedidoActionsStub },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(ResumenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    if (!options?.skipInitialFlush) {
      await flushAsync();
    }
  }

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  describe('Pedidos en Curso', () => {
    it('no renderiza enlace Ver todos ni boton de eliminar y muestra contador, 5 pasos, badges y enlaces', async () => {
      await setupComponent();

      const host = fixture.nativeElement as HTMLElement;
      const allActionTexts = Array.from(host.querySelectorAll('a, button')).map((el) =>
        (el.textContent ?? '').trim().toLowerCase()
      );
      expect(allActionTexts.some((txt) => txt.includes('ver todos'))).toBeFalse();
      expect(allActionTexts.some((txt) => txt.includes('eliminar'))).toBeFalse();

      const allIcons = Array.from(host.querySelectorAll('mat-icon')).map((el) =>
        (el.textContent ?? '').trim()
      );
      expect(allIcons).not.toContain('delete');
      expect(allIcons).not.toContain('delete_outline');

      const allLinks = fixture.debugElement
        .queryAll(By.directive(RouterLink))
        .map((dbg) => router.serializeUrl(dbg.injector.get(RouterLink).urlTree!));
      expect(allLinks).not.toContain('/pedidos');

      expect(host.querySelector('.header-pill--orders')?.textContent?.trim()).toBe('2 activos');

      const orderCards = host.querySelectorAll('.order-card');
      expect(orderCards.length).toBe(2);

      const card1 = orderCards[0] as HTMLElement;
      const steps1 = Array.from(card1.querySelectorAll('.order-progress__step'));
      expect(steps1.length).toBe(5);
      expect(steps1.map((s) => s.getAttribute('title'))).toEqual([
        'Recibido',
        'Lavando',
        'Secando',
        'Doblando',
        'Listo',
      ]);
      expect(steps1[0].classList.contains('is-done')).toBeTrue();
      expect(steps1[1].classList.contains('is-current')).toBeTrue();
      expect(steps1[2].classList.contains('is-done')).toBeFalse();
      expect(steps1[2].classList.contains('is-current')).toBeFalse();
      expect(card1.querySelector('.order-progress')?.getAttribute('aria-label')).toBe(
        'Etapa actual: Lavando'
      );
      expect(card1.querySelector('.order-progress__pct')?.textContent?.trim()).toBe('40%');
      expect(card1.querySelector('.stage-badge')?.classList.contains('stage--lavando')).toBeTrue();
      expect(card1.querySelector('.charge-pill--due')?.textContent?.trim()).toBe('Por cobrar $120');
      expect(card1.querySelector('.charge-pill--paid')).toBeNull();

      const card2 = orderCards[1] as HTMLElement;
      const steps2 = Array.from(card2.querySelectorAll('.order-progress__step'));
      expect(steps2.filter((s) => s.classList.contains('is-done')).length).toBe(4);
      expect(steps2[4].classList.contains('is-current')).toBeTrue();
      expect(card2.querySelector('.order-progress')?.getAttribute('aria-label')).toBe(
        'Etapa actual: Listo'
      );
      expect(card2.querySelector('.order-progress__pct')?.textContent?.trim()).toBe('100%');
      expect(card2.querySelector('.charge-pill--paid')?.textContent?.trim()).toBe('Pagado');
      expect(card2.querySelector('.charge-pill--due')).toBeNull();
      expect(card2.querySelector('.order-due')?.textContent).toContain('Sin fecha');

      const orderDebugEls = fixture.debugElement.queryAll(By.css('.order-card'));
      expect(
        router.serializeUrl(orderDebugEls[0].injector.get(RouterLink).urlTree!)
      ).toBe('/pedidos/ped-1');
      expect(
        router.serializeUrl(orderDebugEls[1].injector.get(RouterLink).urlTree!)
      ).toBe('/pedidos/ped-2');
    });

    it('formatea contador singular 1 activo y soporta las etapas recibido, secando y doblando', async () => {
      await setupComponent({
        pedidosActivos: [makePedido({ id: 'ped-solo', estado: 'secando' })],
      });

      const host = fixture.nativeElement as HTMLElement;
      expect(host.querySelector('.header-pill--orders')?.textContent?.trim()).toBe('1 activo');
      expect(host.querySelector('.order-progress')?.getAttribute('aria-label')).toBe(
        'Etapa actual: Secando'
      );
      expect(host.querySelector('.order-progress__pct')?.textContent?.trim()).toBe('60%');

      fixture.destroy();
      TestBed.resetTestingModule();

      await setupComponent({
        pedidosActivos: [
          makePedido({ id: 'p-rec', estado: 'recibido' }),
          makePedido({ id: 'p-dob', estado: 'doblando' }),
        ],
      });

      const host2 = fixture.nativeElement as HTMLElement;
      const cards = host2.querySelectorAll('.order-card');
      expect(cards[0].querySelector('.order-progress__pct')?.textContent?.trim()).toBe('20%');
      expect(cards[1].querySelector('.order-progress__pct')?.textContent?.trim()).toBe('80%');
    });

    it('boton Compartir invoca pedidoActions.sendWhatsapp y detiene propagacion y preventDefault', async () => {
      const pedidoTarget = makePedido({
        id: 'ped-share',
        folio: 'PED-900',
        estado: 'doblando',
      });
      await setupComponent({ pedidosActivos: [pedidoTarget] });

      const navigateSpy = spyOn(router, 'navigateByUrl').and.resolveTo(true);
      const host = fixture.nativeElement as HTMLElement;
      const shareBtn = host.querySelector('.order-card button.share-pill-btn') as HTMLButtonElement;
      expect(shareBtn).not.toBeNull();
      expect(shareBtn.textContent).toContain('Compartir');

      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      const stopSpy = spyOn(clickEvent, 'stopPropagation').and.callThrough();
      const preventSpy = spyOn(clickEvent, 'preventDefault').and.callThrough();

      shareBtn.dispatchEvent(clickEvent);
      fixture.detectChanges();

      expect(pedidoActionsStub.sendWhatsapp).toHaveBeenCalledOnceWith(pedidoTarget);
      expect(stopSpy).toHaveBeenCalled();
      expect(preventSpy).toHaveBeenCalled();
      expect(clickEvent.defaultPrevented).toBeTrue();
      expect(navigateSpy).not.toHaveBeenCalled();

      // Clic directo en la tarjeta si navega al detalle del pedido
      const orderCard = host.querySelector('.order-card') as HTMLElement;
      orderCard.click();
      fixture.detectChanges();
      expect(navigateSpy).toHaveBeenCalledTimes(1);
      const navigatedTarget = navigateSpy.calls.mostRecent().args[0];
      expect(
        typeof navigatedTarget === 'string'
          ? navigatedTarget
          : router.serializeUrl(navigatedTarget)
      ).toBe('/pedidos/ped-share');
    });
  });

  describe('KPIs PopsConsole', () => {
    it('renderiza Balance, Ingresos mes, Egresos mes y Cartera Vencida con enlaces y queryParams', async () => {
      await setupComponent();

      const host = fixture.nativeElement as HTMLElement;
      const heroCard = host.querySelector('a.kpi-card--hero') as HTMLAnchorElement;
      const ingresoCard = host.querySelector('a.kpi-card--ingreso') as HTMLAnchorElement;
      const egresoCard = host.querySelector('a.kpi-card--egreso') as HTMLAnchorElement;
      const deudaCard = host.querySelector('a.kpi-card--deuda') as HTMLAnchorElement;

      expect(heroCard.querySelector('.kpi-label')?.textContent?.trim()).toBe('Balance');
      expect(heroCard.querySelector('.kpi-value')?.textContent?.trim()).toBe('$15,000');
      expect(heroCard.querySelector('.kpi-subtitle')?.textContent?.trim()).toBe(
        'Margen neto: 75% sobre ingresos'
      );
      expect(heroCard.classList.contains('negativo')).toBeFalse();

      expect(ingresoCard.querySelector('.kpi-label')?.textContent?.trim()).toBe('Ingresos mes');
      expect(ingresoCard.querySelector('.kpi-value')?.textContent?.trim()).toBe('$20,000');

      expect(egresoCard.querySelector('.kpi-label')?.textContent?.trim()).toBe('Egresos mes');
      expect(egresoCard.querySelector('.kpi-value')?.textContent?.trim()).toBe('$5,000');

      expect(deudaCard.querySelector('.kpi-label')?.textContent?.trim()).toBe(
        'Cartera Vencida (Al Día)'
      );
      expect(deudaCard.querySelector('.kpi-value')?.textContent?.trim()).toBe('$500');
      expect(deudaCard.querySelector('.kpi-subtitle')?.textContent?.trim()).toBe(
        '2 pedidos con saldo pendiente'
      );

      expect(heroCard.getAttribute('href')).toBe('/movimientos');
      expect(ingresoCard.getAttribute('href')).toBe('/movimientos?tipo=ingreso');
      expect(egresoCard.getAttribute('href')).toBe('/movimientos?tipo=egreso');
      expect(deudaCard.getAttribute('href')).toBe('/deudas');
    });

    it('aplica clase .negativo cuando balanceMes < 0 y muestra subtitulo singular de deuda', async () => {
      await setupComponent({
        dashboard: makeDashboardResponse({
          kpis_mes: { ingresos: 0, egresos: 4200, balance: -4200 },
        }),
        pedidosDeuda: [
          makePedido({
            id: 'deu-unica',
            saldo_pendiente: 350,
            fecha_entrega_estimada: formatLocalIsoOffset(-2),
          }),
        ],
      });

      const host = fixture.nativeElement as HTMLElement;
      const heroCard = host.querySelector('a.kpi-card--hero') as HTMLAnchorElement;
      const deudaCard = host.querySelector('a.kpi-card--deuda') as HTMLAnchorElement;

      expect(heroCard.classList.contains('negativo')).toBeTrue();
      expect(heroCard.querySelector('.kpi-value')?.textContent?.trim()).toBe('-$4,200');
      expect(heroCard.querySelector('.kpi-subtitle')?.textContent?.trim()).toBe(
        'Sin ingresos registrados en el mes'
      );

      expect(deudaCard.querySelector('.kpi-value')?.textContent?.trim()).toBe('$350');
      expect(deudaCard.querySelector('.kpi-subtitle')?.textContent?.trim()).toBe(
        '1 pedido con saldo pendiente'
      );
    });

    it('muestra Sin saldos pendientes cuando no hay pedidos adeudados', async () => {
      await setupComponent({ pedidosDeuda: [] });

      const host = fixture.nativeElement as HTMLElement;
      const deudaCard = host.querySelector('a.kpi-card--deuda') as HTMLAnchorElement;
      expect(deudaCard.querySelector('.kpi-value')?.textContent?.trim()).toBe('$0');
      expect(deudaCard.querySelector('.kpi-subtitle')?.textContent?.trim()).toBe(
        'Sin saldos pendientes'
      );
    });
  });

  describe('6 Graficas y selector de rango', () => {
    it('renderiza las 6 .chart-card con cabeceras tematicas, insight pills y tipos esperados', async () => {
      await setupComponent();

      expect(component.mainChartType).toBe('line');
      expect(component.barIngresoOptions.indexAxis).toBe('y');
      expect(component.barEgresoOptions.indexAxis).toBe('y');

      const host = fixture.nativeElement as HTMLElement;
      const chartCards = Array.from(host.querySelectorAll('.chart-card'));
      expect(chartCards.length).toBe(6);

      const titles = chartCards.map(
        (card) => card.querySelector('.chart-card__title')?.textContent?.trim() ?? ''
      );
      expect(titles).toEqual([
        'Ingresos vs Egresos',
        'Gravedad de Cartera Adeudada',
        'Actividad de Clientes',
        'Por sucursal (mes)',
        'Por categoría (Ingresos · mes)',
        'Por categoría (Egresos · mes)',
      ]);

      const pills = chartCards.map(
        (card) => card.querySelector('.chart-insight-pill')?.textContent?.trim() ?? ''
      );
      expect(pills).toEqual([
        '+$15,000',
        '50% riesgo crítico',
        '60% activos',
        'Líder: Centro ($13,000)',
        'Lavado por kilo: $14,000 (70%)',
        'Insumos: $3,500 (70%)',
      ]);

      expect(host.querySelectorAll('.chart-card canvas').length).toBe(6);
    });

    it('cambiar rango a 6m y 12m solo consulta DashboardService con limit_recientes: 5 sin recargar pedidos ni clientes', async () => {
      await setupComponent();

      expect(apiStub.listPedidos).toHaveBeenCalledTimes(2);
      expect(apiStub.getClientStats).toHaveBeenCalledTimes(1);
      expect(dashStub.get).toHaveBeenCalledOnceWith(
        jasmine.objectContaining({
          include: 'mes,recientes',
          limit_recientes: 5,
        })
      );

      apiStub.listPedidos.calls.reset();
      apiStub.getClientStats.calls.reset();
      dashStub.get.calls.reset();

      const host = fixture.nativeElement as HTMLElement;
      const rangeBtns = Array.from(host.querySelectorAll('button.range-pill')) as HTMLButtonElement[];
      const btn6m = rangeBtns.find((b) => b.textContent?.trim() === '6m') as HTMLButtonElement;
      const btn12m = rangeBtns.find((b) => b.textContent?.trim() === '12m') as HTMLButtonElement;

      btn6m.click();
      await flushAsync();

      const expected6m = calculateRangeDates('6m');
      expect(component.range()).toBe('6m');
      expect(component.rangeSubtitle()).toBe('Últimos 6 meses · Vista mensual');
      expect(dashStub.get).toHaveBeenCalledOnceWith({
        desde: expected6m.desde,
        hasta: expected6m.hasta,
        include: 'mes,recientes',
        limit_recientes: 5,
      });
      expect(apiStub.listPedidos).not.toHaveBeenCalled();
      expect(apiStub.getClientStats).not.toHaveBeenCalled();

      dashStub.get.calls.reset();
      btn12m.click();
      await flushAsync();

      const expected12m = calculateRangeDates('12m');
      expect(component.range()).toBe('12m');
      expect(component.rangeSubtitle()).toBe('Últimos 12 meses · Vista mensual');
      expect(dashStub.get).toHaveBeenCalledOnceWith({
        desde: expected12m.desde,
        hasta: expected12m.hasta,
        include: 'mes,recientes',
        limit_recientes: 5,
      });
      expect(apiStub.listPedidos).not.toHaveBeenCalled();
      expect(apiStub.getClientStats).not.toHaveBeenCalled();

      // Clic redundante en rango ya activo sin error no dispara peticion
      dashStub.get.calls.reset();
      btn12m.click();
      await flushAsync();
      expect(dashStub.get).not.toHaveBeenCalled();
    });

    it('protege contra respuestas fuera de orden al cambiar rango rapidamente (fetchSeq)', async () => {
      await setupComponent();

      const req6m = createDeferred<DashboardUIResponse>();
      const req12m = createDeferred<DashboardUIResponse>();
      dashStub.get.calls.reset();
      dashStub.get.and.returnValues(req6m.promise, req12m.promise);

      void component.setRange('6m');
      fixture.detectChanges();
      expect(component.rangeLoading()).toBeTrue();
      expect((fixture.nativeElement as HTMLElement).querySelector('.range-status')).not.toBeNull();

      void component.setRange('12m');
      fixture.detectChanges();

      // Llega primero la respuesta mas reciente (12m)
      req12m.resolve(
        makeDashboardResponse({
          kpis_mes: { ingresos: 30000, egresos: 8000, balance: 22000 },
          por_dia: [{ fecha: '2026-06-15', ingresos: 30000, egresos: 8000, balance: 22000 }],
        })
      );
      await flushAsync();

      expect(component.range()).toBe('12m');
      expect(component.rangeLoading()).toBeFalse();
      expect(component.balanceMes()).toBe(22000);

      // Llega tarde la respuesta obsoleta (6m) y debe ser ignorada
      req6m.resolve(
        makeDashboardResponse({
          kpis_mes: { ingresos: 99999, egresos: 0, balance: 99999 },
          por_dia: [{ fecha: '2026-09-15', ingresos: 99999, egresos: 0, balance: 99999 }],
        })
      );
      await flushAsync();

      expect(component.range()).toBe('12m');
      expect(component.balanceMes()).toBe(22000);
      expect(component.error()).toBeNull();
    });

    it('ignora errores tardios de una peticion de rango obsoleta', async () => {
      await setupComponent();

      const req6m = createDeferred<DashboardUIResponse>();
      const req12m = createDeferred<DashboardUIResponse>();
      dashStub.get.calls.reset();
      dashStub.get.and.returnValues(req6m.promise, req12m.promise);

      void component.setRange('6m');
      void component.setRange('12m');

      req12m.resolve(
        makeDashboardResponse({
          kpis_mes: { ingresos: 18000, egresos: 3000, balance: 15000 },
        })
      );
      await flushAsync();

      req6m.reject(new Error('Timeout obsoleto'));
      await flushAsync();

      expect(component.error()).toBeNull();
      expect(component.balanceMes()).toBe(15000);
      expect(component.rangeLoading()).toBeFalse();
    });
  });

  describe('Ultimos Movimientos', () => {
    it('limita a maximo 5 .recent-card, renderiza metadatos, signo unico y aisla clic en chip de pedido', async () => {
      const sevenRecientes: DashboardReciente[] = [
        makeReciente({
          id: 'mov-1',
          tipo: 'ingreso',
          categoria: 'Lavado por kilo',
          sucursal_nombre: 'Centro',
          metodo_pago: 'mercado_pago',
          nota: '  Pago completo  ',
          pedido_id: 'ped-10',
          pedido_folio: 'PED-010',
          monto: 450,
        }),
        makeReciente({
          id: 'mov-2',
          tipo: 'egreso',
          categoria: 'Insumos',
          sucursal_nombre: 'Norte',
          metodo_pago: 'transferencia',
          nota: 'Compra suavizante',
          pedido_id: 'ped-11',
          pedido_folio: null,
          monto: -180,
        }),
        makeReciente({
          id: 'mov-3',
          tipo: 'ingreso',
          categoria: 'Planchado',
          sucursal_nombre: 'Sur',
          metodo_pago: 'metodo_desconocido',
          nota: '   ',
          pedido_id: null,
          pedido_folio: null,
          monto: 120,
        }),
        makeReciente({ id: 'mov-4', tipo: 'egreso', monto: 90 }),
        makeReciente({ id: 'mov-5', tipo: 'ingreso', monto: 210 }),
        makeReciente({ id: 'mov-6', tipo: 'ingreso', monto: 330 }),
        makeReciente({ id: 'mov-7', tipo: 'egreso', monto: 440 }),
      ];

      await setupComponent({
        dashboard: makeDashboardResponse({ recientes: sevenRecientes }),
      });

      const host = fixture.nativeElement as HTMLElement;
      expect(host.querySelector('.header-pill--recent')?.textContent?.trim()).toBe('Últimos 5');

      const cards = host.querySelectorAll('.recent-card');
      expect(cards.length).toBe(5);

      const card1 = cards[0] as HTMLElement;
      expect(card1.classList.contains('is-egreso')).toBeFalse();
      expect(card1.querySelector('.branch-pill')?.textContent).toContain('Centro');
      expect(card1.querySelector('.method-pill')?.textContent?.trim()).toBe('Mercado Pago');
      expect(card1.querySelector('.recent-card__note')?.textContent?.trim()).toBe('Pago completo');
      expect(card1.querySelector('.recent-card__amount')?.textContent?.trim()).toBe('+$450');
      expect(card1.querySelector('.recent-card__amount')?.classList.contains('neg')).toBeFalse();

      const chip1 = card1.querySelector('a.pedido-chip') as HTMLAnchorElement;
      expect(chip1).not.toBeNull();
      expect(chip1.textContent).toContain('PED-010');
      expect(chip1.getAttribute('href')).toBe('/pedidos/ped-10');

      const card2 = cards[1] as HTMLElement;
      expect(card2.classList.contains('is-egreso')).toBeTrue();
      expect(card2.querySelector('.branch-pill')?.textContent).toContain('Norte');
      expect(card2.querySelector('.method-pill')?.textContent?.trim()).toBe('Transferencia');
      expect(card2.querySelector('.recent-card__note')?.textContent?.trim()).toBe(
        'Compra suavizante'
      );
      expect(card2.querySelector('.recent-card__amount')?.textContent?.trim()).toBe('-$180');
      expect(card2.querySelector('.recent-card__amount')?.classList.contains('neg')).toBeTrue();

      const chip2 = card2.querySelector('a.pedido-chip') as HTMLAnchorElement;
      expect(chip2).not.toBeNull();
      expect(chip2.textContent).toContain('Pedido');
      expect(chip2.getAttribute('href')).toBe('/pedidos/ped-11');

      const card3 = cards[2] as HTMLElement;
      expect(card3.querySelector('a.pedido-chip')).toBeNull();
      expect(card3.querySelector('.recent-card__note')).toBeNull();
      expect(card3.querySelector('.method-pill')).toBeNull();

      const recentDebugCards = fixture.debugElement.queryAll(By.css('.recent-card'));
      expect(
        router.serializeUrl(recentDebugCards[0].injector.get(RouterLink).urlTree!)
      ).toBe('/movimientos/mov-1');
      expect(
        router.serializeUrl(recentDebugCards[1].injector.get(RouterLink).urlTree!)
      ).toBe('/movimientos/mov-2');

      const navigateSpy = spyOn(router, 'navigateByUrl').and.resolveTo(true);
      const chipClick = new MouseEvent('click', { bubbles: true, cancelable: true });
      const stopSpy = spyOn(chipClick, 'stopPropagation').and.callThrough();

      chip1.dispatchEvent(chipClick);
      fixture.detectChanges();

      expect(stopSpy).toHaveBeenCalled();
      expect(navigateSpy).toHaveBeenCalledTimes(1);
      const chipNavTarget = navigateSpy.calls.mostRecent().args[0];
      expect(
        typeof chipNavTarget === 'string' ? chipNavTarget : router.serializeUrl(chipNavTarget)
      ).toBe('/pedidos/ped-10');

      navigateSpy.calls.reset();
      card1.click();
      fixture.detectChanges();
      expect(navigateSpy).toHaveBeenCalledTimes(1);
      const cardNavTarget = navigateSpy.calls.mostRecent().args[0];
      expect(
        typeof cardNavTarget === 'string' ? cardNavTarget : router.serializeUrl(cardNavTarget)
      ).toBe('/movimientos/mov-1');
    });
  });

  describe('Estados de carga, error y vacios', () => {
    it('muestra skeleton .resumen-skeleton mientras loading() es true y lo oculta al resolver', async () => {
      const activosDef = createDeferred<Pedido[]>();
      const deudaDef = createDeferred<Pedido[]>();
      const statsDef = createDeferred<ClientStatsResponse>();
      const dashDef = createDeferred<DashboardUIResponse>();

      await setupComponent({
        skipInitialFlush: true,
        customActivosPromise: activosDef.promise,
        customDeudaPromise: deudaDef.promise,
        customStatsPromise: statsDef.promise,
        customDashPromise: dashDef.promise,
      });

      const host = fixture.nativeElement as HTMLElement;
      expect(component.loading()).toBeTrue();
      const skeleton = host.querySelector('.resumen-skeleton');
      expect(skeleton).not.toBeNull();
      expect(skeleton?.getAttribute('aria-busy')).toBe('true');
      expect(host.querySelector('.resumen-section')).toBeNull();
      expect(host.querySelector('.state-card--error')).toBeNull();

      activosDef.resolve([makePedido()]);
      deudaDef.resolve([]);
      statsDef.resolve(makeClientStats());
      dashDef.resolve(makeDashboardResponse());
      await flushAsync();

      expect(component.loading()).toBeFalse();
      expect(host.querySelector('.resumen-skeleton')).toBeNull();
      expect(host.querySelectorAll('.resumen-section').length).toBe(3);
    });

    it('muestra estado de error .state-card--error y Reintentar recarga exitosamente', async () => {
      await setupComponent({
        dashError: new Error('Error de conexion con el servidor'),
      });

      const host = fixture.nativeElement as HTMLElement;
      const errorCard = host.querySelector('.state-card--error') as HTMLElement;
      expect(errorCard).not.toBeNull();
      expect(errorCard.getAttribute('role')).toBe('alert');
      expect(errorCard.textContent).toContain('Error de conexion con el servidor');
      expect(host.querySelector('.resumen-skeleton')).toBeNull();

      dashStub.get.and.resolveTo(makeDashboardResponse());
      const retryBtn = errorCard.querySelector('button.retry-btn') as HTMLButtonElement;
      expect(retryBtn).not.toBeNull();
      expect(retryBtn.textContent).toContain('Reintentar');

      retryBtn.click();
      await flushAsync();

      expect(host.querySelector('.state-card--error')).toBeNull();
      expect(host.querySelector('.kpi-card--hero .kpi-value')?.textContent?.trim()).toBe('$15,000');
      expect(host.querySelectorAll('.order-card').length).toBe(2);
    });

    it('renderiza estados vacios de pedidos con CTA Recibir Pedido, graficas vacias y movimientos vacios', async () => {
      await setupComponent({
        pedidosActivos: [],
        pedidosDeuda: [],
        clientStats: makeClientStats({
          total: 0,
          segmentos: { active_0_15: 0, risk_16_45: 0, lost_45plus: 0 },
        }),
        dashboard: makeDashboardResponse({
          kpis_mes: { ingresos: 0, egresos: 0, balance: 0 },
          por_dia: [],
          por_sucursal_mes: [],
          por_categoria_mes: { ingreso: [], egreso: [] },
          recientes: [],
        }),
      });

      const host = fixture.nativeElement as HTMLElement;

      expect(host.querySelector('.header-pill--orders')?.textContent?.trim()).toBe('0 activos');
      const emptyOrders = host.querySelector('.empty-orders') as HTMLElement;
      expect(emptyOrders).not.toBeNull();
      expect(emptyOrders.textContent).toContain('Todo al día');

      const emptyCta = emptyOrders.querySelector('a.empty-cta') as HTMLAnchorElement;
      expect(emptyCta).not.toBeNull();
      expect(emptyCta.textContent).toContain('Recibir Pedido');
      expect(emptyCta.getAttribute('href')).toBe('/pedidos/nuevo');

      expect(host.querySelector('.kpi-card--hero .kpi-subtitle')?.textContent?.trim()).toBe(
        'Sin movimientos en el mes'
      );
      expect(host.querySelector('.kpi-card--deuda .kpi-subtitle')?.textContent?.trim()).toBe(
        'Sin saldos pendientes'
      );

      expect(host.querySelectorAll('.chart-card canvas').length).toBe(0);
      expect(host.querySelectorAll('.chart-card .chart-empty').length).toBe(4);
      expect(host.querySelectorAll('.chart-card .donut-empty-ring').length).toBe(2);
      expect(host.querySelector('.chart-card--trend .chart-empty')?.textContent).toContain(
        'Sin movimientos registrados en este rango.'
      );
      expect(
        host.querySelector('.chart-card--deuda .donut-center__value')?.textContent?.trim()
      ).toBe('0');
      expect(
        host.querySelector('.chart-card--clientes .donut-center__value')?.textContent?.trim()
      ).toBe('0');

      expect(host.querySelectorAll('.recent-card').length).toBe(0);
      const emptyRecent = host.querySelector('.empty-recent') as HTMLElement;
      expect(emptyRecent).not.toBeNull();
      expect(emptyRecent.textContent).toContain('Aún no hay movimientos registrados.');
    });
  });
});
