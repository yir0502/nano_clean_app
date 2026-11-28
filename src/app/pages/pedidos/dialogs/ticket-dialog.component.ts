import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Pedido } from '../../../core/models';
import { TicketPrintService } from '../../../core/ticket-print.service';
import { PedidoActionsService } from '../../../core/pedido-actions.service';

export interface TicketDialogData {
  pedido: Pedido;
  esCreacion?: boolean;
  metodoPagoTexto?: string;
}

@Component({
  selector: 'app-ticket-dialog',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="ticket-modal">
      <header class="header-row">
        <div class="header-lead">
          <span class="header-icon">
            <mat-icon aria-hidden="true">receipt_long</mat-icon>
          </span>
          <div class="header-titles">
            <span class="badge-folio">{{ data.pedido.folio }}</span>
            <h2 class="title">{{ data.esCreacion ? 'Pedido registrado' : 'Ticket y código QR' }}</h2>
          </div>
        </div>
        <button type="button" class="btn-close" (click)="cerrar()" aria-label="Cerrar">
          <mat-icon aria-hidden="true">close</mat-icon>
        </button>
      </header>

      <div class="status-pills" *ngIf="data.esCreacion && (data.pedido.movimiento_registrado || data.pedido.whatsapp_disparado)">
        <div class="pill ok" *ngIf="data.pedido.movimiento_registrado">
          <mat-icon aria-hidden="true">check_circle</mat-icon>
          <span>Ingreso registrado automáticamente en caja</span>
        </div>
        <div class="pill ok" *ngIf="data.pedido.whatsapp_disparado">
          <mat-icon aria-hidden="true">mark_chat_read</mat-icon>
          <span>Confirmación enviada por WhatsApp</span>
        </div>
      </div>

      <div class="qr-box">
        <img *ngIf="qrDataUrl()" [src]="qrDataUrl()" alt="Código QR del pedido" class="qr-img" />
        <div class="qr-placeholder" *ngIf="!qrDataUrl() && !qrError()" aria-label="Generando código QR">
          <mat-icon aria-hidden="true">qr_code_2</mat-icon>
          <span>Generando código QR...</span>
        </div>
        <div class="qr-placeholder qr-placeholder--error" *ngIf="qrError()" role="alert">
          <mat-icon aria-hidden="true">error_outline</mat-icon>
          <span>No se pudo generar el código QR</span>
        </div>

        <span class="client-name">{{ data.pedido.cliente_nombre || 'Cliente Mostrador' }}</span>

        <div class="amount-grid">
          <div class="amount-item">
            <span class="amount-label">Total</span>
            <span class="amount-val">&#36;{{ Number(data.pedido.monto_total || 0).toFixed(2) }}</span>
          </div>
          <div class="amount-divider" aria-hidden="true"></div>
          <div class="amount-item">
            <span class="amount-label">Por pagar</span>
            <span
              class="amount-val"
              [class.amount-val--pending]="Number(data.pedido.saldo_pendiente || 0) > 0">
              &#36;{{ Number(data.pedido.saldo_pendiente || 0).toFixed(2) }}
            </span>
          </div>
        </div>
      </div>

      <label class="auto-print-row">
        <input type="checkbox" [checked]="autoPrint()" (change)="toggleAutoPrint($event)" />
        <span>Imprimir automáticamente al crear nuevos pedidos</span>
      </label>

      <div class="actions">
        <button
          type="button"
          class="btn-print"
          [disabled]="imprimiendo()"
          (click)="imprimir()">
          <mat-icon aria-hidden="true">print</mat-icon>
          <span>{{ imprimiendo() ? 'Preparando impresión...' : 'Imprimir ticket + talón QR' }}</span>
        </button>

        <button
          *ngIf="!data.pedido.whatsapp_disparado && data.pedido.cliente_telefono"
          type="button"
          class="btn-wa-fallback"
          (click)="abrirWhatsappManual()">
          <mat-icon aria-hidden="true">chat</mat-icon>
          <span>Enviar por WhatsApp manual</span>
        </button>

        <button type="button" class="btn-done" (click)="cerrar()">
          Listo
        </button>
      </div>
    </div>
  `,
  styles: [`
    .ticket-modal {
      padding: 20px;
      max-width: 390px;
      background: #ffffff;
      font-family: var(--font-ui);
      font-variant-numeric: tabular-nums;
      color: #0f172a;
    }

    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 14px;
    }

    .header-lead {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .header-icon {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      flex-shrink: 0;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: var(--brand-primary, #196aff);
    }

    .header-icon mat-icon {
      font-size: 19px;
      width: 19px;
      height: 19px;
    }

    .header-titles {
      min-width: 0;
    }

    .badge-folio {
      display: inline-block;
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      padding: 1px 7px;
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
      font-size: 11.5px;
      font-weight: 700;
      letter-spacing: 0.03em;
      margin-bottom: 3px;
    }

    .title {
      margin: 0;
      font-size: 1.08rem;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.02em;
      line-height: 1.25;
    }

    .btn-close {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      padding: 0;
      border-radius: 10px;
      border: 1px solid #e2e8f0;
      background: #f8fafc;
      color: #475569;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease;
    }

    .btn-close:hover {
      background: #f1f5f9;
      border-color: #cbd5e1;
      color: #0f172a;
    }

    .btn-close mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    button:focus-visible,
    input:focus-visible {
      outline: 2px solid var(--brand-primary, #196aff);
      outline-offset: 2px;
    }

    .status-pills {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 12px;
    }

    .pill {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 600;
    }

    .pill.ok {
      background: #ecfdf5;
      color: #047857;
      border: 1px solid #a7f3d0;
    }

    .pill mat-icon {
      font-size: 17px;
      width: 17px;
      height: 17px;
      color: #059669;
      flex-shrink: 0;
    }

    .qr-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }

    .qr-img {
      width: 164px;
      height: 164px;
      border-radius: 10px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      padding: 6px;
      box-sizing: border-box;
    }

    .qr-placeholder {
      width: 164px;
      height: 164px;
      border-radius: 10px;
      border: 1px dashed #cbd5e1;
      background: #ffffff;
      color: #64748b;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-size: 12px;
      text-align: center;
      padding: 12px;
      box-sizing: border-box;
    }

    .qr-placeholder--error {
      border-color: #fecaca;
      background: #fef2f2;
      color: #b91c1c;
    }

    .client-name {
      font-weight: 700;
      font-size: 14px;
      color: #0f172a;
      text-align: center;
    }

    .amount-grid {
      width: 100%;
      display: grid;
      grid-template-columns: 1fr 1px 1fr;
      align-items: center;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
    }

    .amount-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1px;
    }

    .amount-divider {
      height: 26px;
      background: #e2e8f0;
    }

    .amount-label {
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
    }

    .amount-val {
      font-size: 14px;
      font-weight: 800;
      color: #0f172a;
      font-variant-numeric: tabular-nums;
    }

    .amount-val--pending {
      color: #b45309;
    }

    .auto-print-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #475569;
      margin-bottom: 14px;
      cursor: pointer;
    }

    .auto-print-row input {
      width: 15px;
      height: 15px;
      accent-color: var(--brand-primary, #196aff);
      cursor: pointer;
      flex-shrink: 0;
    }

    .actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .btn-print,
    .btn-wa-fallback,
    .btn-done {
      width: 100%;
      min-height: 40px;
      padding: 8px 14px;
      border-radius: 10px;
      font-family: inherit;
      font-size: 13.5px;
      font-variant-numeric: tabular-nums;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      cursor: pointer;
      transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
    }

    .btn-print mat-icon,
    .btn-wa-fallback mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    .btn-print {
      border: 0;
      background: var(--brand-primary, #196aff);
      color: #ffffff;
      font-weight: 700;
      box-shadow: 0 2px 6px rgba(25, 106, 255, 0.24);
    }

    .btn-print:hover:not(:disabled) {
      filter: brightness(1.06);
    }

    .btn-print:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-wa-fallback {
      border: 1px solid #a7f3d0;
      background: #ecfdf5;
      color: #047857;
      font-weight: 700;
    }

    .btn-wa-fallback:hover {
      background: #d1fae5;
      border-color: #6ee7b7;
    }

    .btn-done {
      min-height: 38px;
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      color: #334155;
      font-weight: 600;
    }

    .btn-done:hover {
      background: #f1f5f9;
      border-color: #94a3b8;
      color: #0f172a;
    }
  `],
})
export class TicketDialogComponent implements OnInit {
  data = inject<TicketDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<TicketDialogComponent>);
  private ticketService = inject(TicketPrintService);
  private pedidoActions = inject(PedidoActionsService);

  protected readonly Number = Number;

  qrDataUrl = signal<string>('');
  qrError = signal<boolean>(false);
  imprimiendo = signal<boolean>(false);
  autoPrint = signal<boolean>(this.ticketService.autoPrintEnabled);

  async ngOnInit(): Promise<void> {
    try {
      const url = await this.ticketService.generarQrDataUrl(this.data.pedido);
      this.qrDataUrl.set(url);
    } catch {
      this.qrError.set(true);
    }
  }

  toggleAutoPrint(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    this.autoPrint.set(target.checked);
    this.ticketService.setAutoPrintEnabled(target.checked);
  }

  async imprimir(): Promise<void> {
    if (this.imprimiendo()) return;
    this.imprimiendo.set(true);
    try {
      await this.ticketService.imprimirTicket({
        ...this.data.pedido,
        metodo_pago_texto: this.data.metodoPagoTexto,
      });
    } finally {
      this.imprimiendo.set(false);
    }
  }

  abrirWhatsappManual(): void {
    this.pedidoActions.sendWhatsapp(this.data.pedido);
  }

  cerrar(): void {
    this.dialogRef.close();
  }
}
