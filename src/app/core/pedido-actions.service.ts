import { Injectable } from '@angular/core';
import { Pedido } from './models';

@Injectable({
  providedIn: 'root',
})
export class PedidoActionsService {
  public readonly estadosProduccion = [
    'recibido',
    'lavando',
    'secando',
    'doblando',
    'listo',
    'entregado',
  ];

  getStatusColor(estado: string): string {
    switch (estado) {
      case 'recibido':
        return 'warn';
      case 'lavando':
        return 'accent_1';
      case 'secando':
        return 'accent_2';
      case 'doblando':
        return 'accent_3';
      case 'listo':
        return 'primary';
      case 'entregado':
        return 'completed';
      case 'cancelado':
        return 'canceled';
      default:
        return '';
    }
  }

  construirUrlRastreo(pedido: Pick<Pedido, 'folio'> & { org_id?: string | null }): string {
    const baseUrl = window.location.origin;
    const orgId = pedido.org_id || localStorage.getItem('sb_org_id') || '';
    return orgId ? `${baseUrl}/rastreo/${orgId}/${pedido.folio}` : `${baseUrl}/rastreo/${pedido.folio}`;
  }

  sendWhatsapp(pedido: Pedido) {
    if (!pedido.cliente_telefono) {
      console.warn('El pedido no tiene un telefono asociado.');
      return;
    }

    const urlRastreo = this.construirUrlRastreo(pedido);
    const estadoLimpio = pedido.estado.replace('_', ' ');
    const estadoFormato = estadoLimpio.charAt(0).toUpperCase() + estadoLimpio.slice(1);
    const total = Number(pedido.monto_total || 0);
    const saldo = Number(pedido.saldo_pendiente || 0);
    const resumenMonto =
      total > 0 ? `\nTotal: *$${total.toFixed(2)}* | Saldo pendiente: *$${saldo.toFixed(2)}*` : '';

    const msg =
      `Hola *${pedido.cliente_nombre || 'Cliente'}*\n\n` +
      `Tu pedido *${pedido.folio}* está en estatus: *${estadoFormato}*.${resumenMonto}\n\n` +
      `Puedes consultar los detalles, saldo y fotos aquí:\n` +
      `${urlRastreo}\n\n` +
      `Gracias por tu confianza.\n` +
      `- Lavandería Nano Clean`;

    let telefono = pedido.cliente_telefono.replace(/\D/g, '');
    if (telefono.length === 10) {
      telefono = '52' + telefono;
    }

    const link = `https://api.whatsapp.com/send?phone=${telefono}&text=${encodeURIComponent(msg)}`;
    window.open(link, '_blank');
  }
}
