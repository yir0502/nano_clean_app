export interface Categoria {
  id: string;
  org_id: string;
  nombre: string;
  tipo: 'ingreso' | 'egreso';
  activo: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Movimiento {
  id: string;
  org_id: string;
  tipo: 'ingreso' | 'egreso';
  monto: number;                     
  categoria_id?: string | null;
  pedido_id?: string | null;
  fecha: string;                     
  nota?: string | null;
  created_at?: string;
  updated_at?: string;
  categoria_nombre?: string;         
  sucursal_id?: string | null;
  sucursal_nombre?: string;
  user_id?: string;
  user_nombre?: string;
}

export interface Sucursal {
  id: string;
  org_id: string;
  nombre: string;
  activo: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Movimiento {
  id: string;
  org_id: string;
  tipo: 'ingreso' | 'egreso';
  monto: number;
  categoria_id?: string | null;
  sucursal_id?: string | null;
  pedido_id?: string | null;
  fecha: string;
  metodo_pago?: string | null;
  nota?: string | null;
  created_at?: string;
  updated_at?: string;
  categoria_nombre?: string;
  sucursal_nombre?: string;
}

export interface Cliente {
  id: string;
  org_id?: string;
  nombre: string;
  telefono: string;
  direccion?: string;
  email?: string;
  permite_whatsapp: boolean;
  frecuencia_recordatorio: number; 
  ultima_visita?: string;
  fecha_ultima_promo?: string;
  total_gastado?: number;
}

export interface Pedido {
  id: string;
  org_id: string;
  folio: string;
  cliente_id: string | null;
  sucursal_id?: string | null;
  descripcion?: string;
  estado: 'pendiente' | 'en_proceso' | 'listo' | 'entregado' | 'cancelado';
  monto_total: number;
  saldo_pendiente: number;
  fecha_entrega_estimada?: string;
  fecha_entregado?: string;
  created_at?: string;
  updated_at?: string;
  cliente_nombre?: string;
  cliente_telefono?: string;
  sucursal_nombre?: string;
}

export interface PedidoEvidencia {
  id: string;
  pedido_id: string;
  url: string;
  tipo: 'ingreso' | 'resultado';
  nota?: string;
  created_at?: string;
}