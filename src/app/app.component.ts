import { Component, computed, inject } from '@angular/core';
import { Router, NavigationEnd, ActivatedRoute, RouterLink, RouterOutlet, RouterLinkActive } from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from './core/auth.service';

import { SharedModule } from './shared/shared.module';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, SharedModule, NgIf],
  template: `
  <!-- TOPBAR: tu diseño -->
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

  <!-- NAV INFERIOR -->
  <nav *ngIf="!hideChrome()" class="mobile-nav" role="navigation" aria-label="Navegación inferior">
    <a mat-button routerLink="/resumen" routerLinkActive="active" [routerLinkActiveOptions]="{exact:true}">
      <mat-icon>insights</mat-icon><span>Resumen</span>
      <i class="indicator"></i>
    </a>
    <a mat-button routerLink="/movimientos" routerLinkActive="active">
      <mat-icon>list_alt</mat-icon><span>Movimientos</span>
      <i class="indicator"></i>
    </a>
    <a mat-button routerLink="/categorias" routerLinkActive="active">
      <mat-icon>category</mat-icon><span>Categorías</span>
      <i class="indicator"></i>
    </a>
  </nav>

  <!-- FAB -->
  <button *ngIf="!hideChrome()" mat-fab class="fab" routerLink="/movimientos/nuevo" aria-label="Nuevo movimiento">
    <mat-icon>add</mat-icon>
  </button>
`,
  styles: [`
    :root { --nav-h: 64px; }

    /* TOPBAR: respeta tu clase .bubbly */
    .bubbly { position: fixed; top: 0; z-index: 12; }

    /* Contenido: deja espacio para la nav inferior + safe-area */
    .page.with-nav { padding-bottom: calc(var(--nav-h) + max(12px, env(safe-area-inset-bottom))); }

    /* ===== NAV INFERIOR ===== */
    .mobile-nav{
      position: fixed; left:0; right:0; bottom:0; height:var(--nav-h);
      display:grid; grid-template-columns: repeat(3,1fr);
      align-items:center; gap: 6px;
      background: rgba(255, 255, 255, 0.23);
      backdrop-filter: saturate(150%) blur(20px);
      border-top: 1px solid rgba(0, 0, 0, 0.48);
      padding: 6px 8px max(6px, env(safe-area-inset-bottom));
      z-index: 10;
    }
    .mobile-nav a{
      position: relative;
      gap:4px; text-decoration:none; border-radius:12px; padding:6px 4px; min-width:0;
      color: var(--mat-sys-on-surface, rgba(0,0,0,.78));
      transition: background .25s ease, color .25s ease;
    }

    .mobile-nav a:hover{
      background: color-mix(in oklab, var(--mat-sys-primary, #3f51b5) 8%, transparent);
    }
    .mobile-nav a mat-icon{ font-size:22px; width:22px; height:22px; line-height:22px; }
    .mobile-nav a span{ font-size:11px; line-height:1; }

    /* Estado activo + indicador */
    .mobile-nav a.active{ color: var(--mat-sys-primary, #3f51b5); font-variation-settings: 'wght' 600; }

    /* FAB cuadrado */
    .fab { 
      position: fixed;
      right: 10px;
      bottom: 60px; 
      z-index: 11;
      width: 70px;
      height: 70px;
      border-radius: 16px; /* esquinas redondeadas */
      overflow: hidden; /* para que la ola se contenga dentro */
      box-shadow: 0 6px 12px rgba(0,0,0,.15), 0 2px 4px rgba(0,0,0,.12);
      background: rgba(98, 212, 148, 1);
    }

    /* Onda animada */
    .fab::before {
      content: "";
      position: absolute;
      left: -50%;
      bottom: -60%;
      width: 200%;
      height: 200%;
      background: rgba(98, 212, 148, 1);
      border-radius: 45%;
      animation: waveMove 10s infinite ease-in-out;
    }

    /* Hacemos otra capa para más realismo */
    .fab::after {
      content: "";
      position: absolute;
      left: -60%;
      bottom: -65%;
      width: 220%;
      height: 220%;
      background: rgba(165, 245, 161, 1);
      border-radius: 40%;
      animation: waveMove 10s infinite ease-in-out reverse;
    }

    /* Animación */
    @keyframes waveMove {
      0% {
        transform: translateY(0) rotate(0deg);
      }
      50% {
        transform: translateY(-50%) rotate(180deg);
      }
      100% {
        transform: translateY(0) rotate(360deg);
      }
    }

    /* Responsive: si el ancho es muy pequeño, oculta labels */
    @media (max-width: 360px){
      .mobile-nav a span { display:none; }
      .mobile-nav a { gap: 0; }
    }
    @media (min-width: 900px){
      .mobile-nav{ display:none; }
      .page.with-nav{ padding-bottom: 12px; }
      .fab{ bottom: 24px; }
    }
  `]
})
export class AppComponent {
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  // Lee data.hideChrome de la ruta activa más profunda
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

  hideChrome = computed(() => this.hideSig());

  constructor(public auth: AuthService) { }

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}