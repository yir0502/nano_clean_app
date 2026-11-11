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
    loadComponent: () => import('./pages/movimientos/movimiento-form/movimiento-form.component').then(m => m.MovimientoFormComponent) },

  { path: 'movimientos/:id',
    data: { hideFab: true },
    canMatch: [authGuard],
    loadComponent: () => import('./pages/movimientos/movimiento-form/movimiento-form.component').then(m => m.MovimientoFormComponent) },

  { path: 'analisis',
    canMatch: [authGuard],
    loadComponent: () => import('./pages/analisis/analisis.component').then(m => m.AnalisisComponent) },

  { path: 'categorias', redirectTo: 'analisis', pathMatch: 'full' },

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

  {
    path: 'deudas',
    canMatch: [authGuard],
    loadComponent: () => import('./pages/deudas/deudas.component').then(m => m.DeudasComponent)
  },

  { 
    path: 'pedidos',
    canMatch: [authGuard],
    loadComponent: () => import('./pages/pedidos/pedidos-list/pedidos-list').then(m => m.PedidosListComponent)
  },
  { 
    path: 'pedidos/nuevo',
    canMatch: [authGuard],
    data: { hideFab: true },
    loadComponent: () => import('./pages/pedidos/pedido-form/pedido-form').then(m => m.PedidoFormComponent)
  },
  { 
    path: 'pedidos/:id',
    canMatch: [authGuard],
    data: { hideFab: true },
    loadComponent: () => import('./pages/pedidos/pedido-form/pedido-form').then(m => m.PedidoFormComponent)
  },

  {
    path: 'rastreo/:orgId/:folio',
    data: { 
      hideChrome: true,
      hideFab: true
    },
    loadComponent: () => import('./pages/rastreo/rastreo.component').then(m => m.RastreoComponent)
  },
  {
    path: 'rastreo/:folio',
    data: { 
      hideChrome: true,
      hideFab: true
    },
    loadComponent: () => import('./pages/rastreo/rastreo.component').then(m => m.RastreoComponent)
  },
  {
    path: 'rastreo',
    data: { 
      hideChrome: true,
      hideFab: true
    },
    loadComponent: () => import('./pages/rastreo/rastreo.component').then(m => m.RastreoComponent)
  },

  { path: '**', redirectTo: 'resumen' }
];
