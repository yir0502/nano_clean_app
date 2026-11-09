import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule, MAT_DATE_LOCALE } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { AuthService } from '../../../core/auth.service';

import { ApiClientService } from '../../../core/api-client.service';
import { Categoria, Movimiento, Sucursal } from '../../../core/models';

@Component({
  selector: 'app-movimiento-form',
  standalone: true,
  providers: [{ provide: MAT_DATE_LOCALE, useValue: 'es-MX' }],
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatButtonToggleModule,
    MatDatepickerModule, MatNativeDateModule, MatProgressSpinnerModule,
    MatSnackBarModule, MatDialogModule
  ],
  templateUrl: './movimiento-form.component.html',
  styleUrls: ['./movimiento-form.component.scss']
})
export class MovimientoFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(ApiClientService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private location = inject(Location);

  saving = signal<boolean>(false);
  loading = signal<boolean>(true);
  isEdit = signal<boolean>(false);
  movimientoId = signal<string | null>(null);
  sucursales: Sucursal[] = [];
  categorias = signal<Categoria[]>([]);

  readonly metodosPago = [
    { id: 'efectivo', label: 'Efectivo', icon: 'attach_money' },
    { id: 'transferencia', label: 'Transferencia', icon: 'sync_alt' },
    { id: 'tarjeta', label: 'Tarjeta', icon: 'credit_card' },
    { id: 'mercado_pago', label: 'Mercado Pago', icon: 'qr_code_scanner' },
    { id: 'otro', label: 'Otro', icon: 'more_horiz' },
  ];

  form = this.fb.group({
    tipo: this.fb.nonNullable.control<'ingreso'|'egreso'>('ingreso', { validators: [Validators.required] }),
    monto: this.fb.nonNullable.control<number | null>(null, { validators: [Validators.required, Validators.min(0.01)] }),
    categoria_id: this.fb.nonNullable.control<string | null>(null, { validators: [Validators.required] }),
    sucursal_id: this.fb.nonNullable.control<string | null>(null, { validators: [Validators.required] }), 
    fecha: this.fb.nonNullable.control<Date | null>(new Date(), { validators: [Validators.required] }),
    metodo_pago: this.fb.nonNullable.control<string | null>('efectivo', { validators: [Validators.required] }),
    nota: this.fb.nonNullable.control<string>(''),
    pedido_id: this.fb.control<string | null>(null)
  });

  titulo = computed(() => this.isEdit() ? 'Editar movimiento' : 'Nuevo movimiento');
  constructor(private auth: AuthService) {}

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'nuevo') {
      this.isEdit.set(true);
      this.movimientoId.set(id);
    }

    this.loadCategorias(this.form.controls.tipo.value);
    this.form.controls.tipo.valueChanges.subscribe(t => this.loadCategorias(t));

    this.route.queryParams.subscribe(params => {
      if (!this.isEdit() && params['monto']) {
        this.form.patchValue({
          tipo: 'ingreso',
          monto: Number(params['monto']),
          nota: params['descripcion'] || '',
          sucursal_id: params['sucursal_id'] || null,
          pedido_id: params['pedido_id'] || null,
          categoria_id: params['categoria_id'] || null
        });

        this.loadCategorias('ingreso');

        if (params['pedido_id']) {
          this.form.controls.tipo.disable();
        }
      }
    });

    if (this.isEdit()) {
      await this.loadMovimiento(this.movimientoId()!);
    } else {
      this.loading.set(false);
    }

    await this.loadSucursales();
    if (!this.isEdit() && !this.form.controls.sucursal_id.value) {
      this.form.controls.sucursal_id.setValue(this.sucursales.length > 0 ? this.sucursales[0].id : null);
    }
  }

  private async loadCategorias(tipo: 'ingreso' | 'egreso') {
    try {
      const cats = await this.api.listCategorias(tipo);
      this.categorias.set(cats);

      const sel = this.form.controls.categoria_id.value;
      if (sel && !cats.some(c => c.id === sel)) {
        this.form.controls.categoria_id.setValue(null);
      }

      if (!this.isEdit() && !this.form.controls.categoria_id.value && cats.length > 0) {
        this.form.controls.categoria_id.setValue(cats.length > 1 ? cats[1].id : cats[0].id);
      }
    } catch (e) {
      this.snack.open('No se pudieron cargar las categorías', 'OK', { duration: 2500 });
    }
  }

  private async loadSucursales() {
    try {
      this.sucursales = await this.api.listSucursales({ activo: 1 });
      if (this.sucursales.length === 0) {
        this.form.controls.sucursal_id.disable();
      } else {
        this.form.controls.sucursal_id.enable();
      }
    } catch (e) {
      this.snack.open('No se pudieron cargar las sucursales', 'OK', { duration: 2500 });
    }
  }

  private async loadMovimiento(id: string) {
    try {
      const found = await this.api.getMovimiento(id);
      if (!found) throw new Error('No encontrado');

      const queryPayload = this.route.snapshot.queryParams;

      this.form.patchValue({
        tipo: found.tipo as any,
        monto: queryPayload['monto'] ? Number(queryPayload['monto']) : Number(found.monto),
        categoria_id: found.categoria_id || null,
        sucursal_id: found.sucursal_id || null,
        pedido_id: found.pedido_id || null,
        fecha: found.fecha ? new Date(found.fecha + 'T00:00:00') : new Date(),
        metodo_pago: found.metodo_pago || 'efectivo',
        nota: queryPayload['nota'] ? queryPayload['nota'] : (found.nota || '')
      });

      if (found.pedido_id) this.form.controls.tipo.disable();
    } catch (e) {
      this.snack.open('No se pudo cargar el movimiento', 'OK', { duration: 2500 });
      this.router.navigateByUrl('/movimientos');
    } finally {
      this.loading.set(false);
    }
  }

  async save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);

    const v = this.form.getRawValue();
    const fechaISO = v.fecha ? this.formatDate(v.fecha) : this.formatDate(new Date());
    const payload = {
      tipo: v.tipo,
      monto: Number(v.monto),
      categoria_id: v.categoria_id,
      sucursal_id: v.sucursal_id,
      pedido_id: v.pedido_id,
      fecha: fechaISO,
      metodo_pago: v.metodo_pago,
      nota: v.nota?.trim() || '',
      org_id: this.auth.orgId
    } as Omit<Movimiento, 'id' | 'org_id' | 'created_at' | 'updated_at'>;

    try {
      if (this.isEdit() && this.movimientoId()) {
        await this.api.updateMovimiento(this.movimientoId()!, payload as any);
        this.snack.open('Movimiento actualizado', 'OK', { duration: 2000 });
      } else {
        await this.api.createMovimiento(payload);
        this.snack.open('Movimiento creado', 'OK', { duration: 2000 });
      }
      this.router.navigateByUrl('/movimientos');
    } catch (e: any) {
      this.snack.open(e?.message || 'No se pudo guardar', 'OK', { duration: 3000 });
    } finally {
      this.saving.set(false);
    }
  }

  async delete() {
    if (!this.isEdit() || !this.movimientoId()) return;

    const dialogData: ConfirmDialogData = {
      title: 'Eliminar movimiento',
      message: '¿Estás seguro de eliminar este movimiento? Esta acción no se puede deshacer.',
      icon: 'delete_forever',
      color: 'warn'
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: dialogData,
      width: '360px',
      panelClass: 'custom-modal-panel'
    });

    const ok = await dialogRef.afterClosed().toPromise();
    if (!ok) return;
    try {
      await this.api.deleteMovimiento(this.movimientoId()!);
      this.snack.open('Movimiento eliminado', 'OK', { duration: 2000 });
      this.router.navigateByUrl('/movimientos');
    } catch (e: any) {
      this.snack.open(e?.message || 'No se pudo eliminar', 'OK', { duration: 3000 });
    }
  }

  private formatDate(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  close() {
    if (window.history.length > 1) {
      this.location.back();
    } else {
      this.router.navigateByUrl('/movimientos');
    }
  }
}

