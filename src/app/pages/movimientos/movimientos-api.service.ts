import { Injectable, inject } from '@angular/core';
import { ApiClientService } from '../../core/api-client.service';
import {
  MovimientosPaginadosResponse,
  MovimientosQueryParams,
} from '../../core/models';

@Injectable({ providedIn: 'root' })
export class MovimientosApiService {
  private readonly api = inject(ApiClientService);

  listarPaginados(params: MovimientosQueryParams): Promise<MovimientosPaginadosResponse> {
    const query: Record<string, string | number | boolean | undefined> = {
      desde: params.desde,
      hasta: params.hasta,
      tipo: params.tipo,
      categoria_id: params.categoria_id,
      sucursal_id: params.sucursal_id,
      metodo_pago: params.metodo_pago,
      q: params.q,
      limit: params.limit,
      offset: params.offset,
      pedido_id: params.pedido_id,
      org_id: params.org_id,
      paginated: 1,
    };

    return this.api.get<MovimientosPaginadosResponse>('/movimientos', query);
  }
}
