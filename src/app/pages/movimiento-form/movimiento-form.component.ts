import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';

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
import { AuthService } from '../../core/auth.service';

import { ApiClientService } from '../../core/api-client.service';
import { Categoria, Movimiento } from '../../core/models';
import { Sucursal } from '../../core/models';

@Component({
  selector: 'app-movimiento-form',
  standalone: true,
  providers: [{ provide: MAT_DATE_LOCALE, useValue: 'es-MX' }],
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatButtonToggleModule,
    MatDatepickerModule, MatNativeDateModule, MatProgressSpinnerModule,
    MatSnackBarModule
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

  saving = signal<boolean>(false);
  loading = signal<boolean>(true);
  isEdit = signal<boolean>(false);
  movimientoId = signal<string | null>(null);
  sucursales: Sucursal[] = [];
  categorias = signal<Categoria[]>([]);

  // Métodos de pago (ajústalos si quieres)
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
    nota: this.fb.nonNullable.control<string>('', { validators: [Validators.maxLength(300)] })
  });

  titulo = computed(() => this.isEdit() ? 'Editar movimiento' : 'Nuevo movimiento');
  constructor(private auth: AuthService) {}
  async ngOnInit(): Promise<void> {
    // Detecta si es edición
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'nuevo') {
      this.isEdit.set(true);
      this.movimientoId.set(id);
    }

    // Cargar categorías según tipo (y recargar al cambiar)
    this.loadCategorias(this.form.controls.tipo.value);
    this.form.controls.tipo.valueChanges.subscribe(t => this.loadCategorias(t));

    // Si edición, cargar datos y parchear
    if (this.isEdit()) {
      this.loadMovimiento(this.movimientoId()!);
    } else {
      this.loading.set(false);
    }

    // Cargar sucursales
    await this.loadSucursales();
    if (!this.isEdit()) {
      this.form.controls.sucursal_id.setValue(this.sucursales.length > 0 ? this.sucursales[0].id : null);
    }
  }

  private async loadCategorias(tipo: 'ingreso' | 'egreso') {
    try {
      const cats = await this.api.listCategorias(tipo);
      this.categorias.set(cats);

      // Si la categoría seleccionada ya no aplica para el nuevo tipo, límpiala
      const sel = this.form.controls.categoria_id.value;
      if (sel && !cats.some(c => c.id === sel)) {
        this.form.controls.categoria_id.setValue(null);
      }

      // 1. Si no estamos en modo edición (o si la categoría es null)
      // 2. Y si la nueva lista de categorías no está vacía
      if (!this.isEdit() && !this.form.controls.categoria_id.value && cats.length > 0) {
        this.form.controls.categoria_id.setValue(cats[1].id);
      }
      // ***************************************************************

    } catch (e) {
      this.snack.open('No se pudieron cargar las categorías', 'OK', { duration: 2500 });
    }
  }

  private async loadSucursales() {
    try {
      this.sucursales = await this.api.listSucursales({ activo: 1 });
      // Si no hay sucursales, deshabilita el campo
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
      // No tenemos GET /movimientos/:id, así que buscamos en listado y filtramos
      const all = await this.api.listMovimientos();
      const found = all.find(m => m.id === id);
      if (!found) throw new Error('No encontrado');

      // Parchea formulario
      this.form.patchValue({
        tipo: found.tipo as any,
        monto: Number(found.monto),
        categoria_id: found.categoria_id || null,
        sucursal_id: found.sucursal_id || null,
        fecha: found.fecha ? new Date(found.fecha + 'T00:00:00') : new Date(),
        metodo_pago: found.metodo_pago || 'efectivo',
        nota: found.nota || ''
      });
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

    // Construir payload
    const v = this.form.getRawValue();
    const fechaISO = v.fecha ? this.formatDate(v.fecha) : this.formatDate(new Date());
    const payload = {
      tipo: v.tipo,
      monto: Number(v.monto),
      categoria_id: v.categoria_id,
      sucursal_id: v.sucursal_id,  
      fecha: fechaISO,             // YYYY-MM-DD
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
    const ok = confirm('¿Eliminar este movimiento? Esta acción no se puede deshacer.');
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
  private location = inject(Location);
  close() {
    if (window.history.length > 1) {
      this.location.back();             // vuelve a la pantalla anterior
    } else {
      this.router.navigateByUrl('/movimientos');  // fallback
    }
  }
}
