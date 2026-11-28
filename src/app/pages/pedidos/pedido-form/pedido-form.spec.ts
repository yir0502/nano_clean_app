import { Location, registerLocaleData } from '@angular/common';
import localeEsMX from '@angular/common/locales/es-MX';
import { OverlayContainer } from '@angular/cdk/overlay';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, flush, flushMicrotasks, tick } from '@angular/core/testing';
import { MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatDialog, type MatDialogConfig } from '@angular/material/dialog';
import { MatSnackBar, type MatSnackBarConfig } from '@angular/material/snack-bar';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { type Observable, Subject, of } from 'rxjs';

import { ApiClientService } from '../../../core/api-client.service';
import type { Categoria, Cliente, Pedido, PedidoCreatePayload, PedidoEvidencia, PedidoUpdatePayload, Sucursal } from '../../../core/models';
import { PedidoActionsService } from '../../../core/pedido-actions.service';
import { TicketPrintService } from '../../../core/ticket-print.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { AccionPedidoDialogComponent } from '../dialogs/accion-pedido-dialog.component';
import { EntregaDialogComponent, type EntregaDialogResponse } from '../dialogs/entrega-dialog.component';
import { TicketDialogComponent } from '../dialogs/ticket-dialog.component';
import { formatLocalDateFromInput } from '../pedidos.helpers';
import { PedidoFormComponent } from './pedido-form';

registerLocaleData(localeEsMX);

const STORAGE_LAST_SUCURSAL = 'nc_last_sucursal_id';
const STORAGE_TARIFA_KG = 'nc_tarifa_kg';
const TEST_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

type ApiKeys =
  | 'listSucursales' | 'listCategorias' | 'listClientes' | 'getCliente'
  | 'createCliente' | 'updateCliente' | 'getPedido' | 'createPedido'
  | 'updatePedido' | 'listEvidencias' | 'uploadEvidencia' | 'deleteEvidencia';

type ApiClientStub = jasmine.SpyObj<Pick<ApiClientService, ApiKeys>>;
type RouterStub = jasmine.SpyObj<Pick<Router, 'navigateByUrl'>>;
type LocationStub = jasmine.SpyObj<Pick<Location, 'back'>>;
type PedidoActionsStub = jasmine.SpyObj<Pick<PedidoActionsService, 'sendWhatsapp'>>;
type ImprimirTicketArg = Parameters<TicketPrintService['imprimirTicket']>[0];

interface DialogRefStub<R = unknown> { afterClosed: () => Observable<R>; }
interface MatDialogStub { open: jasmine.Spy<(component: unknown, config?: MatDialogConfig<unknown>) => DialogRefStub>; }
interface SnackBarStub { open: jasmine.Spy<(message: string, action?: string, config?: MatSnackBarConfig) => void>; }
interface TicketPrintStub { autoPrintEnabled: boolean; imprimirTicket: jasmine.Spy<(p: ImprimirTicketArg) => Promise<void>>; }
interface SetupOptions {
  routeId?: string; sucursales?: Sucursal[]; categorias?: Categoria[];
  pedido?: Pedido; cliente?: Cliente; evidencias?: PedidoEvidencia[]; autoPrintEnabled?: boolean;
}

const mockDialogClose = <R>(result: R): DialogRefStub<R> => ({ afterClosed: () => of(result) });

const makeSucursales = (count: number): Sucursal[] => {
  const nombres = ['Centro', 'Norte', 'Sur', 'Poniente', 'Oriente', 'Polanco'];
  return Array.from({ length: count }, (_, i) => ({
    id: `suc-${i + 1}`, org_id: 'org-1', nombre: nombres[i] ?? `Sucursal ${i + 1}`, activo: true,
  }));
};

const makeCategorias = (): Categoria[] => [
  { id: 'cat-1', org_id: 'org-1', nombre: 'Lavado por kilo', tipo: 'ingreso', activo: true },
  { id: 'cat-2', org_id: 'org-1', nombre: 'Servicios mostrador', tipo: 'ingreso', activo: true },
];

const makeCliente = (overrides: Partial<Cliente> = {}): Cliente => ({
  id: 'cli-1', org_id: 'org-1', nombre: 'Ana Lopez', telefono: '5512345678',
  permite_whatsapp: true, frecuencia_recordatorio: 0, monedero: 20,
  contador_servicios: 2, apto_promociones: true, ...overrides,
});

const makePedido = (overrides: Partial<Pedido> = {}): Pedido => ({
  id: 'ped-42', org_id: 'org-1', folio: 'LAV-4200', cliente_id: 'cli-1',
  cliente_nombre: 'Ana Lopez', cliente_telefono: '5512345678', sucursal_id: 'suc-1',
  sucursal_nombre: 'Centro', descripcion: '3 kg lavado y secado', estado: 'lavando',
  monto_total: 200, saldo_pendiente: 120, descuento_aplicado: 0,
  fecha_entrega_estimada: '2026-12-10', whatsapp_disparado: false, ...overrides,
});

const makeEvidencias = (count: number): PedidoEvidencia[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `ev-${i + 1}`, pedido_id: 'ped-42', url: `${TEST_IMG}#ev-${i + 1}`, tipo: 'ingreso',
  }));

const localOffsetIso = (dias: number): string => {
  const now = new Date();
  return formatLocalDateFromInput(new Date(now.getFullYear(), now.getMonth(), now.getDate() + dias));
};

function queryRequired<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Elemento no encontrado: ${selector}`);
  return el;
}

function findBtn(root: ParentNode, selector: string, text: string): HTMLButtonElement {
  const match = Array.from(root.querySelectorAll<HTMLButtonElement>(selector)).find((b) =>
    (b.textContent ?? '').includes(text)
  );
  if (!match) throw new Error(`Boton no encontrado: "${text}" en ${selector}`);
  return match;
}

describe('PedidoFormComponent', () => {
  let fixture: ComponentFixture<PedidoFormComponent>;
  let component: PedidoFormComponent;
  let apiStub: ApiClientStub;
  let dialogStub: MatDialogStub;
  let snackStub: SnackBarStub;
  let routerStub: RouterStub;
  let locationStub: LocationStub;
  let ticketStub: TicketPrintStub;
  let pedidoActionsStub: PedidoActionsStub;

  const getHost = (): HTMLElement => {
    if (!(fixture.nativeElement instanceof HTMLElement)) throw new Error('Host no es HTMLElement');
    return fixture.nativeElement;
  };
  const tap = (el: HTMLElement): void => { el.click(); fixture.detectChanges(); };
  const setInput = (el: HTMLInputElement, value: string, evt: 'input' | 'change' = 'input'): void => {
    el.value = value;
    el.dispatchEvent(new Event(evt));
    fixture.detectChanges();
  };
  const pressKey = (key: string): void => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    fixture.detectChanges();
  };

  async function flushAsync(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function configureModule(options: SetupOptions = {}): Promise<void> {
    fixture?.destroy();
    TestBed.resetTestingModule();

    const sucursales = options.sucursales ?? makeSucursales(3);
    const categorias = options.categorias ?? makeCategorias();
    const basePedido = options.pedido ?? makePedido();
    const baseCliente = options.cliente ?? makeCliente();
    const baseEvidencias = options.evidencias ?? [];

    apiStub = jasmine.createSpyObj<Pick<ApiClientService, ApiKeys>>('ApiClientService', [
      'listSucursales', 'listCategorias', 'listClientes', 'getCliente',
      'createCliente', 'updateCliente', 'getPedido', 'createPedido',
      'updatePedido', 'listEvidencias', 'uploadEvidencia', 'deleteEvidencia',
    ]);
    apiStub.listSucursales.and.callFake(() => Promise.resolve(sucursales));
    apiStub.listCategorias.and.callFake(() => Promise.resolve(categorias));
    apiStub.listClientes.and.callFake(() => Promise.resolve({ data: [], count: 0 }));
    apiStub.getCliente.and.callFake(() => Promise.resolve(baseCliente));
    apiStub.getPedido.and.callFake(() => Promise.resolve(basePedido));
    apiStub.listEvidencias.and.callFake(() => Promise.resolve(baseEvidencias));
    apiStub.deleteEvidencia.and.callFake(() => Promise.resolve({ ok: true }));
    apiStub.uploadEvidencia.and.callFake((pedidoId, _f, tipo, nota) =>
      Promise.resolve({ id: 'ev-up', pedido_id: pedidoId, url: `${TEST_IMG}#up`, tipo, nota })
    );
    apiStub.createCliente.and.callFake((p) =>
      Promise.resolve(makeCliente({ id: 'cli-nuevo', nombre: p.nombre ?? 'Nuevo', telefono: p.telefono ?? '' }))
    );
    apiStub.updateCliente.and.callFake((id, p) =>
      Promise.resolve(makeCliente({ ...baseCliente, id, apto_promociones: p.apto_promociones ?? baseCliente.apto_promociones }))
    );
    apiStub.createPedido.and.callFake((p) =>
      Promise.resolve(makePedido({
        id: 'ped-nuevo', folio: 'LAV-9001', cliente_id: p.cliente_id ?? 'cli-nuevo',
        sucursal_id: p.sucursal_id ?? 'suc-1', descripcion: p.descripcion ?? '',
        monto_total: p.monto_total ?? 0, saldo_pendiente: p.saldo_pendiente ?? 0,
        fecha_entrega_estimada: p.fecha_entrega_estimada, estado: 'recibido',
        movimiento_registrado: Boolean(p.registrar_pago),
      }))
    );
    apiStub.updatePedido.and.callFake((id, p) =>
      Promise.resolve(makePedido({
        ...basePedido, id, descripcion: p.descripcion ?? basePedido.descripcion,
        sucursal_id: p.sucursal_id ?? basePedido.sucursal_id, monto_total: p.monto_total ?? basePedido.monto_total,
        saldo_pendiente: p.saldo_pendiente ?? basePedido.saldo_pendiente,
        fecha_entrega_estimada: p.fecha_entrega_estimada ?? basePedido.fecha_entrega_estimada,
        estado: p.estado ?? basePedido.estado,
      }))
    );

    dialogStub = {
      open: jasmine.createSpy<(c: unknown, cfg?: MatDialogConfig<unknown>) => DialogRefStub>('open')
        .and.callFake(() => mockDialogClose(undefined)),
    };
    snackStub = { open: jasmine.createSpy('open') };
    routerStub = jasmine.createSpyObj<Pick<Router, 'navigateByUrl'>>('Router', ['navigateByUrl']);
    routerStub.navigateByUrl.and.callFake(() => Promise.resolve(true));
    locationStub = jasmine.createSpyObj<Pick<Location, 'back'>>('Location', ['back']);
    ticketStub = {
      autoPrintEnabled: options.autoPrintEnabled ?? false,
      imprimirTicket: jasmine.createSpy<(p: ImprimirTicketArg) => Promise<void>>('imprimirTicket')
        .and.callFake(() => Promise.resolve()),
    };
    pedidoActionsStub = jasmine.createSpyObj<Pick<PedidoActionsService, 'sendWhatsapp'>>('PedidoActionsService', ['sendWhatsapp']);

    await TestBed.configureTestingModule({
      imports: [PedidoFormComponent],
      providers: [
        { provide: LOCALE_ID, useValue: 'es-MX' },
        provideNoopAnimations(),
        { provide: ApiClientService, useValue: apiStub },
        { provide: MatDialog, useValue: dialogStub },
        { provide: MatSnackBar, useValue: snackStub },
        { provide: Router, useValue: routerStub },
        { provide: Location, useValue: locationStub },
        { provide: TicketPrintService, useValue: ticketStub },
        { provide: PedidoActionsService, useValue: pedidoActionsStub },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(options.routeId ? { id: options.routeId } : {}) } } },
      ],
    })
      .overrideProvider(MatDialog, { useValue: dialogStub })
      .overrideProvider(MatSnackBar, { useValue: snackStub })
      .compileComponents();
  }

  async function setupComponent(options: SetupOptions = {}): Promise<void> {
    await configureModule(options);
    fixture = TestBed.createComponent(PedidoFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await flushAsync();
  }

  beforeEach(() => {
    localStorage.removeItem(STORAGE_LAST_SUCURSAL);
    localStorage.removeItem(STORAGE_TARIFA_KG);
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    localStorage.removeItem(STORAGE_LAST_SUCURSAL);
    localStorage.removeItem(STORAGE_TARIFA_KG);
  });

  describe('Creacion: sucursal adaptativa y memoria localStorage', () => {
    it('selecciona desde nc_last_sucursal_id o primera activa y alterna botones (<=4) vs select (>4)', async () => {
      localStorage.setItem(STORAGE_LAST_SUCURSAL, 'suc-3');
      await setupComponent({ sucursales: makeSucursales(4) });
      const btns = Array.from(getHost().querySelectorAll<HTMLButtonElement>('.branch-btn'));
      expect(btns.length).toBe(4);
      expect(getHost().querySelector('select[formControlName="sucursal_id"]')).toBeNull();
      expect(component.sucursalSeleccionada()).toBe('suc-3');
      expect(btns[2].classList.contains('active')).toBeTrue();

      localStorage.setItem(STORAGE_LAST_SUCURSAL, 'suc-inactiva');
      await setupComponent({ sucursales: makeSucursales(5) });
      expect(getHost().querySelectorAll('.branch-btn').length).toBe(0);
      const selectEl = queryRequired<HTMLSelectElement>(getHost(), 'select[formControlName="sucursal_id"]');
      expect(selectEl.options.length).toBe(5);
      expect(component.sucursalSeleccionada()).toBe('suc-1');
      expect(selectEl.value).toBe('suc-1');
    });

    it('guarda nc_last_sucursal_id en localStorage al cambiar sucursal', async () => {
      await setupComponent({ sucursales: makeSucursales(3) });
      tap(findBtn(getHost(), '.branch-btn', 'Norte'));
      expect(component.sucursalSeleccionada()).toBe('suc-2');
      expect(localStorage.getItem(STORAGE_LAST_SUCURSAL)).toBe('suc-2');
    });
  });

  describe('Calculadora POS, anticipos, metodo y categoria colapsable', () => {
    it('captura kilos/tarifa persistiendo nc_tarifa_kg, aplica calculo y agrega prendas rapidas', async () => {
      await setupComponent();
      const host = getHost();
      const kgInput = queryRequired<HTMLInputElement>(host, 'input[aria-label="Kilogramos"]');
      const tarifaInput = queryRequired<HTMLInputElement>(host, 'input[aria-label="Tarifa por kilogramo"]');
      const addKgBtn = queryRequired<HTMLButtonElement>(host, '.kg-add-btn');

      setInput(tarifaInput, '25');
      setInput(kgInput, '0');
      expect(localStorage.getItem(STORAGE_TARIFA_KG)).toBe('25');
      expect(addKgBtn.disabled).toBeTrue();

      setInput(kgInput, '4.5');
      expect(component.subtotalKilosPreview()).toBe(112.5);
      expect(addKgBtn.textContent).toContain('$112.50');

      tap(addKgBtn);
      tap(findBtn(host, '.chip-btn', 'Edredón Mat.'));
      expect(component.form.controls.descripcion.value).toBe('4.5 kg lavado y secado, Edredón Mat.');
      expect(component.form.controls.monto_total.value).toBe(112.5);
      expect(component.form.controls.saldo_pendiente.value).toBe(112.5);
      expect(component.kilosCaptura()).toBeNull();
    });

    it('aplica presets de anticipo, selecciona metodo de pago y abre/elige categoria colapsable', async () => {
      await setupComponent();
      component.form.controls.monto_total.setValue(200);
      fixture.detectChanges();
      const host = getHost();

      tap(findBtn(host, '.chip-btn', '50%'));
      expect(component.saldoPendiente()).toBe(100);
      expect(component.anticipoCalculado()).toBe(100);

      tap(findBtn(host, '.chip-btn', 'Pagó todo'));
      expect(component.saldoPendiente()).toBe(0);

      tap(findBtn(host, '.chip-btn', 'Debe todo'));
      expect(component.saldoPendiente()).toBe(200);
      expect(host.querySelector('[aria-label="Método de cobro"]')).toBeNull();

      tap(findBtn(host, '.chip-btn', '50%'));
      tap(findBtn(host, '[aria-label="Método de cobro"] .chip-btn', 'Transferencia'));
      expect(component.metodoPago()).toBe('transferencia');

      const catPill = queryRequired<HTMLButtonElement>(host, '.cat-pill');
      expect(component.categoriaIngresoId()).toBe('cat-2');
      expect(catPill.getAttribute('aria-expanded')).toBe('false');

      tap(catPill);
      expect(component.mostrarSelectorCategoria()).toBeTrue();
      expect(catPill.getAttribute('aria-expanded')).toBe('true');

      tap(findBtn(host, '.chip-btn', 'Lavado por kilo'));
      expect(component.categoriaIngresoId()).toBe('cat-1');
      expect(component.categoriaIngresoNombre()).toBe('Lavado por kilo');
      expect(component.mostrarSelectorCategoria()).toBeFalse();
    });
  });

  describe('Fecha de entrega local sin desfase UTC', () => {
    it('aplica presets locales e input date enviando YYYY-MM-DD exacto en createPedido', async () => {
      await setupComponent();
      const host = getHost();
      const presets = [
        { label: 'Hoy', dias: 0 }, { label: 'Mañana', dias: 1 },
        { label: 'En 2 días', dias: 2 }, { label: 'En 3 días', dias: 3 },
      ];
      for (const preset of presets) {
        const expected = localOffsetIso(preset.dias);
        const btn = findBtn(host, '[aria-label="Entrega rápida"] .chip-btn', preset.label);
        tap(btn);
        expect(component.fechaEntrega()).toBe(expected);
        expect(component.form.controls.fecha_entrega_estimada.value).toBe(expected);
        expect(btn.getAttribute('aria-pressed')).toBe('true');
      }

      setInput(queryRequired<HTMLInputElement>(host, '#pf-fecha-entrega'), '2026-12-31', 'change');
      expect(component.fechaEntrega()).toBe('2026-12-31');

      component.selectCliente(makeCliente());
      component.form.patchValue({ monto_total: 150 });
      await component.save();
      expect(apiStub.createPedido).toHaveBeenCalledOnceWith(
        jasmine.objectContaining<PedidoCreatePayload>({ fecha_entrega_estimada: '2026-12-31' })
      );
    });
  });

  describe('Creacion: cliente nuevo y TicketDialogComponent', () => {
    it('bloquea formulario invalido y da de alta cliente nuevo antes de createPedido', async () => {
      await setupComponent();
      await component.save();
      expect(component.submitAttempted()).toBeTrue();
      expect(apiStub.createCliente).not.toHaveBeenCalled();

      const order: string[] = [];
      apiStub.createCliente.and.callFake((p) => {
        order.push('createCliente');
        return Promise.resolve(makeCliente({ id: 'cli-nuevo-9', nombre: p.nombre ?? '', telefono: p.telefono ?? '' }));
      });
      apiStub.createPedido.and.callFake((p) => {
        order.push('createPedido');
        return Promise.resolve(makePedido({ id: 'ped-new', folio: 'LAV-9009', cliente_id: p.cliente_id ?? null }));
      });

      component.form.patchValue({ cliente_nombre: 'Maria Torres', cliente_telefono: '5544332211', descripcion: 'Cobertor', monto_total: 180 });
      component.aplicarPresetAnticipo('cero');
      component.metodoPago.set('tarjeta');
      await component.save();

      expect(order).toEqual(['createCliente', 'createPedido']);
      expect(apiStub.createCliente).toHaveBeenCalledOnceWith({
        nombre: 'Maria Torres', telefono: '5544332211', permite_whatsapp: true, apto_promociones: false,
      });
      expect(apiStub.createPedido).toHaveBeenCalledOnceWith(
        jasmine.objectContaining<PedidoCreatePayload>({
          cliente_id: 'cli-nuevo-9', monto_total: 180, saldo_pendiente: 0,
          registrar_pago: true, metodo_pago: 'tarjeta', categoria_ingreso_id: 'cat-2',
        })
      );
    });

    it('abre TicketDialogComponent tras crear y respeta autoPrintEnabled en TicketPrintService', async () => {
      await setupComponent({ autoPrintEnabled: false });
      component.selectCliente(makeCliente());
      component.form.patchValue({ descripcion: 'Lavado general', monto_total: 100 });

      const ticketClose$ = new Subject<void>();
      dialogStub.open.and.returnValue({ afterClosed: () => ticketClose$.asObservable() });
      const savePromise = component.save();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      expect(ticketStub.imprimirTicket).not.toHaveBeenCalled();
      const [firstCmp, firstCfg] = dialogStub.open.calls.mostRecent().args;
      expect(firstCmp).toBe(TicketDialogComponent);
      expect(firstCfg?.data).toEqual(jasmine.objectContaining({
        esCreacion: true, metodoPagoTexto: undefined,
        pedido: jasmine.objectContaining({ folio: 'LAV-9001', cliente_nombre: 'Ana Lopez', sucursal_nombre: 'Centro' }),
      }));
      expect(routerStub.navigateByUrl).not.toHaveBeenCalled();

      ticketClose$.next();
      ticketClose$.complete();
      await savePromise;
      expect(routerStub.navigateByUrl).toHaveBeenCalledOnceWith('/pedidos');

      dialogStub.open.calls.reset();
      routerStub.navigateByUrl.calls.reset();
      ticketStub.autoPrintEnabled = true;
      dialogStub.open.and.callFake(() => mockDialogClose(undefined));
      component.aplicarPresetAnticipo('cero');
      component.metodoPago.set('efectivo');
      await component.save();

      expect(ticketStub.imprimirTicket).toHaveBeenCalledOnceWith(
        jasmine.objectContaining<ImprimirTicketArg>({ folio: 'LAV-9001', cliente_nombre: 'Ana Lopez', sucursal_nombre: 'Centro', metodo_pago_texto: 'Efectivo' })
      );
      expect(dialogStub.open.calls.mostRecent().args[0]).toBe(TicketDialogComponent);
      expect(dialogStub.open.calls.mostRecent().args[1]?.data).toEqual(jasmine.objectContaining({ esCreacion: true, metodoPagoTexto: 'Efectivo' }));
      expect(routerStub.navigateByUrl).toHaveBeenCalledOnceWith('/pedidos');
    });
  });

  describe('Autocomplete de clientes, auto-vinculacion 10 digitos y panel Lealtad', () => {
    describe('Busqueda debounced y auto-vinculacion', () => {
      beforeEach(async () => { await configureModule(); });

      it('consulta listClientes en autocomplete, selecciona cliente y auto-vincula telefono de 10 digitos', fakeAsync(() => {
        fixture = TestBed.createComponent(PedidoFormComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
        flushMicrotasks();
        fixture.detectChanges();

        const ana = makeCliente({ id: 'cli-1', nombre: 'Ana Lopez', telefono: '5511223344' });
        const carlos = makeCliente({ id: 'cli-2', nombre: 'Carlos Ruiz', telefono: '5599887766' });
        apiStub.listClientes.and.callFake((p) => {
          if (p?.q === 'Ana') return Promise.resolve({ data: [ana], count: 1 });
          if (p?.q === '5599887766') return Promise.resolve({ data: [carlos], count: 1 });
          return Promise.resolve({ data: [], count: 0 });
        });

        component.form.controls.cliente_nombre.setValue('Ana');
        tick(299);
        expect(apiStub.listClientes).not.toHaveBeenCalled();
        tick(1);
        flushMicrotasks();
        fixture.detectChanges();
        expect(apiStub.listClientes).toHaveBeenCalledOnceWith({ q: 'Ana', limit: 5 });

        fixture.debugElement.query(By.directive(MatAutocompleteTrigger)).injector.get(MatAutocompleteTrigger).openPanel();
        fixture.detectChanges();
        tick();
        fixture.detectChanges();

        const optionEl = TestBed.inject(OverlayContainer).getContainerElement().querySelector<HTMLElement>('mat-option');
        expect(optionEl).not.toBeNull();
        optionEl?.click();
        fixture.detectChanges();
        flush();

        expect(component.selectedCliente()).toEqual(ana);
        expect(component.form.controls.cliente_id.value).toBe('cli-1');
        expect(component.form.controls.cliente_nombre.disabled).toBeTrue();
        expect(component.displayCliente(ana)).toBe('Ana Lopez');

        component.clearCliente();
        apiStub.listClientes.calls.reset();
        component.form.controls.cliente_telefono.setValue('559988776');
        tick(450);
        flushMicrotasks();
        expect(apiStub.listClientes).not.toHaveBeenCalled();

        component.form.controls.cliente_telefono.setValue('5599887766');
        tick(450);
        flushMicrotasks();
        fixture.detectChanges();
        expect(apiStub.listClientes).toHaveBeenCalledOnceWith({ q: '5599887766', limit: 1 });
        expect(component.selectedCliente()).toEqual(carlos);
        expect(snackStub.open).toHaveBeenCalledWith('Cliente vinculado automáticamente', 'OK', { duration: 2500 });
        flush();
      }));
    });

    it('refleja ciclo X/4, monedero, tope y actualiza apto_promociones via toggleAptitudPromo', async () => {
      await setupComponent();
      const cliente = makeCliente({ id: 'cli-7', monedero: 30, contador_servicios: 7, apto_promociones: true });
      component.selectCliente(cliente);
      fixture.detectChanges();
      const host = getHost();

      expect(component.serviciosEnCiclo()).toBe(3);
      expect(component.proximaGanancia()).toBe(20);
      expect(host.querySelector('.cycle-hd strong')?.textContent?.trim()).toBe('3 / 4');
      expect(host.querySelectorAll('.c-dot.filled').length).toBe(3);
      expect(host.querySelector('.loyalty-box')?.textContent).toContain('$30.00');

      apiStub.updateCliente.and.callFake((_id, p) => Promise.resolve({ ...cliente, apto_promociones: p.apto_promociones }));
      const toggleBtn = queryRequired<HTMLButtonElement>(host, '.promo-toggle');
      toggleBtn.click();
      await flushAsync();

      expect(apiStub.updateCliente).toHaveBeenCalledOnceWith('cli-7', { apto_promociones: false });
      expect(component.selectedCliente()?.apto_promociones).toBeFalse();
      expect(toggleBtn.textContent).toContain('No aplica promos');
      expect(snackStub.open).toHaveBeenCalledWith('Cliente excluido del programa de lealtad', 'OK', { duration: 3000 });

      component.selectCliente(makeCliente({ id: 'cli-top', monedero: 50, contador_servicios: 4 }));
      fixture.detectChanges();
      expect(component.proximaGanancia()).toBe(0);
      expect(host.querySelector('.loyalty-box')?.textContent).toContain('Tope alcanzado');
    });
  });

  describe('Edicion: carga, stepper de 7 estados y Ticket QR', () => {
    it('carga pedido y evidencias, renderiza folio/descuento, actualiza stepper y abre Ticket QR', async () => {
      await setupComponent({
        routeId: 'ped-42',
        pedido: makePedido({ estado: 'lavando', descuento_aplicado: 20, monto_total: 200, saldo_pendiente: 80 }),
        evidencias: makeEvidencias(2),
      });
      const host = getHost();
      expect(apiStub.getPedido).toHaveBeenCalledOnceWith('ped-42');
      expect(apiStub.listEvidencias).toHaveBeenCalledOnceWith('ped-42');
      expect(apiStub.getCliente).toHaveBeenCalledOnceWith('cli-1');
      expect(host.querySelector('.folio-pill')?.textContent?.trim()).toBe('LAV-4200');
      expect(host.querySelector('.banner--ok')?.textContent).toContain('$20.00');
      expect(host.querySelectorAll('.step-btn').length).toBe(7);

      tap(findBtn(host, '.step-btn', 'Doblando'));
      expect(component.estadoActual()).toBe('doblando');

      component.form.patchValue({ descripcion: 'Edredon King' });
      findBtn(host, 'header button', 'Ticket QR').click();
      const [cmp, cfg] = dialogStub.open.calls.mostRecent().args;
      expect(cmp).toBe(TicketDialogComponent);
      expect(cfg?.data).toEqual(jasmine.objectContaining({
        esCreacion: false,
        pedido: jasmine.objectContaining({ folio: 'LAV-4200', descripcion: 'Edredon King', sucursal_nombre: 'Centro' }),
      }));
    });
  });

  describe('Edicion: EntregaDialogComponent y AccionPedidoDialogComponent', () => {
    it('maneja EntregaDialogComponent al entregar con saldo (abortar, cobrar y deuda)', async () => {
      await setupComponent({ routeId: 'ped-42', pedido: makePedido({ estado: 'listo', monto_total: 200, saldo_pendiente: 120 }) });
      component.setStatus('entregado');

      dialogStub.open.and.returnValue(mockDialogClose<EntregaDialogResponse | undefined>(undefined));
      await component.save();
      expect(dialogStub.open.calls.mostRecent().args[0]).toBe(EntregaDialogComponent);
      expect(apiStub.updatePedido).not.toHaveBeenCalled();

      dialogStub.open.and.returnValue(mockDialogClose<EntregaDialogResponse>({ accion: 'cobrar', metodoPago: 'tarjeta', categoriaIngresoId: 'cat-1' }));
      await component.save();
      expect(apiStub.updatePedido).toHaveBeenCalledOnceWith(
        'ped-42',
        jasmine.objectContaining<PedidoUpdatePayload>({
          estado: 'entregado', saldo_pendiente: 120, monto_cobrado: 120, metodo_pago: 'tarjeta', categoria_ingreso_id: 'cat-1',
        })
      );
      expect(routerStub.navigateByUrl).toHaveBeenCalledOnceWith('/pedidos');

      apiStub.updatePedido.calls.reset();
      routerStub.navigateByUrl.calls.reset();
      dialogStub.open.and.returnValue(mockDialogClose<EntregaDialogResponse>({ accion: 'deuda' }));
      await component.save();
      const deudaPayload = apiStub.updatePedido.calls.mostRecent().args[1];
      expect(deudaPayload.estado).toBe('entregado');
      expect(deudaPayload.monto_cobrado).toBeUndefined();
      expect(deudaPayload.metodo_pago).toBeUndefined();
      expect(snackStub.open).toHaveBeenCalledWith('Pedido entregado. Saldo registrado en Deudas', 'OK', { duration: 3500 });
    });

    it('abre AccionPedidoDialogComponent al pasar a listo, dispara WhatsApp o respeta envio automatico', async () => {
      await setupComponent({ routeId: 'ped-42', pedido: makePedido({ estado: 'doblando', folio: 'LAV-4200', whatsapp_disparado: false }) });
      component.setStatus('listo');

      dialogStub.open.and.returnValue(mockDialogClose('whatsapp'));
      await component.save();
      expect(dialogStub.open.calls.mostRecent().args[0]).toBe(AccionPedidoDialogComponent);
      expect(pedidoActionsStub.sendWhatsapp).toHaveBeenCalledOnceWith(
        jasmine.objectContaining<Pedido>({ folio: 'LAV-4200', estado: 'listo', cliente_nombre: 'Ana Lopez' })
      );

      dialogStub.open.calls.reset();
      pedidoActionsStub.sendWhatsapp.calls.reset();
      dialogStub.open.and.returnValue(mockDialogClose('omitir'));
      await component.save();
      expect(pedidoActionsStub.sendWhatsapp).not.toHaveBeenCalled();

      dialogStub.open.calls.reset();
      apiStub.updatePedido.and.callFake((id, p) =>
        Promise.resolve(makePedido({ id, folio: 'LAV-4200', estado: p.estado ?? 'listo', whatsapp_disparado: true }))
      );
      await component.save();
      expect(dialogStub.open).not.toHaveBeenCalled();
      expect(snackStub.open).toHaveBeenCalledWith('Pedido LAV-4200 LISTO y cliente notificado por WhatsApp', 'OK', { duration: 3500 });
    });
  });

  describe('Evidencias fotograficas y Lightbox de zoom', () => {
    it('abre overlay accesible con contador, navega con botones/teclado y cierra con Escape, X y backdrop', async () => {
      await setupComponent({ routeId: 'ped-42', evidencias: makeEvidencias(3) });
      const host = getHost();
      const counter = (): string | undefined => host.querySelector('.lb-meta .mono')?.textContent?.trim();

      tap(host.querySelectorAll<HTMLButtonElement>('.photo-thumb-btn')[0]);
      const overlay = queryRequired<HTMLElement>(host, '.lb-overlay');
      expect(overlay.getAttribute('role')).toBe('dialog');
      expect(overlay.getAttribute('aria-modal')).toBe('true');
      expect(counter()).toBe('1 / 3');

      tap(queryRequired<HTMLButtonElement>(host, '.lb-nav--next'));
      expect(counter()).toBe('2 / 3');
      pressKey('ArrowRight');
      expect(counter()).toBe('3 / 3');
      pressKey('ArrowLeft');
      expect(counter()).toBe('2 / 3');
      tap(queryRequired<HTMLButtonElement>(host, '.lb-nav--prev'));
      expect(counter()).toBe('1 / 3');
      tap(queryRequired<HTMLImageElement>(host, '.lb-img'));
      expect(component.lightboxIndex()).toBe(0);

      pressKey('Escape');
      expect(host.querySelector('.lb-overlay')).toBeNull();

      component.openLightbox(1);
      fixture.detectChanges();
      tap(queryRequired<HTMLButtonElement>(host, '.lb-close'));
      expect(component.lightboxIndex()).toBeNull();

      component.openLightbox(0);
      fixture.detectChanges();
      tap(queryRequired<HTMLElement>(host, '.lb-overlay'));
      expect(component.lightboxIndex()).toBeNull();
    });

    it('elimina evidencia remota tras confirmacion y reconcilia indice del lightbox y lista', async () => {
      await setupComponent({ routeId: 'ped-42', evidencias: makeEvidencias(3) });

      dialogStub.open.and.returnValue(mockDialogClose(false));
      queryRequired<HTMLButtonElement>(getHost(), '.photo-rm').click();
      await flushAsync();
      expect(dialogStub.open.calls.mostRecent().args[0]).toBe(ConfirmDialogComponent);
      expect(apiStub.deleteEvidencia).not.toHaveBeenCalled();
      expect(component.fotos().length).toBe(3);

      component.openLightbox(2);
      dialogStub.open.and.returnValue(mockDialogClose(true));
      await component.removeFoto(0);
      expect(apiStub.deleteEvidencia).toHaveBeenCalledWith('ped-42', 'ev-1');
      expect(component.fotos().map((f) => f.id)).toEqual(['ev-2', 'ev-3']);
      expect(component.lightboxIndex()).toBe(1);

      await component.removeFoto(1);
      expect(component.fotos().map((f) => f.id)).toEqual(['ev-2']);
      expect(component.lightboxIndex()).toBe(0);

      await component.removeFoto(0);
      expect(component.fotos().length).toBe(0);
      expect(component.lightboxIndex()).toBeNull();

      const revokeSpy = spyOn(URL, 'revokeObjectURL');
      dialogStub.open.calls.reset();
      component.fotos.set([{ url: 'blob:http://localhost/local-1' }]);
      await component.removeFoto(0);
      expect(dialogStub.open).not.toHaveBeenCalled();
      expect(revokeSpy).toHaveBeenCalledOnceWith('blob:http://localhost/local-1');
      expect(component.fotos().length).toBe(0);
    });
  });
});
