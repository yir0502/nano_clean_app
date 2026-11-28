import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
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
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="creative-modal-wrapper">
      <div class="modal-bubbles-container" aria-hidden="true">
        <div class="bubble"></div><div class="bubble"></div><div class="bubble"></div>
        <div class="bubble"></div><div class="bubble"></div><div class="bubble"></div><div class="bubble"></div>
      </div>

      <div class="modal-content-glass accion-dialog">
        <header class="dialog-header">
          <div class="header-lead">
            <span class="header-icon">
              <mat-icon aria-hidden="true">notifications_active</mat-icon>
            </span>
            <h2 class="dialog-title">{{ data.titulo }}</h2>
          </div>
          <button
            type="button"
            class="btn-close"
            (click)="cerrar()"
            aria-label="Cerrar">
            <mat-icon aria-hidden="true">close</mat-icon>
          </button>
        </header>

        <p class="dialog-msg">{{ data.mensaje }}</p>

        <div class="dialog-actions">
          <button
            *ngFor="let a of data.acciones"
            type="button"
            class="btn-accion"
            [ngClass]="'btn-' + (a.color || 'primary')"
            (click)="seleccionar(a.valor)">
            <mat-icon aria-hidden="true">{{ a.icono }}</mat-icon>
            <span>{{ a.texto }}</span>
          </button>
          <button type="button" class="btn-skip" (click)="seleccionar('omitir')">
            Omitir
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .creative-modal-wrapper {
      font-family: var(--font-ui);
      font-variant-numeric: tabular-nums;
    }

    .accion-dialog {
      padding: 20px;
      max-width: 390px;
      text-align: left;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 12px;
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
      width: 34px;
      height: 34px;
      border-radius: 10px;
      flex-shrink: 0;
      background: rgba(25, 106, 255, 0.12);
      border: 1px solid rgba(25, 106, 255, 0.2);
      color: var(--brand-primary, #196aff);
    }

    .header-icon mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .dialog-title {
      font-family: inherit;
      font-size: 1.15rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0;
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
      border: 1px solid #cbd5e1;
      background: rgba(255, 255, 255, 0.78);
      color: #475569;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease;
    }

    .btn-close:hover {
      background: #ffffff;
      color: #0f172a;
      border-color: #94a3b8;
    }

    .btn-close mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    button:focus-visible {
      outline: 2px solid var(--brand-primary, #196aff);
      outline-offset: 2px;
    }

    .dialog-msg {
      font-family: inherit;
      font-variant-numeric: tabular-nums;
      font-size: 0.92rem;
      color: #475569;
      margin: 0 0 20px;
      line-height: 1.5;
    }

    .dialog-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .btn-accion,
    .btn-skip {
      width: 100%;
      min-height: 40px;
      padding: 9px 14px;
      border-radius: 10px;
      font-family: inherit;
      font-variant-numeric: tabular-nums;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
      transition: background 0.16s ease, transform 0.16s ease, border-color 0.16s ease;
    }

    .btn-accion {
      min-height: 42px;
      font-weight: 700;
      font-size: 0.9rem;
      border: 1px solid transparent;
    }

    .btn-accion mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    .btn-primary {
      background: var(--brand-primary, #196aff);
      color: #ffffff;
      box-shadow: 0 3px 10px rgba(25, 106, 255, 0.24);
    }

    .btn-accent {
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #ffffff;
      box-shadow: 0 3px 10px rgba(217, 119, 6, 0.24);
    }

    .btn-whatsapp {
      background: #ecfdf5;
      color: #047857;
      border-color: #6ee7b7;
      box-shadow: 0 2px 6px rgba(4, 120, 87, 0.12);
    }

    .btn-whatsapp:hover {
      background: #d1fae5;
      border-color: #34d399;
    }

    .btn-primary:hover,
    .btn-accent:hover {
      transform: translateY(-1px);
      filter: brightness(1.04);
    }

    .btn-skip {
      color: #334155;
      font-size: 0.875rem;
      background: rgba(255, 255, 255, 0.78);
      border: 1px solid #cbd5e1;
      font-weight: 600;
    }

    .btn-skip:hover {
      background: #ffffff;
      border-color: #94a3b8;
      color: #0f172a;
    }
  `],
})
export class AccionPedidoDialogComponent {
  data = inject<AccionPedidoDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<AccionPedidoDialogComponent, string>);

  seleccionar(valor: string): void {
    this.dialogRef.close(valor);
  }

  cerrar(): void {
    this.dialogRef.close();
  }
}
