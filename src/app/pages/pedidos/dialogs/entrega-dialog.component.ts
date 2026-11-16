import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MetodoPago } from '../../../core/models';

export interface EntregaDialogData {
  nombreCliente: string;
  folio: string;
  saldoPendiente: number;
  montoTotal: number;
}

export interface EntregaDialogResponse {
  accion: 'cobrar' | 'deuda';
  metodoPago?: MetodoPago;
}

@Component({
  selector: 'app-entrega-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="creative-modal-wrapper">
      <div class="modal-bubbles-container">
        <div class="bubble"></div><div class="bubble"></div><div class="bubble"></div>
        <div class="bubble"></div><div class="bubble"></div><div class="bubble"></div><div class="bubble"></div>
      </div>

      <div class="modal-content-glass entrega-dialog">
        <h2 class="dialog-title">Entregar Pedido</h2>

        <div class="dialog-body">
          <p class="info-text">
            Pedido <strong>{{ data.folio }}</strong> de <strong>{{ data.nombreCliente }}</strong>.
          </p>

          <div class="saldo-card" *ngIf="data.saldoPendiente > 0">
            <span class="saldo-label">Saldo a liquidar</span>
            <span class="saldo-value">&#36;{{ data.saldoPendiente.toFixed(2) }}</span>
          </div>

          <p class="question">Método de cobro en un toque:</p>
          <div class="metodos-grid">
            <button
              type="button"
              *ngFor="let m of metodos"
              class="metodo-chip"
              [class.active]="metodoSeleccionado() === m.id"
              (click)="metodoSeleccionado.set(m.id)">
              <mat-icon>{{ m.icon }}</mat-icon>
              <span>{{ m.label }}</span>
            </button>
          </div>
        </div>

        <div class="dialog-actions">
          <button mat-button class="btn-registrar" (click)="cobrarYEntregar()">
            <mat-icon>payments</mat-icon>
            Cobrar &#36;{{ data.saldoPendiente.toFixed(2) }} y Entregar
          </button>
          <button mat-button class="btn-deuda" (click)="dejarEnDeudas()">
            <mat-icon>schedule</mat-icon>
            Entregar y Dejar en Deudas
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .creative-modal-wrapper {
      font-family: 'Roboto', 'Helvetica Neue', sans-serif;
    }

    .entrega-dialog {
      padding: 28px 22px;
      max-width: 390px;
    }

    .dialog-title {
      font-family: inherit;
      font-size: 1.35rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 12px 0;
      letter-spacing: -0.5px;
    }

    .dialog-body {
      margin-bottom: 20px;
    }

    .info-text {
      font-family: inherit;
      font-size: 0.92rem;
      color: #475569;
      line-height: 1.45;
      margin: 0 0 14px;
    }
    .info-text strong {
      color: #0f172a;
    }

    .saldo-card {
      background: linear-gradient(135deg, #fff3e0, #ffe0b2);
      border-radius: 12px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      margin-bottom: 16px;
      box-shadow: 0 4px 10px rgba(255, 152, 0, 0.15);
      border: 1px solid rgba(255, 152, 0, 0.3);
    }
    .saldo-label {
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      color: #e65100;
      letter-spacing: 0.5px;
    }
    .saldo-value {
      font-size: 1.85rem;
      font-weight: 800;
      color: #bf360c;
    }

    .question {
      font-size: 0.85rem;
      font-weight: 700;
      color: #334155;
      margin: 0 0 8px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }

    .metodos-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }

    .metodo-chip {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 10px 8px;
      border-radius: 10px;
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      color: #334155;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .metodo-chip mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .metodo-chip.active {
      background: #0f172a;
      color: #ffffff;
      border-color: #0f172a;
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.25);
    }

    .dialog-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .btn-registrar {
      background: linear-gradient(135deg, #22c55e, #10b981) !important;
      color: white !important;
      height: 48px;
      border-radius: 12px !important;
      font-weight: 700 !important;
      font-size: 0.9rem !important;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
    }

    .btn-deuda {
      background-color: transparent !important;
      color: #e65100 !important;
      border: 1px solid #ff9800;
      height: 44px;
      border-radius: 12px !important;
      font-weight: 600 !important;
      font-size: 0.85rem !important;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
  `],
})
export class EntregaDialogComponent {
  data = inject<EntregaDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<EntregaDialogComponent, EntregaDialogResponse>);

  metodoSeleccionado = signal<MetodoPago>('efectivo');

  readonly metodos: { id: MetodoPago; label: string; icon: string }[] = [
    { id: 'efectivo', label: 'Efectivo', icon: 'attach_money' },
    { id: 'transferencia', label: 'Transferencia', icon: 'sync_alt' },
    { id: 'tarjeta', label: 'Tarjeta', icon: 'credit_card' },
    { id: 'mercado_pago', label: 'Mercado Pago', icon: 'qr_code_scanner' },
  ];

  cobrarYEntregar(): void {
    this.dialogRef.close({
      accion: 'cobrar',
      metodoPago: this.metodoSeleccionado(),
    });
  }

  dejarEnDeudas(): void {
    this.dialogRef.close({
      accion: 'deuda',
    });
  }
}
