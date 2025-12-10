import { Component, computed, inject, signal, ViewChild } from '@angular/core';
import { Router, NavigationEnd, ActivatedRoute, RouterLink, RouterOutlet, RouterLinkActive } from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from './core/auth.service';

// --- NUEVOS IMPORTS ---
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { SharedModule } from './shared/shared.module';
import { NgIf, NgFor } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, SharedModule, NgIf, NgFor,
    MatSidenavModule, MatListModule, MatButtonModule
  ],
  template: `
  <mat-sidenav-container class="app-container" autosize>
    
    <mat-sidenav #drawer mode="over" position="start" 
                 [opened]="menuOpen()" 
                 (closedStart)="menuOpen.set(false)"
                 class="bubbly-drawer">
      
      <div class="drawer-header">
        <img class="logo-drawer" src="images/logo_letras_blanco.png" alt="Nano Clean" />
        <button mat-icon-button (click)="toggleMenu()">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <mat-nav-list class="drawer-list">
        <a mat-list-item 
           *ngFor="let option of additionalNavOptions" 
           (click)="navigateAndCloseMenu(option.path)">
          <mat-icon matListItemIcon>{{ option.icon }}</mat-icon>
          <span matListItemTitle>{{ option.label }}</span>
        </a>
        <mat-divider></mat-divider>
        <a mat-list-item *ngIf="auth.isLoggedIn()" (click)="logoutAndClose()">
           <mat-icon matListItemIcon color="warn">logout</mat-icon>
           <span matListItemTitle>Salir</span>
        </a>
      </mat-nav-list>
    
    </mat-sidenav>


    <mat-sidenav-content>
      
      <mat-toolbar *ngIf="!hideChrome()" color="primary" class="bubbly">
        <img class="logo-toolbar" src="images/logo_letras_blanco.png" alt="Nano Clean" />
        <span class="spacer"></span>
        <button mat-button class="logout-btn" *ngIf="auth.isLoggedIn()" (click)="logout()">
          <mat-icon>logout</mat-icon><span>Salir</span>
        </button>
      </mat-toolbar>

      <main class="page" [class.with-nav]="!hideChrome()">
        <router-outlet />
      </main>

      <nav *ngIf="!hideChrome()" class="mobile-nav" role="navigation" aria-label="Navegación inferior">
        <a mat-button (click)="toggleMenu()" aria-label="Más opciones de navegación" class="more-options-button" [class.active]="menuOpen()">
          <mat-icon>menu_open</mat-icon> <i class="indicator"></i>
        </a>
        <a mat-button routerLink="/resumen" routerLinkActive="active" [routerLinkActiveOptions]="{exact:true}">
          <mat-icon>insights</mat-icon><span>Resumen</span>
          <i class="indicator"></i>
        </a>
        <a mat-button routerLink="/movimientos" routerLinkActive="active">
          <mat-icon>list_alt</mat-icon><span>Movimientos</span>
          <i class="indicator"></i>
        </a>
        <a mat-button routerLink="/categorias" routerLinkActive="active">
          <mat-icon>attach_money</mat-icon><span>Análisis</span>
          <i class="indicator"></i>
        </a>
      </nav>

      <div *ngIf="!hideFab()" class="fab-container">
        <div class="fab-options" [class.open]="fabMenuOpen()">
          <button mat-mini-fab (click)="navigateAndCloseFab('/administracion/sucursales/nuevo')" 
                  aria-label="Agregar sucursal" class="fab-option">
            <span class="label"><mat-icon class="icon-label">store</mat-icon>Sucursal</span>
          </button>

          <button mat-mini-fab (click)="navigateAndCloseFab('/administracion/categorias/nuevo')" 
                  aria-label="Agregar categoría" class="fab-option">
            <span class="label"><mat-icon class="icon-label">category</mat-icon>Categoría</span>
          </button>

          <button mat-mini-fab (click)="navigateAndCloseFab('/movimientos/nuevo')" 
                  aria-label="Nuevo movimiento" class="fab-option">
            <span class="label"><mat-icon class="icon-label">payment</mat-icon>Movimiento</span>
          </button>
          
          <button mat-mini-fab (click)="navigateAndCloseFab('/pedidos/nuevo')" 
                  aria-label="Agregar pedido" class="fab-option">
            <span class="label"><mat-icon class="icon-label">work</mat-icon>Pedido</span>
          </button>
        </div>
        
        <button mat-fab class="fab-main" color="primary" (click)="toggleFabMenu()" aria-label="Opciones rápidas">
          <mat-icon *ngIf="!fabMenuOpen()">add</mat-icon>
          <mat-icon *ngIf="fabMenuOpen()">close</mat-icon>
        </button>
      </div>

    </mat-sidenav-content>
  </mat-sidenav-container>
`,
  styles: [`
    :root { --nav-h: 64px; }
    .app-container { height: 100vh; display: flex; flex-direction: column; }

    /* TOPBAR: respeta tu clase .bubbly */
    .bubbly { position: fixed; top: 0; z-index: 12; }

    /* Contenido: deja espacio para la nav inferior + safe-area */
    /* Ajustado para que el scroll sea interno al contenido del sidenav */
    .page.with-nav { 
      padding-top: 64px; /* Espacio para el topbar fijo */
      padding-bottom: calc(var(--nav-h) + max(12px, env(safe-area-inset-bottom)));
      min-height: 100vh;
      box-sizing: border-box;
    }

    /* ===== SIDENAV DRAWER ESTILIZADO ===== */
    .bubbly-drawer {
      /* Ancho: 50% de la pantalla, pero no más de 320px */
      width: 50vw;
      max-width: 320px;
      min-width: 250px; 
      background: rgba(255, 255, 255, 0.75);
      backdrop-filter: saturate(180%) blur(30px);
      box-shadow: 5px 0 25px rgba(0, 0, 0, 0.2);
    }

    .drawer-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 5px;
      background: linear-gradient(90deg, rgba(0, 115, 255, 0.8), rgba(0, 89, 255, 0.6));
      color: white;
      height: 35px;
    }

    .drawer-header button {
      color: white;
    }

    .logo-drawer { height: 35px; }

    .drawer-list .mat-mdc-list-item {
      border-radius: 0 24px 24px 0;
      margin: 8px 8px 8px 0;
      transition: all 0.3s ease;
      display: flex; align-items: center; gap: 12px;
    }

    .drawer-list .mat-mdc-list-item span {
      font-weight: 500;
      font-size: 14px;
    }

    /* Efecto hover y active en los items del menú */
    .drawer-list .mat-mdc-list-item:hover,
    .active-drawer-link {
        background: rgba(0, 115, 255, 0.15); /* Azul muy claro */
        color: var(--mat-sys-primary, #3f51b5);
    }

    /* ===== NAV INFERIOR (Con el fix previo) ===== */
    .mobile-nav{
      position: fixed; left:0; right:0; bottom:0; height:var(--nav-h);
      display:grid; grid-template-columns: 0.3fr 1fr 1fr 1fr; 
      align-items:center; gap: 4px;
      background: rgba(255, 255, 255, 0.23);
      backdrop-filter: saturate(150%) blur(20px);
      border-top: 1px solid rgba(0, 0, 0, 0.48);
      padding: 6px 8px max(6px, env(safe-area-inset-bottom));
      z-index: 10;
    }
    .mobile-nav a{
      position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap:0px; text-decoration:none; border-radius:12px; padding:6px 0; min-width:0;
      color: var(--mat-sys-on-surface, rgba(0,0,0,.78));
      transition: background .25s ease, color .25s ease;
    }
    .mobile-nav a:hover, .mobile-nav a.active{
      background: color-mix(in oklab, var(--mat-sys-primary, #3f51b5) 8%, transparent);
    }
    .mobile-nav a mat-icon{ font-size:22px; width:22px; height:22px; line-height:22px; margin:0; margin-top:4px; }
    .mobile-nav a span{ font-size:11px; line-height:1; margin-top: 2px; }
    .mobile-nav a.active{ color: var(--mat-sys-primary, #3f51b5); font-variation-settings: 'wght' 600; }

    /* --- FAB SPEED DIAL --- */
    .fab-container {
      position: fixed; right: 16px; bottom: 80px; z-index: 11;
      display: flex; flex-direction: column; align-items: flex-end;
      width: 0;
    }
    .fab-main { 
      position: fixed; right: 10px; bottom: 60px; z-index: 11; width: 70px; height: 70px;
      border-radius: 16px; overflow: hidden; box-shadow: 0 6px 12px rgba(0,0,0,.15), 0 2px 4px rgba(0,0,0,.12);
      background: linear-gradient(90deg, #0073ffff, #0059ff4f); color: black;
    }
    .fab-main::before {
      content: ""; position: absolute; left: -50%; bottom: -60%; width: 200%; height: 200%;
      background: linear-gradient(90deg, #0073ffff, #0059ff4f); border-radius: 45%;
      animation: waveMove 10s infinite ease-in-out;
    }
    .fab-main::after {
      content: ""; position: absolute; left: -60%; bottom: -65%; width: 220%; height: 220%;
      background: linear-gradient(90deg, #fffffff3, #ffffffbe); border-radius: 40%;
      animation: waveMove 10s infinite ease-in-out reverse;
    }
    @keyframes waveMove {
      0% { transform: translateY(0) rotate(0deg); }
      50% { transform: translateY(-50%) rotate(180deg); }
      100% { transform: translateY(0) rotate(360deg); }
    }
    .fab-options { 
      display: flex; flex-direction: column; align-items: flex-end; margin-bottom: 12px; margin-right: 60px;
      /* FIX: Deshabilita clics cuando está cerrado */
      pointer-events: none; 
    }
    .fab-option {
      margin-bottom: 12px; opacity: 0; transform: translateY(100%);
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      display: flex; align-items: center; gap: 8px; box-shadow: none; background: transparent; whidth: auto; height: auto;
    }
    .fab-option .label {
      background: #a1cbffff; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 500;
      margin-right: 60px; white-space: nowrap; display: flex; align-items: center; justify-content: center; color: black;
    }
    .fab-option .icon-label { font-size: 16px; position: relative; top: 3px; right: 2px; }
    
    /* Estado ABIERTO */
    .fab-options.open {
      /* FIX: Habilita clics solo cuando está abierto */
      pointer-events: auto;
    }
    .fab-options.open .fab-option { opacity: 1; transform: translateY(0); }
    .fab-options.open .fab-option:nth-child(1) { transition-delay: 0.1s; }
    .fab-options.open .fab-option:nth-child(2) { transition-delay: 0.05s; }
    .fab-options.open .fab-option:nth-child(3) { transition-delay: 0s; }

    @media (max-width: 360px){
      .mobile-nav a span { display:none; }
      .mobile-nav a { gap: 0; }
    }
    @media (min-width: 900px){
      .mobile-nav{ display:none; }
      .page.with-nav{ padding-bottom: 12px; }
    }
  `]
})
export class AppComponent {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  public auth = inject(AuthService);

  // Señales para controlar los estados de los menús
  fabMenuOpen = signal(false);
  menuOpen = signal(false); // NUEVA señal para el Sidenav

  additionalNavOptions = [
    { path: '/administracion', icon: 'category', label: 'Administración' },
    { path: '/clientes', icon: 'group', label: 'Clientes' },
    { path: '/pedidos', icon: 'work', label: 'Pedidos' },
    { path: '/inventario', icon: 'inventory', label: 'Inventario' },
    { path: '/pedidos_proveedores', icon: 'local_shipping', label: 'Pedidos Proveedores' },
    // Agrega más opciones aquí
  ];

  private hideSig = toSignal(
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

  private fabSig = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => {
        const url = this.router.url;
        return url.includes('/movimientos/nuevo') ||
          (url.includes('/movimientos/') && url.length > '/movimientos/'.length);
      }),
      startWith(false)
    )
  );

  hideChrome = computed(() => this.hideSig());

  hideFab = computed(() => {
    if (this.hideChrome()) return true;
    return this.fabSig();
  });

  // --- NUEVOS MÉTODOS PARA EL SIDENAV ---
  toggleMenu() {
    this.menuOpen.update(val => !val);
  }

  navigateAndCloseMenu(path: string) {
    this.router.navigateByUrl(path);
    this.menuOpen.set(false); // Cierra el menú al navegar
  }

  logoutAndClose() {
      this.logout();
      this.menuOpen.set(false);
  }

  // Métodos del FAB (renombré uno para evitar confusión)
  toggleFabMenu() {
    this.fabMenuOpen.update(val => !val);
  }

  navigateAndCloseFab(path: string) {
    this.router.navigateByUrl(path);
    this.fabMenuOpen.set(false);
  }


  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}