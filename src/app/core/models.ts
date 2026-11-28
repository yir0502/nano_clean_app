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
  metodo_pago?: string | null;
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

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
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
  ultimo_recordatorio_at?: string;
  total_gastado?: number;
  invitaciones_enviadas?: number;
  monedero?: number;
  contador_servicios?: number;
  apto_promociones?: boolean;
}

export type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta' | 'mercado_pago' | 'otro';

export interface Pedido {
  id: string;
  org_id: string;
  folio: string;
  cliente_id: string | null;
  sucursal_id?: string | null;
  descripcion?: string;
  estado: 'recibido' | 'lavando' | 'secando' | 'doblando' | 'listo' | 'entregado' | 'cancelado';
  monto_total: number;
  saldo_pendiente: number;
  fecha_entrega_estimada?: string;
  fecha_entregado?: string;
  created_at?: string;
  updated_at?: string;
  cliente_nombre?: string;
  cliente_telefono?: string;
  sucursal_nombre?: string;
  descuento_aplicado?: number;
  puntos_generados?: boolean;
  movimiento_registrado?: boolean;
  whatsapp_automatico?: boolean;
  whatsapp_disparado?: boolean;
}

export interface PedidoCreatePayload extends Partial<Pedido> {
  registrar_pago?: boolean;
  metodo_pago?: MetodoPago | null;
  categoria_ingreso_id?: string | null;
  omitir_whatsapp?: boolean;
}

export interface PedidoUpdatePayload extends Partial<Pedido> {
  monto_cobrado?: number;
  metodo_pago?: MetodoPago | null;
  categoria_ingreso_id?: string | null;
  omitir_whatsapp?: boolean;
}

export interface PedidoEvidencia {
  id: string;
  pedido_id: string;
  url: string;
  tipo: 'ingreso' | 'resultado';
  nota?: string;
  created_at?: string;
}

export type PedidoEstadoFilter =
  | 'recibido'
  | 'lavando'
  | 'secando'
  | 'doblando'
  | 'listo'
  | 'entregado'
  | 'cancelado';

export interface PedidosPorEstadoCount {
  recibido: number;
  lavando: number;
  secando: number;
  doblando: number;
  listo: number;
  entregado: number;
  cancelado: number;
}

export interface PedidosResumen {
  total: number;
  en_proceso: number;
  listos: number;
  por_cobrar_count: number;
  por_cobrar_monto: number;
  por_estado: PedidosPorEstadoCount;
}

export interface PedidosPaginadosResponse {
  data: Pedido[];
  count: number;
  resumen: PedidosResumen;
}

export interface PedidosPaginadosQueryParams {
  activo?: boolean;
  q?: string;
  sucursal_id?: string;
  estado?: PedidoEstadoFilter;
  solo_por_cobrar?: boolean;
  desde?: string;
  hasta?: string;
  limit?: number;
  offset?: number;
}

export interface MovimientosTotales {
  ingresos: number;
  egresos: number;
  balance: number;
  total_movimientos?: number;
  ingresos_count?: number;
  egresos_count?: number;
}

export interface MovimientosPaginadosResponse {
  data: Movimiento[];
  count: number;
  totales: MovimientosTotales;
}

export interface MovimientosQueryParams {
  desde?: string;
  hasta?: string;
  tipo?: 'ingreso' | 'egreso';
  categoria_id?: string;
  sucursal_id?: string;
  metodo_pago?: string;
  q?: string;
  limit?: number;
  offset?: number;
  pedido_id?: string;
  org_id?: string;
}

export interface ClientStatsSegmentos {
  active_0_15: number;
  risk_16_45: number;
  lost_45plus: number;
}

export interface ClientStatsFrecuencias {
  '7': number;
  '15': number;
  '30': number;
  otros: number;
}

export interface ClientStatsResponse {
  total: number;
  faltan_promo: number;
  con_whatsapp: number;
  frecuencias: ClientStatsFrecuencias;
  segmentos: ClientStatsSegmentos;
}

export interface RepartoSocioConfig {
  id: string;
  nombre: string;
  pct: number;
}

export interface SucursalRepartoConfig {
  sucursal_id: string;
  capital_pct: number;
  socios: RepartoSocioConfig[];
  updated_at: string | null;
  configurado: boolean;
}

export interface SucursalRepartoPayload {
  capital_pct: number;
  socios: RepartoSocioConfig[];
}
