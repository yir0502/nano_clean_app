// src/app/pages/categorias/categorias.component.ts
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule, MAT_DATE_LOCALE } from '@angular/material/core';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { NgChartsModule } from 'ng2-charts';
import type { ChartData, ChartOptions } from 'chart.js';
import { Chart as ChartJS, registerables } from 'chart.js';
ChartJS.register(...registerables);

import { ApiClientService } from '../../core/api-client.service';
import { Sucursal, Movimiento, Categoria } from '../../core/models';

const C_ING_BG   = 'hsla(158, 64%, 45%, .75)';
const C_ING_LINE = 'hsl(158, 64%, 45%)';
const C_EGR_BG   = 'hsla(0, 83%, 60%, .75)';
const C_EGR_LINE  = 'hsl(0, 83%, 60%)';

type RangePreset = 'mes'|'3m'|'6m'|'12m';

@Component({
  selector: 'app-categorias',
  standalone: true,
  providers: [{ provide: MAT_DATE_LOCALE, useValue: 'es-MX' }],
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatSelectModule, MatInputModule,
    MatButtonModule, MatIconModule, MatButtonToggleModule, MatDatepickerModule, MatNativeDateModule,
    MatDividerModule, MatSnackBarModule, MatSlideToggleModule,
    NgChartsModule
  ],
  templateUrl: './categorias.component.html',
  styleUrls: ['./categorias.component.scss']
})
export class CategoriasComponent implements OnInit {
  private api = inject(ApiClientService);
  private fb = inject(FormBuilder);
  private snack = inject(MatSnackBar);

  loading = signal<boolean>(true);
  error   = signal<string | null>(null);

  sucursales = signal<Sucursal[]>([]);
  categorias = signal<Categoria[]>([]);

  sucursalId = signal<string>('');
  preset     = signal<RangePreset>('mes');
  desde      = signal<Date>(this.firstDayThisMonth());
  hasta      = signal<Date>(new Date());

  // Datos (rango actual)
  items = signal<Movimiento[]>([]);
  // Datos (mes actual) → para reparto cuando el switch está activo
  monthItems = signal<Movimiento[]>([]);
  useMesActual = signal<boolean>(true); // 🔛 por defecto

  // KPIs (del rango seleccionado)
  totalIngresos = computed(() =>
    this.items().filter(m => m.tipo === 'ingreso').reduce((s,m) => s + Math.abs(+m.monto || 0), 0)
  );
  totalEgresos = computed(() =>
    this.items().filter(m => m.tipo === 'egreso' ).reduce((s,m) => s + Math.abs(+m.monto || 0), 0)
  );
  totalBalance = computed(() => this.totalIngresos() - this.totalEgresos());

  // Balance del mes actual (para reparto si el switch está activo)
  private balanceFrom(items: Movimiento[]) {
    const ing = items.filter(m => m.tipo==='ingreso').reduce((s,m)=> s + Math.abs(+m.monto || 0), 0);
    const egr = items.filter(m => m.tipo==='egreso' ).reduce((s,m)=> s + Math.abs(+m.monto || 0), 0);
    return ing - egr;
  }
  balanceMesActual = computed(() => this.balanceFrom(this.monthItems()));

  // Serie y donas (del rango seleccionado)
  serieData: ChartData<'bar'> = { labels: [], datasets: [] };
  serieOpts: ChartOptions<'bar'> = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'top' } },
    scales: { x: { stacked: false, ticks: { maxRotation: 0 } }, y: { stacked: false, beginAtZero: true } },
    datasets: { bar: { categoryPercentage: 0.7, barPercentage: 0.9, maxBarThickness: 36 } } as any
  };

  donaIng: ChartData<'doughnut'> = { labels: [], datasets: [] };
  donaEgr: ChartData<'doughnut'> = { labels: [], datasets: [] };
  donaOpts: ChartOptions<'doughnut'> = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } };

  // Reparto (4 miembros) — usa balance positivo; fuente: rango o mes actual según switch
  repartoForm = this.fb.group({
    aNombre: this.fb.nonNullable.control('Socio A', { validators: [Validators.maxLength(50)] }),
    aPct:    this.fb.nonNullable.control<number>(34, { validators: [Validators.min(0), Validators.max(100)] }),
    bNombre: this.fb.nonNullable.control('Socio B', { validators: [Validators.maxLength(50)] }),
    bPct:    this.fb.nonNullable.control<number>(33, { validators: [Validators.min(0), Validators.max(100)] }),
    cNombre: this.fb.nonNullable.control('Socio C', { validators: [Validators.maxLength(50)] }),
    cPct:    this.fb.nonNullable.control<number>(33, { validators: [Validators.min(0), Validators.max(100)] }),
    dNombre: this.fb.nonNullable.control('Socio D', { validators: [Validators.maxLength(50)] }),
    dPct:    this.fb.nonNullable.control<number>(0,  { validators: [Validators.min(0), Validators.max(100)] }),
  });

  repartoWarning = computed(() => {
    const v = this.repartoForm.getRawValue();
    const sum = (v.aPct || 0) + (v.bPct || 0) + (v.cPct || 0) + (v.dPct || 0);
    return sum !== 100 ? `Suma ${sum}%. Se recomienda 100%.` : '';
  });

  // Fuente de balance para reparto:
  private repartoBalance = computed(() => {
    const base = this.useMesActual() ? this.balanceMesActual() : this.totalBalance();
    return Math.max(base, 0); // solo positivo
  });

  repartoResult = computed(() => {
    const bal = this.repartoBalance();
    const v = this.repartoForm.getRawValue();
    return [
      { nombre: v.aNombre || 'Socio A', monto: bal * ((v.aPct||0)/100) },
      { nombre: v.bNombre || 'Socio B', monto: bal * ((v.bPct||0)/100) },
      { nombre: v.cNombre || 'Socio C', monto: bal * ((v.cPct||0)/100) },
      { nombre: v.dNombre || 'Socio D', monto: bal * ((v.dPct||0)/100) }
    ];
  });

  async ngOnInit() {
    try {
      this.loading.set(true);
      this.restoreReparto();
      this.restoreUseMesActual();

      const [sucs, cats] = await Promise.all([
        this.api.listSucursales({ activo: 1 }),
        this.api.listCategorias()
      ]);
      this.sucursales.set(sucs);
      this.categorias.set(cats);

      if (sucs.length) this.sucursalId.set(sucs[0].id);

      await this.reload();              // rango actual
      await this.reloadMesActual();     // mes actual (para reparto)
    } catch (e: any) {
      this.error.set(e?.message || 'Error cargando análisis');
    } finally {
      this.loading.set(false);
    }
  }

  // ===== UI actions
  async setPreset(p: RangePreset) {
    this.preset.set(p);
    if (p === 'mes')  { this.desde.set(this.firstDayThisMonth()); this.hasta.set(new Date()); }
    if (p === '3m')   { const d=new Date(); d.setMonth(d.getMonth()-3); this.desde.set(d); this.hasta.set(new Date()); }
    if (p === '6m')   { const d=new Date(); d.setMonth(d.getMonth()-6); this.desde.set(d); this.hasta.set(new Date()); }
    if (p === '12m')  { const d=new Date(); d.setMonth(d.getMonth()-12); this.desde.set(d); this.hasta.set(new Date()); }
    await this.reload();
    if (this.useMesActual()) await this.reloadMesActual();
  }
  async onStartDateChange(d: Date|null){ if (!d) return; this.desde.set(d); this.preset.set('12m'); await this.reload(); }
  async onEndDateChange(d: Date|null){ if (!d) return; this.hasta.set(d); this.preset.set('12m'); await this.reload(); }

  async onSucursalChange(id: string){
    this.sucursalId.set(id);
    await this.reload();
    if (this.useMesActual()) await this.reloadMesActual(); // 👈 mes actual depende de sucursal
  }

  toggleMesActual(checked: boolean){
    this.useMesActual.set(checked);
    localStorage.setItem('nano_clean_reparto_use_mes_actual', JSON.stringify(checked));
    // si se activó y aún no tenemos datos del mes, los cargamos
    if (checked && this.monthItems().length === 0) {
      this.reloadMesActual();
    }
  }

  equalSplit() {
    const x = Math.floor(100/4);
    this.repartoForm.patchValue({ aPct: x, bPct: x, cPct: x, dPct: 100 - 3*x });
    this.saveReparto();
  }
  saveReparto() {
    localStorage.setItem('nano_clean_reparto', JSON.stringify(this.repartoForm.getRawValue()));
    this.snack.open('Reparto guardado', 'OK', { duration: 1500 });
    // recargar pagina para ver cambios
    location.reload();
  }
  private restoreReparto() {
    const raw = localStorage.getItem('nano_clean_reparto');
    if (raw) { try { this.repartoForm.patchValue(JSON.parse(raw)); } catch {} }
  }
  private restoreUseMesActual() {
    const raw = localStorage.getItem('nano_clean_reparto_use_mes_actual');
    if (raw) { try { this.useMesActual.set(JSON.parse(raw)); } catch {} }
  }

  // ===== Carga datos
  private firstDayThisMonth(){ const n=new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); }
  private iso(d: Date){ return d.toISOString().slice(0,10); }
  private weekKey(fechaISO: string){
    const d = new Date(fechaISO + 'T00:00:00');
    const day = (d.getDay()+6)%7; const monday = new Date(d); monday.setDate(d.getDate()-day);
    const lab = new Intl.DateTimeFormat('es-MX', { day:'2-digit', month:'short' }).format(monday);
    return { key: monday.toISOString().slice(0,10), label: `Sem ${lab}` };
  }
  private monthKey(fechaISO: string){
    const key = fechaISO.slice(0,7);
    const [y,m] = key.split('-').map(Number);
    const lab = new Intl.DateTimeFormat('es-MX', { month:'short', year:'2-digit' }).format(new Date(y, m-1, 1));
    return { key, label: lab };
  }

  private aggregateSerie(items: Movimiento[], mode: 'weekly'|'monthly'){
    const map = new Map<string, { ingresos:number; egresos:number; label:string }>();
    for (const m of items){
      const sel = mode === 'weekly' ? this.weekKey(m.fecha) : this.monthKey(m.fecha);
      const cur = map.get(sel.key) || { ingresos:0, egresos:0, label: sel.label };
      const val = Math.abs(+m.monto || 0);
      if (m.tipo==='ingreso') cur.ingresos += val; else cur.egresos += val;
      map.set(sel.key, cur);
    }
    return Array.from(map.values());
  }

  // helper: nombre del mes actual (para la leyenda)
private mesActualLabel(): string {
  const s = new Intl.DateTimeFormat('es-MX', { month:'long', year:'numeric' }).format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
}
// helper: asegura un nombre válido
private safeCatName(raw: any, categoria_id?: string | null): string {
  const s = (raw ?? '').toString().trim();
  if (s) return s;
  return categoria_id ? 'Desconocida' : 'Sin categoría';
}

private buildDonuts(items: Movimiento[]){
  const byIng = new Map<string, number>();
  const byEgr = new Map<string, number>();

  for (const m of items){
    const name = this.safeCatName((m as any).categoria_nombre, m.categoria_id);
    const acc = Math.abs(Number(m.monto) || 0);
    if (m.tipo === 'ingreso') byIng.set(name, (byIng.get(name) || 0) + acc);
    else                      byEgr.set(name, (byEgr.get(name) || 0) + acc);
  }

  const mes = this.mesActualLabel();

  const ingLabels = Array.from(byIng.keys());
  const egrLabels = Array.from(byEgr.keys());

  this.donaIng = {
    labels: ingLabels,
    datasets: [{
      label: `Ingresos (${mes})`,               // 👈 evita "undefined" en la leyenda
      data: ingLabels.map(k => byIng.get(k)!),
      backgroundColor: ingLabels.map((_, i) => this.pickColor(i, true))
    }]
  };

  this.donaEgr = {
    labels: egrLabels,
    datasets: [{
      label: `Egresos (${mes})`,                // 👈 evita "undefined"
      data: egrLabels.map(k => byEgr.get(k)!),
      backgroundColor: egrLabels.map((_, i) => this.pickColor(i, false))
    }]
  };
}

  private pickColor(i: number, ingreso: boolean){
    const base = ingreso ? C_ING_LINE : C_EGR_LINE;
    const alfas = [ .9, .75, .6, .45, .3, .2 ];
    const a = alfas[i % alfas.length];
    return base.replace('hsl', 'hsla').replace(')', `, ${a})`);
  }

  async reload(){
    if (!this.sucursalId()) { this.items.set([]); this.serieData={labels:[],datasets:[]}; this.donaIng={labels:[],datasets:[]}; this.donaEgr={labels:[],datasets:[]}; return; }
    this.loading.set(true);
    try{
      const params = {
        desde: this.iso(this.desde()),
        hasta: this.iso(this.hasta()),
        sucursal_id: this.sucursalId(),
        limit: 2000
      };
      const rows = await this.api.listMovimientos(params);
      this.items.set(rows || []);

      const mode = (this.preset()==='mes' || this.preset()==='3m') ? 'weekly' : 'monthly';
      const serie = this.aggregateSerie(this.items(), mode);
      this.serieData = {
        labels: serie.map(s=>s.label),
        datasets: [
          { label: 'Ingresos', data: serie.map(s=>s.ingresos), backgroundColor: C_ING_BG, borderColor: C_ING_LINE, borderWidth: 1, borderRadius: 6 },
          { label: 'Egresos',  data: serie.map(s=>s.egresos),  backgroundColor: C_EGR_BG, borderColor: C_EGR_LINE, borderWidth: 1, borderRadius: 6 }
        ]
      };

      this.buildDonuts(this.items());
    }catch(e:any){
      this.error.set(e?.message || 'Error cargando datos');
    }finally{
      this.loading.set(false);
    }
  }

  async reloadMesActual(){
    if (!this.sucursalId()) { this.monthItems.set([]); return; }
    const desdeMes = this.firstDayThisMonth();
    const hastaMes = new Date();
    const rows = await this.api.listMovimientos({
      desde: this.iso(desdeMes),
      hasta: this.iso(hastaMes),
      sucursal_id: this.sucursalId(),
      limit: 2000
    });
    this.monthItems.set(rows || []);
  }
}