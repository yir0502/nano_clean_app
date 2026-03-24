import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface LiquidarDialogData {
  folio: string;
  nombreCliente: string;
  saldoPendiente: number;
  montoTotal: number;
}

export interface LiquidarDialogResult {
  accion: 'liquidar' | 'abonar' | 'cancelar';
  monto: number;
}

@Component({
  selector: 'app-liquidar-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule
  ],
  template: `
    <div class="liquidar-dialog">
      <div class="dialog-header">
        <mat-icon class="header-icon">account_balance_wallet</mat-icon>
        <h2>Liquidar Deuda</h2>
      </div>

      <div class="dialog-body">
        <div class="info-row">
          <span class="label">Cliente</span>
          <span class="value">{{ data.nombreCliente }}</span>
        </div>
        <div class="info-row">
          <span class="label">Folio</span>
          <span class="value folio">{{ data.folio }}</span>
        </div>

        <div class="saldo-card">
          <span class="saldo-label">Saldo Pendiente</span>
          <span class="saldo-value">\${{ data.saldoPendiente.toFixed(2) }}</span>
        </div>

        <mat-form-field appearance="outline" class="monto-field">
          <mat-label>Monto a pagar</mat-label>
          <input matInput type="number" inputmode="decimal"
                 [(ngModel)]="montoPago"
                 [max]="data.saldoPendiente"
                 min="0.01" step="0.01">
          <span matTextPrefix>$&nbsp;</span>
        </mat-form-field>

        <div class="pago-info" *ngIf="montoPago > 0 && montoPago < data.saldoPendiente">
          <mat-icon>info</mat-icon>
          <span>Restará <strong>\${{ (data.saldoPendiente - montoPago).toFixed(2) }}</strong> de deuda</span>
        </div>
        <div class="pago-info completo" *ngIf="montoPago >= data.saldoPendiente">
          <mat-icon>check_circle</mat-icon>
          <span>Se liquidará la deuda <strong>completamente</strong></span>
        </div>
      </div>

      <div class="dialog-actions">
        <button mat-flat-button class="btn-liquidar"
                [disabled]="!montoPago || montoPago <= 0 || saving()"
                (click)="confirmar()">
          <mat-icon>payments</mat-icon>
          {{ montoPago >= data.saldoPendiente ? 'Liquidar Total' : 'Registrar Abono' }}
        </button>
        <button mat-stroked-button class="btn-cancelar" (click)="cancelar()" [disabled]="saving()">
          Cancelar
        </button>
      </div>
    </div>
  `,
  styles: [`
    .liquidar-dialog {
      padding: 8px 4px;
      max-width: 380px;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .header-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: #0073ff;
    }
    .dialog-header h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      color: #1a1a2e;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      font-size: 14px;
    }
    .info-row .label {
      color: #888;
      font-weight: 500;
    }
    .info-row .value {
      font-weight: 600;
      color: #333;
    }
    .info-row .folio {
      font-family: monospace;
      color: #0073ff;
    }

    .saldo-card {
      background: linear-gradient(135deg, #fce4ec, #ffcdd2);
      border-radius: 12px;
      padding: 14px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 12px 0 16px;
    }
    .saldo-label {
      font-size: 13px;
      font-weight: 500;
      color: #c62828;
    }
    .saldo-value {
      font-size: 22px;
      font-weight: 700;
      color: #b71c1c;
    }

    .monto-field {
      width: 100%;
    }

    .pago-info {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: #e65100;
      margin-bottom: 16px;
    }
    .pago-info mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .pago-info.completo {
      color: #2e7d32;
    }

    .dialog-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .btn-liquidar {
      background: linear-gradient(135deg, #0073ff, #0059ff) !important;
      color: white !important;
      border-radius: 12px !important;
      padding: 10px 20px !important;
      font-weight: 600 !important;
    }
    .btn-cancelar {
      border-radius: 12px !important;
      color: #666 !important;
    }
  `]
})
export class LiquidarDialogComponent {
  data = inject<LiquidarDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<LiquidarDialogComponent>);

  montoPago = this.data.saldoPendiente;
  saving = signal(false);

  confirmar() {
    if (!this.montoPago || this.montoPago <= 0) return;
    const esTotal = this.montoPago >= this.data.saldoPendiente;
    this.dialogRef.close({
      accion: esTotal ? 'liquidar' : 'abonar',
      monto: Math.min(this.montoPago, this.data.saldoPendiente)
    } as LiquidarDialogResult);
  }

  cancelar() {
    this.dialogRef.close({ accion: 'cancelar', monto: 0 } as LiquidarDialogResult);
  }
}
