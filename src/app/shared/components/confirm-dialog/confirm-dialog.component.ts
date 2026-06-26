import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ConfirmDialogData {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  icon?: string;
  color?: 'primary' | 'accent' | 'warn';
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="creative-modal-wrapper">
      <div class="modal-bubbles-container">
        <div class="bubble"></div><div class="bubble"></div><div class="bubble"></div>
        <div class="bubble"></div><div class="bubble"></div><div class="bubble"></div><div class="bubble"></div>
      </div>
      
      <div class="modal-content-glass">
        <h2 mat-dialog-title class="dialog-title">{{ data.title || 'Confirmar acción' }}</h2>
        <mat-dialog-content class="dialog-content">
          <p>{{ data.message }}</p>
        </mat-dialog-content>
        <mat-dialog-actions class="dialog-actions">
          <button mat-button mat-dialog-close class="btn-cancel">
            {{ data.cancelText || 'Cancelar' }}
          </button>
          <button mat-button [mat-dialog-close]="true" class="btn-confirm" [ngClass]="data.color || 'primary'">
            {{ data.confirmText || 'Confirmar' }}
          </button>
        </mat-dialog-actions>
      </div>
    </div>
  `,
  styles: [`
    .creative-modal-wrapper {
      font-family: 'Roboto', 'Helvetica Neue', sans-serif;
    }

    .dialog-title {
      font-family: inherit;
      font-size: 1.5rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 12px 0;
      letter-spacing: -0.5px;
    }

    .dialog-content {
      font-family: inherit;
      font-size: 1rem;
      line-height: 1.5;
      color: #475569;
      margin-bottom: 28px;
    }

    .dialog-actions {
      display: flex;
      gap: 12px;
      width: 100%;
      padding: 0;
      justify-content: center;
    }

    .dialog-actions button {
      font-family: inherit;
      flex: 1;
      height: 48px;
      border-radius: 12px;
      font-weight: 700;
      font-size: 0.95rem;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .btn-cancel {
      background-color: #f1f5f9 !important;
      color: #64748b !important;
      border: 1px solid #e2e8f0;
    }
    .btn-cancel:hover {
      background-color: #e2e8f0 !important;
      color: #475569 !important;
    }

    /* Variantes Confirmar */
    .btn-confirm {
      color: white !important;
      box-shadow: 0 4px 15px rgba(0,0,0, 0.1);
    }
    .btn-confirm.warn {
      background: linear-gradient(135deg, #ef4444 0%, #f87171 100%) !important;
    }
    .btn-confirm.primary {
      background: linear-gradient(135deg, #0073ff 0%, #00c6ff 100%) !important;
    }
    .btn-confirm.accent {
      background: linear-gradient(135deg, #10b981 0%, #34d399 100%) !important;
    }

    .btn-confirm:hover {
      transform: translateY(-2px);
      filter: brightness(1.05);
    }
    .btn-confirm:active {
      transform: translateY(1px);
    }
  `]
})
export class ConfirmDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData
  ) {}
}
