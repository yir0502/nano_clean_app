import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter, Router } from '@angular/router';

import { AppComponent } from './app.component';
import { AuthService } from './core/auth.service';

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
        provideRouter([]),
        provideNoopAnimations(),
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();
  });

  it('coloca el menu en esquina superior izquierda y los botones rapidos en la derecha del topbar dejando Salir en el sidebar', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const toolbar = compiled.querySelector('mat-toolbar') as HTMLElement;
    const topbarMenuBtn = toolbar.querySelector('.topbar-menu-btn') as HTMLButtonElement;
    const quickActions = toolbar.querySelector('.topbar-quick-actions') as HTMLElement;
    const drawerText = compiled.querySelector('.drawer-list')?.textContent || '';

    expect(app).toBeTruthy();
    expect(compiled.querySelector('.app-container')).not.toBeNull();
    expect(toolbar).not.toBeNull();
    expect(toolbar.firstElementChild).toBe(topbarMenuBtn);
    expect(quickActions).not.toBeNull();
    expect(toolbar.querySelector('.logout-btn')).toBeNull();
    expect(drawerText).toContain('Salir');

    expect(app.menuOpen()).toBeFalse();
    topbarMenuBtn.click();
    fixture.detectChanges();
    expect(app.menuOpen()).toBeTrue();
  });

  it('deja la barra inferior unicamente con los 4 accesos en orden exacto sin Deudas ni botones de accion rapida', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const dockShell = compiled.querySelector('.bottom-dock-shell') as HTMLElement;
    const navTabs = Array.from(dockShell.querySelectorAll('.bottom-nav-dock .nav-tab span')).map(
      (el) => el.textContent?.trim()
    );

    expect(navTabs).toEqual(['Resumen', 'Pedidos', 'Movimientos', 'Análisis']);
    expect(navTabs).not.toContain('Deudas');
    expect(dockShell.querySelector('.more-options-button')).toBeNull();
    expect(dockShell.querySelectorAll('button').length).toBe(0);
    expect(app.additionalNavOptions.some((opt) => opt.path === '/deudas')).toBeTrue();
  });

  it('navega con los botones del topbar a nuevo pedido y nuevo egreso', () => {
    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, 'navigate').and.resolveTo(true);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const pedidoBtn = compiled.querySelector('.topbar-action-btn--pedido') as HTMLButtonElement;
    const egresoBtn = compiled.querySelector('.topbar-action-btn--egreso') as HTMLButtonElement;

    expect(pedidoBtn).not.toBeNull();
    expect(egresoBtn).not.toBeNull();

    pedidoBtn.click();
    expect(navigateSpy).toHaveBeenCalledWith(['/pedidos/nuevo']);

    egresoBtn.click();
    expect(navigateSpy).toHaveBeenCalledWith(['/movimientos/nuevo'], {
      queryParams: { tipo: 'egreso' },
    });
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
