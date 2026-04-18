import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule, provideNativeDateAdapter } from '@angular/material/core';

export interface LiquidarDialogData {
  folio: string;
  nombreCliente: string;
  saldoPendiente: number;
  montoTotal: number;
}

export interface LiquidarDialogResult {
  accion: 'liquidar' | 'abonar' | 'cancelar';
  monto: number;
  fecha: Date;
}

@Component({
  selector: 'app-liquidar-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatDatepickerModule, MatNativeDateModule
  ],
  providers: [provideNativeDateAdapter()],
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

        <mat-form-field appearance="outline" class="monto-field">
          <mat-label>Fecha de pago</mat-label>
          <input matInput [matDatepicker]="picker" [(ngModel)]="fechaPago">
          <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
          <mat-datepicker #picker></mat-datepicker>
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
    :host {
      display: block;
      background: rgba(255, 255, 255, 0.8);
      backdrop-filter: blur(15px);
      border-radius: 20px;
    }

    .liquidar-dialog {
      padding: 12px 8px;
      max-width: 400px;
      color: #1e293b;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
      
      .header-icon {
        font-size: 36px;
        width: 36px;
        height: 36px;
        color: var(--brand-primary);
        filter: drop-shadow(0 4px 6px rgba(25, 106, 255, 0.2));
      }
      
      h2 {
        margin: 0;
        font-size: 22px;
        font-weight: 800;
        letter-spacing: -0.5px;
      }
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid rgba(0,0,0,0.05);
      
      .label {
        font-size: 13px;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
      }
      
      .value {
        font-weight: 700;
        color: #334155;
      }
      
      .folio {
        font-family: 'JetBrains Mono', monospace;
        color: var(--brand-primary);
      }
    }

    .saldo-card {
      background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
      border-radius: 16px;
      padding: 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 20px 0;
      box-shadow: 0 4px 15px rgba(239, 68, 68, 0.1);

      .saldo-label {
        font-size: 14px;
        font-weight: 700;
        color: #991b1b;
        text-transform: uppercase;
      }
      
      .saldo-value {
        font-size: 26px;
        font-weight: 900;
        color: #b91c1c;
        letter-spacing: -1px;
      }
    }

    .monto-field {
      width: 100%;
      margin-bottom: 8px;
      
      ::ng-deep .mdc-text-field--outlined {
        --mdc-outlined-text-field-container-shape: 12px;
      }
    }

    .pago-info {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      font-weight: 600;
      color: #d97706;
      background: #fffbeb;
      padding: 12px;
      border-radius: 12px;
      margin-bottom: 20px;
      
      mat-icon { font-size: 20px; width: 20px; height: 20px; }
      
      &.completo {
        background: #ecfdf5;
        color: #059669;
      }
    }

    .dialog-actions {
      display: flex;
      flex-direction: column;
      gap: 12px;
      
      button {
        height: 50px;
        border-radius: 14px !important;
        font-weight: 700 !important;
        font-size: 15px !important;
        letter-spacing: 0.5px;
      }
      
      .btn-liquidar {
        background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-light)) !important;
        box-shadow: 0 4px 12px rgba(25, 106, 255, 0.3);
      }
      
      .btn-cancelar {
        color: #64748b !important;
      }
    }
  `]
})
export class LiquidarDialogComponent {
  data = inject<LiquidarDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<LiquidarDialogComponent>);

  montoPago = this.data.saldoPendiente;
  fechaPago = new Date();
  saving = signal(false);

  confirmar() {
    if (!this.montoPago || this.montoPago <= 0) return;
    const esTotal = this.montoPago >= this.data.saldoPendiente;
    this.dialogRef.close({
      accion: esTotal ? 'liquidar' : 'abonar',
      monto: Math.min(this.montoPago, this.data.saldoPendiente),
      fecha: this.fechaPago
    } as LiquidarDialogResult);
  }

  cancelar() {
    this.dialogRef.close({ accion: 'cancelar', monto: 0, fecha: new Date() } as LiquidarDialogResult);
  }
}
