import { Component, computed, inject, signal } from '@angular/core';
import { Router, NavigationEnd, ActivatedRoute, RouterLink, RouterOutlet, RouterLinkActive } from '@angular/router';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, map, startWith } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from './core/auth.service';

import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { SharedModule } from './shared/shared.module';
import { LoaderComponent } from './shared/components/loader.component';
import { NgIf, NgFor } from '@angular/common';

export interface NavOption {
  path: string;
  icon: string;
  label: string;
  exact?: boolean;
}

interface SwipePoint {
  x: number;
  y: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    SharedModule,
    NgIf,
    NgFor,
    MatSidenavModule,
    MatListModule,
    MatButtonModule,
    LoaderComponent,
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
})
export class AppComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  public readonly auth = inject(AuthService);
  private readonly swUpdate = inject(SwUpdate, { optional: true });

  private edgeSwipeStart: SwipePoint | null = null;
  private edgeSwipeCurrent: SwipePoint | null = null;
  private drawerSwipeStart: SwipePoint | null = null;
  private drawerSwipeCurrent: SwipePoint | null = null;

  constructor() {
    if (this.swUpdate?.isEnabled) {
      this.swUpdate.versionUpdates
        .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
        .subscribe(() => {
          window.location.reload();
        });
    }
  }

  menuOpen = signal(false);

  readonly additionalNavOptions: ReadonlyArray<NavOption> = [
    { path: '/resumen', icon: 'space_dashboard', label: 'Resumen', exact: true },
    { path: '/pedidos', icon: 'local_laundry_service', label: 'Pedidos' },
    { path: '/movimientos', icon: 'receipt_long', label: 'Movimientos' },
    { path: '/analisis', icon: 'insights', label: 'Análisis' },
    { path: '/deudas', icon: 'account_balance_wallet', label: 'Deudas' },
    { path: '/clientes', icon: 'people_alt', label: 'Clientes' },
    { path: '/administracion', icon: 'tune', label: 'Administración' },
  ];

  readonly bottomNavItems: ReadonlyArray<NavOption> = [
    { path: '/resumen', icon: 'space_dashboard', label: 'Resumen', exact: true },
    { path: '/pedidos', icon: 'local_laundry_service', label: 'Pedidos' },
    { path: '/movimientos', icon: 'receipt_long', label: 'Movimientos' },
    { path: '/analisis', icon: 'insights', label: 'Análisis' },
  ];

  private readonly hideSig = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => {
        let r: ActivatedRoute | null = this.route;
        while (r?.firstChild) r = r.firstChild;
        return r?.snapshot.data?.['hideChrome'] === true;
      }),
      startWith(false)
    )
  );

  private readonly fabSig = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => {
        let r: ActivatedRoute | null = this.route;
        while (r?.firstChild) r = r.firstChild;
        return r?.snapshot.data?.['hideFab'] === true;
      }),
      startWith(false)
    )
  );

  hideChrome = computed(() => this.hideSig());

  hideFab = computed(() => {
    if (this.hideChrome()) return true;
    return this.fabSig();
  });

  toggleMenu(): void {
    this.menuOpen.update((val) => !val);
  }

  navigateAndCloseMenu(path: string): void {
    void this.router.navigateByUrl(path);
    this.menuOpen.set(false);
  }

  logoutAndClose(): void {
    this.logout();
    this.menuOpen.set(false);
  }

  goToNuevoPedido(): void {
    void this.router.navigate(['/pedidos/nuevo']);
  }

  goToNuevoEgreso(): void {
    void this.router.navigate(['/movimientos/nuevo'], { queryParams: { tipo: 'egreso' } });
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }

  onEdgeSwipeStart(event: TouchEvent): void {
    if (this.hideChrome() || this.menuOpen()) return;
    const touch = event.touches[0];
    if (!touch) return;
    if (touch.clientX > 48 && this.isInsideHorizontallyScrolledElement(event.target)) {
      this.edgeSwipeStart = null;
      this.edgeSwipeCurrent = null;
      return;
    }
    const point: SwipePoint = { x: touch.clientX, y: touch.clientY };
    this.edgeSwipeStart = point;
    this.edgeSwipeCurrent = point;
  }

  onEdgeSwipeMove(event: TouchEvent): void {
    const start = this.edgeSwipeStart;
    if (this.hideChrome() || this.menuOpen() || !start) return;
    const touch = event.touches[0];
    if (!touch) return;
    this.edgeSwipeCurrent = { x: touch.clientX, y: touch.clientY };

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;

    if (Math.abs(deltaY) > 60 && Math.abs(deltaY) > Math.abs(deltaX)) {
      this.edgeSwipeStart = null;
      this.edgeSwipeCurrent = null;
      return;
    }

    if (deltaX >= 50 && Math.abs(deltaY) < 60 && deltaX > Math.abs(deltaY) * 1.25) {
      this.edgeSwipeStart = null;
      this.edgeSwipeCurrent = null;
      this.menuOpen.set(true);
    }
  }

  onEdgeSwipeEnd(event: TouchEvent): void {
    const start = this.edgeSwipeStart;
    const last = this.edgeSwipeCurrent;
    this.edgeSwipeStart = null;
    this.edgeSwipeCurrent = null;
    if (this.hideChrome() || this.menuOpen() || !start) return;

    const endTouch = event.changedTouches?.[0];
    const endPoint: SwipePoint | null = endTouch
      ? { x: endTouch.clientX, y: endTouch.clientY }
      : last;
    if (!endPoint) return;

    const deltaX = endPoint.x - start.x;
    const deltaY = endPoint.y - start.y;
    if (deltaX >= 50 && Math.abs(deltaY) < 60 && deltaX > Math.abs(deltaY) * 1.25) {
      this.menuOpen.set(true);
    }
  }

  onDrawerSwipeStart(event: TouchEvent): void {
    if (this.hideChrome() || !this.menuOpen()) return;
    const touch = event.touches[0];
    if (!touch) return;
    const point: SwipePoint = { x: touch.clientX, y: touch.clientY };
    this.drawerSwipeStart = point;
    this.drawerSwipeCurrent = point;
  }

  onDrawerSwipeMove(event: TouchEvent): void {
    const start = this.drawerSwipeStart;
    if (this.hideChrome() || !this.menuOpen() || !start) return;
    const touch = event.touches[0];
    if (!touch) return;
    this.drawerSwipeCurrent = { x: touch.clientX, y: touch.clientY };

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;

    if (Math.abs(deltaY) > 60 && Math.abs(deltaY) > Math.abs(deltaX)) {
      this.drawerSwipeStart = null;
      this.drawerSwipeCurrent = null;
      return;
    }

    if (deltaX <= -50 && Math.abs(deltaY) < 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
      this.drawerSwipeStart = null;
      this.drawerSwipeCurrent = null;
      this.menuOpen.set(false);
    }
  }

  onDrawerSwipeEnd(event: TouchEvent): void {
    const start = this.drawerSwipeStart;
    const last = this.drawerSwipeCurrent;
    this.drawerSwipeStart = null;
    this.drawerSwipeCurrent = null;
    if (this.hideChrome() || !this.menuOpen() || !start) return;

    const endTouch = event.changedTouches?.[0];
    const endPoint: SwipePoint | null = endTouch
      ? { x: endTouch.clientX, y: endTouch.clientY }
      : last;
    if (!endPoint) return;

    const deltaX = endPoint.x - start.x;
    const deltaY = endPoint.y - start.y;
    if (deltaX <= -50 && Math.abs(deltaY) < 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
      this.menuOpen.set(false);
    }
  }

  private isInsideHorizontallyScrolledElement(target: EventTarget | null): boolean {
    let node = target instanceof HTMLElement ? target : null;
    while (node && node !== document.body && node !== document.documentElement) {
      if (node.tagName === 'INPUT' && (node as HTMLInputElement).type === 'range') {
        return true;
      }
      if (node.scrollWidth > node.clientWidth + 4 && node.scrollLeft > 0) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }
}
