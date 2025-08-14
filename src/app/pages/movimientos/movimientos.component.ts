import { Component, OnInit, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { ApiClientService } from '../../core/api-client.service';
import { Categoria, Movimiento } from '../../core/models';
import { Sucursal } from '../../core/models';

type TipoFiltro = 'todos' | 'ingreso' | 'egreso';

@Component({
  selector: 'app-movimientos',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule, MatListModule, MatIconModule,
    MatButtonModule, MatButtonToggleModule,
    MatSelectModule, MatFormFieldModule, MatInputModule,
    MatDatepickerModule, MatNativeDateModule,
    MatProgressSpinnerModule, MatSnackBarModule
  ],
  templateUrl: './movimientos.component.html',
  styleUrls: ['./movimientos.component.scss']
})
export class MovimientosComponent implements OnInit {
  constructor(
    // ...tus inyecciones actuales
    private snack: MatSnackBar
  ) {}

   async onDelete(m: Movimiento, ev?: Event) {
    ev?.stopPropagation(); // no navegar ni disparar otros clicks del item

    const montoAbs = Math.abs(Number(m.monto) || 0);
    const ok = confirm(`¿Eliminar el ${m.tipo} de ${montoAbs.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })}?`);
    if (!ok) return;

    try {
      await this.api.deleteMovimiento(m.id);
      // Quita el registro de la lista actual sin recargar
      this.items.set(this.items().filter(x => x.id !== m.id));
      this.snack.open('Movimiento eliminado', 'OK', { duration: 2000 });
    } catch (e: any) {
      this.snack.open(e?.message || 'No se pudo eliminar', 'OK', { duration: 3000 });
    } }
  private api = inject(ApiClientService);

  // Estado general
  loading = signal<boolean>(true);
  loadingMore = signal<boolean>(false);
  error = signal<string | null>(null);

  // Datos
  items = signal<Movimiento[]>([]);
  hasMore = signal<boolean>(false);
  pageSize = 25;
  offset = 0;

  // Catálogos
  catsIngreso = signal<Categoria[]>([]);
  catsEgreso  = signal<Categoria[]>([]);
  metodos = [
    { id: '', label: 'Todos' },
    { id: 'efectivo', label: 'Efectivo' },
    { id: 'transferencia', label: 'Transferencia' },
    { id: 'tarjeta', label: 'Tarjeta' },
    { id: 'mercado_pago', label: 'Mercado Pago' },
    { id: 'otro', label: 'Otro' },
  ];

  // Filtros (signals)
  tipo = signal<TipoFiltro>('todos');
  categoriaId = signal<string>('');
  metodoPago = signal<string>('');
  q = signal<string>('');
  sucursales = signal<Sucursal[]>([]);
  sucursalId = signal<string>('');
  
  // Rango de fechas (por defecto: mes actual)
  private today = new Date();
  desde = signal<Date>(new Date(this.today.getFullYear(), this.today.getMonth(), 1));
  hasta = signal<Date>(new Date());

  // Totales del filtro
  totalIngresos = computed(() => this.items().reduce((s,m)=> s + (m.tipo==='ingreso' ? Number(m.monto) : 0), 0));
  totalEgresos  = computed(() => this.items().reduce((s,m)=> s + (m.tipo==='egreso' ? Number(m.monto) : 0), 0));
  totalBalance  = computed(() => this.totalIngresos() - this.totalEgresos());

  // Categorías visibles según tipo
  catsFiltradas = computed<Categoria[]>(() => {
    if (this.tipo()==='ingreso') return this.catsIngreso();
    if (this.tipo()==='egreso')  return this.catsEgreso();
    // todos: concat + únicos por id
    const map = new Map<string,string>();
    const out: Categoria[] = [];
    [...this.catsIngreso(), ...this.catsEgreso()].forEach(c => {
      if (!map.has(c.id)) { map.set(c.id, c.nombre); out.push(c); }
    });
    return out;
  });

  ngOnInit() { this.init(); }

  // ===== Helpers =====
  private iso(d: Date) { return d.toISOString().slice(0,10); }
  rangeLabel(): string {
    return `${this.iso(this.desde())} → ${this.iso(this.hasta())}`;
  }

  // Presets rápidos
  setPreset(p: 'hoy'|'7d'|'30d'|'mes'){
    const now = new Date();
    if (p==='hoy'){ this.desde.set(new Date(now)); this.hasta.set(new Date(now)); }
    if (p==='7d'){ const d=new Date(); d.setDate(d.getDate()-6); this.desde.set(d); this.hasta.set(now); }
    if (p==='30d'){ const d=new Date(); d.setDate(d.getDate()-29); this.desde.set(d); this.hasta.set(now); }
    if (p==='mes'){ this.desde.set(new Date(now.getFullYear(), now.getMonth(), 1)); this.hasta.set(now); }
    this.reload();
  }

  onStartDateChange(d: Date | null){
    if (d) { this.desde.set(d); if (this.desde() > this.hasta()) this.hasta.set(d); this.reload(); }
  }
  onEndDateChange(d: Date | null){
    if (d) { this.hasta.set(d); if (this.hasta() < this.desde()) this.desde.set(d); this.reload(); }
  }

  // Filtros
  onTipoChange(val: TipoFiltro){ this.tipo.set(val); this.categoriaId.set(''); this.reload(); }
  onCategoriaChange(val: string){ this.categoriaId.set(val); this.reload(); }
  onMetodoChange(val: string){ this.metodoPago.set(val); this.reload(); }
  onQInput(val: string){ this.q.set(val); /* puedes deboucear si quieres */ this.reload(); }

  // ===== Data access =====
  private async init(){
    try{
      this.loading.set(true);
      // catálogos
      [this.catsIngreso, this.catsEgreso].forEach(s => s.set([]));
      this.catsIngreso.set(await this.api.listCategorias('ingreso'));
      this.catsEgreso.set(await this.api.listCategorias('egreso'));
      this.sucursales.set(await this.api.listSucursales({ activo: 1 }));
      await this.reload();
    }catch(e:any){
      this.error.set(e?.message || 'Error inicializando');
    }finally{
      this.loading.set(false);
    }
  }

  async reload(){
    this.offset = 0;
    await this.fetchPage(true);
  }

  async loadMore(){
    if (this.loadingMore() || !this.hasMore()) return;
    this.offset += this.pageSize;
    await this.fetchPage(false);
  }

  private async fetchPage(replace: boolean){
    try{
      if (replace) this.loading.set(true); else this.loadingMore.set(true);
      const tipoValue = this.tipo();
      const params = {
        desde: this.iso(this.desde()),
        hasta: this.iso(this.hasta()),
        ...(tipoValue !== 'todos' ? { tipo: tipoValue as 'ingreso' | 'egreso' } : {}),
        categoria_id: this.categoriaId() || undefined,
        sucursal_id: this.sucursalId() || undefined,
        metodo_pago: this.metodoPago() || undefined,
        q: this.q() || undefined,
        limit: this.pageSize,
        offset: this.offset
      };
      const page = await this.api.listMovimientos(params);
      this.hasMore.set(page.length === this.pageSize);
      this.items.set(replace ? page : [...this.items(), ...page]);
    }catch(e:any){
      this.error.set(e?.message || 'Error cargando movimientos');
    }finally{
      this.loading.set(false); this.loadingMore.set(false);
    }
  }

  // UI helpers
  catNombre(m: Movimiento): string {
    // si tu API no manda el nombre de categoría, resolvemos localmente
    const all = [...this.catsIngreso(), ...this.catsEgreso()];
    return m.categoria_nombre || all.find(c => c.id === (m.categoria_id || ''))?.nombre || 'Sin categoría';
  }
  catNotas(m: Movimiento): string {
    // si tu API no manda notas, resolvemos localmente "Sin nota"
    return m?.nota || 'Sin nota';
  }
  iconoTipo(m: Movimiento){ return m.tipo==='ingreso' ? 'arrow_downward' : 'arrow_upward'; }
  esNegativo(m: Movimiento){ return m.tipo==='egreso'; }
}