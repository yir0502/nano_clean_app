import { Injectable, inject } from '@angular/core';
import * as QRCode from 'qrcode';
import { BUSINESS_CONFIG } from './config/business.config';
import { Pedido } from './models';
import { PedidoActionsService } from './pedido-actions.service';

const STORAGE_AUTO_PRINT = 'nc_auto_print_ticket';

@Injectable({
  providedIn: 'root',
})
export class TicketPrintService {
  private pedidoActions = inject(PedidoActionsService);

  get autoPrintEnabled(): boolean {
    return localStorage.getItem(STORAGE_AUTO_PRINT) === '1';
  }

  setAutoPrintEnabled(enabled: boolean): void {
    localStorage.setItem(STORAGE_AUTO_PRINT, enabled ? '1' : '0');
  }

  async generarQrDataUrl(pedido: Pick<Pedido, 'folio'> & { org_id?: string | null }): Promise<string> {
    const url = this.pedidoActions.construirUrlRastreo(pedido);
    return QRCode.toDataURL(url, {
      margin: 1,
      width: 200,
      errorCorrectionLevel: 'M',
    });
  }

  async imprimirTicket(pedido: Partial<Pedido> & { folio: string; metodo_pago_texto?: string }): Promise<void> {
    const urlRastreo = this.pedidoActions.construirUrlRastreo({
      folio: pedido.folio,
      org_id: pedido.org_id,
    });

    const qrClienteSvg = await QRCode.toString(urlRastreo, {
      type: 'svg',
      margin: 1,
      width: 148,
      errorCorrectionLevel: 'M',
    });

    const qrBolsaSvg = await QRCode.toString(urlRastreo, {
      type: 'svg',
      margin: 1,
      width: 108,
      errorCorrectionLevel: 'M',
    });

    const html = this.construirHtmlTermico(pedido, qrClienteSvg, qrBolsaSvg);
    this.ejecutarImpresionIframe(html);
  }

  private escapeHtml(raw: string | undefined | null): string {
    if (!raw) return '';
    return raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private formatearFechaHora(iso?: string): string {
    const d = iso ? new Date(iso) : new Date();
    return d.toLocaleString('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private formatearFechaEntrega(fechaStr?: string): string {
    if (!fechaStr) return 'Por confirmar';
    const clean = fechaStr.includes('T') ? fechaStr : `${fechaStr}T12:00:00`;
    const d = new Date(clean);
    if (isNaN(d.getTime())) return this.escapeHtml(fechaStr);
    return d.toLocaleDateString('es-MX', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    });
  }

  private construirHtmlTermico(
    pedido: Partial<Pedido> & { folio: string; metodo_pago_texto?: string },
    qrClienteSvg: string,
    qrBolsaSvg: string
  ): string {
    const negocio = this.escapeHtml(BUSINESS_CONFIG.nombreNegocio);
    const sucursal = this.escapeHtml(pedido.sucursal_nombre || 'Mostrador');
    const folio = this.escapeHtml(pedido.folio);
    const cliente = this.escapeHtml(pedido.cliente_nombre || 'Cliente Mostrador');
    const telefono = this.escapeHtml(pedido.cliente_telefono || '');
    const descripcion = this.escapeHtml(pedido.descripcion || 'Servicio de lavanderia');
    const fechaEmision = this.formatearFechaHora(pedido.created_at);
    const fechaEntrega = this.formatearFechaEntrega(pedido.fecha_entrega_estimada);

    const total = Number(pedido.monto_total || 0);
    const descuento = Number(pedido.descuento_aplicado || 0);
    const saldo = Number(pedido.saldo_pendiente || 0);
    const pagado = Math.max(0, total - descuento - saldo);

    const filaDescuento =
      descuento > 0
        ? `<div class="row"><span>Descuento lealtad:</span><span>-$${descuento.toFixed(2)}</span></div>`
        : '';

    const filaMetodo = pedido.metodo_pago_texto
      ? `<div class="row sub"><span>Método de pago:</span><span>${this.escapeHtml(pedido.metodo_pago_texto)}</span></div>`
      : '';

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Ticket ${folio}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      color: #000000;
    }
    body {
      margin: 0 auto;
      padding: 3mm 3mm 6mm;
      width: 100%;
      max-width: 72mm;
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      line-height: 1.3;
      background: #ffffff;
    }
    .center { text-align: center; }
    .brand { font-size: 15px; font-weight: 700; text-transform: uppercase; }
    .meta { font-size: 11px; margin-top: 2px; }
    .folio-box {
      margin: 6px 0;
      padding: 4px;
      border: 2px solid #000000;
      text-align: center;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 1px;
    }
    .divider {
      border-top: 1px dashed #000000;
      margin: 6px 0;
    }
    .cut-line {
      border-top: 2px dashed #000000;
      margin: 12px 0 8px;
      padding-top: 4px;
      text-align: center;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 6px;
      margin: 2px 0;
    }
    .row.sub { font-size: 11px; }
    .row.bold { font-weight: 700; font-size: 14px; margin-top: 4px; }
    .desc {
      margin: 4px 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 12px;
    }
    .qr-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin: 6px 0 2px;
    }
    .qr-wrap svg {
      display: block;
    }
    .qr-caption {
      font-size: 10px;
      text-align: center;
      margin-top: 2px;
    }
    .bag-folio {
      font-size: 24px;
      font-weight: 700;
      text-align: center;
      letter-spacing: 1px;
      margin: 2px 0;
    }
    .bag-client {
      font-size: 14px;
      font-weight: 700;
      text-align: center;
      margin-bottom: 2px;
    }
  </style>
</head>
<body>
  <div class="center">
    <div class="brand">${negocio}</div>
    <div class="meta">${sucursal} | ${fechaEmision}</div>
  </div>

  <div class="folio-box">${folio}</div>

  <div><strong>Cliente:</strong> ${cliente}</div>
  ${telefono ? `<div><strong>Tel:</strong> ${telefono}</div>` : ''}
  <div><strong>Entrega est.:</strong> ${fechaEntrega}</div>

  <div class="divider"></div>
  <div><strong>Detalle:</strong></div>
  <div class="desc">${descripcion}</div>
  <div class="divider"></div>

  <div class="row"><span>Total:</span><span>$${total.toFixed(2)}</span></div>
  ${filaDescuento}
  <div class="row"><span>Abonado:</span><span>$${pagado.toFixed(2)}</span></div>
  ${filaMetodo}
  <div class="row bold"><span>POR PAGAR:</span><span>$${saldo.toFixed(2)}</span></div>

  <div class="divider"></div>
  <div class="qr-wrap">
    ${qrClienteSvg}
    <div class="qr-caption">Escanea para ver estatus, saldo y fotos</div>
  </div>

  <div class="cut-line">- - - TALON DE BOLSA - - -</div>
  <div class="bag-folio">${folio}</div>
  <div class="bag-client">${cliente}</div>
  <div class="center meta">Entrega: ${fechaEntrega} | Resta: $${saldo.toFixed(2)}</div>
  <div class="qr-wrap">
    ${qrBolsaSvg}
  </div>
</body>
</html>`;
  }

  private ejecutarImpresionIframe(html: string): void {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc || !iframe.contentWindow) {
      document.body.removeChild(iframe);
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    const win = iframe.contentWindow;
    const cleanup = () => {
      setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 1500);
    };

    setTimeout(() => {
      win.focus();
      win.print();
      cleanup();
    }, 180);
  }
}
