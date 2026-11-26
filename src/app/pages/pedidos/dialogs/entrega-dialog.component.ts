import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ApiClientService } from '../../../core/api-client.service';
import { Categoria, MetodoPago } from '../../../core/models';

export interface EntregaDialogData {
  nombreCliente: string;
  folio: string;
  saldoPendiente: number;
  montoTotal: number;
}

export interface EntregaDialogResponse {
  accion: 'cobrar' | 'deuda';
  metodoPago?: MetodoPago;
  categoriaIngresoId?: string | null;
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

          <div class="categoria-inline-row" *ngIf="categoriasIngreso().length > 0">
            <button
              type="button"
              class="categoria-pill-btn"
              (click)="mostrarCategorias.set(!mostrarCategorias())">
              <mat-icon>sell</mat-icon>
              <span>Categoría: <strong>{{ categoriaSeleccionadaNombre() }}</strong></span>
              <span class="cambiar-link">{{ mostrarCategorias() ? 'Ocultar' : 'Cambiar' }}</span>
            </button>

            <div class="categoria-chips-panel" *ngIf="mostrarCategorias()">
              <button
                type="button"
                *ngFor="let c of categoriasIngreso()"
                class="categoria-chip"
                [class.active]="categoriaSeleccionada() === c.id"
                (click)="seleccionarCategoria(c.id)">
                {{ c.nombre }}
              </button>
            </div>
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

    .categoria-inline-row {
      margin-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .categoria-pill-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      align-self: flex-start;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px dashed #cbd5e1;
      background: #f8fafc;
      color: #475569;
      font-size: 12px;
      cursor: pointer;
    }

    .categoria-pill-btn mat-icon {
      font-size: 15px;
      width: 15px;
      height: 15px;
    }

    .categoria-pill-btn strong {
      color: #0f172a;
      font-weight: 600;
    }

    .categoria-pill-btn .cambiar-link {
      color: #0284c7;
      font-weight: 600;
      margin-left: 4px;
    }

    .categoria-chips-panel {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .categoria-chip {
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      color: #334155;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .categoria-chip.active {
      background: #0f172a;
      color: #ffffff;
      border-color: #0f172a;
    }
  `],
})
export class EntregaDialogComponent implements OnInit {
  data = inject<EntregaDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<EntregaDialogComponent, EntregaDialogResponse>);
  private api = inject(ApiClientService);

  metodoSeleccionado = signal<MetodoPago>('efectivo');
  categoriasIngreso = signal<Categoria[]>([]);
  categoriaSeleccionada = signal<string | null>(null);
  mostrarCategorias = signal<boolean>(false);
  categoriaSeleccionadaNombre = computed(
    () => this.categoriasIngreso().find((c) => c.id === this.categoriaSeleccionada())?.nombre || 'Automática'
  );

  readonly metodos: { id: MetodoPago; label: string; icon: string }[] = [
    { id: 'efectivo', label: 'Efectivo', icon: 'attach_money' },
    { id: 'transferencia', label: 'Transferencia', icon: 'sync_alt' },
    { id: 'tarjeta', label: 'Tarjeta', icon: 'credit_card' },
    { id: 'mercado_pago', label: 'Mercado Pago', icon: 'qr_code_scanner' },
  ];

  ngOnInit(): void {
    void this.cargarCategorias();
  }

  private async cargarCategorias(): Promise<void> {
    try {
      const cats = await this.api.listCategorias('ingreso');
      const activas = cats.filter((c) => c.activo !== false);
      const lista = activas.length > 0 ? activas : cats;
      this.categoriasIngreso.set(lista);
      if (!this.categoriaSeleccionada() && lista.length > 0) {
        this.categoriaSeleccionada.set(lista.length > 1 ? lista[1].id : lista[0].id);
      }
    } catch {
      // El backend asigna la categoria por defecto si falla la consulta
    }
  }

  seleccionarCategoria(id: string): void {
    this.categoriaSeleccionada.set(id);
    this.mostrarCategorias.set(false);
  }

  cobrarYEntregar(): void {
    this.dialogRef.close({
      accion: 'cobrar',
      metodoPago: this.metodoSeleccionado(),
      categoriaIngresoId: this.categoriaSeleccionada() || undefined,
    });
  }

  dejarEnDeudas(): void {
    this.dialogRef.close({
      accion: 'deuda',
    });
  }
}
