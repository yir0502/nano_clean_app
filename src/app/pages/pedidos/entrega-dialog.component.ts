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
    <div class="entrega-dialog">
      <div class="dialog-header">
        <mat-icon class="header-icon">inventory_2</mat-icon>
        <h2>Pedido Entregado</h2>
      </div>

      <div class="dialog-body">
        <p class="info-text">
          El pedido <strong>{{ data.folio }}</strong> de <strong>{{ data.nombreCliente }}</strong> ha sido marcado como entregado.
        </p>

        <div class="saldo-card" *ngIf="data.saldoPendiente > 0">
          <span class="saldo-label">Saldo pendiente</span>
          <span class="saldo-value">\${{ data.saldoPendiente.toFixed(2) }}</span>
        </div>

        <p class="question">¿Deseas registrar el cobro ahora?</p>
      </div>

      <div class="dialog-actions">
        <button mat-flat-button class="btn-registrar" (click)="elegir('registrar')">
          <mat-icon>payments</mat-icon>
          Registrar Cobro
        </button>
        <button mat-stroked-button class="btn-deuda" (click)="elegir('deuda')">
          <mat-icon>schedule</mat-icon>
          Agregar a Deudas
        </button>
      </div>
    </div>
  `,
  styles: [`
    .entrega-dialog {
      padding: 8px 4px;
      max-width: 360px;
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
      color: #4caf50;
    }
    .dialog-header h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      color: #1a1a2e;
    }

    .dialog-body {
      margin-bottom: 20px;
    }
    .info-text {
      font-size: 14px;
      color: #555;
      line-height: 1.5;
      margin: 0 0 16px;
    }

    .saldo-card {
      background: linear-gradient(135deg, #fff3e0, #ffe0b2);
      border-radius: 12px;
      padding: 14px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .saldo-label {
      font-size: 13px;
      font-weight: 500;
      color: #e65100;
    }
    .saldo-value {
      font-size: 22px;
      font-weight: 700;
      color: #bf360c;
    }

    .question {
      font-size: 15px;
      font-weight: 600;
      color: #333;
      margin: 0;
      text-align: center;
    }

    .dialog-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .btn-registrar {
      background: linear-gradient(135deg, #4caf50, #388e3c) !important;
      color: white !important;
      border-radius: 12px !important;
      padding: 10px 20px !important;
      font-weight: 600 !important;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-deuda {
      border-color: #ff9800 !important;
      color: #e65100 !important;
      border-radius: 12px !important;
      padding: 10px 20px !important;
      font-weight: 600 !important;
      display: flex;
      align-items: center;
      gap: 8px;
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
