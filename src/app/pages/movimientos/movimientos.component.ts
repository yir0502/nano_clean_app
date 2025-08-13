import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ApiClientService } from '../../core/api-client.service';
import { Movimiento } from '../../core/models';

@Component({
  selector: 'app-movimientos',
  standalone: true,
  imports: [CommonModule, MatListModule, MatButtonModule, MatIconModule],
  templateUrl: './movimientos.component.html',
  styleUrls: ['./movimientos.component.scss']
})
export class MovimientosComponent implements OnInit {
  data = signal<Movimiento[]>([]);
  constructor(private api: ApiClientService, private router: Router) {}
  async ngOnInit(){ this.data.set(await this.api.listMovimientos()); }

  open(id: string){ this.router.navigate(['/movimientos', id]); }

  async eliminar(id: string, ev: Event){
    ev.stopPropagation();
    const ok = confirm('¿Eliminar este movimiento? Esta acción no se puede deshacer.');
    if (!ok) return;
    await this.api.deleteMovimiento(id);
    this.data.set(await this.api.listMovimientos());
  }

  async filtrar(p:'hoy'|'semana'|'mes'){
    const d = new Date();
    if (p==='hoy'){
      const iso = d.toISOString().slice(0,10);
      this.data.set(await this.api.listMovimientos({desde: iso, hasta: iso}));
    } else if (p==='semana'){
      const end = d.toISOString().slice(0,10); d.setDate(d.getDate()-6);
      const start = d.toISOString().slice(0,10);
      this.data.set(await this.api.listMovimientos({desde: start, hasta: end}));
    } else {
      const ym = new Date().toISOString().slice(0,7);
      this.data.set(await this.api.listMovimientos({desde: ym+'-01', hasta: ym+'-31'}));
    }
  }
  async limpiar(){ this.data.set(await this.api.listMovimientos()); }
}