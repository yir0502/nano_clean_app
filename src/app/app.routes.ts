import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'resumen', pathMatch: 'full' },

  { path: 'login',
    loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },

  { path: 'resumen',
    canMatch: [authGuard],
    loadComponent: () => import('./pages/resumen/resumen.component').then(m => m.ResumenComponent) },

  { path: 'movimientos',
    canMatch: [authGuard],
    loadComponent: () => import('./pages/movimientos/movimientos.component').then(m => m.MovimientosComponent) },

  { path: 'movimientos/nuevo',
    canMatch: [authGuard],
    loadComponent: () => import('./pages/movimiento-form/movimiento-form.component').then(m => m.MovimientoFormComponent) },

  { path: 'movimientos/:id',
    canMatch: [authGuard],
    loadComponent: () => import('./pages/movimiento-form/movimiento-form.component').then(m => m.MovimientoFormComponent) },

  { path: 'categorias',
    canMatch: [authGuard],
    loadComponent: () => import('./pages/categorias/categorias.component').then(m => m.CategoriasComponent) },

  { path: '**', redirectTo: 'resumen' }
];
