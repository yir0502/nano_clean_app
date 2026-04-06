import { Injectable } from '@angular/core';
import { Pedido } from './models';

@Injectable({
  providedIn: 'root'
})
export class PedidoActionsService {

  // Orden lógico de producción para la barra de rastreo
  public readonly estadosProduccion = [
    'recibido', 
    'lavando', 
    'secando', 
    'doblando', 
    'listo', 
    'entregado'
  ];

  constructor() { }

  /**
   * Devuelve la clase de color/css correspondiente a un estado
   */
  getStatusColor(estado: string): string {
    switch (estado) {
      case 'recibido': return 'warn';
      case 'lavando': return 'accent_1';
      case 'secando': return 'accent_2';
      case 'doblando': return 'accent_3';
      case 'listo': return 'primary';
      case 'entregado': return 'completed';
      case 'cancelado': return 'canceled';
      default: return '';
    }
  }

  /**
   * Genera el mensaje dinámico y abre WhatsApp Web / App
   */
  sendWhatsapp(pedido: Pedido) {
    if (!pedido.cliente_telefono) {
      console.warn('El pedido no tiene un teléfono asociado.');
      return;
    }

    const baseUrl = window.location.origin;
    const urlRastreo = `${baseUrl}/rastreo/${pedido.folio}`;

    const estadoLimpio = pedido.estado.replace('_', ' ');
    const estadoFormato = estadoLimpio.charAt(0).toUpperCase() + estadoLimpio.slice(1);

    const msg = `Hola *${pedido.cliente_nombre}* \uD83D\uDC4B

Tu pedido *${pedido.folio}* está: *${estadoFormato}*.

Puedes ver los detalles, saldo y fotos aquí \uD83D\uDC47:
${urlRastreo}

¡Gracias por tu confianza! \u2764\uFE0F
- Lavandería Nano Clean \uD83E\uDD16`;

    // Limpiar teléfono para API
    const telefono = pedido.cliente_telefono.replace(/\\D/g, '');

    const link = `https://api.whatsapp.com/send?phone=${telefono}&text=${encodeURIComponent(msg)}`;
    window.open(link, '_blank');
  }
}
