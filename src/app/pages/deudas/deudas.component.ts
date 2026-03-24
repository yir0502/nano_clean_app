import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { firstValueFrom } from 'rxjs';

// Material
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { NgChartsModule } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';

import { ApiClientService } from '../../core/api-client.service';
import { Pedido } from '../../core/models';
import { LiquidarDialogComponent, LiquidarDialogResult } from './liquidar-dialog.component';
import { LiquidarDialogComponent, LiquidarDialogResult } from './liquidar-dialog.component';

@Component({
  selector: 'app-deudas',
  standalone: true,
  imports: [
    CommonModule, RouterModule, FormsModule,
    MatCardModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatProgressSpinnerModule,
    MatListModule, MatTooltipModule, NgChartsModule,
    MatSnackBarModule
  ],
  templateUrl: './deudas.component.html',
  styleUrls: ['./deudas.component.scss']
})
export class DeudasComponent implements OnInit {
  private api = inject(ApiClientService);
  private router = inject(Router);
  private snack = inject(MatSnackBar);
  protected readonly Number = Number;

  loading = signal<boolean>(true);
  pedidos = signal<Pedido[]>([]);
  q = signal<string>('');

  // KPIs
  totalDeuda = computed(() => this.pedidos().reduce((acc, p) => acc + Number(p.saldo_pendiente || 0), 0));
  totalClientes = computed(() => {
    // Unique clients
    const ids = this.pedidos().map(p => p.cliente_id).filter(Boolean);
    return new Set(ids).size;
  });

  // Data Graphics
  chartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' } }
  };

  doughnutData: ChartConfiguration['data'] = { labels: [], datasets: [] };
  barData: ChartConfiguration['data'] = { labels: [], datasets: [] };
  sucursalBarData: ChartConfiguration['data'] = { labels: [], datasets: [] };

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      let data = await this.api.listPedidos({ deuda: true, q: this.q() });

      // Filtro de seguridad estricto en el FrontEnd para ignorar anomalias de BD (Strings vacíos, nulos o ceros literales)
      data = data.filter(p => Number(p.saldo_pendiente) > 0);

      this.pedidos.set(data);
      this.generateCharts(data);
    } catch (e) {
      console.error(e);
    } finally {
      this.loading.set(false);
    }
  }

  generateCharts(pedidos: Pedido[]) {
    // 1. Doughnut: Riesgo de Morosidad
    let leves = 0, graves = 0, dia = 0;
    pedidos.forEach(p => {
      const lvl = this.getNivelAtraso(p.fecha_entrega_estimada);
      if (lvl === 'grave') graves++;
      else if (lvl === 'leve') leves++;
      else dia++;
    });

    this.doughnutData = {
      labels: ['Día a Día', 'Atraso Leve', 'Riesgo Crítico'],
      datasets: [
        {
          data: [dia, leves, graves],
          backgroundColor: ['#4caf50', '#ff9800', '#f44336'],
          hoverOffset: 4
        }
      ]
    };

    // 2. Barras: Top 5 deudores (Agrupados por nombre)
    const porCliente = pedidos.reduce((acc, p) => {
      const nombre = p.cliente_nombre || 'Desconocido';
      acc[nombre] = (acc[nombre] || 0) + Number(p.saldo_pendiente || 0);
      return acc;
    }, {} as Record<string, number>);

    const arr = Object.entries(porCliente).sort((a, b) => b[1] - a[1]).slice(0, 5);

    this.barData = {
      labels: arr.map(i => i[0].split(' ')[0]), // Primer nombre
      datasets: [
        {
          data: arr.map(i => i[1]),
          label: 'Deuda Acumulada',
          backgroundColor: '#0073ff',
          borderRadius: 4
        }
      ]
    };

    // 3. Barras: Deudas por Sucursal
    const porSucursal = pedidos.reduce((acc, p) => {
      const suc = p.sucursal_nombre || 'Sin Sucursal';
      acc[suc] = (acc[suc] || 0) + Number(p.saldo_pendiente || 0);
      return acc;
    }, {} as Record<string, number>);

    this.sucursalBarData = {
      labels: Object.keys(porSucursal),
      datasets: [
        {
          data: Object.values(porSucursal),
          label: 'Deuda por Sucursal',
          backgroundColor: '#9c27b0', // Morado corporativo
          borderRadius: 4
        }
      ]
    };
  }

  onSearch(val: string) {
    this.q.set(val);
    this.load();
  }

  abrirWhatsapp(p: Pedido, clickEvent: Event) {
    clickEvent.stopPropagation();
    if (!p.cliente_telefono) return;

    const saldo = Number(p.saldo_pendiente || 0).toFixed(2);
    // \uD83D\uDC4B = Wave, \uD83D\uDE4F = Pray, \uD83D\uDCB5 = Money
    const msg = `Hola *${p.cliente_nombre}* \uD83D\uDC4B\n\nTe escribimos de Nano Clean para recordarte amablemente que hay un saldo pendiente de *$${saldo}* correspondiente a tu pedido *${p.folio}*.\n\nPor favor, contáctanos en cuanto puedas para liquidar tu cuenta \uD83D\uDCB5.\n\n¡Muchas gracias por tu preferencia! \uD83D\uDE4F`;

    let telLimpio = p.cliente_telefono.replace(/\D/g, '');
    window.open(`https://api.whatsapp.com/send?phone=${telLimpio}&text=${encodeURIComponent(msg)}`, '_blank');
  }

  async liquidarDeuda(p: Pedido, event: Event) {
    event.stopPropagation();
    const saldo = Number(p.saldo_pendiente || 0);
    if (saldo <= 0) return;

    if (!confirm(`¿Estás seguro de liquidar la deuda de $${saldo.toFixed(2)} de ${p.cliente_nombre}?`)) {
      return;
    }

    this.loading.set(true);
    try {
      // 1. Verificar si tiene un movimiento asignado previamente
      const movs = await this.api.listMovimientos({ pedido_id: p.id });

      if (movs && movs.length > 0) {
        // Escenario A: Redirigir a edición de movimiento
        const targetMov = movs[0];
        const todayShort = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });

        const oldNota = targetMov.nota ? targetMov.nota : `Pedido ${p.cliente_nombre || 'Cliente'}`;
        const nuevaNota = `${oldNota} | Liquidacion: $${saldo.toFixed(2)} (${todayShort})`;
        const globalTotal = Number(targetMov.monto) + saldo;

        this.snack.open('Visualizando movimiento previo para agregar liquidación...', 'OK', { duration: 3000 });

        this.router.navigate(['/movimientos', targetMov.id], {
          queryParams: {
            monto: globalTotal.toFixed(2),
            nota: nuevaNota
          }
        });
        // Si se redirige, no ocultamos el spinner para evitar un parpadeo
      } else {
        // Escenario B: Cerrar deuda en cero directamente
        await this.api.updatePedido(p.id, { saldo_pendiente: 0 });
        this.snack.open(`Deuda de ${p.cliente_nombre} liquidada a $0`, 'OK', { duration: 3000 });
        await this.load(); // Esto quita el loading internamente
      }
    } catch (e: any) {
      console.error(e);
      this.snack.open('Error: ' + (e.message || 'Ocurrió un problema'), 'Cerrar');
      this.loading.set(false);
    }
  }

  // Calcula la severidad del atraso
  getNivelAtraso(fechaStr: string | undefined): 'normal' | 'leve' | 'grave' {
    if (!fechaStr) return 'normal';
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const parts = fechaStr.split('-');
    if (parts.length === 3) {
      const pDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      pDate.setHours(0, 0, 0, 0);

      if (now > pDate) {
        const diffTime = Math.abs(now.getTime() - pDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= 7 ? 'leve' : 'grave';
      }
    }
    return 'normal';
  }

  async liquidarDeuda(p: Pedido, clickEvent: Event) {
    clickEvent.stopPropagation();

    const saldo = Number(p.saldo_pendiente || 0);
    if (saldo <= 0) return;

    const dialogRef = this.dialog.open(LiquidarDialogComponent, {
      data: {
        folio: p.folio,
        nombreCliente: p.cliente_nombre || 'Cliente',
        saldoPendiente: saldo,
        montoTotal: Number(p.monto_total || 0)
      },
      width: '400px'
    });

    const result: LiquidarDialogResult | undefined = await firstValueFrom(dialogRef.afterClosed());
    if (!result || result.accion === 'cancelar') return;

    const montoPago = result.monto;
    const todayShort = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });
    const detalleStr = p.descripcion ? `(${p.descripcion})` : `(Folio: ${p.folio})`;
    const esLiquidacion = result.accion === 'liquidar';

    try {
      // 1. Buscar movimiento existente del pedido
      const movs = await this.api.listMovimientos({ pedido_id: p.id });

      if (movs && movs.length > 0) {
        // Actualizar movimiento existente
        const mov = movs[0];
        const oldNota = mov.nota || `Pedido ${p.cliente_nombre} ${detalleStr}`;
        const etiqueta = esLiquidacion ? 'Liquidacion' : 'Abono';
        const nuevaNota = `${oldNota} | ${etiqueta}: $${montoPago.toFixed(2)} (${todayShort})`;
        const nuevoMonto = Number(mov.monto) + montoPago;

        await this.api.updateMovimiento(mov.id, {
          monto: nuevoMonto,
          nota: nuevaNota
        });
      } else {
        // Crear movimiento nuevo ligado al pedido
        const etiqueta = esLiquidacion ? 'Liquidacion' : 'Abono';
        await this.api.createMovimiento({
          tipo: 'ingreso',
          monto: montoPago,
          nota: `Pedido ${p.cliente_nombre} ${detalleStr}. ${etiqueta}: $${montoPago.toFixed(2)} (${todayShort})`,
          pedido_id: p.id,
          sucursal_id: p.sucursal_id || null,
          fecha: new Date().toISOString().split('T')[0],
          metodo_pago: 'efectivo'
        });
      }

      // 2. Actualizar saldo_pendiente del pedido
      const nuevoSaldo = Math.max(0, saldo - montoPago);
      await this.api.updatePedido(p.id, { saldo_pendiente: nuevoSaldo });

      // 3. Feedback y recargar
      const msg = esLiquidacion
        ? `¡Deuda de ${p.cliente_nombre} liquidada completamente!`
        : `Abono de $${montoPago.toFixed(2)} registrado. Resta: $${nuevoSaldo.toFixed(2)}`;
      this.snack.open(msg, 'OK', { duration: 4000 });

      await this.load();
    } catch (e: any) {
      console.error(e);
      this.snack.open('Error al procesar el pago: ' + (e.message || ''), 'Cerrar', { duration: 5000 });
    }
  }
}
