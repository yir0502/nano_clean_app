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
  monto: number;                      // valor positivo; en UI ponemos signo si egreso
  categoria_id?: string | null;
  fecha: string;                      // YYYY-MM-DD
  metodo_pago?: string | null;
  nota?: string | null;
  created_at?: string;
  updated_at?: string;
  categoria_nombre?: string;          // nombre resuelto de la categoría
  sucursal_id?: string | null;        // nuevo campo para sucursal
  sucursal_nombre?: string;           // nombre resuelto de la sucursal
  user_id?: string;               // ID del usuario que creó el movimiento
  user_nombre?: string;           // Nombre del usuario que creó el movimiento
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
  sucursal_id?: string | null;    // 👈 nuevo
  fecha: string;
  metodo_pago?: string | null;
  nota?: string | null;
  created_at?: string;
  updated_at?: string;

  categoria_nombre?: string;
  sucursal_nombre?: string;       // 👈 enriquecido por el backend
}
