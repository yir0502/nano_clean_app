import { Component } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { NgIf } from '@angular/common';
import { AuthService } from './core/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, MatToolbarModule, MatButtonModule, MatIconModule, NgIf],
  template: `
    <mat-toolbar color="primary">
      Nano Clean
      <span style="flex:1 1 auto"></span>
      <button *ngIf="auth.isLoggedIn()" mat-button (click)="auth.logout()">Salir</button>
    </mat-toolbar>
    <main class="page"><router-outlet/></main>

    <nav class="mobile-nav">
      <a mat-button routerLink="/resumen"><mat-icon>insights</mat-icon><span>Resumen</span></a>
      <a mat-button routerLink="/movimientos"><mat-icon>list_alt</mat-icon><span>Movs</span></a>
      <a mat-button routerLink="/categorias"><mat-icon>category</mat-icon><span>Categorías</span></a>
    </nav>

    <button mat-fab color="primary" class="fab" routerLink="/movimientos/nuevo">
      <mat-icon>add</mat-icon>
    </button>
  `,
  styles: [`
    :root { --nav-h: 64px; }
    .page { padding: 12px 12px calc(var(--nav-h) + 12px); }
    .mobile-nav{
      position: fixed; left:0; right:0; bottom:0; height:var(--nav-h);
      display:flex; justify-content:space-around; align-items:center;
      background:#fff; border-top:1px solid #eee; padding-bottom: env(safe-area-inset-bottom);
    }
    .mobile-nav a{ display:flex; flex-direction:column; gap:4px; font-size:12px; }
    .fab{ position: fixed; right:16px; bottom: calc(var(--nav-h) + 16px); }
    @media (min-width:900px){ .mobile-nav{ display:none; } .fab{ bottom:16px; } }
  `]
})
export class AppComponent {
  constructor(public auth: AuthService) {}
}