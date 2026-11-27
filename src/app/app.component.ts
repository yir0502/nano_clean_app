import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  QueryList,
  ViewChildren,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NgFor, NgIf } from '@angular/common';
import { filter, map, startWith } from 'rxjs/operators';

import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { AuthService } from './core/auth.service';
import { LoaderComponent } from './shared/components/loader.component';
import { SharedModule } from './shared/shared.module';

export interface NavOption {
  path: string;
  icon: string;
  label: string;
  exact?: boolean;
}

export interface DropletTrailBurst {
  id: number;
  dir: 'left' | 'right';
  left: number;
  width: number;
}

interface SwipePoint {
  x: number;
  y: number;
}

interface TabGeometry {
  left: number;
  width: number;
}

const TRAIL_DURATION_MS = 540;

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
export class AppComponent implements AfterViewInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  public readonly auth = inject(AuthService);
  private readonly swUpdate = inject(SwUpdate, { optional: true });

  @ViewChildren('navTabEl') private navTabEls?: QueryList<ElementRef<HTMLAnchorElement>>;

  private edgeSwipeStart: SwipePoint | null = null;
  private edgeSwipeCurrent: SwipePoint | null = null;
  private drawerSwipeStart: SwipePoint | null = null;
  private drawerSwipeCurrent: SwipePoint | null = null;
  private trailTimer: ReturnType<typeof setTimeout> | null = null;
  private rafId: number | null = null;
  private burstCounter = 0;

  menuOpen = signal(false);
  orbMenuOpen = signal(false);

  activeTabIndex = signal<number>(-1);
  dropletVisible = signal<boolean>(false);
  dropletLeft = signal<number>(0);
  dropletWidth = signal<number>(0);
  dropletMotion = signal<'idle' | 'left' | 'right'>('idle');
  dropletAnimPhase = signal<'a' | 'b'>('a');
  trailBursts = signal<ReadonlyArray<DropletTrailBurst>>([]);

  readonly additionalNavOptions: ReadonlyArray<NavOption> = [
    { path: '/resumen', icon: 'space_dashboard', label: 'Resumen', exact: true },
    { path: '/pedidos', icon: 'local_laundry_service', label: 'Pedidos' },
    { path: '/movimientos', icon: 'receipt_long', label: 'Movimientos' },
    { path: '/analisis', icon: 'insights', label: 'Análisis' },
    { path: '/deudas', icon: 'account_balance_wallet', label: 'Deudas' },
    { path: '/clientes', icon: 'people_alt', label: 'Clientes' },
    { path: '/administracion', icon: 'tune', label: 'Administración' },
  ];

  readonly leftBottomNavItems: ReadonlyArray<NavOption> = [
    { path: '/resumen', icon: 'space_dashboard', label: 'Resumen', exact: true },
    { path: '/pedidos', icon: 'local_laundry_service', label: 'Pedidos' },
  ];

  readonly rightBottomNavItems: ReadonlyArray<NavOption> = [
    { path: '/movimientos', icon: 'receipt_long', label: 'Movimientos' },
    { path: '/analisis', icon: 'insights', label: 'Análisis' },
  ];

  readonly bottomNavItems: ReadonlyArray<NavOption> = [
    ...this.leftBottomNavItems,
    ...this.rightBottomNavItems,
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

  constructor() {
    if (this.swUpdate?.isEnabled) {
      this.swUpdate.versionUpdates
        .pipe(
          filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'),
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe(() => {
          window.location.reload();
        });
    }

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((evt) => {
        this.orbMenuOpen.set(false);
        this.handleRouteTabChange(evt.urlAfterRedirects || evt.url, true);
      });

    this.destroyRef.onDestroy(() => {
      this.clearTrailTimer();
      if (this.rafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this.rafId);
      }
    });
  }

  ngAfterViewInit(): void {
    this.handleRouteTabChange(this.router.url, false);

    if (typeof window !== 'undefined') {
      const onResize = () => this.repositionDropletSilently();
      window.addEventListener('resize', onResize, { passive: true });
      this.destroyRef.onDestroy(() => window.removeEventListener('resize', onResize));
    }

    this.navTabEls?.changes
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.repositionDropletSilently());
  }

  toggleMenu(): void {
    this.orbMenuOpen.set(false);
    this.menuOpen.update((val) => !val);
  }

  toggleOrbMenu(): void {
    this.orbMenuOpen.update((val) => !val);
  }

  closeOrbMenu(): void {
    this.orbMenuOpen.set(false);
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
    this.orbMenuOpen.set(false);
    void this.router.navigate(['/pedidos/nuevo']);
  }

  goToNuevoEgreso(): void {
    this.orbMenuOpen.set(false);
    void this.router.navigate(['/movimientos/nuevo'], { queryParams: { tipo: 'egreso' } });
  }

  logout(): void {
    this.orbMenuOpen.set(false);
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
      this.orbMenuOpen.set(false);
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
      this.orbMenuOpen.set(false);
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

  resolveBottomTabIndex(rawUrl: string): number {
    const cleanPath = rawUrl.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
    if (cleanPath === '/resumen') return 0;
    if (cleanPath === '/pedidos' || cleanPath.startsWith('/pedidos/')) return 1;
    if (cleanPath === '/movimientos' || cleanPath.startsWith('/movimientos/')) return 2;
    if (cleanPath === '/analisis' || cleanPath.startsWith('/analisis/')) return 3;
    return -1;
  }

  private handleRouteTabChange(url: string, animate: boolean): void {
    const prevIndex = this.activeTabIndex();
    const nextIndex = this.resolveBottomTabIndex(url);
    this.activeTabIndex.set(nextIndex);

    if (nextIndex < 0) {
      this.dropletVisible.set(false);
      this.clearTrailMotion();
      return;
    }

    const prevGeo = prevIndex >= 0 ? this.measureTabGeometry(prevIndex) : null;
    const nextGeo = this.measureTabGeometry(nextIndex);

    if (nextGeo) {
      this.dropletLeft.set(nextGeo.left);
      this.dropletWidth.set(nextGeo.width);
      this.dropletVisible.set(true);
    }

    if (animate && prevIndex >= 0 && prevIndex !== nextIndex) {
      const dir: 'left' | 'right' = nextIndex > prevIndex ? 'right' : 'left';
      const fallbackStart = prevIndex * 72 + 24;
      const fallbackEnd = nextIndex * 72 + 24;

      let wakeStart = fallbackStart;
      let wakeEnd = fallbackEnd;
      if (prevGeo && nextGeo) {
        if (dir === 'right') {
          wakeStart = prevGeo.left + prevGeo.width * 0.3;
          wakeEnd = nextGeo.left + nextGeo.width * 0.72;
        } else {
          wakeStart = nextGeo.left + nextGeo.width * 0.28;
          wakeEnd = prevGeo.left + prevGeo.width * 0.7;
        }
      }

      const trailLeft = Math.max(0, Math.min(wakeStart, wakeEnd));
      const trailWidth = Math.max(28, Math.abs(wakeEnd - wakeStart));

      this.dropletAnimPhase.update((p) => (p === 'a' ? 'b' : 'a'));
      this.dropletMotion.set(dir);
      this.burstCounter += 1;
      this.trailBursts.set([{ id: this.burstCounter, dir, left: trailLeft, width: trailWidth }]);

      this.clearTrailTimer();
      this.trailTimer = setTimeout(() => {
        this.dropletMotion.set('idle');
        this.trailBursts.set([]);
        this.trailTimer = null;
      }, TRAIL_DURATION_MS);
    } else if (!animate) {
      this.clearTrailMotion();
    }

    this.scheduleDropletResync();
  }

  private repositionDropletSilently(): void {
    const idx = this.activeTabIndex();
    if (idx < 0) {
      this.dropletVisible.set(false);
      return;
    }
    const geo = this.measureTabGeometry(idx);
    if (geo) {
      this.dropletLeft.set(geo.left);
      this.dropletWidth.set(geo.width);
      this.dropletVisible.set(true);
    }
  }

  private scheduleDropletResync(): void {
    if (typeof requestAnimationFrame !== 'function') return;
    if (this.rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.repositionDropletSilently();
    });
  }

  private measureTabGeometry(index: number): TabGeometry | null {
    const tabs = this.navTabEls?.toArray();
    if (!tabs || index < 0 || index >= tabs.length) return null;
    const el = tabs[index]?.nativeElement;
    if (!el || el.offsetWidth <= 0) return null;
    return { left: el.offsetLeft, width: el.offsetWidth };
  }

  private clearTrailMotion(): void {
    this.clearTrailTimer();
    this.dropletMotion.set('idle');
    this.trailBursts.set([]);
  }

  private clearTrailTimer(): void {
    if (this.trailTimer !== null) {
      clearTimeout(this.trailTimer);
      this.trailTimer = null;
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
