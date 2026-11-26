import { registerLocaleData } from '@angular/common';
import localeEsMX from '@angular/common/locales/es-MX';
import { LOCALE_ID, Type } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';

import { ApiClientService } from '../../core/api-client.service';
import {
  Categoria,
  Movimiento,
  MovimientosPaginadosResponse,
  MovimientosQueryParams,
  Sucursal,
} from '../../core/models';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { MovimientosApiService } from './movimientos-api.service';
import { MovimientosComponent } from './movimientos.component';
import {
  calcularMetaPaginacion,
  calcularRangoPreset,
  construirChipsFiltrosAvanzados,
  detectarPresetActivo,
  formatDateIsoLocal,
  formatMetodoPagoLabel,
} from './movimientos.helpers';

registerLocaleData(localeEsMX);

interface MovimientosApiStub {
  listarPaginados: jasmine.Spy<
    (params: MovimientosQueryParams) => Promise<MovimientosPaginadosResponse>
  >;
}

interface ApiClientStub {
  listCategorias: jasmine.Spy<(tipo?: 'ingreso' | 'egreso') => Promise<Categoria[]>>;
  listSucursales: jasmine.Spy<(params?: { activo?: number }) => Promise<Sucursal[]>>;
  deleteMovimiento: jasmine.Spy<(id: string) => Promise<{ ok: boolean }>>;
}

interface ConfirmDialogRefStub {
  afterClosed: () => Observable<boolean>;
}

interface MatDialogStub {
  open: jasmine.Spy<
    (
      component: Type<ConfirmDialogComponent>,
      config?: { data?: ConfirmDialogData; width?: string; panelClass?: string }
    ) => ConfirmDialogRefStub
  >;
}

interface MatSnackBarStub {
  open: jasmine.Spy<(message: string, action?: string, config?: { duration?: number }) => void>;
}

function makeMovimiento(overrides: Partial<Movimiento> = {}): Movimiento {
  return {
    id: 'mov-1',
    org_id: 'org-1',
    tipo: 'ingreso',
    monto: 150,
    categoria_id: 'cat-ing-1',
    categoria_nombre: 'Lavanderia',
    sucursal_id: 'suc-1',
    sucursal_nombre: 'Centro',
    pedido_id: null,
    fecha: '2026-11-15T12:00:00',
    nota: 'Servicio estandar',
    metodo_pago: 'efectivo',
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

describe('movimientos.helpers', () => {
  it('formatDateIsoLocal formatea fechas locales sin corrimiento UTC y maneja fechas invalidas', () => {
    expect(formatDateIsoLocal(new Date(2026, 0, 5, 23, 55, 0))).toBe('2026-01-05');
    expect(formatDateIsoLocal(new Date('invalid'))).toBe('');
  });

  it('formatMetodoPagoLabel normaliza metodos y usa fallback para valores vacios o desconocidos', () => {
    expect(formatMetodoPagoLabel(' efectivo ')).toBe('Efectivo');
    expect(formatMetodoPagoLabel('TRANSFERENCIA')).toBe('Transferencia');
    expect(formatMetodoPagoLabel('tarjeta')).toBe('Tarjeta');
    expect(formatMetodoPagoLabel('mercado_pago')).toBe('Mercado Pago');
    expect(formatMetodoPagoLabel('otro')).toBe('Otro');
    expect(formatMetodoPagoLabel(null)).toBe('Sin especificar');
    expect(formatMetodoPagoLabel('')).toBe('Sin especificar');
    expect(formatMetodoPagoLabel('cripto')).toBe('Sin especificar');
  });

  it('calcularRangoPreset y detectarPresetActivo calculan e identifican presets correctamente', () => {
    const base = new Date(2026, 10, 20);
    const hoy = calcularRangoPreset('hoy', base);
    expect(formatDateIsoLocal(hoy.desde)).toBe('2026-11-20');
    expect(formatDateIsoLocal(hoy.hasta)).toBe('2026-11-20');
    expect(detectarPresetActivo(hoy.desde, hoy.hasta, base)).toBe('hoy');

    const siete = calcularRangoPreset('7d', base);
    expect(formatDateIsoLocal(siete.desde)).toBe('2026-11-14');
    expect(formatDateIsoLocal(siete.hasta)).toBe('2026-11-20');
    expect(detectarPresetActivo(siete.desde, siete.hasta, base)).toBe('7d');

    const treinta = calcularRangoPreset('30d', base);
    expect(formatDateIsoLocal(treinta.desde)).toBe('2026-10-22');
    expect(formatDateIsoLocal(treinta.hasta)).toBe('2026-11-20');
    expect(detectarPresetActivo(treinta.desde, treinta.hasta, base)).toBe('30d');

    const mes = calcularRangoPreset('mes', base);
    expect(formatDateIsoLocal(mes.desde)).toBe('2026-11-01');
    expect(formatDateIsoLocal(mes.hasta)).toBe('2026-11-20');
    expect(detectarPresetActivo(mes.desde, mes.hasta, base)).toBe('mes');

    expect(detectarPresetActivo(new Date(2026, 9, 1), new Date(2026, 9, 10), base)).toBe(
      'personalizado'
    );
    expect(detectarPresetActivo(new Date('invalid'), base, base)).toBe('personalizado');
  });

  it('calcularMetaPaginacion cubre lista vacia, paginas intermedias y ultima pagina', () => {
    expect(calcularMetaPaginacion(0, 0, 20)).toEqual({
      from: 0,
      to: 0,
      totalPages: 1,
      displayPage: 1,
      canPrev: false,
      canNext: false,
    });

    expect(calcularMetaPaginacion(45, 0, 20)).toEqual({
      from: 1,
      to: 20,
      totalPages: 3,
      displayPage: 1,
      canPrev: false,
      canNext: true,
    });

    expect(calcularMetaPaginacion(45, 2, 20)).toEqual({
      from: 41,
      to: 45,
      totalPages: 3,
      displayPage: 3,
      canPrev: true,
      canNext: false,
    });
  });

  it('construirChipsFiltrosAvanzados arma chips solo para filtros activos y resuelve nombres', () => {
    const categorias: Categoria[] = [
      { id: 'cat-1', org_id: 'org-1', nombre: 'Lavanderia', tipo: 'ingreso', activo: true },
    ];
    const sucursales: Sucursal[] = [
      { id: 'suc-1', org_id: 'org-1', nombre: 'Centro', activo: true },
    ];

    expect(
      construirChipsFiltrosAvanzados({
        presetActivo: 'mes',
        desde: new Date(2026, 10, 1),
        hasta: new Date(2026, 10, 20),
        categoriaId: '',
        categorias,
        sucursalId: '',
        sucursales,
        metodoPago: '',
      })
    ).toEqual([]);

    const chips = construirChipsFiltrosAvanzados({
      presetActivo: 'personalizado',
      desde: new Date(2026, 9, 1),
      hasta: new Date(2026, 9, 15),
      categoriaId: 'cat-1',
      categorias,
      sucursalId: 'suc-missing',
      sucursales,
      metodoPago: 'mercado_pago',
    });

    expect(chips.length).toBe(4);
    expect(chips[0].key).toBe('rango');
    expect(chips[0].value).toContain('2026-10-01');
    expect(chips[0].value).toContain('2026-10-15');
    expect(chips[1].value).toBe('Lavanderia');
    expect(chips[2].value).toBe('suc-missing');
    expect(chips[3].value).toBe('Mercado Pago');
  });
});

describe('MovimientosApiService', () => {
  it('envia paginated=1 y todos los parametros de consulta a /movimientos', async () => {
    const mockResp: MovimientosPaginadosResponse = {
      data: [],
      count: 0,
      totales: { ingresos: 0, egresos: 0, balance: 0 },
    };
    const apiGetSpy = jasmine.createSpy('get').and.resolveTo(mockResp);
    const apiStub: Pick<ApiClientService, 'get'> = {
      get: apiGetSpy as ApiClientService['get'],
    };

    TestBed.configureTestingModule({
      providers: [MovimientosApiService, { provide: ApiClientService, useValue: apiStub }],
    });

    const service = TestBed.inject(MovimientosApiService);
    const result = await service.listarPaginados({
      desde: '2026-11-01',
      hasta: '2026-11-30',
      tipo: 'ingreso',
      q: 'jabon',
      limit: 20,
      offset: 40,
    });

    expect(result).toEqual(mockResp);
    expect(apiGetSpy).toHaveBeenCalledOnceWith('/movimientos', {
      desde: '2026-11-01',
      hasta: '2026-11-30',
      tipo: 'ingreso',
      categoria_id: undefined,
      sucursal_id: undefined,
      metodo_pago: undefined,
      q: 'jabon',
      limit: 20,
      offset: 40,
      pedido_id: undefined,
      org_id: undefined,
      paginated: 1,
    });
  });
});

describe('MovimientosComponent', () => {
  let fixture: ComponentFixture<MovimientosComponent>;
  let component: MovimientosComponent;
  let movimientosApiStub: MovimientosApiStub;
  let apiClientStub: ApiClientStub;
  let dialogStub: MatDialogStub;
  let snackStub: MatSnackBarStub;

  const categoriasIngreso: Categoria[] = [
    { id: 'cat-ing-1', org_id: 'org-1', nombre: 'Lavanderia', tipo: 'ingreso', activo: true },
  ];
  const categoriasEgreso: Categoria[] = [
    { id: 'cat-egr-1', org_id: 'org-1', nombre: 'Insumos', tipo: 'egreso', activo: true },
  ];
  const sucursalesMock: Sucursal[] = [
    { id: 'suc-1', org_id: 'org-1', nombre: 'Centro', activo: true },
    { id: 'suc-2', org_id: 'org-1', nombre: 'Norte', activo: true },
  ];

  const defaultResponse: MovimientosPaginadosResponse = {
    data: [makeMovimiento({ id: 'mov-1', monto: 100 }), makeMovimiento({ id: 'mov-2', tipo: 'egreso', monto: 40 })],
    count: 25,
    totales: {
      ingresos: 15400,
      egresos: 3200.5,
      balance: 12199.5,
    },
  };

  async function flushAsync(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function setupComponent(options?: {
    initialQueryParams?: Record<string, string>;
    initialResponse?: MovimientosPaginadosResponse;
  }): Promise<void> {
    movimientosApiStub = {
      listarPaginados: jasmine
        .createSpy('listarPaginados')
        .and.resolveTo(options?.initialResponse ?? defaultResponse),
    };

    apiClientStub = {
      listCategorias: jasmine
        .createSpy('listCategorias')
        .and.callFake(async (tipo?: 'ingreso' | 'egreso') =>
          tipo === 'egreso' ? categoriasEgreso : categoriasIngreso
        ),
      listSucursales: jasmine.createSpy('listSucursales').and.resolveTo(sucursalesMock),
      deleteMovimiento: jasmine.createSpy('deleteMovimiento').and.resolveTo({ ok: true }),
    };

    dialogStub = {
      open: jasmine.createSpy('open').and.returnValue({
        afterClosed: () => of(true),
      }),
    };

    snackStub = {
      open: jasmine.createSpy('open'),
    };

    await TestBed.configureTestingModule({
      imports: [MovimientosComponent],
      providers: [
        { provide: LOCALE_ID, useValue: 'es-MX' },
        provideNoopAnimations(),
        provideRouter([]),
        { provide: MovimientosApiService, useValue: movimientosApiStub },
        { provide: ApiClientService, useValue: apiClientStub },
        { provide: MatDialog, useValue: dialogStub },
        { provide: MatSnackBar, useValue: snackStub },
      ],
    })
      .overrideProvider(MatDialog, { useValue: dialogStub })
      .overrideProvider(MatSnackBar, { useValue: snackStub })
      .compileComponents();

    if (options?.initialQueryParams) {
      const route = TestBed.inject(ActivatedRoute);
      route.snapshot.queryParams = options.initialQueryParams;
    }

    fixture = TestBed.createComponent(MovimientosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await flushAsync();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('1. carga inicial consulta limit=20 y offset=0 y renderiza totales del servidor en KPI cards', async () => {
    await setupComponent();

    const esperadoMes = calcularRangoPreset('mes');
    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledTimes(1);
    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledWith({
      desde: formatDateIsoLocal(esperadoMes.desde),
      hasta: formatDateIsoLocal(esperadoMes.hasta),
      categoria_id: undefined,
      sucursal_id: undefined,
      metodo_pago: undefined,
      q: undefined,
      limit: 20,
      offset: 0,
    });

    const host = fixture.nativeElement as HTMLElement;
    const balanceCard = host.querySelector('.kpi-card--hero') as HTMLElement;
    const ingresoCard = host.querySelector('.kpi-card--ingreso') as HTMLElement;
    const egresoCard = host.querySelector('.kpi-card--egreso') as HTMLElement;

    expect(balanceCard.querySelector('.kpi-label')?.textContent?.trim()).toBe('Balance');
    expect(balanceCard.querySelector('.kpi-value')?.textContent).toContain('12,199.5');
    expect(balanceCard.querySelector('.kpi-subtitle')?.textContent).toContain(
      '25 movimientos en el periodo'
    );
    expect(balanceCard.classList.contains('negativo')).toBeFalse();

    expect(ingresoCard.querySelector('.kpi-label')?.textContent?.trim()).toBe('Ingresos');
    expect(ingresoCard.querySelector('.kpi-value')?.textContent).toContain('15,400');

    expect(egresoCard.querySelector('.kpi-label')?.textContent?.trim()).toBe('Egresos');
    expect(egresoCard.querySelector('.kpi-value')?.textContent).toContain('3,200.5');
  });

  it('marca el hero KPI como negativo cuando el balance del servidor es menor a cero', async () => {
    await setupComponent({
      initialResponse: {
        data: [makeMovimiento({ tipo: 'egreso', monto: 500 })],
        count: 1,
        totales: { ingresos: 100, egresos: 600, balance: -500 },
      },
    });

    const host = fixture.nativeElement as HTMLElement;
    const balanceCard = host.querySelector('.kpi-card--hero') as HTMLElement;
    expect(balanceCard.classList.contains('negativo')).toBeTrue();
  });

  it('inicializa q desde queryParams ?q= en la carga inicial', async () => {
    await setupComponent({
      initialQueryParams: { q: '  detergente  ' },
    });

    expect(component.qInput()).toBe('detergente');
    expect(component.q()).toBe('detergente');
    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledWith(
      jasmine.objectContaining({ q: 'detergente', limit: 20, offset: 0 })
    );
  });

  it('2. paginacion Siguiente/Anterior envia offset 20/0 y cambio de pageSize resetea offset a 0', async () => {
    const pageData: MovimientosPaginadosResponse = {
      data: [makeMovimiento({ id: 'mov-p1' })],
      count: 45,
      totales: { ingresos: 5000, egresos: 1000, balance: 4000 },
    };
    await setupComponent({ initialResponse: pageData });

    const host = fixture.nativeElement as HTMLElement;
    const prevBtn = host.querySelector('button[aria-label="Página anterior"]') as HTMLButtonElement;
    const nextBtn = host.querySelector('button[aria-label="Página siguiente"]') as HTMLButtonElement;
    const rowsSelect = host.querySelector('select.rows-select') as HTMLSelectElement;

    expect(prevBtn.disabled).toBeTrue();
    expect(nextBtn.disabled).toBeFalse();
    expect(host.querySelector('.pg-cnt')?.textContent).toContain('Mostrando 1-20 de 45');

    nextBtn.click();
    await flushAsync();

    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledWith(
      jasmine.objectContaining({ limit: 20, offset: 20 })
    );
    expect(prevBtn.disabled).toBeFalse();
    expect(host.querySelector('.pg-cnt')?.textContent).toContain('Mostrando 21-40 de 45');

    prevBtn.click();
    await flushAsync();

    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledWith(
      jasmine.objectContaining({ limit: 20, offset: 0 })
    );

    nextBtn.click();
    await flushAsync();
    expect(component.page()).toBe(1);

    rowsSelect.value = '50';
    rowsSelect.dispatchEvent(new Event('change'));
    await flushAsync();

    expect(component.pageSize()).toBe(50);
    expect(component.page()).toBe(0);
    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledWith(
      jasmine.objectContaining({ limit: 50, offset: 0 })
    );

    rowsSelect.value = '10';
    rowsSelect.dispatchEvent(new Event('change'));
    await flushAsync();
    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledWith(
      jasmine.objectContaining({ limit: 10, offset: 0 })
    );

    rowsSelect.value = '20';
    rowsSelect.dispatchEvent(new Event('change'));
    await flushAsync();
    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledWith(
      jasmine.objectContaining({ limit: 20, offset: 0 })
    );
  });

  it('3. busqueda q aplica debounce de 300 ms, resetea a pagina 1 y limpiar cancela debounce pendiente', fakeAsync(() => {
    movimientosApiStub = {
      listarPaginados: jasmine.createSpy('listarPaginados').and.resolveTo({
        data: [makeMovimiento({ id: 'mov-1' })],
        count: 45,
        totales: { ingresos: 1000, egresos: 200, balance: 800 },
      }),
    };

    apiClientStub = {
      listCategorias: jasmine.createSpy('listCategorias').and.resolveTo(categoriasIngreso),
      listSucursales: jasmine.createSpy('listSucursales').and.resolveTo(sucursalesMock),
      deleteMovimiento: jasmine.createSpy('deleteMovimiento').and.resolveTo({ ok: true }),
    };

    dialogStub = {
      open: jasmine.createSpy('open').and.returnValue({ afterClosed: () => of(false) }),
    };
    snackStub = { open: jasmine.createSpy('open') };

    TestBed.configureTestingModule({
      imports: [MovimientosComponent],
      providers: [
        { provide: LOCALE_ID, useValue: 'es-MX' },
        provideNoopAnimations(),
        provideRouter([]),
        { provide: MovimientosApiService, useValue: movimientosApiStub },
        { provide: ApiClientService, useValue: apiClientStub },
        { provide: MatDialog, useValue: dialogStub },
        { provide: MatSnackBar, useValue: snackStub },
      ],
    })
      .overrideProvider(MatDialog, { useValue: dialogStub })
      .overrideProvider(MatSnackBar, { useValue: snackStub });

    fixture = TestBed.createComponent(MovimientosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    flushMicrotasks();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const nextBtn = host.querySelector('button[aria-label="Página siguiente"]') as HTMLButtonElement;
    expect(nextBtn).not.toBeNull();
    nextBtn.click();
    flushMicrotasks();
    fixture.detectChanges();
    expect(component.page()).toBe(1);

    movimientosApiStub.listarPaginados.calls.reset();

    const searchInput = host.querySelector('input.search-input') as HTMLInputElement;

    searchInput.value = 'detergente';
    searchInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    tick(299);
    expect(movimientosApiStub.listarPaginados).not.toHaveBeenCalled();

    tick(1);
    flushMicrotasks();
    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledTimes(1);
    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledWith(
      jasmine.objectContaining({ q: 'detergente', offset: 0 })
    );
    expect(component.page()).toBe(0);

    // Escribir nuevo termino y limpiar antes de los 300 ms cancela el debounce pendiente
    movimientosApiStub.listarPaginados.calls.reset();
    searchInput.value = 'suavizante';
    searchInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    tick(150);
    expect(movimientosApiStub.listarPaginados).not.toHaveBeenCalled();

    const clearBtn = host.querySelector('button.search-clear-btn') as HTMLButtonElement;
    expect(clearBtn).not.toBeNull();
    clearBtn.click();
    fixture.detectChanges();
    flushMicrotasks();

    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledTimes(1);
    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledWith(
      jasmine.objectContaining({ q: undefined, offset: 0 })
    );

    tick(500);
    flushMicrotasks();
    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledTimes(1);

    // Con q ya vacio, iniciar escritura y limpiar antes de 300 ms no dispara ninguna peticion
    movimientosApiStub.listarPaginados.calls.reset();
    searchInput.value = 'cloro';
    searchInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    tick(150);

    const clearBtnAgain = host.querySelector('button.search-clear-btn') as HTMLButtonElement;
    clearBtnAgain.click();
    fixture.detectChanges();
    tick(500);
    flushMicrotasks();

    expect(movimientosApiStub.listarPaginados).not.toHaveBeenCalled();
  }));

  it('4. toggle de filtros avanzados, badge contador, chips removibles al cerrar y Limpiar filtros', async () => {
    await setupComponent();
    const host = fixture.nativeElement as HTMLElement;
    const fltBtn = host.querySelector('button.flt-btn') as HTMLButtonElement;

    expect(host.querySelector('#movimientos-filtros-avanzados')).toBeNull();
    expect(host.querySelector('.flt-badge')).toBeNull();
    expect(host.querySelector('.chips-bar')).toBeNull();
    expect(fltBtn.getAttribute('aria-expanded')).toBe('false');

    fltBtn.click();
    fixture.detectChanges();
    expect(host.querySelector('#movimientos-filtros-avanzados')).not.toBeNull();
    expect(fltBtn.getAttribute('aria-expanded')).toBe('true');

    component.onStartDateChange(new Date(2026, 9, 1));
    component.onEndDateChange(new Date(2026, 9, 15));
    component.onCategoriaChange('cat-ing-1');
    component.onSucursalChange('suc-1');
    component.onMetodoChange('transferencia');
    await flushAsync();

    expect(host.querySelector('.flt-badge')?.textContent?.trim()).toBe('4');
    expect(host.querySelector('.chips-bar')).toBeNull();
    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledWith(
      jasmine.objectContaining({
        desde: '2026-10-01',
        hasta: '2026-10-15',
        categoria_id: 'cat-ing-1',
        sucursal_id: 'suc-1',
        metodo_pago: 'transferencia',
        offset: 0,
      })
    );

    // Cerrar panel muestra chips removibles
    fltBtn.click();
    fixture.detectChanges();
    expect(host.querySelector('#movimientos-filtros-avanzados')).toBeNull();
    const chips = host.querySelectorAll('.chips-bar .active-chip');
    expect(chips.length).toBe(4);

    movimientosApiStub.listarPaginados.calls.reset();
    const removeSucBtn = host.querySelector(
      'button[aria-label="Quitar filtro Sucursal"]'
    ) as HTMLButtonElement;
    removeSucBtn.click();
    await flushAsync();

    expect(component.sucursalId()).toBe('');
    expect(host.querySelector('.flt-badge')?.textContent?.trim()).toBe('3');
    expect(host.querySelectorAll('.chips-bar .active-chip').length).toBe(3);
    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledWith(
      jasmine.objectContaining({ sucursal_id: undefined, offset: 0 })
    );

    // Abrir panel y limpiar todos los filtros
    fltBtn.click();
    fixture.detectChanges();
    movimientosApiStub.listarPaginados.calls.reset();

    const clearAllBtn = host.querySelector('button.clr-btn') as HTMLButtonElement;
    clearAllBtn.click();
    await flushAsync();

    const mes = calcularRangoPreset('mes');
    expect(component.categoriaId()).toBe('');
    expect(component.sucursalId()).toBe('');
    expect(component.metodoPago()).toBe('');
    expect(component.tipo()).toBe('todos');
    expect(host.querySelector('.flt-badge')).toBeNull();
    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledTimes(1);
    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledWith(
      jasmine.objectContaining({
        desde: formatDateIsoLocal(mes.desde),
        hasta: formatDateIsoLocal(mes.hasta),
        categoria_id: undefined,
        sucursal_id: undefined,
        metodo_pago: undefined,
        q: undefined,
        offset: 0,
      })
    );
  });

  it('5. clic en KPI cards actualiza filtro tipo y recarga datos', async () => {
    await setupComponent();
    const host = fixture.nativeElement as HTMLElement;
    const heroCard = host.querySelector('.kpi-card--hero') as HTMLButtonElement;
    const ingresoCard = host.querySelector('.kpi-card--ingreso') as HTMLButtonElement;
    const egresoCard = host.querySelector('.kpi-card--egreso') as HTMLButtonElement;

    component.onCategoriaChange('cat-ing-1');
    await flushAsync();
    movimientosApiStub.listarPaginados.calls.reset();

    ingresoCard.click();
    await flushAsync();
    expect(component.tipo()).toBe('ingreso');
    expect(component.categoriaId()).toBe('');
    expect(ingresoCard.classList.contains('kpi-active')).toBeTrue();
    expect(ingresoCard.getAttribute('aria-pressed')).toBe('true');
    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledWith(
      jasmine.objectContaining({ tipo: 'ingreso', categoria_id: undefined, offset: 0 })
    );

    // Clic redundante en KPI activo en pagina 0 no recarga
    movimientosApiStub.listarPaginados.calls.reset();
    ingresoCard.click();
    await flushAsync();
    expect(movimientosApiStub.listarPaginados).not.toHaveBeenCalled();

    egresoCard.click();
    await flushAsync();
    expect(component.tipo()).toBe('egreso');
    expect(egresoCard.classList.contains('kpi-active')).toBeTrue();
    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledWith(
      jasmine.objectContaining({ tipo: 'egreso', offset: 0 })
    );

    heroCard.click();
    await flushAsync();
    expect(component.tipo()).toBe('todos');
    expect(heroCard.classList.contains('kpi-active')).toBeTrue();
    const lastCallParams = movimientosApiStub.listarPaginados.calls.mostRecent().args[0];
    expect(lastCallParams.tipo).toBeUndefined();
    expect(lastCallParams.offset).toBe(0);
  });

  it('6. tocar nota larga alterna estado expandido y chip Pedido solo se renderiza si existe pedido_id', async () => {
    const notaLarga =
      'Nota muy larga de prueba para verificar que el boton de nota en tarjeta movil alterna su estado expandido correctamente al recibir clic del usuario.';

    await setupComponent({
      initialResponse: {
        data: [
          makeMovimiento({ id: 'mov-con-pedido', pedido_id: 'ped-100', nota: notaLarga }),
          makeMovimiento({ id: 'mov-sin-pedido', pedido_id: null, nota: 'Nota breve' }),
        ],
        count: 2,
        totales: { ingresos: 300, egresos: 0, balance: 300 },
      },
    });

    const host = fixture.nativeElement as HTMLElement;
    const cards = host.querySelectorAll('.mob-list .mov-card');
    expect(cards.length).toBe(2);

    const noteBtn = cards[0].querySelector('button.mov-card__note') as HTMLButtonElement;
    expect(noteBtn).not.toBeNull();
    expect(noteBtn.classList.contains('expanded')).toBeFalse();
    expect(noteBtn.getAttribute('aria-expanded')).toBe('false');

    noteBtn.click();
    fixture.detectChanges();
    expect(noteBtn.classList.contains('expanded')).toBeTrue();
    expect(noteBtn.getAttribute('aria-expanded')).toBe('true');

    noteBtn.click();
    fixture.detectChanges();
    expect(noteBtn.classList.contains('expanded')).toBeFalse();
    expect(noteBtn.getAttribute('aria-expanded')).toBe('false');

    // Enlace Pedido en tarjeta movil y tabla escritorio solo cuando pedido_id existe
    const chipCardConPedido = cards[0].querySelector('a.pedido-chip');
    const chipCardSinPedido = cards[1].querySelector('a.pedido-chip');
    expect(chipCardConPedido).not.toBeNull();
    expect(chipCardConPedido?.textContent).toContain('Pedido');
    expect(chipCardSinPedido).toBeNull();

    const tableRows = host.querySelectorAll('.mov-table tbody tr');
    expect(tableRows.length).toBe(2);
    expect(tableRows[0].querySelector('a.pedido-chip')).not.toBeNull();
    expect(tableRows[0].querySelector('a.tbl-act-ped')).not.toBeNull();
    expect(tableRows[1].querySelector('a.pedido-chip')).toBeNull();
    expect(tableRows[1].querySelector('a.tbl-act-ped')).toBeNull();
  });

  it('7. eliminar ultimo registro en pagina 2 retrocede a pagina 1 (offset 0) y recarga totales reales del servidor', async () => {
    const movPage1 = makeMovimiento({ id: 'mov-1', monto: 200 });
    const movUltimoPage2 = makeMovimiento({ id: 'mov-ultimo', monto: 350 });

    await setupComponent({
      initialResponse: {
        data: [movPage1],
        count: 21,
        totales: { ingresos: 2350, egresos: 400, balance: 1950 },
      },
    });

    movimientosApiStub.listarPaginados.and.resolveTo({
      data: [movUltimoPage2],
      count: 21,
      totales: { ingresos: 2350, egresos: 400, balance: 1950 },
    });

    const host = fixture.nativeElement as HTMLElement;
    const nextBtn = host.querySelector('button[aria-label="Página siguiente"]') as HTMLButtonElement;
    nextBtn.click();
    await flushAsync();

    expect(component.page()).toBe(1);
    expect(component.items().length).toBe(1);

    // Respuesta esperada del servidor al recargar pagina 1 tras eliminacion
    movimientosApiStub.listarPaginados.calls.reset();
    movimientosApiStub.listarPaginados.and.resolveTo({
      data: [movPage1],
      count: 20,
      totales: { ingresos: 2000, egresos: 400, balance: 1600 },
    });

    const delBtn = host.querySelector('.mov-card .act-btn--del') as HTMLButtonElement;
    delBtn.click();
    await flushAsync();

    expect(dialogStub.open).toHaveBeenCalledWith(
      ConfirmDialogComponent,
      jasmine.objectContaining({
        width: '360px',
        panelClass: 'custom-modal-panel',
      })
    );
    expect(apiClientStub.deleteMovimiento).toHaveBeenCalledOnceWith('mov-ultimo');
    expect(component.page()).toBe(0);
    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({ limit: 20, offset: 0 })
    );

    const balanceCard = host.querySelector('.kpi-card--hero') as HTMLElement;
    const ingresoCard = host.querySelector('.kpi-card--ingreso') as HTMLElement;
    expect(balanceCard.querySelector('.kpi-value')?.textContent).toContain('1,600');
    expect(balanceCard.querySelector('.kpi-subtitle')?.textContent).toContain(
      '20 movimientos en el periodo'
    );
    expect(ingresoCard.querySelector('.kpi-value')?.textContent).toContain('2,000');
  });

  it('no elimina ni recarga si el usuario cancela el dialogo de confirmacion', async () => {
    await setupComponent();
    dialogStub.open.and.returnValue({ afterClosed: () => of(false) });
    movimientosApiStub.listarPaginados.calls.reset();

    const host = fixture.nativeElement as HTMLElement;
    const delBtn = host.querySelector('.mov-card .act-btn--del') as HTMLButtonElement;
    delBtn.click();
    await flushAsync();

    expect(apiClientStub.deleteMovimiento).not.toHaveBeenCalled();
    expect(movimientosApiStub.listarPaginados).not.toHaveBeenCalled();
  });

  it('ignora respuestas obsoletas ante peticiones concurrentes (race condition)', async () => {
    await setupComponent();

    const req1 = createDeferred<MovimientosPaginadosResponse>();
    const req2 = createDeferred<MovimientosPaginadosResponse>();

    movimientosApiStub.listarPaginados.and.returnValues(req1.promise, req2.promise);

    component.onTipoChange('ingreso');
    component.onTipoChange('egreso');

    req2.resolve({
      data: [makeMovimiento({ id: 'mov-reciente', tipo: 'egreso', monto: 99 })],
      count: 1,
      totales: { ingresos: 0, egresos: 99, balance: -99 },
    });
    await flushAsync();

    // Llega tarde la respuesta obsoleta de req1
    req1.resolve({
      data: [makeMovimiento({ id: 'mov-obsoleto', tipo: 'ingreso', monto: 777 })],
      count: 99,
      totales: { ingresos: 777, egresos: 0, balance: 777 },
    });
    await flushAsync();

    expect(component.items().map((m) => m.id)).toEqual(['mov-reciente']);
    expect(component.totalCount()).toBe(1);
    expect(component.totales()).toEqual({ ingresos: 0, egresos: 99, balance: -99 });
  });

  it('muestra estado de error y permite reintentar cuando falla listarPaginados', async () => {
    await setupComponent();
    movimientosApiStub.listarPaginados.and.rejectWith(new Error('Fallo de red'));

    component.reload();
    await flushAsync();

    const host = fixture.nativeElement as HTMLElement;
    const errorCard = host.querySelector('.state-card--error') as HTMLElement;
    expect(errorCard).not.toBeNull();
    expect(errorCard.textContent).toContain('Fallo de red');

    movimientosApiStub.listarPaginados.and.resolveTo(defaultResponse);
    const retryBtn = errorCard.querySelector('button') as HTMLButtonElement;
    retryBtn.click();
    await flushAsync();

    expect(host.querySelector('.state-card--error')).toBeNull();
    expect(host.querySelectorAll('.mob-list .mov-card').length).toBe(2);
  });

  it('botones de preset y grupo de tipo actualizan filtros y resetean offset a 0', async () => {
    await setupComponent({
      initialResponse: {
        data: [makeMovimiento({ id: 'mov-1' })],
        count: 45,
        totales: { ingresos: 1000, egresos: 0, balance: 1000 },
      },
    });

    const host = fixture.nativeElement as HTMLElement;
    const nextBtn = host.querySelector('button[aria-label="Página siguiente"]') as HTMLButtonElement;
    nextBtn.click();
    await flushAsync();
    expect(component.page()).toBe(1);

    movimientosApiStub.listarPaginados.calls.reset();
    const presetHoyBtn = Array.from(host.querySelectorAll('button.preset-btn')).find(
      (btn) => btn.textContent?.trim() === 'Hoy'
    ) as HTMLButtonElement;
    presetHoyBtn.click();
    await flushAsync();

    const hoy = calcularRangoPreset('hoy');
    expect(component.presetActivo()).toBe('hoy');
    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledWith(
      jasmine.objectContaining({
        desde: formatDateIsoLocal(hoy.desde),
        hasta: formatDateIsoLocal(hoy.hasta),
        offset: 0,
      })
    );

    movimientosApiStub.listarPaginados.calls.reset();
    const segIngresoBtn = Array.from(host.querySelectorAll('button.seg-btn')).find(
      (btn) => btn.textContent?.trim() === 'Ingresos'
    ) as HTMLButtonElement;
    segIngresoBtn.click();
    await flushAsync();
    expect(component.tipo()).toBe('ingreso');
    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledWith(
      jasmine.objectContaining({ tipo: 'ingreso', offset: 0 })
    );
  });

  it('Enter en el campo de busqueda consulta inmediatamente sin esperar debounce', async () => {
    await setupComponent();
    movimientosApiStub.listarPaginados.calls.reset();

    const host = fixture.nativeElement as HTMLElement;
    const searchInput = host.querySelector('input.search-input') as HTMLInputElement;
    searchInput.value = 'urgente';
    searchInput.dispatchEvent(new Event('input'));
    searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await flushAsync();

    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({ q: 'urgente', offset: 0 })
    );
  });

  it('rango de fechas pendiente en calendario abierto espera al cierre y ajusta desde <= hasta', async () => {
    await setupComponent();
    movimientosApiStub.listarPaginados.calls.reset();

    component.onStartDateChange(new Date(2026, 10, 25), true);
    component.onEndDateChange(new Date(2026, 10, 10));
    await flushAsync();

    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledWith(
      jasmine.objectContaining({
        desde: '2026-11-10',
        hasta: '2026-11-10',
        offset: 0,
      })
    );

    movimientosApiStub.listarPaginados.calls.reset();
    component.onStartDateChange(new Date(2026, 10, 28), true);
    expect(movimientosApiStub.listarPaginados).not.toHaveBeenCalled();

    component.onDateRangeClosed();
    await flushAsync();
    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledWith(
      jasmine.objectContaining({
        desde: '2026-11-28',
        hasta: '2026-11-28',
        offset: 0,
      })
    );
  });

  it('conserva pagina 2 si aun quedan registros y muestra snackbar si falla la eliminacion', async () => {
    const movA = makeMovimiento({ id: 'mov-a' });
    const movB = makeMovimiento({ id: 'mov-b' });
    await setupComponent({
      initialResponse: {
        data: [movA, movB],
        count: 22,
        totales: { ingresos: 300, egresos: 0, balance: 300 },
      },
    });

    const host = fixture.nativeElement as HTMLElement;
    const nextBtn = host.querySelector('button[aria-label="Página siguiente"]') as HTMLButtonElement;
    nextBtn.click();
    await flushAsync();
    expect(component.page()).toBe(1);

    movimientosApiStub.listarPaginados.calls.reset();
    const delBtn = host.querySelector('.mov-card .act-btn--del') as HTMLButtonElement;
    delBtn.click();
    await flushAsync();

    expect(component.page()).toBe(1);
    expect(movimientosApiStub.listarPaginados).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({ limit: 20, offset: 20 })
    );

    movimientosApiStub.listarPaginados.calls.reset();
    apiClientStub.deleteMovimiento.and.rejectWith(new Error('Permiso denegado'));
    delBtn.click();
    await flushAsync();

    expect(snackStub.open).toHaveBeenCalledWith('Permiso denegado', 'OK', { duration: 4000 });
    expect(movimientosApiStub.listarPaginados).not.toHaveBeenCalled();
  });

  it('muestra estado vacio y resuelve nombres de categoria desde catalogo o fallback', async () => {
    await setupComponent({
      initialResponse: {
        data: [
          makeMovimiento({ id: 'm1', categoria_id: 'cat-ing-1', categoria_nombre: '' }),
          makeMovimiento({ id: 'm2', categoria_id: 'inexistente', categoria_nombre: '' }),
        ],
        count: 2,
        totales: { ingresos: 300, egresos: 0, balance: 300 },
      },
    });

    const host = fixture.nativeElement as HTMLElement;
    const catNames = Array.from(host.querySelectorAll('.mob-list .mov-card__cat')).map((el) =>
      el.textContent?.trim()
    );
    expect(catNames).toEqual(['Lavanderia', 'Sin categoría']);

    movimientosApiStub.listarPaginados.and.resolveTo({
      data: [],
      count: 0,
      totales: { ingresos: 0, egresos: 0, balance: 0 },
    });
    component.reload();
    await flushAsync();

    expect(host.querySelector('.state-card h3')?.textContent?.trim()).toBe(
      'Sin movimientos en este rango'
    );
  });
});
