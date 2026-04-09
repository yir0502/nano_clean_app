import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { Categoria, Movimiento, Sucursal, Pedido, PedidoEvidencia, Cliente, PaginatedResponse } from './models';
import { AuthService } from './auth.service';
import { ENV } from './env';

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private snack = inject(MatSnackBar);

  private base = ENV.API_URL || 'http://localhost:3000';
  
  // Caché de memoria para catálogos estáticos
  private cacheCategorias = new Map<string, Categoria[]>();
  private cacheSucursales = new Map<string, Sucursal[]>();

  // ===== HELPERS =====

  // Convierte objeto simple a HttpParams de Angular
  private toHttpParams(params?: Record<string, any>): HttpParams {
    let httpParams = new HttpParams();
    if (!params) return httpParams;

    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      if (typeof v === 'string' && (v.trim() === '' || v === 'undefined' || v === 'null')) continue;
      httpParams = httpParams.set(k, String(v));
    }
    return httpParams;
  }

  // Wrapper para mantener tu estilo de Promesas y simplificar GET/POST
  private async request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, options?: { body?: any, params?: any }): Promise<T> {
    const url = path.startsWith('/') ? `${this.base}${path}` : `${this.base}/${path}`;

    // Inyectamos org_id si no viene ya en los parámetros
    const params = { ...options?.params };
    if (!params.org_id && this.auth.orgId) {
      params.org_id = this.auth.orgId;
    }

    const obs$ = this.http.request<T>(method, url, {
      body: options?.body,
      params: this.toHttpParams(params),
    });

    try {
      return await firstValueFrom(obs$);
    } catch (error: any) {
      // Normalizar error para que tus componentes sigan recibiendo el mensaje limpio
      const msg = error.error?.error || error.message || 'Error del servidor';
      this.snack.open(msg, 'Cerrar', { duration: 4000, horizontalPosition: 'right', verticalPosition: 'bottom' });
      throw new Error(msg);
    }
  }

  // ==========================================
  // ===== MÉTODOS PÚBLICOS (Interfaz intacta)
  // ==========================================

  // Genéricos
  get<T>(path: string, params?: Record<string, any>): Promise<T> {
    return this.request<T>('GET', path, { params });
  }

  post<T>(path: string, body?: any): Promise<T> {
    return this.request<T>('POST', path, { body });
  }

  put<T>(path: string, body?: any): Promise<T> {
    return this.request<T>('PUT', path, { body });
  }

  deleteGeneric<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  // --- MOVIMIENTOS ---
  listMovimientos(params?: any): Promise<Movimiento[]> {
    const p = { org_id: this.auth.orgId, ...params };
    return this.get<Movimiento[]>('/movimientos', p);
  }

  createMovimiento(payload: any): Promise<Movimiento> {
    return this.post<Movimiento>('/movimientos', payload);
  }

  updateMovimiento(id: string, patch: Partial<Movimiento>): Promise<Movimiento> {
    return this.put<Movimiento>(`/movimientos/${id}`, patch);
  }

  deleteMovimiento(id: string): Promise<{ ok: boolean }> {
    return this.deleteGeneric<{ ok: boolean }>(`/movimientos/${id}`);
  }

  // --- CATEGORÍAS ---
  async listCategorias(tipo?: 'ingreso' | 'egreso'): Promise<Categoria[]> {
    const cacheKey = tipo || 'todas';
    if (this.cacheCategorias.has(cacheKey)) return this.cacheCategorias.get(cacheKey)!;

    const p: any = { org_id: this.auth.orgId };
    if (tipo) p.tipo = tipo;
    const res = await this.get<Categoria[]>('/categorias', p);
    
    this.cacheCategorias.set(cacheKey, res);
    return res;
  }

  createCategoria(payload: any): Promise<Categoria> {
    this.cacheCategorias.clear(); // Limpiar caché al crear
    return this.post<Categoria>('/categorias', payload);
  }

  deleteCategoria(id: string): Promise<{ ok: boolean }> {
    this.cacheCategorias.clear(); // Limpiar caché al borrar
    return this.deleteGeneric<{ ok: boolean }>(`/categorias/${id}`);
  }

  // --- SUCURSALES ---
  async listSucursales(params?: { activo?: number }): Promise<Sucursal[]> {
    const cacheKey = JSON.stringify(params || {});
    if (this.cacheSucursales.has(cacheKey)) return this.cacheSucursales.get(cacheKey)!;

    const p: any = { org_id: this.auth.orgId };
    if (params?.activo !== undefined) p.activo = params.activo;
    const res = await this.get<Sucursal[]>('/sucursales', p);
    
    this.cacheSucursales.set(cacheKey, res);
    return res;
  }

  createSucursal(payload: any): Promise<Sucursal> {
    this.cacheSucursales.clear(); // Limpiar caché al crear
    return this.post<Sucursal>('/sucursales', payload);
  }

  deleteSucursal(id: string): Promise<{ ok: boolean }> {
    this.cacheSucursales.clear(); // Limpiar caché al borrar
    return this.deleteGeneric<{ ok: boolean }>(`/sucursales/${id}`);
  }

  // --- CLIENTES ---
  listClientes(params?: any): Promise<PaginatedResponse<Cliente>> {
    const p = { org_id: this.auth.orgId, ...params };
    return this.get<PaginatedResponse<Cliente>>('/clientes', p);
  }

  getClientStats(): Promise<any> {
    const p = { org_id: this.auth.orgId };
    return this.get<any>('/clientes/stats', p);
  }

  deleteCliente(id: string): Promise<{ ok: boolean }> {
    return this.deleteGeneric<{ ok: boolean }>(`/clientes/${id}`);
  }

  createCliente(payload: Partial<Cliente>): Promise<Cliente> {
    return this.post<Cliente>('/clientes', payload);
  }

  updateCliente(id: string, payload: Partial<Cliente>): Promise<Cliente> {
    return this.put<Cliente>(`/clientes/${id}`, payload);
  }

  sendMassMessage(payload: { message: string, template?: string }): Promise<{ ok: boolean }> {
    return this.post<{ ok: boolean }>('/clientes/mass-message', payload);
  }

  // --- PEDIDOS Y TRACKING ---
  listPedidos(params?: {
    activo?: boolean; // true = pendientes/proceso, false = entregados/historial
    q?: string;       // búsqueda por folio
    limit?: number;
    offset?: number;
    org_id?: string;
    deuda?: boolean;
  }): Promise<Pedido[]> {
    const p = { org_id: this.auth.orgId, ...params };
    return this.get<Pedido[]>('/pedidos', p);
  }

  createPedido(payload: Partial<Pedido>): Promise<Pedido> {
    return this.post<Pedido>('/pedidos', payload);
  }

  updatePedido(id: string, patch: Partial<Pedido>): Promise<Pedido> {
    return this.put<Pedido>(`/pedidos/${id}`, patch);
  }

  // Subir foto de evidencia (Multipart File)
  uploadEvidencia(pedidoId: string, file: File, tipo: 'ingreso' | 'resultado', nota?: string): Promise<PedidoEvidencia> {
    const formData = new FormData();
    formData.append('foto', file);
    formData.append('tipo', tipo);
    if (nota) formData.append('nota', nota);
    return this.request<PedidoEvidencia>('POST', `/pedidos/${pedidoId}/evidencia`, { body: formData });
  }

  deletePedido(id: string): Promise<{ ok: boolean }> {
    return this.deleteGeneric<{ ok: boolean }>(`/pedidos/${id}`);
  }

  listEvidencias(pedidoId: string): Promise<PedidoEvidencia[]> {
    return this.get<PedidoEvidencia[]>(`/pedidos/${pedidoId}/evidencia`);
  }

  deleteEvidencia(pedidoId: string, evidenciaId: string): Promise<{ ok: boolean }> {
    return this.deleteGeneric<{ ok: boolean }>(`/pedidos/${pedidoId}/evidencia/${evidenciaId}`);
  }

  // --- RASTREO PÚBLICO ---
  getPedidoPublico(folio: string): Promise<Pedido> {
    return this.get<Pedido>(`/rastreo/${folio}`);
  }

  canjearPromo(folio: string): Promise<{ ok: boolean; descuento_aplicado: number; saldo_pendiente: number; monedero_restante: number; mensaje: string }> {
    // Endpoint público: usa fetch directo sin autenticación
    return fetch(`${this.base}/rastreo/${folio}/canjear`, { method: 'POST' })
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Error al canjear');
        return data;
      });
  }
}