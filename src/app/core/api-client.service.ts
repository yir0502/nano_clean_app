import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import {
  Categoria,
  Cliente,
  ClientStatsResponse,
  Movimiento,
  MovimientosQueryParams,
  PaginatedResponse,
  Pedido,
  PedidoCreatePayload,
  PedidoEvidencia,
  PedidoUpdatePayload,
  Sucursal,
  SucursalRepartoConfig,
  SucursalRepartoPayload,
} from './models';
import { AuthService } from './auth.service';
import { ENV } from './env';

export interface ClientesQueryParams {
  q?: string;
  limit?: number;
  offset?: number;
  filter?: string;
  org_id?: string;
}

export interface CategoriaCreatePayload {
  nombre: string;
  tipo: 'ingreso' | 'egreso';
  activo?: boolean;
  org_id?: string | null;
}

export interface SucursalCreatePayload {
  nombre: string;
  direccion?: string;
  activo?: boolean;
  org_id?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private snack = inject(MatSnackBar);

  private base = ENV.API_URL || 'http://localhost:3001';

  private cacheCategorias = new Map<string, Categoria[]>();
  private cacheSucursales = new Map<string, Sucursal[]>();

  private toHttpParams(params?: Record<string, unknown>): HttpParams {
    let httpParams = new HttpParams();
    if (!params) return httpParams;

    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      if (typeof v === 'string' && (v.trim() === '' || v === 'undefined' || v === 'null')) continue;
      httpParams = httpParams.set(k, String(v));
    }
    return httpParams;
  }

  private extractErrorMessage(error: unknown): string {
    if (error && typeof error === 'object') {
      if ('error' in error && error.error && typeof error.error === 'object' && 'error' in error.error) {
        const serverMsg = error.error.error;
        if (typeof serverMsg === 'string' && serverMsg) {
          return serverMsg;
        }
      }
      if ('message' in error && typeof error.message === 'string' && error.message) {
        return error.message;
      }
    }
    return 'Error del servidor';
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    options?: { body?: unknown; params?: Record<string, unknown> }
  ): Promise<T> {
    const url = path.startsWith('/') ? `${this.base}${path}` : `${this.base}/${path}`;

    const params: Record<string, unknown> = { ...(options?.params ?? {}) };
    if (!params['org_id'] && this.auth.orgId) {
      params['org_id'] = this.auth.orgId;
    }

    const obs$ = this.http.request<T>(method, url, {
      body: options?.body,
      params: this.toHttpParams(params),
    });

    try {
      return await firstValueFrom(obs$);
    } catch (error: unknown) {
      const msg = this.extractErrorMessage(error);
      this.snack.open(msg, 'Cerrar', {
        duration: 4000,
        horizontalPosition: 'right',
        verticalPosition: 'bottom',
      });
      throw new Error(msg);
    }
  }

  get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>('GET', path, { params });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, { body });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, { body });
  }

  deleteGeneric<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  listMovimientos(params?: MovimientosQueryParams): Promise<Movimiento[]> {
    const p: Record<string, unknown> = { org_id: this.auth.orgId, ...params };
    return this.get<Movimiento[]>('/movimientos', p);
  }

  getMovimiento(id: string): Promise<Movimiento> {
    const p: Record<string, unknown> = { org_id: this.auth.orgId };
    return this.get<Movimiento>(`/movimientos/${id}`, p);
  }

  createMovimiento(payload: Partial<Movimiento>): Promise<Movimiento> {
    return this.post<Movimiento>('/movimientos', payload);
  }

  updateMovimiento(id: string, patch: Partial<Movimiento>): Promise<Movimiento> {
    return this.put<Movimiento>(`/movimientos/${id}`, patch);
  }

  deleteMovimiento(id: string): Promise<{ ok: boolean }> {
    return this.deleteGeneric<{ ok: boolean }>(`/movimientos/${id}`);
  }

  async listCategorias(tipo?: 'ingreso' | 'egreso'): Promise<Categoria[]> {
    const cacheKey = tipo || 'todas';
    if (this.cacheCategorias.has(cacheKey)) return this.cacheCategorias.get(cacheKey)!;

    const p: Record<string, unknown> = { org_id: this.auth.orgId };
    if (tipo) p['tipo'] = tipo;
    const res = await this.get<Categoria[]>('/categorias', p);

    this.cacheCategorias.set(cacheKey, res);
    return res;
  }

  createCategoria(payload: CategoriaCreatePayload): Promise<Categoria> {
    this.cacheCategorias.clear();
    return this.post<Categoria>('/categorias', payload);
  }

  deleteCategoria(id: string): Promise<{ ok: boolean }> {
    this.cacheCategorias.clear();
    return this.deleteGeneric<{ ok: boolean }>(`/categorias/${id}`);
  }

  async listSucursales(params?: { activo?: number }): Promise<Sucursal[]> {
    const cacheKey = JSON.stringify(params || {});
    if (this.cacheSucursales.has(cacheKey)) return this.cacheSucursales.get(cacheKey)!;

    const p: Record<string, unknown> = { org_id: this.auth.orgId };
    if (params?.activo !== undefined) p['activo'] = params.activo;
    const res = await this.get<Sucursal[]>('/sucursales', p);

    this.cacheSucursales.set(cacheKey, res);
    return res;
  }

  createSucursal(payload: SucursalCreatePayload): Promise<Sucursal> {
    this.cacheSucursales.clear();
    return this.post<Sucursal>('/sucursales', payload);
  }

  deleteSucursal(id: string): Promise<{ ok: boolean }> {
    this.cacheSucursales.clear();
    return this.deleteGeneric<{ ok: boolean }>(`/sucursales/${id}`);
  }

  getSucursalReparto(sucursalId: string): Promise<SucursalRepartoConfig> {
    return this.get<SucursalRepartoConfig>(`/sucursales/${encodeURIComponent(sucursalId)}/reparto`);
  }

  saveSucursalReparto(
    sucursalId: string,
    payload: SucursalRepartoPayload
  ): Promise<SucursalRepartoConfig> {
    return this.put<SucursalRepartoConfig>(
      `/sucursales/${encodeURIComponent(sucursalId)}/reparto`,
      payload
    );
  }

  listClientes(params?: ClientesQueryParams): Promise<PaginatedResponse<Cliente>> {
    const p: Record<string, unknown> = { org_id: this.auth.orgId, ...params };
    return this.get<PaginatedResponse<Cliente>>('/clientes', p);
  }

  getCliente(id: string): Promise<Cliente> {
    const p: Record<string, unknown> = { org_id: this.auth.orgId };
    return this.get<Cliente>(`/clientes/${id}`, p);
  }

  getClientStats(): Promise<ClientStatsResponse> {
    const p: Record<string, unknown> = { org_id: this.auth.orgId };
    return this.get<ClientStatsResponse>('/clientes/stats', p);
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

  listPedidos(params?: {
    activo?: boolean;
    q?: string;
    limit?: number;
    offset?: number;
    org_id?: string;
    deuda?: boolean;
  }): Promise<Pedido[]> {
    const p: Record<string, unknown> = { org_id: this.auth.orgId, ...params };
    return this.get<Pedido[]>('/pedidos', p);
  }

  getPedido(id: string): Promise<Pedido> {
    const p: Record<string, unknown> = { org_id: this.auth.orgId };
    return this.get<Pedido>(`/pedidos/${id}`, p);
  }

  createPedido(payload: PedidoCreatePayload): Promise<Pedido> {
    return this.post<Pedido>('/pedidos', payload);
  }

  updatePedido(id: string, patch: PedidoUpdatePayload): Promise<Pedido> {
    return this.put<Pedido>(`/pedidos/${id}`, patch);
  }

  notificarPedidoWhatsapp(id: string): Promise<{ ok: boolean; proveedor: string; motivo?: string }> {
    return this.post<{ ok: boolean; proveedor: string; motivo?: string }>(`/pedidos/${id}/notificar`, {});
  }

  getIntegracionesEstado(): Promise<{ whatsapp_automatico: boolean }> {
    return this.get<{ whatsapp_automatico: boolean }>('/pedidos/integraciones/estado');
  }

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

  getPedidoPublico(orgId: string | null | undefined, folio: string): Promise<Pedido> {
    const cleanOrg = (orgId || '').trim();
    const cleanFolio = (folio || '').trim();
    const path = cleanOrg ? `/rastreo/${cleanOrg}/${cleanFolio}` : `/rastreo/${cleanFolio}`;
    return fetch(`${this.base}${path}`)
      .then(async (r) => {
        const data = (await r.json()) as Pedido & { error?: string };
        if (!r.ok) throw new Error(data.error || 'Pedido no encontrado');
        return data;
      });
  }

  canjearPromo(
    orgId: string | null | undefined,
    folio: string
  ): Promise<{ ok: boolean; descuento_aplicado: number; saldo_pendiente: number; monedero_restante: number; mensaje: string }> {
    const cleanOrg = (orgId || '').trim();
    const cleanFolio = (folio || '').trim();
    const path = cleanOrg ? `/rastreo/${cleanOrg}/${cleanFolio}/canjear` : `/rastreo/${cleanFolio}/canjear`;
    return fetch(`${this.base}${path}`, { method: 'POST' })
      .then(async (r) => {
        const data = (await r.json()) as {
          ok: boolean;
          descuento_aplicado: number;
          saldo_pendiente: number;
          monedero_restante: number;
          mensaje: string;
          error?: string;
        };
        if (!r.ok) throw new Error(data.error || 'Error al canjear');
        return data;
      });
  }
}
