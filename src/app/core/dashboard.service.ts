// src/app/core/dashboard.service.ts
import { Injectable } from '@angular/core';
import { ApiClientService } from './api-client.service';
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
  por_sucursal_mes?: { sucursal_id: string | null; nombre: string; ingresos: number; egresos: number; balance: number }[];
  recientes?: { id: string; tipo: 'ingreso'|'egreso'; categoria: string; fecha: string; monto: number }[];
  meta: { items: number };
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private base = ENV.API_URL || 'http://localhost:3000';
  constructor(private api: ApiClientService) {}

  async get(params: {
    desde?: string; hasta?: string; org_id?: string; include?: string; limit_recientes?: number
  } = {}): Promise<DashboardUIResponse> {
    // asegura include por defecto como antes
    const merged = { include: 'mes,recientes', ...params };
    // delega en ApiClientService para que maneje 401 y redireccione al login
    return this.api.get<DashboardUIResponse>('/dashboard', merged);
  }
}
