import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface AccionPedidoDialogData {
  titulo: string;
  mensaje: string;
  acciones: {
    texto: string;
    icono: string;
    valor: string;
    color?: 'primary' | 'accent' | 'whatsapp';
  }[];
}

@Component({
  selector: 'app-accion-pedido-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="creative-modal-wrapper">
      <div class="modal-bubbles-container">
        <div class="bubble"></div><div class="bubble"></div><div class="bubble"></div>
        <div class="bubble"></div><div class="bubble"></div><div class="bubble"></div><div class="bubble"></div>
      </div>

      <div class="modal-content-glass accion-dialog">
        <h2 class="dialog-title">{{ data.titulo }}</h2>
        <p class="dialog-msg">{{ data.mensaje }}</p>

        <div class="dialog-actions">
          <button *ngFor="let a of data.acciones"
                  mat-button
                  class="btn-accion"
                  [ngClass]="'btn-' + (a.color || 'primary')"
                  (click)="seleccionar(a.valor)">
            <mat-icon>{{ a.icono }}</mat-icon>
            {{ a.texto }}
          </button>
          <button mat-button class="btn-skip" (click)="seleccionar('omitir')">
            Omitir
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .creative-modal-wrapper {
      font-family: 'Roboto', 'Helvetica Neue', sans-serif;
    }

    .accion-dialog {
      padding: 32px 24px;
      max-width: 380px;
    }

    .dialog-title {
      font-family: inherit;
      font-size: 1.4rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 12px 0;
      letter-spacing: -0.5px;
    }

    .dialog-msg {
      font-family: inherit;
      font-size: 0.95rem;
      color: #475569;
      margin: 0 0 24px;
      line-height: 1.5;
    }

    .dialog-actions {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .btn-accion {
      font-family: inherit;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      height: 48px;
      border-radius: 12px !important;
      font-weight: 700 !important;
      font-size: 0.95rem !important;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      transition: all 0.3s ease;
      color: white !important;
      box-shadow: 0 4px 15px rgba(0,0,0, 0.1);
    }
    .btn-primary {
      background: linear-gradient(135deg, #0073ff, #00c6ff) !important;
    }
    .btn-accent {
      background: linear-gradient(135deg, #f59e0b, #fbbf24) !important;
    }
    .btn-whatsapp {
      background: linear-gradient(135deg, #22c55e, #10b981) !important;
    }

    .btn-accion:hover {
      transform: translateY(-2px);
      filter: brightness(1.05);
    }

    .btn-skip {
      font-family: inherit;
      height: 48px;
      border-radius: 12px !important;
      color: #64748b !important;
      font-size: 0.9rem !important;
      background-color: transparent !important;
      border: 1px solid #cbd5e1;
      font-weight: 600 !important;
      text-transform: uppercase;
    }
    .btn-skip:hover {
      background-color: #f1f5f9 !important;
      color: #475569 !important;
    }
  `]
})
export class AccionPedidoDialogComponent {
  data = inject<AccionPedidoDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<AccionPedidoDialogComponent>);

  seleccionar(valor: string) {
    this.dialogRef.close(valor);
  }
}
