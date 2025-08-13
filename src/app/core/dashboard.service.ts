import { Injectable } from '@angular/core';
import { ENV } from './env';

export interface DashboardRange { desde: string; hasta: string; dias: number; }
export interface DashboardTotals { ingresos: number; egresos: number; balance: number; }
export interface DashboardDay    { fecha: string; ingresos: number; egresos: number; balance: number; }
export interface DashboardCategory { categoria_id: string | null; nombre: string; total: number; }

export interface DashboardUIResponse {
  range: DashboardRange;
  totales: DashboardTotals;
  por_dia: DashboardDay[];
  por_categoria: { ingreso: DashboardCategory[]; egreso: DashboardCategory[]; };
  kpis_mes?: DashboardTotals;
  por_categoria_mes?: { ingreso: DashboardCategory[]; egreso: DashboardCategory[]; };
  recientes?: { id: string; tipo: 'ingreso'|'egreso'; categoria: string; fecha: string; monto: number }[];
  meta: { items: number };
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private base = ENV.API_URL || 'http://localhost:3000';
  private get token(): string | undefined { return localStorage.getItem('sb_token') || undefined; }

  async get(params: { desde?: string; hasta?: string; org_id?: string; include?: string; limit_recientes?: number } = {}): Promise<DashboardUIResponse> {
    const search = new URLSearchParams({ include: 'mes,recientes', ...params as any }).toString();
    const url = `${this.base}/dashboard?${search}`;
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(()=>res.statusText)}`);
    return res.json();
  }
}