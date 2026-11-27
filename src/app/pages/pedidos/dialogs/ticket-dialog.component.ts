import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
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
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatCheckboxModule],
  template: `
    <div class="ticket-modal">
      <div class="header-row">
        <div>
          <span class="badge-folio">{{ data.pedido.folio }}</span>
          <h2 class="title">{{ data.esCreacion ? 'Pedido Registrado' : 'Ticket y Código QR' }}</h2>
        </div>
        <button mat-icon-button (click)="cerrar()" aria-label="Cerrar">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="status-pills" *ngIf="data.esCreacion">
        <div class="pill ok" *ngIf="data.pedido.movimiento_registrado">
          <mat-icon>check_circle</mat-icon>
          <span>Ingreso registrado automáticamente en caja</span>
        </div>
        <div class="pill ok" *ngIf="data.pedido.whatsapp_disparado">
          <mat-icon>mark_chat_read</mat-icon>
          <span>Confirmación enviada por WhatsApp</span>
        </div>
      </div>

      <div class="qr-box">
        <img *ngIf="qrDataUrl()" [src]="qrDataUrl()" alt="QR del pedido" class="qr-img" />
        <span class="client-name">{{ data.pedido.cliente_nombre || 'Cliente Mostrador' }}</span>
        <span class="amount-summary">
          Total: &#36;{{ Number(data.pedido.monto_total || 0).toFixed(2) }} |
          Por pagar: &#36;{{ Number(data.pedido.saldo_pendiente || 0).toFixed(2) }}
        </span>
      </div>

      <label class="auto-print-row">
        <input type="checkbox" [checked]="autoPrint()" (change)="toggleAutoPrint($event)" />
        <span>Imprimir automáticamente al crear nuevos pedidos</span>
      </label>

      <div class="actions">
        <button mat-flat-button class="btn-print" (click)="imprimir()">
          <mat-icon>print</mat-icon>
          Imprimir Ticket + Talón QR
        </button>

        <button
          *ngIf="!data.pedido.whatsapp_disparado && data.pedido.cliente_telefono"
          mat-stroked-button
          class="btn-wa-fallback"
          (click)="abrirWhatsappManual()">
          <mat-icon>chat</mat-icon>
          Enviar por WhatsApp Manual
        </button>

        <button mat-button class="btn-done" (click)="cerrar()">
          Listo
        </button>
      </div>
    </div>
  `,
  styles: [`
    .ticket-modal {
      padding: 20px;
      max-width: 380px;
      font-family: var(--font-ui);
    }
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }
    .badge-folio {
      display: inline-block;
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      padding: 2px 8px;
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .title {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 800;
      color: #0f172a;
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
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
    }
    .pill.ok {
      background: #ecfdf5;
      color: #065f46;
      border: 1px solid #a7f3d0;
    }
    .pill mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #10b981;
    }
    .qr-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      margin-bottom: 12px;
    }
    .qr-img {
      width: 164px;
      height: 164px;
      border-radius: 8px;
      background: #ffffff;
      padding: 4px;
    }
    .client-name {
      font-weight: 700;
      font-size: 14px;
      color: #1e293b;
      margin-top: 4px;
    }
    .amount-summary {
      font-size: 12px;
      color: #475569;
      font-weight: 500;
    }
    .auto-print-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #475569;
      margin-bottom: 16px;
      cursor: pointer;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .btn-print {
      height: 46px;
      border-radius: 10px !important;
      background: #0f172a !important;
      color: #ffffff !important;
      font-weight: 700 !important;
    }
    .btn-wa-fallback {
      height: 42px;
      border-radius: 10px !important;
      border-color: #16a34a !important;
      color: #15803d !important;
      font-weight: 600 !important;
    }
    .btn-done {
      height: 40px;
      color: #64748b !important;
      font-weight: 600 !important;
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
  autoPrint = signal<boolean>(this.ticketService.autoPrintEnabled);

  async ngOnInit(): Promise<void> {
    const url = await this.ticketService.generarQrDataUrl(this.data.pedido);
    this.qrDataUrl.set(url);
  }

  toggleAutoPrint(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.autoPrint.set(checked);
    this.ticketService.setAutoPrintEnabled(checked);
  }

  async imprimir(): Promise<void> {
    await this.ticketService.imprimirTicket({
      ...this.data.pedido,
      metodo_pago_texto: this.data.metodoPagoTexto,
    });
  }

  abrirWhatsappManual(): void {
    this.pedidoActions.sendWhatsapp(this.data.pedido);
  }

  cerrar(): void {
    this.dialogRef.close();
  }
}
