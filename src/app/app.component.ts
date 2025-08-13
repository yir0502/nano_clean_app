import { Component, computed, inject } from '@angular/core';
import { Router, NavigationEnd, ActivatedRoute, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from './core/auth.service';

// UI: puedes usar tu SharedModule para no repetir imports de Material
import { SharedModule } from './shared/shared.module';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, SharedModule, NgIf],
  template: `
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

  <nav *ngIf="!hideChrome()" class="mobile-nav">
    <a mat-button routerLink="/resumen"><mat-icon>insights</mat-icon><span>Resumen</span></a>
    <a mat-button routerLink="/movimientos"><mat-icon>list_alt</mat-icon><span>Movs</span></a>
    <a mat-button routerLink="/categorias"><mat-icon>category</mat-icon><span>Categorías</span></a>
  </nav>

  <button *ngIf="!hideChrome()" mat-fab color="primary" class="fab" routerLink="/movimientos/nuevo">
    <mat-icon>add</mat-icon>
  </button>
`,


  styles: [`
    :root { --nav-h: 64px; }
    .page.with-nav { padding-bottom: calc(var(--nav-h) + 12px); }

    .mobile-nav{
      position: fixed; left:0; right:0; bottom:0; height:var(--nav-h);
      display:flex; justify-content:space-around; align-items:center;
      background: var(--mat-sys-surface);
      border-top: 1px solid rgba(0,0,0,.06);
      padding-bottom: env(safe-area-inset-bottom);
      z-index: 10;
    }
    .mobile-nav a{ display:flex; flex-direction:column; gap:4px; font-size:12px; text-decoration:none; }
    .fab{ position: fixed; right:16px; bottom: calc(var(--nav-h) + 16px); z-index: 11; }

    @media (min-width: 900px){
      .mobile-nav{ display:none; }
      .page.with-nav{ padding-bottom: 12px; }
      .fab{ bottom:16px; }
    }
  `]
})
export class AppComponent {
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  // Lee el data.hideChrome de la ruta activa más profunda
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
