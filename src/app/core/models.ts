export type TipoMovimiento = 'ingreso' | 'egreso';

export interface Categoria {
  id: string;
  org_id: string;
  nombre: string;
  tipo: TipoMovimiento;
  activo: boolean;
}

export interface Movimiento {
  id: string;
  org_id: string;
  usuario_id?: string;
  tipo: TipoMovimiento;
  monto: number;
  categoria_id?: string;
  fecha: string;        // YYYY-MM-DD
  metodo_pago?: string;
  nota?: string;
  created_at?: string;
  updated_at?: string;
}