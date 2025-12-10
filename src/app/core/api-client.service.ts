import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http'; // <--- HttpClient
import { firstValueFrom } from 'rxjs';
import { Categoria, Movimiento, Sucursal, Pedido, PedidoEvidencia} from './models';
import { AuthService } from './auth.service';
import { ENV } from './env';

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private http = inject(HttpClient);
  private auth = inject(AuthService); // Se usa en el interceptor, pero quizás necesitemos orgId aquí para params

  private base = ENV.API_URL || 'http://localhost:3000';

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

    const obs$ = this.http.request<T>(method, url, {
      body: options?.body,
      params: this.toHttpParams(options?.params),
    });

    try {
      return await firstValueFrom(obs$);
    } catch (error: any) {
      // Normalizar error para que tus componentes sigan recibiendo el mensaje limpio
      const msg = error.error?.error || error.message || 'Error del servidor';
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
  listCategorias(tipo?: 'ingreso' | 'egreso'): Promise<Categoria[]> {
    const p: any = { org_id: this.auth.orgId };
    if (tipo) p.tipo = tipo;
    return this.get<Categoria[]>('/categorias', p);
  }

  createCategoria(payload: any): Promise<Categoria> {
    return this.post<Categoria>('/categorias', payload);
  }

  deleteCategoria(id: string): Promise<{ ok: boolean }> {
    return this.deleteGeneric<{ ok: boolean }>(`/categorias/${id}`);
  }

  // --- SUCURSALES ---
  listSucursales(params?: { activo?: number }): Promise<Sucursal[]> {
    const p: any = { org_id: this.auth.orgId };
    if (params?.activo !== undefined) p.activo = params.activo;
    return this.get<Sucursal[]>('/sucursales', p);
  }

  createSucursal(payload: any): Promise<Sucursal> {
    return this.post<Sucursal>('/sucursales', payload);
  }

  deleteSucursal(id: string): Promise<{ ok: boolean }> {
    return this.deleteGeneric<{ ok: boolean }>(`/sucursales/${id}`);
  }

  // --- CLIENTES ---
  listClientes(params?: any): Promise<any[]> {
    const p = { org_id: this.auth.orgId, ...params };
    return this.get<any[]>('/clientes', p);
  }

  deleteCliente(id: string): Promise<{ ok: boolean }> {
    return this.deleteGeneric<{ ok: boolean }>(`/clientes/${id}`);
  }

  createCliente(payload: any): Promise<any> {
    return this.post('/clientes', payload);
  }

  updateCliente(id: string, payload: any): Promise<any> {
    return this.put(`/clientes/${id}`, payload);
  }

  sendMassMessage(payload: { message: string, template?: string }): Promise<any> {
    return this.post('/clientes/mass-message', payload);
  }

  // --- PEDIDOS Y TRACKING ---
  listPedidos(params?: {
    activo?: boolean; // true = pendientes/proceso, false = entregados/historial
    q?: string;       // búsqueda por folio
    limit?: number;
    offset?: number;
    org_id?: string;
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
  getPedidoPublico(folio: string): Promise<any> {
    return this.get(`/rastreo/${folio}`);
  }
}