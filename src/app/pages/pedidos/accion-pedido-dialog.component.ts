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
    <div class="accion-dialog">
      <div class="dialog-header">
        <mat-icon class="header-icon">task_alt</mat-icon>
        <h2>{{ data.titulo }}</h2>
      </div>

      <p class="dialog-msg">{{ data.mensaje }}</p>

      <div class="dialog-actions">
        <button *ngFor="let a of data.acciones"
                mat-flat-button
                class="btn-accion"
                [ngClass]="'btn-' + (a.color || 'primary')"
                (click)="seleccionar(a.valor)">
          <mat-icon>{{ a.icono }}</mat-icon>
          {{ a.texto }}
        </button>
        <button mat-stroked-button class="btn-skip" (click)="seleccionar('omitir')">
          Omitir
        </button>
      </div>
    </div>
  `,
  styles: [`
    .accion-dialog {
      padding: 8px 4px;
      max-width: 380px;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 10px;
    }
    .header-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: #0073ff;
    }
    .dialog-header h2 {
      margin: 0;
      font-size: 19px;
      font-weight: 700;
      color: #1a1a2e;
    }

    .dialog-msg {
      font-size: 14px;
      color: #555;
      margin: 0 0 18px;
      line-height: 1.5;
    }

    .dialog-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .btn-accion {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 20px !important;
      border-radius: 12px !important;
      font-weight: 600 !important;
      font-size: 14px !important;
    }
    .btn-primary {
      background: linear-gradient(135deg, #0073ff, #0059ff) !important;
      color: white !important;
    }
    .btn-accent {
      background: linear-gradient(135deg, #ff9800, #f57c00) !important;
      color: white !important;
    }
    .btn-whatsapp {
      background: linear-gradient(135deg, #25D366, #128C7E) !important;
      color: white !important;
    }

    .btn-skip {
      border-radius: 12px !important;
      color: #888 !important;
      font-size: 13px !important;
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
