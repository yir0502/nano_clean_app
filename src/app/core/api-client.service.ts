import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Categoria, Movimiento } from './models';
import { AuthService } from './auth.service';
import { ENV } from './env';

type Mode = 'local' | 'remote';
const MODE: Mode = 'remote'; // cámbialo a 'local' si quieres probar sin backend

const KEY_MOVS = 'nano_clean_movs';
const KEY_CATS = 'nano_clean_cats';
const ORG = 'local-org';
const uid = () => crypto.randomUUID();

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  constructor(private auth: AuthService, private router: Router) {}

  // ===== QS helper (no manda undefined/null/'' ) =====
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

  // ===== LOCAL =====
  private read<T>(k: string, def: T): T { return JSON.parse(localStorage.getItem(k) || JSON.stringify(def)); }
  private write<T>(k: string, v: T){ localStorage.setItem(k, JSON.stringify(v)); }

  private async listMovimientosLocal(params?: {desde?:string; hasta?:string; tipo?:string; categoria_id?:string;}): Promise<Movimiento[]> {
    let data = this.read<Movimiento[]>(KEY_MOVS, []);
    if (params?.desde) data = data.filter(m => m.fecha >= params.desde!);
    if (params?.hasta) data = data.filter(m => m.fecha <= params.hasta!);
    if (params?.tipo) data = data.filter(m => m.tipo === params.tipo);
    if (params?.categoria_id) data = data.filter(m => m.categoria_id === params.categoria_id);
    return data.sort((a,b)=> b.fecha.localeCompare(a.fecha));
  }
  private async createMovimientoLocal(payload: Omit<Movimiento,'id'|'org_id'|'created_at'|'updated_at'>){
    const all = this.read<Movimiento[]>(KEY_MOVS, []);
    const now = new Date().toISOString();
    const item: Movimiento = { id: uid(), org_id: ORG, created_at: now, updated_at: now, ...payload };
    all.push(item); this.write(KEY_MOVS, all); return item;
  }
  private async updateMovimientoLocal(id:string, patch: Partial<Movimiento>){
    const all = this.read<Movimiento[]>(KEY_MOVS, []);
    const i = all.findIndex(m=>m.id===id);
    if (i>=0){ all[i] = { ...all[i], ...patch, updated_at: new Date().toISOString() }; this.write(KEY_MOVS, all); }
    return all[i];
  }
  private async deleteMovimientoLocal(id:string){ const all=this.read<Movimiento[]>(KEY_MOVS, []); this.write(KEY_MOVS, all.filter(m=>m.id!==id)); return {ok:true}; }
  private async listCategoriasLocal(tipo?: 'ingreso'|'egreso'): Promise<Categoria[]>{
    const def: Categoria[] = [
      { id: uid(), org_id: ORG, nombre: 'Lavado por kilo', tipo: 'ingreso', activo: true },
      { id: uid(), org_id: ORG, nombre: 'Planchado',       tipo: 'ingreso', activo: true },
      { id: uid(), org_id: ORG, nombre: 'Detergentes',     tipo: 'egreso',  activo: true },
      { id: uid(), org_id: ORG, nombre: 'Agua/Luz',        tipo: 'egreso',  activo: true }
    ];
    const stored = this.read<Categoria[]>(KEY_CATS, def);
    if (!localStorage.getItem(KEY_CATS)) this.write(KEY_CATS, stored);
    return tipo ? stored.filter(c=>c.tipo===tipo) : stored;
  }

  // ===== REMOTO =====
  private async fetchJSON(path: string, init?: RequestInit){
    const r = await fetch(path, {
      ...(init||{}),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.auth.token}`,
        ...(init?.headers||{})
      }
    });

    if (r.status === 401) {
      this.auth.logout();
      this.router.navigateByUrl('/login');
      throw new Error('No autorizado');
    }

    if (!r.ok) {
      const e = await r.json().catch(()=>({error:r.statusText}));
      throw new Error(e.error || 'Request failed');
    }
    return r.json();
  }

  // Ajusta aquí la URL base de tu API (local o deploy)
  private base = ENV.API_URL || 'http://localhost:3000';

  private listMovimientosRemote(params?: any){ 
    const qs = this.qs(params);
    return this.fetchJSON(`${this.base}/movimientos${qs}`);
  }
  private createMovimientoRemote(payload: any){
    return this.fetchJSON(`${this.base}/movimientos`, { method: 'POST', body: JSON.stringify(payload) });
  }
  private updateMovimientoRemote(id: string, patch: any){
    return this.fetchJSON(`${this.base}/movimientos/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
  }
  private deleteMovimientoRemote(id: string){
    return this.fetchJSON(`${this.base}/movimientos/${id}`, { method: 'DELETE' });
  }
  private listCategoriasRemote(params?: any){
    const qs = this.qs(params);
    return this.fetchJSON(`${this.base}/categorias${qs}`);
  }

  // ===== API PÚBLICA =====
  listMovimientos(params?: {desde?:string; hasta?:string; tipo?:string; categoria_id?:string;}): Promise<Movimiento[]> {
    return MODE==='remote' ? this.listMovimientosRemote(params) : this.listMovimientosLocal(params);
  }
  createMovimiento(payload: Omit<Movimiento,'id'|'org_id'>){
    return MODE==='remote' ? this.createMovimientoRemote(payload) : this.createMovimientoLocal(payload);
  }
  updateMovimiento(id:string, patch: Partial<Movimiento>){
    return MODE==='remote' ? this.updateMovimientoRemote(id, patch) : this.updateMovimientoLocal(id, patch);
  }
  deleteMovimiento(id:string){
    return MODE==='remote' ? this.deleteMovimientoRemote(id) : this.deleteMovimientoLocal(id);
  }
  listCategorias(tipo?: 'ingreso'|'egreso'): Promise<Categoria[]>{
    return MODE==='remote' ? this.listCategoriasRemote(tipo ? { tipo } : undefined) : this.listCategoriasLocal(tipo);
  }
}
