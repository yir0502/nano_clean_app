import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Categoria, Movimiento, Sucursal } from './models';
import { AuthService } from './auth.service';
import { ENV } from './env';

type Mode = 'local' | 'remote';
const MODE: Mode = 'remote'; // cámbialo a 'local' si quieres probar sin backend

const KEY_MOVS = 'nano_clean_movs';
const KEY_CATS = 'nano_clean_cats';
const ORG = 'local-org';
const uid = () => crypto.randomUUID();

// Utilidades de fecha y etiquetas
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (d: Date) => ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][d.getMonth()];
const dateOnlyISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  constructor(private auth: AuthService, private router: Router) { }

  // ===== QS helper (no manda undefined/null/'') =====
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

  // ===== LOCAL STORAGE helpers =====
  private read<T>(k: string, def: T): T { return JSON.parse(localStorage.getItem(k) || JSON.stringify(def)); }
  private write<T>(k: string, v: T) { localStorage.setItem(k, JSON.stringify(v)); }

  // ====== LOCAL MODE ======
  private async listMovimientosLocal(params?: {
    desde?: string; hasta?: string;
    tipo?: string; categoria_id?: string;
    metodo_pago?: string; q?: string;
    limit?: number; offset?: number;
  }): Promise<Movimiento[]> {
    let data = this.read<Movimiento[]>(KEY_MOVS, []);
    const allCats = await this.listCategoriasLocal(); // para nombre de categoría y búsqueda por texto

    // Filtros
    if (params?.desde) data = data.filter(m => (m.fecha as string) >= params.desde!);
    if (params?.hasta) data = data.filter(m => (m.fecha as string) <= params.hasta!);
    if (params?.tipo) data = data.filter(m => m.tipo === params.tipo);
    if (params?.categoria_id) data = data.filter(m => m.categoria_id === params.categoria_id);
    if (params?.metodo_pago) data = data.filter(m => (m as any).metodo_pago === params.metodo_pago);

    if (params?.q && params.q.trim()) {
      const q = params.q.trim().toLowerCase();
      const catName = (id?: string) => allCats.find(c => c.id === id)?.nombre || 'Sin categoría';
      data = data.filter(m => {
        const nota = (m as any).nota?.toString().toLowerCase() || '';
        const metodo = (m as any).metodo_pago?.toString().toLowerCase() || '';
        const cat = catName((m as any).categoria_id).toLowerCase();
        return nota.includes(q) || metodo.includes(q) || cat.includes(q);
      });
    }

    // Orden: fecha desc (luego created_at desc si existe)
    data = data.sort((a, b) => {
      const fa = String(a.fecha), fb = String(b.fecha);
      if (fa !== fb) return fb.localeCompare(fa);
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });

    // Enriquecer con categoria_nombre (útil para UI)
    const catMap = new Map(allCats.map(c => [c.id, c.nombre]));
    const enriched = data.map(m => ({
      ...m,
      categoria_nombre: m.categoria_id ? (catMap.get(m.categoria_id) || 'Sin categoría') : 'Sin categoría'
    }));

    // Paginación
    const off = params?.offset ?? 0;
    const lim = params?.limit ?? enriched.length;
    return enriched.slice(off, off + lim);
  }

  private async createMovimientoLocal(payload: Omit<Movimiento, 'id' | 'org_id' | 'created_at' | 'updated_at'>) {
    const all = this.read<Movimiento[]>(KEY_MOVS, []);
    const now = new Date().toISOString();
    const item: Movimiento = { id: uid(), org_id: ORG, created_at: now, updated_at: now, ...payload };
    all.push(item); this.write(KEY_MOVS, all); return item;
  }
  private async updateMovimientoLocal(id: string, patch: Partial<Movimiento>) {
    const all = this.read<Movimiento[]>(KEY_MOVS, []);
    const i = all.findIndex(m => m.id === id);
    if (i >= 0) { all[i] = { ...all[i], ...patch, updated_at: new Date().toISOString() }; this.write(KEY_MOVS, all); }
    return all[i];
  }
  private async deleteMovimientoLocal(id: string) { const all = this.read<Movimiento[]>(KEY_MOVS, []); this.write(KEY_MOVS, all.filter(m => m.id !== id)); return { ok: true }; }
  private async listCategoriasLocal(tipo?: 'ingreso' | 'egreso'): Promise<Categoria[]> {
    const def: Categoria[] = [
      { id: uid(), org_id: ORG, nombre: 'Lavado por kilo', tipo: 'ingreso', activo: true },
      { id: uid(), org_id: ORG, nombre: 'Planchado', tipo: 'ingreso', activo: true },
      { id: uid(), org_id: ORG, nombre: 'Detergentes', tipo: 'egreso', activo: true },
      { id: uid(), org_id: ORG, nombre: 'Agua/Luz', tipo: 'egreso', activo: true }
    ];
    const stored = this.read<Categoria[]>(KEY_CATS, def);
    if (!localStorage.getItem(KEY_CATS)) this.write(KEY_CATS, stored);
    return tipo ? stored.filter(c => c.tipo === tipo) : stored;
  }

  // ===== DASHBOARD LOCAL (para modo 'local') =====
  private async dashboardLocal() {
    const movs = await this.listMovimientosLocal();
    const cats = await this.listCategoriasLocal();

    // Mes actual (usar YYYY-MM-DD para comparar con m.fecha)
    const now = new Date();
    const from = dateOnlyISO(new Date(now.getFullYear(), now.getMonth(), 1));
    const to = dateOnlyISO(new Date(now.getFullYear(), now.getMonth() + 1, 1));
    const inMonth = movs.filter(m => (m.fecha as string) >= from && (m.fecha as string) < to);

    // KPIs (si egreso viene negativo, tomar valor absoluto)
    const ingresosMes = inMonth.filter(m => m.tipo === 'ingreso')
      .reduce((s, m) => s + (Number(m.monto) < 0 ? -Number(m.monto) : Number(m.monto)), 0);
    const egresosMes = inMonth.filter(m => m.tipo === 'egreso')
      .reduce((s, m) => s + (Number(m.monto) < 0 ? -Number(m.monto) : Number(m.monto)), 0);

    // Series últimos 12 meses
    const buckets: Record<string, { label: string; ingresos: number; egresos: number }> = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets[monthKey(d)] = { label: monthLabel(d), ingresos: 0, egresos: 0 };
    }
    for (const m of movs) {
      const d = new Date(m.fecha as string);
      const key = monthKey(new Date(d.getFullYear(), d.getMonth(), 1));
      if (!buckets[key]) continue;
      const val = (Number(m.monto) < 0 ? -Number(m.monto) : Number(m.monto));
      if (m.tipo === 'ingreso') buckets[key].ingresos += val; else buckets[key].egresos += val;
    }
    const series = Object.keys(buckets).sort().map(k => buckets[k]);

    // Dona categorías del mes (suma por categoría, ambos tipos)
    const byCat: Record<string, number> = {};
    const catName = (id?: string) => cats.find(c => c.id === id)?.nombre || 'Sin categoría';
    for (const m of inMonth) {
      const name = catName((m as any).categoria_id);
      const val = (Number(m.monto) < 0 ? -Number(m.monto) : Number(m.monto));
      byCat[name] = (byCat[name] || 0) + val;
    }
    const categoriasMes = Object.entries(byCat).map(([nombre, monto]) => ({ nombre, monto }));

    // Últimos movimientos
    const ultimosMovimientos = [...movs]
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
      .slice(0, 10);

    return {
      kpis: { ingresosMes, egresosMes },
      series,
      categoriasMes,
      ultimosMovimientos
    };
  }

  // ===== REMOTO =====
  private async fetchJSON(path: string, init?: RequestInit) {
    console.log(`ApiClientService: fetchJSON ${path}`, MODE);
    console.log('token front', this.auth.token);

    const r = await fetch(path, {
      ...(init || {}),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.auth.token}`,
        ...(init?.headers || {})
      }
    });

    if (r.status === 401) {
      this.auth.logout();
      this.router.navigateByUrl('/login');
      throw new Error('No autorizado');
    }

    if (!r.ok) {
      const e = await r.json().catch(() => ({ error: r.statusText }));
      throw new Error(e.error || 'Request failed');
    }
    return r.json();
  }

  // Base API
  private base = ENV.API_URL || 'http://localhost:3000';
  private url(path: string, params?: Record<string, any>) {
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${this.base}${p}${this.qs(params)}`;
  }

  private listMovimientosRemote(params?: any) {
    return this.fetchJSON(this.url('/movimientos', params));
  }
  private createMovimientoRemote(payload: any) {
    return this.fetchJSON(this.url('/movimientos'), { method: 'POST', body: JSON.stringify(payload) });
  }
  private updateMovimientoRemote(id: string, patch: any) {
    return this.fetchJSON(this.url(`/movimientos/${id}`), { method: 'PUT', body: JSON.stringify(patch) });
  }
  private deleteMovimientoRemote(id: string) {
    return this.fetchJSON(this.url(`/movimientos/${id}`), { method: 'DELETE' });
  }
  private listCategoriasRemote(params?: any) {
    return this.fetchJSON(this.url('/categorias', params));
  }
  async listSucursalesRemote(params?: any) {
    return this.fetchJSON(this.url('/sucursales', params));
  }

  // ===== API GENÉRICA (para usar this.api.get('/dashboard'), etc.) =====
  get<T>(path: string, params?: Record<string, any>): Promise<T> {
    // console.log(`ApiClientService: GET ${path}`, this.url(path, params), MODE);
    if (MODE === 'remote') return this.fetchJSON(this.url(path, params));
    // Soporte local para /dashboard
    if (path === '/dashboard') return this.dashboardLocal() as unknown as Promise<T>;
    return Promise.reject(new Error(`GET ${path} no soportado en modo local`));
  }
  post<T>(path: string, body?: any): Promise<T> {
    if (MODE === 'remote') return this.fetchJSON(this.url(path), { method: 'POST', body: JSON.stringify(body) });
    return Promise.reject(new Error(`POST ${path} no soportado en modo local`));
  }
  put<T>(path: string, body?: any): Promise<T> {
    if (MODE === 'remote') return this.fetchJSON(this.url(path), { method: 'PUT', body: JSON.stringify(body) });
    return Promise.reject(new Error(`PUT ${path} no soportado en modo local`));
  }
  deleteGeneric<T>(path: string): Promise<T> {
    if (MODE === 'remote') return this.fetchJSON(this.url(path), { method: 'DELETE' });
    return Promise.reject(new Error(`DELETE ${path} no soportado en modo local`));
  }

  // ===== MOVIMIENTOS =====
  listMovimientos(params?: {
    desde?: string; hasta?: string;
    tipo?: 'ingreso' | 'egreso';
    categoria_id?: string;
    sucursal_id?: string;               // 👈 NUEVO
    metodo_pago?: string;
    q?: string;
    limit?: number; offset?: number;
  }): Promise<Movimiento[]> {
    return MODE === 'remote'
      ? this.listMovimientosRemote(params)
      : this.listMovimientosLocal(params);
  }

  // ... imports, clase, etc.
  createMovimiento(payload: Omit<Movimiento, 'id' | 'org_id'>) {
    return MODE === 'remote' ? this.createMovimientoRemote(payload) : this.createMovimientoLocal(payload);
  }
  updateMovimiento(id: string, patch: Partial<Movimiento>) {
    return MODE === 'remote' ? this.updateMovimientoRemote(id, patch) : this.updateMovimientoLocal(id, patch);
  }
  deleteMovimiento(id: string) {
    return MODE === 'remote' ? this.deleteMovimientoRemote(id) : this.deleteMovimientoLocal(id);
  }

  listCategorias(tipo?: 'ingreso' | 'egreso'): Promise<Categoria[]> {
    return MODE === 'remote'
      ? this.listCategoriasRemote(tipo ? { tipo } : undefined)
      : this.listCategoriasLocal(tipo);
  }

  listSucursales(params?: { activo?: number }): Promise<Sucursal[]> {
    return MODE === 'remote'
      ? this.listSucursalesRemote(params)
      : Promise.resolve([]); // No hay soporte local para sucursales
  }
}