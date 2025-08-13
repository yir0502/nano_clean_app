import { Component, OnInit } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { NgIf, NgFor, DatePipe, CurrencyPipe } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import { ChartConfiguration } from 'chart.js';
import { ApiClientService } from '../../core/api-client.service';

Chart.register(...registerables);

type SerieMes = { label: string; ingresos: number; egresos: number; };
type CategoriaMonto = { nombre: string; monto: number; };
type Movimiento = { id: string; fecha: string; categoria: string; tipo: 'ingreso'|'egreso'; monto: number; nota?: string; };

const BRAND = '#1e6bff'; // azul de marca
const EXPEN = '#ff3b30'; // rojo egresos (iOS-like)
const hexA = (hex: string, a: number) => {
  const bigint = parseInt(hex.replace('#',''), 16);
  const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
  return `rgba(${r},${g},${b},${a})`;
};

@Component({
  selector: 'app-resumen',
  standalone: true,
  imports: [SharedModule, NgIf, NgFor, DatePipe, CurrencyPipe],
  templateUrl: './resumen.component.html',
  styleUrls: ['./resumen.component.scss']
})
export class ResumenComponent implements OnInit {
  loading = true;

  // KPIs
  ingresosMes = 0;
  egresosMes  = 0;
  balanceMes  = 0;

  // Rango seleccionado (12m por defecto)
  range: '12m'|'6m'|'3m' = '12m';
  seriesFull: SerieMes[] = [];

  // Line: Ingresos vs Egresos
  lineLabels: string[] = [];
  lineData: ChartConfiguration<'line'>['data'] = {
    labels: this.lineLabels,
    datasets: [
      {
        label: 'Ingresos',
        data: [],
        borderColor: BRAND,
        backgroundColor: hexA(BRAND, 0.18),
        pointBackgroundColor: BRAND,
        pointRadius: 2,
        borderWidth: 2,
        tension: .35,
        fill: true
      },
      {
        label: 'Egresos',
        data: [],
        borderColor: EXPEN,
        backgroundColor: hexA(EXPEN, 0.18),
        pointBackgroundColor: EXPEN,
        pointRadius: 2,
        borderWidth: 2,
        tension: .35,
        fill: true
      }
    ]
  };
  lineOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true, maintainAspectRatio: false,
    plugins:{ legend:{ position:'top' } },
    scales:{
      y:{ beginAtZero:true, grid:{ color:'rgba(0,0,0,.06)' } },
      x:{ grid:{ display:false } }
    }
  };

  // Dona: categorías del mes (paleta consistente)
  doughnutData: ChartConfiguration<'doughnut'>['data'] = {
    labels: [], datasets: [{ data: [], backgroundColor: [
      hexA(BRAND, .9), '#00bcd4', '#ff9800', '#4caf50', '#ab47bc', '#8d6e63'
    ] }]
  };
  doughnutOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ position:'right' } }
  };

  // Últimos movimientos
  recientes: Movimiento[] = [];

  constructor(private api: ApiClientService) {}

  async ngOnInit() {
    try {
      const dash = await this.api.get<any>('/dashboard');

      this.ingresosMes = dash?.kpis?.ingresosMes ?? 0;
      this.egresosMes  = dash?.kpis?.egresosMes ?? 0;
      this.balanceMes  = this.ingresosMes - this.egresosMes;

      this.seriesFull = dash?.series ?? [];
      this.applyRange(this.range);

      const cat: CategoriaMonto[] = dash?.categoriasMes ?? [];
      this.doughnutData = {
        labels: cat.map(c => c.nombre),
        datasets: [{ 
          data: cat.map(c => c.monto),
          backgroundColor: [
            hexA(BRAND, .9), '#00bcd4', '#ff9800', '#4caf50', '#ab47bc', '#8d6e63'
          ]
        }]
      };

      this.recientes = dash?.ultimosMovimientos ?? [];
    } catch {
      // Fallback demo
      const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      this.seriesFull = meses.map((m,i) => ({
        label: m,
        ingresos: (12+i*2)*1000,
        egresos : (8 +i*1 )*800
      }));
      this.applyRange(this.range);

      this.doughnutData = {
        labels: ['Lavado','Secado','Planchado','Tintorería'],
        datasets: [{ data: [3200, 1800, 1200, 600],
          backgroundColor: [hexA(BRAND,.9),'#00bcd4','#ff9800','#4caf50'] }]
      };

      this.ingresosMes = 37000; this.egresosMes = 22000; this.balanceMes = 15000;
      this.recientes = [
        { id:'1', fecha: new Date().toISOString(), categoria:'Lavado', tipo:'ingreso', monto:120, nota:'Ticket 1032' },
        { id:'2', fecha: new Date().toISOString(), categoria:'Detergente', tipo:'egreso', monto:-45, nota:'Compra insumo' },
      ];
    } finally {
      this.loading = false;
    }
  }

  setRange(v: '12m'|'6m'|'3m') {
    this.range = v;
    this.applyRange(v);
  }

  private applyRange(v: '12m'|'6m'|'3m') {
    const take = v === '12m' ? 12 : v === '6m' ? 6 : 3;
    const data = this.seriesFull.slice(-take);
    this.lineLabels = data.map(s => s.label);
    (this.lineData.datasets[0].data as number[]) = data.map(s => s.ingresos);
    (this.lineData.datasets[1].data as number[]) = data.map(s => s.egresos);
    this.lineData = { ...this.lineData, labels: this.lineLabels };
  }
}
