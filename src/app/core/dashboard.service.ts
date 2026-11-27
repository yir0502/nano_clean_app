import { Injectable } from '@angular/core';
import { ApiClientService } from './api-client.service';

export interface DashboardRange {
  desde: string;
  hasta: string;
  dias: number;
}

export interface DashboardTotals {
  ingresos: number;
  egresos: number;
  balance: number;
}

export interface DashboardDay {
  fecha: string;
  ingresos: number;
  egresos: number;
  balance: number;
}

export interface DashboardCategory {
  categoria_id: string | null;
  nombre: string;
  total: number;
}

export interface DashboardSucursalMes {
  sucursal_id: string | null;
  nombre: string;
  ingresos: number;
  egresos: number;
  balance: number;
}

export interface DashboardReciente {
  id: string;
  tipo: 'ingreso' | 'egreso';
  categoria: string;
  sucursal_id: string | null;
  sucursal_nombre: string;
  metodo_pago: string | null;
  nota: string | null;
  pedido_id: string | null;
  pedido_folio: string | null;
  fecha: string;
  created_at: string | null;
  monto: number;
}

export interface DashboardQueryParams {
  desde?: string;
  hasta?: string;
  org_id?: string;
  include?: string;
  limit_recientes?: number;
}

export interface DashboardUIResponse {
  range: DashboardRange;
  totales: DashboardTotals;
  por_dia: DashboardDay[];
  por_categoria: {
    ingreso: DashboardCategory[];
    egreso: DashboardCategory[];
  };
  kpis_mes?: DashboardTotals;
  por_categoria_mes?: {
    ingreso: DashboardCategory[];
    egreso: DashboardCategory[];
  };
  por_sucursal_mes?: DashboardSucursalMes[];
  recientes?: DashboardReciente[];
  meta: { items: number };
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(private api: ApiClientService) {}

  async get(params: DashboardQueryParams = {}): Promise<DashboardUIResponse> {
    const merged: Record<string, unknown> = { include: 'mes,recientes', ...params };
    return this.api.get<DashboardUIResponse>('/dashboard', merged);
  }
}
