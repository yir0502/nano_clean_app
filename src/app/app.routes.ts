import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'resumen', pathMatch: 'full' },

  { path: 'login',
    data: { hideChrome: true },
    loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },

  { path: 'resumen',
    canMatch: [authGuard],
    loadComponent: () => import('./pages/resumen/resumen.component').then(m => m.ResumenComponent) },

  { path: 'movimientos',
    canMatch: [authGuard],
    loadComponent: () => import('./pages/movimientos/movimientos.component').then(m => m.MovimientosComponent) },

  { path: 'movimientos/nuevo',
    data: { hideFab: true },
    canMatch: [authGuard],
    loadComponent: () => import('./pages/movimiento-form/movimiento-form.component').then(m => m.MovimientoFormComponent) },

  { path: 'movimientos/:id',
    canMatch: [authGuard],
    loadComponent: () => import('./pages/movimiento-form/movimiento-form.component').then(m => m.MovimientoFormComponent) },

  { path: 'categorias',
    canMatch: [authGuard],
    loadComponent: () => import('./pages/categorias/categorias.component').then(m => m.CategoriasComponent) },

{ 
    path: 'administracion',
    canMatch: [authGuard],
    loadComponent: () => import('./pages/administracion/admin-list/administracion.component').then(m => m.AdministracionComponent) 
  },
  
  { 
    path: 'administracion/sucursales/nuevo', 
    data: { hideFab: true },
    canMatch: [authGuard],
    loadComponent: () => import('./pages/administracion/sucursales/sucursales-nuevo.component').then(m => m.SucursalesNuevoComponent) 
  },
  {
    path: 'administracion/sucursales/listado',
    canMatch: [authGuard],
    loadComponent: () => import('./pages/administracion/sucursales/sucursales-listado.component').then(m => m.SucursalesListadoComponent)
  },
  { 
    path: 'administracion/categorias/nuevo', 
    data: { hideFab: true },
    canMatch: [authGuard],
    loadComponent: () => import('./pages/administracion/categorias/categorias-nuevo.component').then(m => m.CategoriasNuevoComponent)
  },
  {
    path: 'administracion/categorias/listado',
    canMatch: [authGuard],
    loadComponent: () => import('./pages/administracion/categorias/categorias-listado.component').then(m => m.CategoriasListadoComponent)
  },

  {
    path: 'clientes',
    canMatch: [authGuard],
    loadComponent: () => import('./pages/clientes/clientes.component').then(m => m.ClientesComponent)
  },

  { path: '**', redirectTo: 'resumen' }
];
