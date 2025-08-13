import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { ApiClientService } from '../../core/api-client.service';
import { Movimiento } from '../../core/models';

@Component({
  selector: 'app-resumen',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule],
  templateUrl: './resumen.component.html',
  styleUrls: ['./resumen.component.scss']
})
export class ResumenComponent implements OnInit {
  movs = signal<Movimiento[]>([]);
  private hoy = new Date().toISOString().slice(0,10);
  private ym = this.hoy.slice(0,7);

  ingHoy = computed(()=> this.movs().filter(m=>m.tipo==='ingreso' && m.fecha===this.hoy).reduce((a,b)=>a+b.monto,0));
  egHoy  = computed(()=> this.movs().filter(m=>m.tipo==='egreso'  && m.fecha===this.hoy).reduce((a,b)=>a+b.monto,0));
  ingMes = computed(()=> this.movs().filter(m=>m.tipo==='ingreso' && m.fecha.startsWith(this.ym)).reduce((a,b)=>a+b.monto,0));
  egMes  = computed(()=> this.movs().filter(m=>m.tipo==='egreso'  && m.fecha.startsWith(this.ym)).reduce((a,b)=>a+b.monto,0));

  constructor(private api: ApiClientService){}
  async ngOnInit(){ this.movs.set(await this.api.listMovimientos()); }

  async exportarCSV(){
    const desde = `${this.ym}-01`;
    const hasta = `${this.ym}-31`;
    const rows = await this.api.listMovimientos({ desde, hasta });
    const csv = this.toCSV(rows);
    this.downloadFile(csv, `movimientos-${this.ym}.csv`, 'text/csv;charset=utf-8;');
  }

  private toCSV(data: Movimiento[]): string {
    const headers = ['id','tipo','monto','fecha','categoria_id','metodo_pago','nota','created_at','updated_at'];
    const esc = (v:any) => {
      const s = v==null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
    };
    const lines = [headers.join(',')].concat(
      data.map(m => [m.id, m.tipo, m.monto, m.fecha, m.categoria_id||'', m.metodo_pago||'', m.nota||'', m.created_at||'', m.updated_at||'']
        .map(esc).join(','))
    );
    return lines.join('\n');
  }

  private downloadFile(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
}