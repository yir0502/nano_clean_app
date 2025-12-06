import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Categoria, Movimiento, Sucursal } from './models';
import { AuthService } from './auth.service';
import { ENV } from './env';

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private auth = inject(AuthService);
  private router = inject(Router);

  // URL base desde variables de entorno
  private base = ENV.API_URL || 'http://localhost:3000';

  // ===== HELPERS PRIVADOS =====

  /**
   * Construye el Query String eliminando nulos/undefined
   */
  private qs(obj?: Record<string, any>) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(obj || {})) {
      if (v === undefined || v === null) continue;
      if (typeof v === 'string' && (v.trim() === '' || v === 'undefined' || v === 'null')) continue;
      p.append(k, String(v));
    }
    const s = p.toString();
    return s ? `?${s}` : '';
  }

  /**
   * Construye la URL completa
   */
  private url(path: string, params?: Record<string, any>) {
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${this.base}${p}${this.qs(params)}`;
  }

  /**
   * Wrapper centralizado para fetch con manejo de Auth y Errores
   */
  private async fetchJSON(path: string, init?: RequestInit) {
    const r = await fetch(path, {
      ...(init || {}),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.auth.token}`, // Token siempre presente
        ...(init?.headers || {})
      }
    });

    // Manejo de sesión expirada
    if (r.status === 401) {
      this.auth.logout();
      this.router.navigateByUrl('/login');
      throw new Error('Sesión expirada o no autorizada');
    }

    // Manejo de errores del servidor
    if (!r.ok) {
      const e = await r.json().catch(() => ({ error: r.statusText }));
      throw new Error(e.error || e.message || 'Error en la petición al servidor');
    }

    // Retornar JSON si hay contenido, sino null
    if (r.status === 204) return null;
    return r.json();
  }

  // ==========================================
  // ===== MÉTODOS PÚBLICOS DE LA API =======
  // ==========================================

  // --- MÉTODOS GENÉRICOS ---
  // Útiles para endpoints como /dashboard que no tienen un método específico aquí
  get<T>(path: string, params?: Record<string, any>): Promise<T> {
    return this.fetchJSON(this.url(path, params));
  }

  post<T>(path: string, body?: any): Promise<T> {
    return this.fetchJSON(this.url(path), { method: 'POST', body: JSON.stringify(body) });
  }

  put<T>(path: string, body?: any): Promise<T> {
    return this.fetchJSON(this.url(path), { method: 'PUT', body: JSON.stringify(body) });
  }

  deleteGeneric<T>(path: string): Promise<T> {
    return this.fetchJSON(this.url(path), { method: 'DELETE' });
  }

  // --- MOVIMIENTOS ---

  listMovimientos(params?: {
    desde?: string;
    hasta?: string;
    tipo?: 'ingreso' | 'egreso';
    categoria_id?: string;
    sucursal_id?: string;
    metodo_pago?: string;
    q?: string;
    limit?: number;
    offset?: number;
    org_id?: string;
  }): Promise<Movimiento[]> {
    params = { org_id: this.auth.orgId, ...params };
    return this.fetchJSON(this.url('/movimientos', params));
  }

  createMovimiento(payload: Omit<Movimiento, 'id' | 'org_id' | 'created_at' | 'updated_at'>): Promise<Movimiento> {
    return this.fetchJSON(this.url('/movimientos'), { method: 'POST', body: JSON.stringify(payload) });
  }

  updateMovimiento(id: string, patch: Partial<Movimiento>): Promise<Movimiento> {
    return this.fetchJSON(this.url(`/movimientos/${id}`), { method: 'PUT', body: JSON.stringify(patch) });
  }

  deleteMovimiento(id: string): Promise<{ ok: boolean }> {
    return this.fetchJSON(this.url(`/movimientos/${id}`), { method: 'DELETE' });
  }

  // --- CATEGORÍAS ---

  listCategorias(tipo?: 'ingreso' | 'egreso'): Promise<Categoria[]> {
    const params: { org_id: string; tipo?: 'ingreso' | 'egreso' } = {
        org_id: this.auth.orgId 
    };
    if (tipo) params.tipo = tipo;
    
    return this.fetchJSON(this.url('/categorias', params));
  }

  createCategoria(payload: Omit<Categoria, 'id' | 'org_id'>): Promise<Categoria> {
    return this.fetchJSON(this.url('/categorias'), { method: 'POST', body: JSON.stringify(payload) });
  }

  deleteCategoria(id: string): Promise<{ ok: boolean }> {
    return this.deleteGeneric((`/categorias/${id}`));
  }

  // --- SUCURSALES ---

  listSucursales(params?: { activo?: number }): Promise<Sucursal[]> {
    const baseParams: { org_id: string; activo?: number } = {
        org_id: this.auth.orgId 
    };
    if (params?.activo !== undefined) baseParams.activo = params.activo;
    return this.fetchJSON(this.url('/sucursales', baseParams));
  }


  createSucursal(payload: Omit<Sucursal, 'id' | 'org_id'>): Promise<Sucursal> {
    return this.fetchJSON(this.url('/sucursales'), { method: 'POST', body: JSON.stringify(payload) });
  }

  deleteSucursal(id: string): Promise<{ ok: boolean }> {
    return this.deleteGeneric((`/sucursales/${id}`));
  }

  // --- CLIENTES ---

  listClientes(params?: {
    q?: string;
    limit?: number;
    offset?: number;
    org_id?: string;
  }): Promise<any[]> {
    params = { org_id: this.auth.orgId, ...params };
    return this.fetchJSON(this.url('/clientes', params));
  }

  deleteCliente(id: string): Promise<{ ok: boolean }> {
    return this.deleteGeneric((`/clientes/${id}`));
  }
}