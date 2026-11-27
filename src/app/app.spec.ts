import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter, Router } from '@angular/router';

import { AppComponent } from './app.component';
import { AuthService } from './core/auth.service';

@Component({ standalone: true, template: '' })
class DummyRouteComponent {}

type AuthServiceStub = Pick<
  AuthService,
  'isLoggedIn' | 'token' | 'orgId' | 'isTokenExpired' | 'login' | 'logout'
>;

function createTouchEvent(
  type: 'touchstart' | 'touchmove' | 'touchend',
  clientX: number,
  clientY: number,
  target?: EventTarget
): TouchEvent {
  const touchPoint = { clientX, clientY } as Touch;
  const touches = type === 'touchend' ? [] : [touchPoint];
  const changedTouches = [touchPoint];
  const evt = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
  Object.defineProperty(evt, 'touches', { value: touches });
  Object.defineProperty(evt, 'changedTouches', { value: changedTouches });
  if (target) {
    Object.defineProperty(evt, 'target', { value: target });
  }
  return evt;
}

describe('AppComponent', () => {
  let authStub: AuthServiceStub;

  beforeEach(async () => {
    authStub = {
      isLoggedIn: signal<boolean>(true),
      token: 'token-1',
      orgId: 'org-1',
      isTokenExpired: () => false,
      login: async () => undefined,
      logout: jasmine.createSpy('logout'),
    };

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([
          { path: 'resumen', component: DummyRouteComponent },
          { path: 'pedidos', component: DummyRouteComponent },
          { path: 'pedidos/nuevo', component: DummyRouteComponent, data: { hideFab: true } },
          { path: 'movimientos', component: DummyRouteComponent },
          { path: 'movimientos/nuevo', component: DummyRouteComponent, data: { hideFab: true } },
          { path: 'analisis', component: DummyRouteComponent },
        ]),
        provideNoopAnimations(),
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();
  });

  it('mantiene el topbar limpio sin botones de creacion y conserva menu a la izquierda y Salir en el sidebar', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const toolbar = compiled.querySelector('mat-toolbar') as HTMLElement;
    const topbarMenuBtn = toolbar.querySelector('.topbar-menu-btn') as HTMLButtonElement;
    const drawerText = compiled.querySelector('.drawer-list')?.textContent || '';

    expect(app).toBeTruthy();
    expect(compiled.querySelector('.app-container')).not.toBeNull();
    expect(toolbar.firstElementChild).toBe(topbarMenuBtn);
    expect(toolbar.querySelector('.topbar-quick-actions')).toBeNull();
    expect(toolbar.querySelector('.logout-btn')).toBeNull();
    expect(drawerText).toContain('Salir');

    expect(app.menuOpen()).toBeFalse();
    topbarMenuBtn.click();
    fixture.detectChanges();
    expect(app.menuOpen()).toBeTrue();
  });

  it('renderiza los 4 accesos en orden exacto flanqueando el boton central circular de agua', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const dock = compiled.querySelector('.bottom-nav-dock') as HTMLElement;
    const navTabs = Array.from(dock.querySelectorAll('.nav-tab span')).map(
      (el) => el.textContent?.trim()
    );
    const centerOrb = dock.querySelector('.center-water-orb') as HTMLButtonElement;

    expect(navTabs).toEqual(['Resumen', 'Pedidos', 'Movimientos', 'Análisis']);
    expect(navTabs).not.toContain('Deudas');
    expect(centerOrb).not.toBeNull();
    expect(centerOrb.querySelector('.orb-water-layer')).not.toBeNull();
    expect(centerOrb.querySelector('svg.orb-icon')).not.toBeNull();
    expect(app.additionalNavOptions.some((opt) => opt.path === '/deudas')).toBeTrue();
  });

  it('abre el abanico de Nuevo Pedido y Nuevo Egreso desde el boton central circular y navega correctamente', () => {
    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, 'navigate').and.resolveTo(true);

    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const centerOrb = compiled.querySelector('.center-water-orb') as HTMLButtonElement;
    const fan = compiled.querySelector('.orb-actions-fan') as HTMLElement;
    const pedidoBtn = compiled.querySelector('.orb-action--pedido') as HTMLButtonElement;
    const egresoBtn = compiled.querySelector('.orb-action--egreso') as HTMLButtonElement;

    expect(app.orbMenuOpen()).toBeFalse();
    expect(fan.classList.contains('open')).toBeFalse();

    centerOrb.click();
    fixture.detectChanges();
    expect(app.orbMenuOpen()).toBeTrue();
    expect(fan.classList.contains('open')).toBeTrue();

    pedidoBtn.click();
    fixture.detectChanges();
    expect(navigateSpy).toHaveBeenCalledWith(['/pedidos/nuevo']);
    expect(app.orbMenuOpen()).toBeFalse();

    centerOrb.click();
    fixture.detectChanges();
    egresoBtn.click();
    fixture.detectChanges();
    expect(navigateSpy).toHaveBeenCalledWith(['/movimientos/nuevo'], {
      queryParams: { tipo: 'egreso' },
    });
    expect(app.orbMenuOpen()).toBeFalse();
  });

  it('anima la gota de agua y la estela direccional al moverse entre secciones del menu inferior', async () => {
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    await router.navigateByUrl('/resumen');
    fixture.detectChanges();
    expect(app.activeTabIndex()).toBe(0);

    // Mover hacia la derecha: Resumen (0) -> Movimientos (2)
    await router.navigateByUrl('/movimientos');
    fixture.detectChanges();
    expect(app.activeTabIndex()).toBe(2);
    expect(app.dropletMotion()).toBe('right');
    expect(app.trailBursts().length).toBe(1);
    expect(app.trailBursts()[0].dir).toBe('right');

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.water-droplet-trail.dir-right')).not.toBeNull();

    // Mover hacia la izquierda: Movimientos (2) -> Pedidos (1)
    await router.navigateByUrl('/pedidos');
    fixture.detectChanges();
    expect(app.activeTabIndex()).toBe(1);
    expect(app.dropletMotion()).toBe('left');
    expect(app.trailBursts().length).toBe(1);
    expect(app.trailBursts()[0].dir).toBe('left');
    expect(compiled.querySelector('.water-droplet-trail.dir-left')).not.toBeNull();
  });

  it('abre el sidebar al deslizar de izquierda a derecha, ignora scroll vertical y cierra al deslizar de derecha a izquierda', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    // Swipe horizontal izquierda -> derecha abre sidebar
    app.onEdgeSwipeStart(createTouchEvent('touchstart', 12, 200));
    app.onEdgeSwipeMove(createTouchEvent('touchmove', 80, 205));
    expect(app.menuOpen()).toBeTrue();

    // Cierra con swipe derecha -> izquierda
    app.onDrawerSwipeStart(createTouchEvent('touchstart', 200, 220));
    app.onDrawerSwipeMove(createTouchEvent('touchmove', 110, 224));
    expect(app.menuOpen()).toBeFalse();

    // Scroll vertical predominante no debe abrir el sidebar
    app.onEdgeSwipeStart(createTouchEvent('touchstart', 12, 200));
    app.onEdgeSwipeMove(createTouchEvent('touchmove', 25, 290));
    app.onEdgeSwipeEnd(createTouchEvent('touchend', 25, 290));
    expect(app.menuOpen()).toBeFalse();
  });
});
