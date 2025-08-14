// src/app/pages/resumen/resumen.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

import { NgChartsModule } from 'ng2-charts';
import type { ChartConfiguration, ChartData, ChartType, ChartOptions} from 'chart.js';
import { Chart as ChartJS, registerables } from 'chart.js';
ChartJS.register(...registerables);
import { DashboardService, DashboardUIResponse, DashboardDay } from '../../core/dashboard.service';

// 🎨 Colores (ajusta a tu marca)
const C_INGRESO_BG   = 'hsla(158, 64%, 45%, .75)'; // verde
const C_INGRESO_LINE = 'hsl(158, 64%, 45%)';
const C_EGRESO_BG    = 'hsla(0, 83%, 60%, .75)';   // rojo
const C_EGRESO_LINE  = 'hsl(0, 83%, 60%)';

@Component({
  selector: 'app-resumen',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule, MatListModule, MatIconModule, MatDividerModule, MatButtonToggleModule,
    NgChartsModule
  ],
  templateUrl: './resumen.component.html',
  styleUrls: ['./resumen.component.scss']
})
export class ResumenComponent implements OnInit {
  // Estado
  loading = true;
  error?: string;

  // KPIs (mes actual)
  ingresosMes = 0;
  egresosMes  = 0;
  balanceMes  = 0;

  // Rango de la 1ª gráfica
  range: '3m'|'6m'|'12m' = '3m';

  // 1) Ingresos vs Egresos (tipo dinámico, usamos barras agregadas)
  mainChartType: ChartType = 'bar';
  lineData: ChartData = { labels: [], datasets: [] };
  lineOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: true } },
    scales: {
      x: { ticks: { maxRotation: 0, autoSkip: true } },
      y: { beginAtZero: true }
    },
    elements: { line: { tension: 0.25 } },
    datasets: { bar: { categoryPercentage: 0.7, barPercentage: 0.9, maxBarThickness: 36 } }
  };

  // 1b) Barras por sucursal (MES)
  sucursalBarData: ChartData<'bar'> = { labels: [], datasets: [] };
  sucursalBarOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'top' } },
    scales: {
      x: { stacked: false },            // pon true si quieres apilar
      y: { stacked: false, beginAtZero: true }
    }
  };

  // 2) Barras por categoría (MES)
  barEgresoData:  ChartData<'bar'> = { labels: [], datasets: [] };
  barIngresoData: ChartData<'bar'> = { labels: [], datasets: [] };
  barOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: true, position: 'bottom' } },
    scales: { y: { beginAtZero: true } },
    datasets: { bar: { categoryPercentage: 0.7, barPercentage: 0.9, maxBarThickness: 36 } }
  };

  // Recientes
  recientes: { id: string; tipo: 'ingreso'|'egreso'; categoria: string; fecha: string; monto: number }[] = [];

  constructor(private dash: DashboardService) {}
  async ngOnInit(){ await this.loadAll(); }

  // ---- helpers ----
  private iso(d: Date) { return d.toISOString().slice(0,10); }
  private toNumber(n: any){ const x = Number(n); return isNaN(x) ? 0 : x; }
  private hasNonZero(arr: number[]){ return arr.some(v => v !== 0); }

  private rangeDates(kind: '3m'|'6m'|'12m'): { desde: string; hasta: string } {
    const hasta = this.iso(new Date());
    const d = new Date();
    if (kind === '3m')  d.setMonth(d.getMonth() - 3);
    if (kind === '6m')  d.setMonth(d.getMonth() - 6);
    if (kind === '12m') d.setMonth(d.getMonth() - 12);
    return { desde: this.iso(d), hasta };
  }

  private mesActualLabel(): string {
    const now = new Date();
    const txt = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(now);
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }
  private rangoLabel(): string {
    return this.range === '3m' ? '3 meses' : this.range === '6m' ? '6 meses' : '12 meses';
  }

  // Agregación (para no tener “mil” barras/días)
  private weekKey(fechaISO: string): { key: string; label: string } {
    const d = new Date(fechaISO + 'T00:00:00');
    const day = (d.getDay() + 6) % 7; // 0=lunes
    const monday = new Date(d); monday.setDate(d.getDate() - day);
    const key = monday.toISOString().slice(0,10);
    const lab = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short' }).format(monday);
    return { key, label: `Sem ${lab}` };
  }
  private monthKey(fechaISO: string): { key: string; label: string } {
    const key = fechaISO.slice(0,7); // YYYY-MM
    const [y, m] = key.split('-').map(Number);
    const lab = new Intl.DateTimeFormat('es-MX', { month: 'short', year: '2-digit' }).format(new Date(y, m-1, 1));
    return { key, label: lab };
  }
  private aggregate(serie: DashboardDay[], mode: 'weekly'|'monthly'){
    const map = new Map<string, { ingresos: number; egresos: number; label: string }>();
    for (const d of serie){
      const sel = mode === 'weekly' ? this.weekKey(d.fecha) : this.monthKey(d.fecha);
      const cur = map.get(sel.key) || { ingresos: 0, egresos: 0, label: sel.label };
      cur.ingresos += this.toNumber(d.ingresos);
      cur.egresos  += this.toNumber(d.egresos);
      map.set(sel.key, cur);
    }
    return Array.from(map.values());
  }

  // ---- carga de datos ----
  async loadAll(){
    try{
      this.loading = true; this.error = undefined;

      const { desde, hasta } = this.rangeDates(this.range);
      const resp: DashboardUIResponse = await this.dash.get({ desde, hasta, include: 'mes,recientes', limit_recientes: 10 });

      // KPIs
      const k = resp.kpis_mes ?? { ingresos: 0, egresos: 0, balance: 0 };
      this.ingresosMes = this.toNumber(k.ingresos);
      this.egresosMes  = this.toNumber(k.egresos);
      this.balanceMes  = this.toNumber(k.balance);

      // Barras por categoría (MES)
      const eg  = resp.por_categoria_mes?.egreso  ?? [];
      const ing = resp.por_categoria_mes?.ingreso ?? [];
      const mesLbl = this.mesActualLabel();

      this.barEgresoData = {
        labels: eg.map(c => c?.nombre || 'Sin categoría'),
        datasets: [{
          label: `Egresos (${mesLbl})`,
          data: eg.map(c => this.toNumber(c?.total)),
          backgroundColor: C_EGRESO_BG,
          borderColor: C_EGRESO_LINE,
          borderWidth: 1,
          borderRadius: 6
        }]
      };
      this.barIngresoData = {
        labels: ing.map(c => c?.nombre || 'Sin categoría'),
        datasets: [{
          label: `Ingresos (${mesLbl})`,
          data: ing.map(c => this.toNumber(c?.total)),
          backgroundColor: C_INGRESO_BG,
          borderColor: C_INGRESO_LINE,
          borderWidth: 1,
          borderRadius: 6
        }]
      };

      // NUEVO: Barras por sucursal (MES)
      const sucs = (resp as any).por_sucursal_mes ?? []; // ← evitar tocar tipos externos
      const sucLabels = sucs.map((s: any) => s?.nombre || 'Sin sucursal');
      const sucIng    = sucs.map((s: any) => this.toNumber(s?.ingresos));
      const sucEgr    = sucs.map((s: any) => this.toNumber(s?.egresos));

      this.sucursalBarData = {
        labels: sucLabels,
        datasets: [
          {
            label: `Ingresos (${mesLbl})`,
            data: sucIng,
            backgroundColor: C_INGRESO_BG,
            borderColor: C_INGRESO_LINE,
            borderWidth: 1,
            borderRadius: 6
          },
          {
            label: `Egresos (${mesLbl})`,
            data: sucEgr,
            backgroundColor: C_EGRESO_BG,
            borderColor: C_EGRESO_LINE,
            borderWidth: 1,
            borderRadius: 6
          }
        ]
      };

      // 1ª gráfica: Ingresos vs Egresos (agregado semanal/mensual)
      const mode = this.range === '3m' ? 'weekly' : 'monthly';
      const serie = this.aggregate(resp.por_dia ?? [], mode);
      const labels = serie.map(s => s.label);
      const serieIng = serie.map(s => s.ingresos);
      const serieEgr = serie.map(s => s.egresos);

      const rangoLbl = this.rangoLabel();
      const datasets: any[] = [];
      if (this.hasNonZero(serieIng)) {
        datasets.push({
          label: `Ingresos (${rangoLbl})`,
          data: serieIng,
          backgroundColor: C_INGRESO_BG,
          borderColor: C_INGRESO_LINE,
          borderWidth: 1
        });
      }
      if (this.hasNonZero(serieEgr)) {
        datasets.push({
          label: `Egresos (${rangoLbl})`,
          data: serieEgr,
          backgroundColor: C_EGRESO_BG,
          borderColor: C_EGRESO_LINE,
          borderWidth: 1
        });
      }
      if (datasets.length === 0 && labels.length) {
        datasets.push({
          label: `Egresos (${rangoLbl})`,
          data: new Array(labels.length).fill(0),
          backgroundColor: C_EGRESO_BG,
          borderColor: C_EGRESO_LINE,
          borderWidth: 1
        });
      }

      this.mainChartType = 'bar'; // barras agrupadas
      this.lineData = { labels, datasets };

      // Recientes
      this.recientes = resp.recientes ?? [];
    }catch(e:any){
      this.error = e?.message || 'Error cargando dashboard';
    }finally{
      this.loading = false;
    }
  }

  async setRange(value: '3m'|'6m'|'12m'){
    this.range = value;
    await this.loadAll();
  }
}