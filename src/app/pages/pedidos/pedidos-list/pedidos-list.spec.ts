import { registerLocaleData } from '@angular/common';
import localeEsMX from '@angular/common/locales/es-MX';
import { Component, LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { MatDialog, type MatDialogConfig } from '@angular/material/dialog';
import { MatSnackBar, type MatSnackBarConfig } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { EMPTY, type Observable, of } from 'rxjs';
import { ApiClientService } from '../../../core/api-client.service';
import type {
  Categoria, Pedido, PedidoEstadoFilter, PedidosPaginadosQueryParams, PedidosPaginadosResponse,
  PedidosPorEstadoCount, PedidosResumen, PedidoUpdatePayload, Sucursal,
} from '../../../core/models';
import { PedidoActionsService } from '../../../core/pedido-actions.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EntregaDialogComponent, type EntregaDialogResponse } from '../dialogs/entrega-dialog.component';
import { QrScannerDialogComponent } from '../dialogs/qr-scanner-dialog.component';
import { TicketDialogComponent } from '../dialogs/ticket-dialog.component';
import {
  calculateHistorialDateRange, calculateOrderCardProgress, canJumpToReady,
  extractScannedOrderQuery, formatLocalDateFromInput, getNextStatusAction,
  getOrderUrgencyInfo, isValidDateRange, parseLocalDateInput,
} from '../pedidos.helpers';
import { PedidosListComponent } from './pedidos-list';

registerLocaleData(localeEsMX);

@Component({ standalone: true, template: '' })
class DummyRouteComponent {}

interface ApiClientStub {
  listSucursales: jasmine.Spy<(params?: { activo?: number }) => Promise<Sucursal[]>>;
  listCategorias: jasmine.Spy<(tipo?: 'ingreso' | 'egreso') => Promise<Categoria[]>>;
  listPedidosPaginados: jasmine.Spy<(params?: PedidosPaginadosQueryParams) => Promise<PedidosPaginadosResponse>>;
  updatePedido: jasmine.Spy<(id: string, patch: PedidoUpdatePayload) => Promise<Pedido>>;
  deletePedido: jasmine.Spy<(id: string) => Promise<{ ok: boolean }>>;
  notificarPedidoWhatsapp: jasmine.Spy<(id: string) => Promise<{ ok: boolean; proveedor: string; motivo?: string }>>;
}

interface SnackBarStub {
  open: jasmine.Spy<(msg: string, action?: string, cfg?: MatSnackBarConfig) => { onAction: () => Observable<void> }>;
}

interface DialogStub {
  open: jasmine.Spy<(cmp: unknown, cfg?: MatDialogConfig<unknown>) => { afterClosed: () => Observable<unknown> }>;
}

interface SetupOpts {
  sucursales?: Sucursal[];
  response?: PedidosPaginadosResponse;
  listError?: Error;
}

interface ResumenOverrides extends Partial<Omit<PedidosResumen, 'por_estado'>> {
  por_estado?: Partial<PedidosPorEstadoCount>;
}

const dialogRefOf = <R>(res: R): { afterClosed: () => Observable<R> } => ({ afterClosed: () => of(res) });

function createDeferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (r?: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (r?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function queryReq<T extends Element>(root: ParentNode, sel: string): T {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`Elemento no encontrado: ${sel}`);
  return el;
}

function findBtn(root: ParentNode, sel: string, text: string): HTMLButtonElement {
  const btn = Array.from(root.querySelectorAll<HTMLButtonElement>(sel)).find((b) => (b.textContent ?? '').includes(text));
  if (!btn) throw new Error(`Boton "${text}" no encontrado en ${sel}`);
  return btn;
}

function scanKeys(target: EventTarget, code: string): KeyboardEvent {
  for (const key of code) target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  const enterEv = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  target.dispatchEvent(enterEv);
  return enterEv;
}

function makeSucursales(count: number): Sucursal[] {
  const names = ['Centro', 'Norte', 'Sur', 'Poniente', 'Oriente', 'Polanco'];
  return Array.from({ length: count }, (_, i) => ({
    id: `suc-${i + 1}`, org_id: 'org-1', nombre: names[i] ?? `Sucursal ${i + 1}`, activo: true,
  }));
}

function makePedido(overrides: Partial<Pedido> = {}): Pedido {
  return {
    id: 'ped-1', org_id: 'org-1', folio: 'LAV-1001', cliente_id: 'cli-1',
    cliente_nombre: 'Ana Lopez', cliente_telefono: '5512345678',
    sucursal_id: 'suc-1', sucursal_nombre: 'Centro', descripcion: '3 kg ropa diaria',
    estado: 'recibido', monto_total: 250, saldo_pendiente: 120,
    fecha_entrega_estimada: '2026-11-25', whatsapp_automatico: false, ...overrides,
  };
}

function makePage(data: Pedido[], count = data.length, overrides: ResumenOverrides = {}): PedidosPaginadosResponse {
  const { por_estado, ...rest } = overrides;
  return {
    data,
    count,
    resumen: {
      total: 5, en_proceso: 3, listos: 2, por_cobrar_count: 3, por_cobrar_monto: 1450, ...rest,
      por_estado: { recibido: 1, lavando: 1, secando: 1, doblando: 0, listo: 2, entregado: 0, cancelado: 0, ...por_estado },
    },
  };
}

describe('pedidos.helpers', () => {
  it('calcula rangos de historial, parsea y formatea fechas locales sin desfase UTC y valida rangos', () => {
    const ref = new Date(2026, 2, 3, 23, 59, 59);
    expect(calculateHistorialDateRange('todo', ref)).toEqual({ desde: '', hasta: '' });
    expect(calculateHistorialDateRange('custom', ref)).toEqual({ desde: '', hasta: '' });
    expect(calculateHistorialDateRange('hoy', ref)).toEqual({ desde: '2026-03-03', hasta: '2026-03-03' });
    expect(calculateHistorialDateRange('7d', ref)).toEqual({ desde: '2026-02-25', hasta: '2026-03-03' });
    expect(calculateHistorialDateRange('mes', ref)).toEqual({ desde: '2026-03-01', hasta: '2026-03-03' });

    const jan1 = parseLocalDateInput('2026-01-01');
    expect([jan1?.getFullYear(), jan1?.getMonth(), jan1?.getDate()]).toEqual([2026, 0, 1]);
    expect(parseLocalDateInput('2024-02-29')?.getDate()).toBe(29);
    for (const bad of ['2026-02-31', '2026-02-29', '2026-13-01', null]) expect(parseLocalDateInput(bad)).toBeNull();

    expect(formatLocalDateFromInput('2026-11-27')).toBe('2026-11-27');
    expect(formatLocalDateFromInput(new Date(2026, 10, 5, 23, 55, 0))).toBe('2026-11-05');
    expect(formatLocalDateFromInput('2026-11-15T14:30:00')).toBe('2026-11-15');
    expect(formatLocalDateFromInput('2026-02-31')).toBe('');
    expect(formatLocalDateFromInput('2026-11-15 25:00:00')).toBe('');

    expect(isValidDateRange('', '')).toBeTrue();
    expect(isValidDateRange('2026-11-01', '2026-11-20')).toBeTrue();
    expect(isValidDateRange('2026-11-10', '2026-11-10')).toBeTrue();
    expect(isValidDateRange('2026-11-21', '2026-11-20')).toBeFalse();
    expect(isValidDateRange('2026-02-31', '2026-03-01')).toBeFalse();
  });

  it('extrae codigos escaneados, urgencia, siguiente accion, salto a listo y progreso', () => {
    const scanCases: ReadonlyArray<[string, string]> = [
      ['  lav-ab12  ', 'LAV-AB12'],
      ['https://app.nanoclean.mx/rastreo/org-1/lav-9x8k', 'LAV-9X8K'],
      ['https://app.nanoclean.mx/rastreo/org-1/PED-7788', 'PED-7788'],
      ['https://app.nanoclean.mx/pedidos/ped-42', 'ped-42'],
      ['https://app.nanoclean.mx/pedidos?q=maria%20lopez', 'maria lopez'],
      ['?folio=ORD-551', 'ORD-551'],
      ['{"folio":"lav-3344"}', 'LAV-3344'],
      ['{"pedido_id":908}', '908'],
      ['   ', ''],
    ];
    for (const [raw, expected] of scanCases) expect(extractScannedOrderQuery(raw)).toBe(expected);

    const ref = new Date(2026, 10, 20, 12, 0, 0);
    expect(getOrderUrgencyInfo('2026-11-18', ref)).toEqual({ label: 'Vencido', tone: 'overdue', daysDiff: -2 });
    expect(getOrderUrgencyInfo('2026-11-20', ref)).toEqual({ label: 'Hoy', tone: 'today', daysDiff: 0 });
    expect(getOrderUrgencyInfo('2026-11-21', ref)).toEqual({ label: 'Mañana', tone: 'tomorrow', daysDiff: 1 });
    const upcoming = getOrderUrgencyInfo('2026-11-25', ref);
    expect(upcoming?.tone).toBe('upcoming');
    expect(upcoming?.daysDiff).toBe(5);
    expect(upcoming?.label).toMatch(/^25\s+nov$/i);
    expect(getOrderUrgencyInfo('2026-02-31', ref)).toBeNull();

    const transitions: ReadonlyArray<[string, PedidoEstadoFilter | null, boolean, number]> = [
      ['recibido', 'lavando', false, 20], ['lavando', 'secando', false, 40],
      ['en_proceso', 'listo', false, 50], ['secando', 'doblando', false, 60],
      ['doblando', 'listo', false, 80], ['listo', 'entregado', false, 100],
      ['entregado', null, false, 100], ['cancelado', null, false, 0],
    ];
    for (const [estado, next, jump, pct] of transitions) {
      expect(getNextStatusAction(estado)?.next ?? null).toBe(next);
      expect(canJumpToReady(estado)).toBe(jump);
      expect(calculateOrderCardProgress(estado)).toBe(pct);
    }
  });
});

describe('PedidosListComponent', () => {
  let fixture: ComponentFixture<PedidosListComponent> | null = null;
  let component: PedidosListComponent;
  let apiStub: ApiClientStub;
  let snackStub: SnackBarStub;
  let dialogStub: DialogStub;
  let actionsStub: { sendWhatsapp: jasmine.Spy<(pedido: Pedido) => void> };

  afterEach(() => {
    fixture?.destroy();
    fixture = null;
    TestBed.resetTestingModule();
  });

  const getHost = (): HTMLElement => {
    if (!fixture) throw new Error('Fixture no inicializado');
    return fixture.nativeElement as HTMLElement;
  };
  const lastParams = (): PedidosPaginadosQueryParams | undefined =>
    apiStub.listPedidosPaginados.calls.mostRecent().args[0];

  async function flush(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    if (fixture) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  async function clickAndFlush(el: HTMLElement): Promise<void> {
    el.click();
    await flush();
  }

  function openFilters(): void {
    if (!component.filtersExpanded()) {
      queryReq<HTMLButtonElement>(getHost(), 'button.filters-toggle-btn').click();
      fixture?.detectChanges();
    }
  }

  async function changeVal(el: HTMLInputElement | HTMLSelectElement, val: string): Promise<void> {
    el.value = val;
    el.dispatchEvent(new Event('change'));
    await flush();
  }

  async function configureModule(opts?: SetupOpts): Promise<void> {
    const defaults = [
      makePedido({ id: 'ped-1', folio: 'LAV-1001', estado: 'recibido', saldo_pendiente: 120 }),
      makePedido({ id: 'ped-2', folio: 'LAV-1002', estado: 'listo', saldo_pendiente: 0 }),
    ];
    apiStub = {
      listSucursales: jasmine.createSpy('listSucursales').and.resolveTo(opts?.sucursales ?? makeSucursales(3)),
      listCategorias: jasmine.createSpy('listCategorias').and.resolveTo([]),
      listPedidosPaginados: jasmine.createSpy('listPedidosPaginados').and.callFake(() =>
        opts?.listError ? Promise.reject(opts.listError) : Promise.resolve(opts?.response ?? makePage(defaults, 2))
      ),
      updatePedido: jasmine.createSpy('updatePedido').and.callFake((id: string, patch: PedidoUpdatePayload) =>
        Promise.resolve(makePedido({ id, estado: patch.estado ?? 'recibido', saldo_pendiente: patch.monto_cobrado ? 0 : 120 }))
      ),
      deletePedido: jasmine.createSpy('deletePedido').and.resolveTo({ ok: true }),
      notificarPedidoWhatsapp: jasmine.createSpy('notificarPedidoWhatsapp').and.resolveTo({ ok: true, proveedor: 'meta' }),
    };
    snackStub = { open: jasmine.createSpy('open').and.callFake(() => ({ onAction: () => EMPTY })) };
    dialogStub = { open: jasmine.createSpy('open').and.callFake(() => dialogRefOf(undefined)) };
    actionsStub = { sendWhatsapp: jasmine.createSpy('sendWhatsapp') };

    await TestBed.configureTestingModule({
      imports: [PedidosListComponent],
      providers: [
        { provide: LOCALE_ID, useValue: 'es-MX' },
        provideNoopAnimations(),
        provideRouter([
          { path: 'pedidos/nuevo', component: DummyRouteComponent },
          { path: 'pedidos/:id', component: DummyRouteComponent },
        ]),
        { provide: ApiClientService, useValue: apiStub },
        { provide: MatSnackBar, useValue: snackStub },
        { provide: MatDialog, useValue: dialogStub },
        { provide: PedidoActionsService, useValue: actionsStub },
      ],
    })
      .overrideProvider(MatSnackBar, { useValue: snackStub })
      .overrideProvider(MatDialog, { useValue: dialogStub })
      .compileComponents();
  }

  async function setup(opts?: SetupOpts): Promise<void> {
    await configureModule(opts);
    fixture = TestBed.createComponent(PedidosListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await flush();
  }

  describe('Activos, KPIs y sucursales', () => {
    it('carga activos iniciales, renderiza KPIs con monto MXN y conteos vivos por etapa', async () => {
      await setup({
        response: makePage([makePedido({ estado: 'lavando' })], 1, {
          total: 7, en_proceso: 5, listos: 2, por_cobrar_count: 3, por_cobrar_monto: 1450,
          por_estado: { recibido: 1, lavando: 2, secando: 1, doblando: 1, listo: 2 },
        }),
      });
      expect(apiStub.listPedidosPaginados).toHaveBeenCalledOnceWith({
        activo: true, q: undefined, sucursal_id: undefined, estado: undefined, limit: 100, offset: 0,
      });
      const host = getHost();
      expect(host.querySelector('.new-order-btn')).toBeNull();
      expect(component.filtersExpanded()).toBeFalse();
      expect(host.querySelector('.filter-toolbar')).toBeNull();
      expect(queryReq(host, '.kpi-card--proceso .kpi-val').textContent?.trim()).toBe('5');
      expect(queryReq(host, '.kpi-card--proceso .kpi-sub').textContent?.trim()).toBe('7 activos en total');
      expect(queryReq(host, '.kpi-card--listos .kpi-val').textContent?.trim()).toBe('2');
      expect(queryReq(host, '.kpi-card--cobrar .kpi-val').textContent?.trim()).toBe('$1,450');
      expect(queryReq(host, '.kpi-card--cobrar .kpi-sub').textContent?.trim()).toBe('3 pedidos con saldo');
      openFilters();
      expect(Array.from(host.querySelectorAll('.stage-chip .chip-cnt')).map((el) => el.textContent?.trim())).toEqual([
        '7', '1', '2', '1', '1', '2',
      ]);
      const steps = Array.from(host.querySelectorAll('.order-progress__step'));
      expect(steps.length).toBe(5);
      expect(steps[0].classList.contains('is-done')).toBeTrue();
      expect(steps[1].classList.contains('is-current')).toBeTrue();
      expect(steps[2].classList.contains('is-done') || steps[2].classList.contains('is-current')).toBeFalse();
      expect(queryReq(host, '.order-progress__label').textContent).toContain('Lavando');
      expect(queryReq(host, '.order-progress__pct').textContent?.trim()).toBe('40%');
    });

    it('KPIs Listos, Por cobrar y En proceso alternan filtros y chips filtran etapa', async () => {
      await setup();
      const host = getHost();
      const listosBtn = queryReq<HTMLButtonElement>(host, '.kpi-card--listos');

      await clickAndFlush(listosBtn);
      expect(component.estadoFiltro()).toBe('listo');
      expect(queryReq(host, '.filters-toggle-btn .flt-badge').textContent?.trim()).toBe('1');
      await clickAndFlush(listosBtn);
      expect(component.estadoFiltro()).toBe('');

      await clickAndFlush(listosBtn);
      await clickAndFlush(queryReq<HTMLButtonElement>(host, '.kpi-card--cobrar'));
      expect(component.soloPorCobrar()).toBeTrue();
      expect(lastParams()).toEqual(jasmine.objectContaining({ activo: true, estado: 'listo', solo_por_cobrar: true }));

      await clickAndFlush(queryReq<HTMLButtonElement>(host, '.kpi-card--proceso'));
      expect([component.estadoFiltro(), component.soloPorCobrar(), lastParams()?.solo_por_cobrar]).toEqual(['', false, undefined]);

      openFilters();
      await clickAndFlush(findBtn(host, '.stage-chip', 'Lavando'));
      expect([component.estadoFiltro(), lastParams()?.estado]).toEqual(['lavando', 'lavando']);
    });

    it('selector de sucursal renderiza chips con Todas para <= 4 sucursales y select para > 4', async () => {
      await setup({ sucursales: makeSucursales(3) });
      openFilters();
      const chips = Array.from(getHost().querySelectorAll<HTMLButtonElement>('.branch-chip-btn'));
      expect(chips.map((b) => b.textContent?.trim())).toEqual(['Todas', 'Centro', 'Norte', 'Sur']);
      expect(getHost().querySelector('select.branch-select')).toBeNull();
      await clickAndFlush(chips[2]);
      expect(lastParams()?.sucursal_id).toBe('suc-2');

      fixture?.destroy();
      fixture = null;
      TestBed.resetTestingModule();

      await setup({ sucursales: makeSucursales(5) });
      openFilters();
      expect(getHost().querySelectorAll('.branch-chip-btn').length).toBe(0);
      const selectEl = queryReq<HTMLSelectElement>(getHost(), 'select.branch-select');
      expect(selectEl.options.length).toBe(6);
      await changeVal(selectEl, 'suc-4');
      expect(lastParams()?.sucursal_id).toBe('suc-4');
    });
  });

  describe('Anti-race, estados contextuales y debounce', () => {
    it('descarta respuestas y errores tardios obsoletos mediante fetchSeq', async () => {
      await setup();
      const slow = createDeferred<PedidosPaginadosResponse>();
      const fast = createDeferred<PedidosPaginadosResponse>();
      apiStub.listPedidosPaginados.and.returnValues(slow.promise, fast.promise);

      component.onSucursalChange('suc-1');
      component.onSucursalChange('suc-2');
      fast.resolve(makePage([makePedido({ id: 'p-new', folio: 'LAV-NEW' })], 1, { total: 1 }));
      await flush();
      slow.resolve(makePage([makePedido({ id: 'p-old', folio: 'LAV-OLD' })], 99, { total: 99 }));
      await flush();
      expect([component.pedidos()[0]?.folio, component.totalCount()]).toEqual(['LAV-NEW', 1]);

      const errReq = createDeferred<PedidosPaginadosResponse>();
      const okReq = createDeferred<PedidosPaginadosResponse>();
      apiStub.listPedidosPaginados.and.returnValues(errReq.promise, okReq.promise);
      component.onSucursalChange('suc-1');
      component.onSucursalChange('suc-3');
      okReq.resolve(makePage([makePedido({ id: 'p-ok', folio: 'LAV-OK' })], 1));
      await flush();
      errReq.reject(new Error('Timeout obsoleto'));
      await flush();
      expect([component.error(), component.pedidos()[0]?.folio]).toEqual([null, 'LAV-OK']);
    });

    it('error muestra Reintentar y vacio con filtros muestra Limpiar filtros', async () => {
      await setup({ listError: new Error('Fallo de red') });
      const host = getHost();
      const errCard = queryReq<HTMLElement>(host, '.state-card--error');
      expect(errCard.textContent).toContain('Fallo de red');

      apiStub.listPedidosPaginados.and.resolveTo(makePage([], 0, { total: 0 }));
      await clickAndFlush(findBtn(errCard, 'button.state-btn', 'Reintentar'));
      expect(host.querySelector('.state-card--error')).toBeNull();
      expect(host.textContent).toContain('No hay pedidos activos');

      component.onEstadoChange('listo');
      await flush();
      expect(host.textContent).toContain('Sin resultados con estos filtros');

      apiStub.listPedidosPaginados.and.resolveTo(makePage([makePedido()], 1));
      await clickAndFlush(findBtn(host, '.state-card button.state-btn', 'Limpiar filtros'));
      expect([component.estadoFiltro(), host.querySelectorAll('.order-card').length]).toEqual(['', 1]);
    });

    describe('debounce de busqueda', () => {
      beforeEach(async () => configureModule());

      it('consolida entradas rapidas en una llamada y cancela timer al destruir', fakeAsync(() => {
        fixture = TestBed.createComponent(PedidosListComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
        flushMicrotasks();

        apiStub.listPedidosPaginados.calls.reset();
        component.onSearchInput('L');
        tick(150);
        component.onSearchInput('LAV-09');
        tick(150);
        expect(apiStub.listPedidosPaginados).not.toHaveBeenCalled();

        tick(150);
        flushMicrotasks();
        expect(apiStub.listPedidosPaginados).toHaveBeenCalledOnceWith(
          jasmine.objectContaining({ activo: true, q: 'LAV-09', offset: 0 })
        );

        apiStub.listPedidosPaginados.calls.reset();
        component.onSearchInput('no-disparar');
        fixture.destroy();
        fixture = null;
        tick(400);
        flushMicrotasks();
        expect(apiStub.listPedidosPaginados).not.toHaveBeenCalled();
      }));
    });
  });

  describe('Historial', () => {
    it('usa preset Todo por defecto sin fechas y muestra monto total y estado de pago', async () => {
      await setup();
      const host = getHost();
      expect(host.querySelector('nav.pg-bar')).toBeNull();

      apiStub.listPedidosPaginados.and.resolveTo(
        makePage([
          makePedido({ id: 'h-1', estado: 'entregado', monto_total: 350, saldo_pendiente: 0 }),
          makePedido({ id: 'h-2', estado: 'cancelado', monto_total: 280, saldo_pendiente: 120 }),
        ])
      );
      openFilters();
      await clickAndFlush(findBtn(host, '.tb-top .seg-btn', 'Historial'));

      expect(component.historialPreset()).toBe('todo');
      expect(lastParams()).toEqual({ activo: false, q: undefined, sucursal_id: undefined, estado: undefined, limit: 20, offset: 0 });
      expect([lastParams()?.desde, lastParams()?.hasta, host.querySelector('.kpis-grid')]).toEqual([undefined, undefined, null]);

      const cards = Array.from(host.querySelectorAll<HTMLElement>('.order-card.is-history'));
      expect(queryReq(cards[0], '.total-pill').textContent?.trim()).toBe('Total $350');
      expect(queryReq(cards[0], '.charge-pill--paid').textContent?.trim()).toBe('Pagado');
      expect(queryReq(cards[1], '.total-pill').textContent?.trim()).toBe('Total $280');
      expect(queryReq(cards[1], '.charge-pill--due').textContent?.trim()).toBe('Pendiente $120');
    });

    it('paginacion real es exclusiva de Historial con Anterior, Siguiente y limite 20/50/100', async () => {
      await setup();
      const host = getHost();
      expect(host.querySelector('nav.pg-bar')).toBeNull();

      const items = Array.from({ length: 20 }, (_, i) => makePedido({ id: `h-${i}`, estado: 'entregado' }));
      apiStub.listPedidosPaginados.and.resolveTo(makePage(items, 45));
      openFilters();
      await clickAndFlush(findBtn(host, '.tb-top .seg-btn', 'Historial'));

      const pg = queryReq<HTMLElement>(host, 'nav.pg-bar');
      const prevBtn = queryReq<HTMLButtonElement>(pg, 'button[aria-label="Página anterior"]');
      const nextBtn = queryReq<HTMLButtonElement>(pg, 'button[aria-label="Página siguiente"]');
      const limitSel = queryReq<HTMLSelectElement>(pg, 'select.pg-select');

      expect(queryReq(pg, '.pg-cnt').textContent?.trim()).toBe('1-20 de 45');
      expect([prevBtn.disabled, nextBtn.disabled]).toEqual([true, false]);
      expect(Array.from(limitSel.options).map((o) => o.value)).toEqual(['20', '50', '100']);

      await clickAndFlush(nextBtn);
      expect(lastParams()).toEqual(jasmine.objectContaining({ activo: false, limit: 20, offset: 20 }));
      expect(queryReq(pg, '.pg-cnt').textContent?.trim()).toBe('21-40 de 45');

      await clickAndFlush(prevBtn);
      expect(lastParams()?.offset).toBe(0);

      await changeVal(limitSel, '50');
      expect(lastParams()).toEqual(jasmine.objectContaining({ activo: false, limit: 50, offset: 0 }));
    });

    it('presets Hoy/7d/Mes/Personalizado, valida desde > hasta sin llamar API y filtra estado', async () => {
      await setup();
      const host = getHost();
      openFilters();
      await clickAndFlush(findBtn(host, '.tb-top .seg-btn', 'Historial'));

      for (const p of [
        { label: 'Hoy', key: 'hoy' as const },
        { label: '7d', key: '7d' as const },
        { label: 'Mes', key: 'mes' as const },
      ]) {
        await clickAndFlush(findBtn(host, '.presets-row .preset-btn', p.label));
        expect(lastParams()).toEqual(jasmine.objectContaining({ activo: false, ...calculateHistorialDateRange(p.key) }));
      }

      await clickAndFlush(findBtn(host, '.presets-row .preset-btn', 'Todo'));
      apiStub.listPedidosPaginados.calls.reset();
      findBtn(host, '.presets-row .preset-btn', 'Personalizado').click();
      fixture?.detectChanges();
      expect(apiStub.listPedidosPaginados).not.toHaveBeenCalled();

      const desde = queryReq<HTMLInputElement>(host, 'input[aria-label="Fecha inicial"]');
      const hasta = queryReq<HTMLInputElement>(host, 'input[aria-label="Fecha final"]');
      await changeVal(desde, '2026-11-20');

      apiStub.listPedidosPaginados.calls.reset();
      await changeVal(hasta, '2026-11-10');
      expect(component.dateRangeError()).toBe('La fecha inicial no puede ser mayor que la fecha final.');
      expect(queryReq(host, '.range-error').textContent).toContain('no puede ser mayor');
      expect(apiStub.listPedidosPaginados).not.toHaveBeenCalled();

      await changeVal(hasta, '2026-11-25');
      expect(component.dateRangeError()).toBeNull();

      for (const st of [{ label: 'Entregado', value: 'entregado' as const }, { label: 'Cancelado', value: 'cancelado' as const }]) {
        await clickAndFlush(findBtn(host, '.hist-filters .seg-group--3 .seg-btn', st.label));
        expect(lastParams()?.estado).toBe(st.value);
      }
    });
  });

  describe('Escaneo QR y pistola USB/Bluetooth', () => {
    it('pistola ignora INPUT/TEXTAREA/SELECT, limpia filtros y cae a Historial', async () => {
      await setup();
      let nowMs = 1000;
      spyOn(performance, 'now').and.callFake(() => (nowMs += 10));

      apiStub.listPedidosPaginados.calls.reset();
      openFilters();
      const input = queryReq<HTMLInputElement>(getHost(), 'input.search-input');
      const textarea = document.createElement('textarea');
      const select = document.createElement('select');
      document.body.append(textarea, select);
      try {
        expect([
          scanKeys(input, 'LAV-1111').defaultPrevented,
          scanKeys(textarea, 'LAV-2222').defaultPrevented,
          scanKeys(select, 'LAV-3333').defaultPrevented,
        ]).toEqual([false, false, false]);
      } finally {
        textarea.remove();
        select.remove();
      }
      expect(apiStub.listPedidosPaginados).not.toHaveBeenCalled();

      component.onSucursalChange('suc-2');
      component.onEstadoChange('lavando');
      component.toggleSoloPorCobrar();
      await flush();

      const pHist = makePedido({ id: 'h-scan', folio: 'LAV-8811', estado: 'entregado' });
      apiStub.listPedidosPaginados.calls.reset();
      apiStub.listPedidosPaginados.and.returnValues(Promise.resolve(makePage([], 0)), Promise.resolve(makePage([pHist], 1)));
      expect(scanKeys(window, 'LAV-8811').defaultPrevented).toBeTrue();
      await flush();

      expect([component.sucursalId(), component.estadoFiltro(), component.soloPorCobrar(), component.vista()]).toEqual([
        '', '', false, 'historial',
      ]);
      expect(apiStub.listPedidosPaginados.calls.argsFor(0)[0]).toEqual({ activo: true, q: 'LAV-8811', limit: 100, offset: 0 });
      expect(apiStub.listPedidosPaginados.calls.argsFor(1)[0]).toEqual({ activo: false, q: 'LAV-8811', limit: 20, offset: 0 });
    });

    it('escaner QR limpia todos los filtros y busca en Activos con fallback a Historial', async () => {
      await setup();
      component.setVista('historial');
      component.onSucursalChange('suc-2');
      component.onEstadoChange('cancelado');
      component.setHistorialPreset('custom');
      component.onDesdeChange('2026-11-01');
      component.onHastaChange('2026-11-15');
      await flush();

      const pHist = makePedido({ id: 'p-qr', folio: 'LAV-5500', estado: 'entregado' });
      dialogStub.open.and.returnValue(dialogRefOf('https://app.nanoclean.mx/rastreo/org-1/lav-5500'));
      apiStub.listPedidosPaginados.calls.reset();
      apiStub.listPedidosPaginados.and.returnValues(Promise.resolve(makePage([], 0)), Promise.resolve(makePage([pHist], 1)));

      openFilters();
      await clickAndFlush(queryReq<HTMLButtonElement>(getHost(), 'button.qr-btn'));
      expect(dialogStub.open).toHaveBeenCalledOnceWith(QrScannerDialogComponent, { width: '390px' });
      expect([
        component.sucursalId(), component.estadoFiltro(), component.soloPorCobrar(),
        component.historialPreset(), component.desde(), component.hasta(), component.vista(),
      ]).toEqual(['', '', false, 'todo', '', '', 'historial']);
      expect(apiStub.listPedidosPaginados.calls.argsFor(0)[0]).toEqual({ activo: true, q: 'LAV-5500', limit: 100, offset: 0 });
      expect(apiStub.listPedidosPaginados.calls.argsFor(1)[0]).toEqual({ activo: false, q: 'LAV-5500', limit: 20, offset: 0 });
    });
  });

  describe('Acciones de mostrador 1 toque', () => {
    it('avanzarEstado respeta el ciclo secuencial sin salto directo a listo y actualiza resumen', async () => {
      await setup({
        response: makePage(
          [makePedido({ id: 'ped-1', estado: 'recibido' }), makePedido({ id: 'ped-2', estado: 'doblando' })],
          2,
          { total: 2, en_proceso: 2, listos: 0, por_estado: { recibido: 1, lavando: 0, secando: 0, doblando: 1, listo: 0 } }
        ),
      });
      const cards = Array.from(getHost().querySelectorAll<HTMLElement>('.order-card'));
      expect(cards[0].querySelector('.act-ready')).toBeNull();
      expect(cards[1].querySelector('.act-ready')).toBeNull();

      await clickAndFlush(queryReq<HTMLButtonElement>(cards[0], '.act-cta'));
      expect(apiStub.updatePedido).toHaveBeenCalledWith('ped-1', { estado: 'lavando' });
      expect(component.pedidos()[0]?.estado).toBe('lavando');
      expect(cards[0].querySelector('.act-ready')).toBeNull();

      apiStub.updatePedido.calls.reset();
      await clickAndFlush(queryReq<HTMLButtonElement>(cards[1], '.act-cta'));
      expect(apiStub.updatePedido).toHaveBeenCalledOnceWith('ped-2', { estado: 'listo' });
      expect([component.pedidos()[1]?.estado, component.resumen().listos]).toEqual(['listo', 1]);
    });

    it('entregar con saldo > 0 abre EntregaDialog: cancelar (X), cobrar y dejar en deuda', async () => {
      const p1 = makePedido({ id: 'ped-cob', folio: 'LAV-4001', estado: 'listo', monto_total: 300, saldo_pendiente: 150 });
      const p2 = makePedido({ id: 'ped-deu', folio: 'LAV-4002', estado: 'listo', monto_total: 200, saldo_pendiente: 80 });
      await setup({ response: makePage([p1, p2], 2, { total: 2, en_proceso: 0, listos: 2, por_cobrar_count: 2, por_cobrar_monto: 230 }) });

      dialogStub.open.and.returnValue(dialogRefOf(undefined));
      await clickAndFlush(queryReq<HTMLButtonElement>(getHost(), '.order-card .act-cta'));
      expect(dialogStub.open).toHaveBeenCalledWith(
        EntregaDialogComponent,
        jasmine.objectContaining({
          disableClose: true,
          data: { nombreCliente: 'Ana Lopez', folio: 'LAV-4001', saldoPendiente: 150, montoTotal: 300 },
        })
      );
      expect(apiStub.updatePedido).not.toHaveBeenCalled();

      const cobrar: EntregaDialogResponse = { accion: 'cobrar', metodoPago: 'tarjeta', categoriaIngresoId: 'cat-2' };
      dialogStub.open.and.returnValue(dialogRefOf(cobrar));
      await clickAndFlush(queryReq<HTMLButtonElement>(getHost(), '.order-card .act-cta'));
      expect(apiStub.updatePedido).toHaveBeenCalledWith('ped-cob', {
        estado: 'entregado', monto_cobrado: 150, metodo_pago: 'tarjeta', categoria_ingreso_id: 'cat-2',
      });
      expect([component.pedidos().map((p) => p.id), component.resumen().por_cobrar_monto]).toEqual([['ped-deu'], 80]);

      apiStub.updatePedido.calls.reset();
      const deuda: EntregaDialogResponse = { accion: 'deuda' };
      dialogStub.open.and.returnValue(dialogRefOf(deuda));
      await clickAndFlush(queryReq<HTMLButtonElement>(getHost(), '.order-card .act-cta'));
      expect(apiStub.updatePedido).toHaveBeenCalledOnceWith('ped-deu', { estado: 'entregado' });
      expect(component.pedidos().length).toBe(0);
    });

    it('notificarWhatsapp soporta envio automatico via API, fallback manual y aviso sin telefono', async () => {
      const pAuto = makePedido({ id: 'wa-1', whatsapp_automatico: true, cliente_telefono: '5511223344' });
      const pManual = makePedido({ id: 'wa-2', whatsapp_automatico: false, cliente_telefono: '5599887766' });
      const pSinTel = makePedido({ id: 'wa-3', cliente_telefono: '' });
      await setup({ response: makePage([pAuto, pManual, pSinTel], 3) });

      const btns = Array.from(getHost().querySelectorAll<HTMLButtonElement>('.order-card .act-wa'));
      await clickAndFlush(btns[0]);
      expect(apiStub.notificarPedidoWhatsapp).toHaveBeenCalledOnceWith('wa-1');
      expect(actionsStub.sendWhatsapp).not.toHaveBeenCalled();

      apiStub.notificarPedidoWhatsapp.and.rejectWith(new Error('Proveedor caido'));
      await clickAndFlush(btns[0]);
      expect(actionsStub.sendWhatsapp).toHaveBeenCalledOnceWith(pAuto);

      actionsStub.sendWhatsapp.calls.reset();
      apiStub.notificarPedidoWhatsapp.calls.reset();
      await clickAndFlush(btns[1]);
      expect(apiStub.notificarPedidoWhatsapp).not.toHaveBeenCalled();
      expect(actionsStub.sendWhatsapp).toHaveBeenCalledOnceWith(pManual);

      actionsStub.sendWhatsapp.calls.reset();
      await clickAndFlush(btns[2]);
      expect(actionsStub.sendWhatsapp).not.toHaveBeenCalled();
      expect(snackStub.open).toHaveBeenCalledWith('Este cliente no tiene teléfono registrado', 'OK', { duration: 2500 });
    });

    it('abrirTicket abre TicketDialog y deletePedido respeta confirmacion', async () => {
      const pedido = makePedido({ id: 'ped-del', folio: 'LAV-6001' });
      await setup({ response: makePage([pedido], 1, { total: 1 }) });

      queryReq<HTMLButtonElement>(getHost(), 'button[aria-label="Abrir ticket QR del pedido LAV-6001"]').click();
      expect(dialogStub.open).toHaveBeenCalledOnceWith(TicketDialogComponent, {
        data: { pedido, esCreacion: false }, width: '390px',
      });

      const delBtn = queryReq<HTMLButtonElement>(getHost(), 'button.icon-btn--del');
      dialogStub.open.calls.reset();
      dialogStub.open.and.returnValue(dialogRefOf(false));
      await clickAndFlush(delBtn);
      expect(dialogStub.open).toHaveBeenCalledOnceWith(
        ConfirmDialogComponent,
        jasmine.objectContaining({ width: '360px', panelClass: 'custom-modal-panel' })
      );
      expect(apiStub.deletePedido).not.toHaveBeenCalled();

      dialogStub.open.and.returnValue(dialogRefOf(true));
      await clickAndFlush(delBtn);
      expect(apiStub.deletePedido).toHaveBeenCalledOnceWith('ped-del');
      expect([component.pedidos().length, component.totalCount()]).toEqual([0, 0]);
    });
  });
});
