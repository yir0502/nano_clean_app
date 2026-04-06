// src/app/pages/resumen/resumen.component.ts
import { Component, OnInit, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar } from '@angular/material/snack-bar';

import { NgChartsModule } from 'ng2-charts';
import type { ChartConfiguration, ChartData, ChartType, ChartOptions } from 'chart.js';
import { Chart as ChartJS, registerables } from 'chart.js';
ChartJS.register(...registerables);

import { DashboardService, DashboardDay } from '../../core/dashboard.service';
import { AuthService } from '../../core/auth.service';
import { ApiClientService } from '../../core/api-client.service';
import { Pedido } from '../../core/models';
import { PedidoActionsService } from '../../core/pedido-actions.service';

const C_INGRESO_BG = 'hsla(158, 64%, 45%, .75)'; // verde
const C_INGRESO_LINE = 'hsl(158, 64%, 45%)';
const C_EGRESO_BG = 'hsla(0, 83%, 60%, .75)';   // rojo
const C_EGRESO_LINE = 'hsl(0, 83%, 60%)';

@Component({
  selector: 'app-resumen',
  standalone: true,
  imports: [
    CommonModule, RouterLink,
    MatCardModule, MatListModule, MatIconModule, MatDividerModule, MatButtonToggleModule,
    NgChartsModule, MatButtonModule, MatChipsModule
  ],
  templateUrl: './resumen.component.html',
  styleUrls: ['./resumen.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResumenComponent implements OnInit {
  // Inyecciones
  private dash = inject(DashboardService);
  private auth = inject(AuthService);
  private api = inject(ApiClientService);
  private snack = inject(MatSnackBar);
  public pedidoActions = inject(PedidoActionsService);

  // Estado via Signals
  loading = signal(true);
  error = signal<string | undefined>(undefined);
  pedidosActivos = signal<Pedido[]>([]);

  // KPIs
  ingresosMes = signal(0);
  egresosMes = signal(0);
  balanceMes = signal(0);
  deudaTotal = signal(0);
  range = signal<'3m' | '6m' | '12m'>('3m');

  // Chart Properties (Reactivos a la vista)
  mainChartType = signal<ChartType>('bar');
  lineData = signal<ChartData>({ labels: [], datasets: [] });
  lineOptions: any = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: true } },
    scales: {
      x: { ticks: { maxRotation: 0, autoSkip: true } },
      y: { beginAtZero: true }
    },
    elements: { line: { tension: 0.25 } },
    datasets: { bar: { categoryPercentage: 0.7, barPercentage: 0.9, maxBarThickness: 36 } }
  };

  sucursalBarData = signal<ChartData<'bar'>>({ labels: [], datasets: [] });
  sucursalBarOptions: ChartOptions<'bar'> = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'top' } },
    scales: {
      x: { stacked: false },
      y: { stacked: false, beginAtZero: true }
    }
  };

  barEgresoData = signal<ChartData<'bar'>>({ labels: [], datasets: [] });
  barIngresoData = signal<ChartData<'bar'>>({ labels: [], datasets: [] });
  barOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: true, position: 'bottom' } },
    scales: { y: { beginAtZero: true } },
    datasets: { bar: { categoryPercentage: 0.7, barPercentage: 0.9, maxBarThickness: 36 } }
  };

  deudasDoughnutData = signal<ChartData<'doughnut'>>({ labels: [], datasets: [] });
  deudasOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'right' } }
  };

  clientesDoughnutData = signal<ChartData<'doughnut'>>({ labels: [], datasets: [] });
  clientesOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' } }
  };

  recientes = signal<{ id: string; tipo: 'ingreso' | 'egreso'; categoria: string; fecha: string; monto: number }[]>([]);

  async ngOnInit() { 
    await this.loadAll(); 
  }

  // --- Helpers locales ---
  private iso(d: Date) { return d.toISOString().slice(0, 10); }
  private toNumber(n: any) { const x = Number(n); return isNaN(x) ? 0 : x; }
  private hasNonZero(arr: number[]) { return arr.some(v => v !== 0); }
  
  private rangeDates(kind: '3m' | '6m' | '12m'): { desde: string; hasta: string } {
    const hasta = this.iso(new Date());
    const d = new Date();
    if (kind === '3m') d.setMonth(d.getMonth() - 3);
    if (kind === '6m') d.setMonth(d.getMonth() - 6);
    if (kind === '12m') d.setMonth(d.getMonth() - 12);
    return { desde: this.iso(d), hasta };
  }

  private mesActualLabel(): string {
    const now = new Date();
    const txt = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(now);
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }

  private rangoLabel(): string {
    return this.range() === '3m' ? '3 meses' : this.range() === '6m' ? '6 meses' : '12 meses';
  }

  // Agregación Semanal y Mensual
  private weekKey(fechaISO: string): { key: string; label: string } {
    const d = new Date(fechaISO + 'T00:00:00');
    const day = (d.getDay() + 6) % 7; 
    const monday = new Date(d); monday.setDate(d.getDate() - day);
    const key = monday.toISOString().slice(0, 10);
    const lab = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short' }).format(monday);
    return { key, label: `Sem ${lab}` };
  }
  private monthKey(fechaISO: string): { key: string; label: string } {
    const key = fechaISO.slice(0, 7);
    const [y, m] = key.split('-').map(Number);
    const lab = new Intl.DateTimeFormat('es-MX', { month: 'short', year: '2-digit' }).format(new Date(y, m - 1, 1));
    return { key, label: lab };
  }
  private aggregate(serie: DashboardDay[], mode: 'weekly' | 'monthly') {
    const map = new Map<string, { ingresos: number; egresos: number; label: string }>();
    for (const d of serie) {
      const sel = mode === 'weekly' ? this.weekKey(d.fecha) : this.monthKey(d.fecha);
      const cur = map.get(sel.key) || { ingresos: 0, egresos: 0, label: sel.label };
      cur.ingresos += this.toNumber(d.ingresos);
      cur.egresos += this.toNumber(d.egresos);
      map.set(sel.key, cur);
    }
    return Array.from(map.values());
  }

  // --- Carga Principal ---
  async loadAll() {
    try {
      this.loading.set(true);
      this.error.set(undefined);

      // Peticiones
      const pPedidos = this.api.listPedidos({activo: true, limit: 4});
      const pDeudas = this.api.listPedidos({deuda: true});
      const pStatsClientes = this.api.getClientStats();
      
      const { desde, hasta } = this.rangeDates(this.range());
      const org_id = this.auth.orgId;
      const pDash = this.dash.get({ desde, hasta, org_id, include: 'mes,recientes', limit_recientes: 10 });

      // Ejecutar Paralelo
      const [pedidos, deudas, resp, statsClientes] = await Promise.all([pPedidos, pDeudas, pDash, pStatsClientes]);

      this.pedidosActivos.set(pedidos);

      // --- KPIs ---
      const k = resp.kpis_mes ?? { ingresos: 0, egresos: 0, balance: 0 };
      this.ingresosMes.set(this.toNumber(k.ingresos));
      this.egresosMes.set(this.toNumber(k.egresos));
      this.balanceMes.set(this.toNumber(k.balance));
      
      this.deudaTotal.set(deudas.reduce((acc, p) => acc + this.toNumber(p.saldo_pendiente), 0));

      // --- Gráfica Dougnut Deudas ---
      let leves = 0, graves = 0, dia = 0;
      const now = new Date();
      now.setHours(0,0,0,0);
      deudas.forEach(p => {
        let level = 'normal';
        if (p.fecha_entrega_estimada) {
           const parts = p.fecha_entrega_estimada.split('-');
           if (parts.length === 3) {
             const pDate = new Date(Number(parts[0]), Number(parts[1])-1, Number(parts[2]));
             pDate.setHours(0,0,0,0);
             if (now > pDate) {
               const diff = Math.ceil(Math.abs(now.getTime() - pDate.getTime()) / (1000 * 60 * 60 * 24));
               level = diff <= 7 ? 'leve' : 'grave';
             }
           }
        }
        if (level === 'grave') graves++;
        else if (level === 'leve') leves++;
        else dia++;
      });
      
      this.deudasDoughnutData.set({
        labels: ['Día a Día', 'Atraso Leve', 'Riesgo Crítico'],
        datasets: [{
          data: [dia, leves, graves],
          backgroundColor: ['#4caf50', '#ff9800', '#f44336'],
          hoverOffset: 4
        }]
      });

      // --- Gráfica Clientes ---
      this.clientesDoughnutData.set({
        labels: ['Activos (<15d)', 'Riesgo (16-45d)', 'Perdidos (>45d)'],
        datasets: [{
          data: [
            statsClientes.segmentos?.active_0_15 || 0,
            statsClientes.segmentos?.risk_16_45 || 0,
            statsClientes.segmentos?.lost_45plus || 0
          ],
          backgroundColor: ['#4caf50', '#ffc107', '#f44336'],
          hoverOffset: 4
        }]
      });

      // --- Barras Por Categoría ---
      const eg = resp.por_categoria_mes?.egreso ?? [];
      const ing = resp.por_categoria_mes?.ingreso ?? [];
      const mesLbl = this.mesActualLabel();

      this.barEgresoData.set({
        labels: eg.map(c => c?.nombre || 'Sin categoría'),
        datasets: [{
          label: `Egresos (${mesLbl})`,
          data: eg.map(c => this.toNumber(c?.total)),
          backgroundColor: C_EGRESO_BG,
          borderColor: C_EGRESO_LINE,
          borderWidth: 1, borderRadius: 6
        }]
      });

      this.barIngresoData.set({
        labels: ing.map(c => c?.nombre || 'Sin categoría'),
        datasets: [{
          label: `Ingresos (${mesLbl})`,
          data: ing.map(c => this.toNumber(c?.total)),
          backgroundColor: C_INGRESO_BG,
          borderColor: C_INGRESO_LINE,
          borderWidth: 1, borderRadius: 6
        }]
      });

      // --- Barras Por Sucursal ---
      const sucs = (resp as any).por_sucursal_mes ?? [];
      const sucLabels = sucs.map((s: any) => s?.nombre || 'Sin sucursal');
      const sucIng = sucs.map((s: any) => this.toNumber(s?.ingresos));
      const sucEgr = sucs.map((s: any) => this.toNumber(s?.egresos));

      this.sucursalBarData.set({
        labels: sucLabels,
        datasets: [
          { label: `Ingresos (${mesLbl})`, data: sucIng, backgroundColor: C_INGRESO_BG, borderColor: C_INGRESO_LINE, borderWidth: 1, borderRadius: 6 },
          { label: `Egresos (${mesLbl})`, data: sucEgr, backgroundColor: C_EGRESO_BG, borderColor: C_EGRESO_LINE, borderWidth: 1, borderRadius: 6 }
        ]
      });

      // --- Gráfica Ingresos Vs Egresos (Agregada) ---
      const mode = this.range() === '3m' ? 'weekly' : 'monthly';
      const serie = this.aggregate(resp.por_dia ?? [], mode);
      const labels = serie.map(s => s.label);
      const serieIng = serie.map(s => s.ingresos);
      const serieEgr = serie.map(s => s.egresos);

      const rangoLbl = this.rangoLabel();
      const datasets: any[] = [];
      if (this.hasNonZero(serieIng)) {
        datasets.push({ label: `Ingresos (${rangoLbl})`, data: serieIng, backgroundColor: C_INGRESO_BG, borderColor: C_INGRESO_LINE, borderWidth: 1 });
      }
      if (this.hasNonZero(serieEgr)) {
        datasets.push({ label: `Egresos (${rangoLbl})`, data: serieEgr, backgroundColor: C_EGRESO_BG, borderColor: C_EGRESO_LINE, borderWidth: 1 });
      }
      if (datasets.length === 0 && labels.length) {
        datasets.push({ label: `Egresos (${rangoLbl})`, data: new Array(labels.length).fill(0), backgroundColor: C_EGRESO_BG, borderColor: C_EGRESO_LINE, borderWidth: 1 });
      }

      this.lineData.set({ labels, datasets });
      this.recientes.set(resp.recientes ?? []);

    } catch (e: any) {
      this.error.set(e?.message || 'Error cargando dashboard');
    } finally {
      this.loading.set(false);
    }
  }

  async setRange(value: '3m' | '6m' | '12m') {
    this.range.set(value);
    await this.loadAll();
  }

  // --- Acciones de Pedido Lógica Refinada ---
  async deletePedido(pedido: Pedido, event: MouseEvent) {
    event.stopPropagation();
    const confirmacion = confirm(`¿Estás seguro de eliminar el pedido ${pedido.folio}? Esta acción no se puede deshacer.`);
    if (!confirmacion) return;

    try {
      await this.api.deletePedido(pedido.id);
      this.pedidosActivos.update(act => act.filter(p => p.id !== pedido.id));
      this.snack.open('Pedido eliminado correctamente', 'OK', { duration: 3000 });
    } catch (e) {
      // El interceptor ya muestra el error, no necesitamos hacer nada.
    }
  }
}