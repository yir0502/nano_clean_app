import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface EntregaDialogData {
  nombreCliente: string;
  folio: string;
  saldoPendiente: number;
  montoTotal: number;
}

export type EntregaDialogResult = 'registrar' | 'deuda';

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
        <h2 class="dialog-title">Pedido Entregado</h2>

        <div class="dialog-body">
          <p class="info-text">
            El pedido <strong>{{ data.folio }}</strong> de <strong>{{ data.nombreCliente }}</strong> ha sido marcado como entregado.
          </p>

          <div class="saldo-card" *ngIf="data.saldoPendiente > 0">
            <span class="saldo-label">Saldo pendiente</span>
            <span class="saldo-value">&#36;{{ data.saldoPendiente.toFixed(2) }}</span>
          </div>

          <p class="question">¿Deseas registrar el cobro ahora?</p>
        </div>

        <div class="dialog-actions">
          <button mat-button class="btn-registrar" (click)="elegir('registrar')">
            <mat-icon>payments</mat-icon>
            Registrar Cobro
          </button>
          <button mat-button class="btn-deuda" (click)="elegir('deuda')">
            <mat-icon>schedule</mat-icon>
            Agregar a Deudas
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
      padding: 32px 24px;
      max-width: 380px;
    }

    .dialog-title {
      font-family: inherit;
      font-size: 1.4rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 16px 0;
      letter-spacing: -0.5px;
    }

    .dialog-body {
      margin-bottom: 24px;
    }

    .info-text {
      font-family: inherit;
      font-size: 0.95rem;
      color: #475569;
      line-height: 1.5;
      margin: 0 0 16px;
    }
    .info-text strong {
      color: #0f172a;
    }

    .saldo-card {
      background: linear-gradient(135deg, #fff3e0, #ffe0b2);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      margin-bottom: 20px;
      box-shadow: 0 4px 10px rgba(255, 152, 0, 0.15);
      border: 1px solid rgba(255, 152, 0, 0.3);
    }
    .saldo-label {
      font-family: inherit;
      font-size: 0.85rem;
      font-weight: 600;
      text-transform: uppercase;
      color: #e65100;
      letter-spacing: 0.5px;
    }
    .saldo-value {
      font-family: inherit;
      font-size: 2rem;
      font-weight: 800;
      color: #bf360c;
    }

    .question {
      font-family: inherit;
      font-size: 0.95rem;
      font-weight: 700;
      color: #0f172a;
      margin: 0;
    }

    .dialog-actions {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .btn-registrar {
      font-family: inherit;
      background: linear-gradient(135deg, #22c55e, #10b981) !important;
      color: white !important;
      height: 48px;
      border-radius: 12px !important;
      font-weight: 700 !important;
      font-size: 0.95rem !important;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(0,0,0, 0.1);
    }
    .btn-registrar:hover {
      transform: translateY(-2px);
      filter: brightness(1.05);
    }

    .btn-deuda {
      font-family: inherit;
      background-color: transparent !important;
      color: #e65100 !important;
      border: 1px solid #ff9800;
      height: 48px;
      border-radius: 12px !important;
      font-weight: 600 !important;
      font-size: 0.9rem !important;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.3s ease;
    }
    .btn-deuda:hover {
      background-color: #fff3e0 !important;
    }
  `]
})
export class EntregaDialogComponent {
  data = inject<EntregaDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<EntregaDialogComponent>);

  elegir(opcion: EntregaDialogResult) {
    this.dialogRef.close(opcion);
  }
}
