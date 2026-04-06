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
import { LoaderComponent } from './shared/components/loader.component';
import { NgIf, NgFor } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, SharedModule, NgIf, NgFor,
    MatSidenavModule, MatListModule, MatButtonModule, LoaderComponent
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.scss']
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
    { path: '/deudas', icon: 'request_quote', label: 'Deudas' },
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