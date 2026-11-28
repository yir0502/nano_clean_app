import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
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
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="creative-modal-wrapper">
      <div class="modal-bubbles-container" aria-hidden="true">
        <div class="bubble"></div><div class="bubble"></div><div class="bubble"></div>
        <div class="bubble"></div><div class="bubble"></div><div class="bubble"></div><div class="bubble"></div>
      </div>

      <div class="modal-content-glass entrega-dialog">
        <header class="dialog-header">
          <div class="header-lead">
            <span class="header-icon">
              <mat-icon aria-hidden="true">payments</mat-icon>
            </span>
            <h2 class="dialog-title">Entregar pedido</h2>
          </div>
          <button
            type="button"
            class="btn-close"
            (click)="cerrar()"
            aria-label="Cerrar">
            <mat-icon aria-hidden="true">close</mat-icon>
          </button>
        </header>

        <div class="dialog-body">
          <p class="info-text">
            Pedido <strong class="folio-text">{{ data.folio }}</strong> de <strong>{{ data.nombreCliente }}</strong>.
          </p>

          <div class="saldo-card" *ngIf="data.saldoPendiente > 0">
            <span class="saldo-label">Saldo a liquidar</span>
            <span class="saldo-value">&#36;{{ data.saldoPendiente.toFixed(2) }}</span>
          </div>

          <p class="question">Método de cobro en un toque:</p>
          <div class="metodos-grid" role="group" aria-label="Método de cobro">
            <button
              type="button"
              *ngFor="let m of metodos"
              class="metodo-chip"
              [class.active]="metodoSeleccionado() === m.id"
              [attr.aria-pressed]="metodoSeleccionado() === m.id"
              (click)="metodoSeleccionado.set(m.id)">
              <mat-icon aria-hidden="true">{{ m.icon }}</mat-icon>
              <span>{{ m.label }}</span>
            </button>
          </div>

          <div class="categoria-inline-row" *ngIf="categoriasIngreso().length > 0">
            <button
              type="button"
              class="categoria-pill-btn"
              [attr.aria-expanded]="mostrarCategorias()"
              (click)="mostrarCategorias.set(!mostrarCategorias())">
              <mat-icon aria-hidden="true">sell</mat-icon>
              <span>Categoría: <strong>{{ categoriaSeleccionadaNombre() }}</strong></span>
              <span class="cambiar-link">{{ mostrarCategorias() ? 'Ocultar' : 'Cambiar' }}</span>
            </button>

            <div class="categoria-chips-panel" *ngIf="mostrarCategorias()">
              <button
                type="button"
                *ngFor="let c of categoriasIngreso()"
                class="categoria-chip"
                [class.active]="categoriaSeleccionada() === c.id"
                [attr.aria-pressed]="categoriaSeleccionada() === c.id"
                (click)="seleccionarCategoria(c.id)">
                {{ c.nombre }}
              </button>
            </div>
          </div>
        </div>

        <div class="dialog-actions">
          <button type="button" class="btn-registrar" (click)="cobrarYEntregar()">
            <mat-icon aria-hidden="true">payments</mat-icon>
            <span>Cobrar &#36;{{ data.saldoPendiente.toFixed(2) }} y entregar</span>
          </button>
          <button type="button" class="btn-deuda" (click)="dejarEnDeudas()">
            <mat-icon aria-hidden="true">schedule</mat-icon>
            <span>Entregar y dejar en deudas</span>
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

    .entrega-dialog {
      padding: 20px;
      max-width: 400px;
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

    .dialog-body {
      margin-bottom: 18px;
    }

    .info-text {
      font-family: inherit;
      font-size: 0.9rem;
      color: #475569;
      line-height: 1.45;
      margin: 0 0 14px;
    }

    .info-text strong {
      color: #0f172a;
      font-weight: 700;
    }

    .folio-text {
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
    }

    .saldo-card {
      background: linear-gradient(135deg, rgba(255, 251, 235, 0.94), rgba(254, 243, 199, 0.9));
      border-radius: 12px;
      padding: 13px 14px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      margin-bottom: 14px;
      border: 1px solid #fcd34d;
      box-shadow: 0 4px 12px rgba(217, 119, 6, 0.12);
    }

    .saldo-label {
      font-size: 0.78rem;
      font-weight: 700;
      color: #b45309;
      letter-spacing: 0.02em;
    }

    .saldo-value {
      font-size: 1.75rem;
      font-weight: 800;
      color: #9a3412;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
      line-height: 1.15;
    }

    .question {
      font-size: 0.82rem;
      font-weight: 700;
      color: #334155;
      margin: 0 0 8px;
    }

    .metodos-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .metodo-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 40px;
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid #cbd5e1;
      background: rgba(255, 255, 255, 0.84);
      color: #334155;
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    }

    .metodo-chip:hover {
      background: #ffffff;
      border-color: #94a3b8;
    }

    .metodo-chip mat-icon {
      font-size: 17px;
      width: 17px;
      height: 17px;
      flex-shrink: 0;
    }

    .metodo-chip.active {
      background: var(--brand-primary, #196aff);
      color: #ffffff;
      border-color: var(--brand-primary, #196aff);
      box-shadow: 0 2px 8px rgba(25, 106, 255, 0.25);
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
      padding: 6px 11px;
      border-radius: 999px;
      border: 1px dashed #cbd5e1;
      background: rgba(255, 255, 255, 0.8);
      color: #475569;
      font-family: inherit;
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
      color: var(--brand-primary, #196aff);
      font-weight: 700;
      margin-left: 4px;
    }

    .categoria-chips-panel {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .categoria-chip {
      padding: 6px 11px;
      border-radius: 999px;
      border: 1px solid #cbd5e1;
      background: rgba(255, 255, 255, 0.86);
      color: #334155;
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .categoria-chip.active {
      background: var(--brand-primary, #196aff);
      color: #ffffff;
      border-color: var(--brand-primary, #196aff);
    }

    .dialog-actions {
      display: flex;
      flex-direction: column;
      gap: 9px;
    }

    .btn-registrar,
    .btn-deuda {
      width: 100%;
      min-height: 42px;
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

    .btn-registrar mat-icon,
    .btn-deuda mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    .btn-registrar {
      border: 0;
      background: linear-gradient(135deg, #10b981, #059669);
      color: #ffffff;
      font-weight: 700;
      font-size: 0.9rem;
      box-shadow: 0 3px 10px rgba(5, 150, 105, 0.25);
    }

    .btn-registrar:hover {
      filter: brightness(1.04);
      transform: translateY(-1px);
    }

    .btn-deuda {
      min-height: 40px;
      background: rgba(255, 251, 235, 0.86);
      color: #b45309;
      border: 1px solid #f59e0b;
      font-weight: 600;
      font-size: 0.86rem;
    }

    .btn-deuda:hover {
      background: #fef3c7;
      border-color: #d97706;
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

  cerrar(): void {
    this.dialogRef.close();
  }
}
