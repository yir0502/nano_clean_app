import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { of, firstValueFrom } from 'rxjs';

import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatChipsModule } from '@angular/material/chips';
import { A11yModule } from '@angular/cdk/a11y';

import { ApiClientService } from '../../../core/api-client.service';
import {
  Categoria,
  Cliente,
  MetodoPago,
  Pedido,
  PedidoCreatePayload,
  PedidoUpdatePayload,
  Sucursal,
} from '../../../core/models';
import { TicketPrintService } from '../../../core/ticket-print.service';
import { PedidoActionsService } from '../../../core/pedido-actions.service';
import { EntregaDialogComponent, EntregaDialogResponse } from '../dialogs/entrega-dialog.component';
import { AccionPedidoDialogComponent, AccionPedidoDialogData } from '../dialogs/accion-pedido-dialog.component';
import { TicketDialogComponent, TicketDialogData } from '../dialogs/ticket-dialog.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

interface FotoPreview {
  file?: File;
  url: string;
  id?: string;
}

const STORAGE_TARIFA_KG = 'nc_tarifa_kg';

@Component({
  selector: 'app-pedido-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatChipsModule,
    A11yModule,
    MatDialogModule,
  ],
  templateUrl: './pedido-form.html',
  styleUrls: ['./pedido-form.scss'],
})
export class PedidoFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(ApiClientService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private ticketService = inject(TicketPrintService);
  private pedidoActions = inject(PedidoActionsService);
  public location = inject(Location);

  loading = signal<boolean>(false);
  saving = signal<boolean>(false);
  isEdit = signal<boolean>(false);
  pedidoId = signal<string | null>(null);
  pedidoCargado = signal<Pedido | null>(null);

  sucursales = signal<Sucursal[]>([]);
  categoriasIngreso = signal<Categoria[]>([]);
  categoriaIngresoId = signal<string | null>(null);
  mostrarSelectorCategoria = signal<boolean>(false);
  categoriaIngresoNombre = computed(
    () => this.categoriasIngreso().find((c) => c.id === this.categoriaIngresoId())?.nombre || 'Automática'
  );
  clientesFiltrados = signal<Cliente[]>([]);
  fotos = signal<FotoPreview[]>([]);
  selectedCliente = signal<Cliente | null>(null);
  currentFolio = signal<string>('');

  montoPagadoInicial = signal<number>(0);
  descuentoInicial = signal<number>(0);
  estadoOriginal = signal<string>('recibido');

  metodoPago = signal<MetodoPago>('efectivo');
  kilosCaptura = signal<number | null>(null);
  tarifaKg = signal<number>(Number(localStorage.getItem(STORAGE_TARIFA_KG) || 0));

  readonly ESTADOS: Pedido['estado'][] = [
    'recibido',
    'lavando',
    'secando',
    'doblando',
    'listo',
    'entregado',
    'cancelado',
  ];

  readonly prendasRapidas: string[] = [
    'Lavado y secado',
    'Edredón Mat.',
    'Edredón King',
    'Cobertor',
    'Sábanas',
    'Tenis',
    'Planchado',
  ];

  readonly metodosPago: { id: MetodoPago; label: string; icon: string }[] = [
    { id: 'efectivo', label: 'Efectivo', icon: 'attach_money' },
    { id: 'transferencia', label: 'Transferencia', icon: 'sync_alt' },
    { id: 'tarjeta', label: 'Tarjeta', icon: 'credit_card' },
    { id: 'mercado_pago', label: 'Mercado Pago', icon: 'qr_code_scanner' },
  ];

  form = this.fb.group({
    cliente_nombre: ['', Validators.required],
    cliente_telefono: ['', [Validators.required, Validators.minLength(10)]],
    cliente_id: [''],
    sucursal_id: ['', Validators.required],
    descripcion: [''],
    monto_total: [0],
    saldo_pendiente: [0],
    fecha_entrega_estimada: [new Date(), Validators.required],
    estado: ['recibido' as Pedido['estado']],
    evidencia_nota: [''],
  });

  titulo = computed(() => (this.isEdit() ? 'Editar Pedido' : 'Nuevo Pedido'));

  constructor() {
    this.form
      .get('cliente_nombre')
      ?.valueChanges.pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((val) => {
          if (!val || typeof val !== 'string') return of({ data: [] as Cliente[], count: 0 });
          return this.api.listClientes({ q: val, limit: 5 });
        })
      )
      .subscribe((res) => this.clientesFiltrados.set(res.data));

    this.form
      .get('cliente_telefono')
      ?.valueChanges.pipe(
        debounceTime(450),
        distinctUntilChanged(),
        switchMap((val) => {
          if (!val || val.length < 10) return of({ data: [] as Cliente[], count: 0 });
          return this.api.listClientes({ q: val, limit: 1 });
        })
      )
      .subscribe((res) => {
        if (res.data.length > 0 && !this.selectedCliente()) {
          this.selectCliente(res.data[0]);
          this.snack.open('Cliente vinculado automáticamente', 'OK', { duration: 2500 });
        }
      });

    this.form
      .get('monto_total')
      ?.valueChanges.pipe(distinctUntilChanged())
      .subscribe((val) => {
        const total = Number(val) || 0;
        if (!this.isEdit()) {
          this.form.get('saldo_pendiente')?.setValue(total, { emitEvent: false });
        } else {
          const pagado = this.montoPagadoInicial();
          const desc = this.descuentoInicial();
          const nuevoPendiente = Math.max(0, total - desc - pagado);
          this.form.get('saldo_pendiente')?.setValue(nuevoPendiente, { emitEvent: false });
        }
      });
  }

  get serviciosEnCiclo(): number {
    return (this.selectedCliente()?.contador_servicios ?? 0) % 4;
  }

  get proximaGanancia(): number {
    const monedero = this.selectedCliente()?.monedero ?? 0;
    if (monedero >= 50) return 0;
    return this.serviciosEnCiclo === 3 ? 20 : 10;
  }

  get promoProgressPercent(): number {
    return (this.serviciosEnCiclo / 4) * 100;
  }

  getLoyaltyMessage(): string {
    const monedero = this.selectedCliente()?.monedero ?? 0;
    if (monedero >= 50) {
      return 'Límite de monedero ($50.00 MXN) alcanzado. Sugiere al cliente canjear su saldo.';
    }
    const count = this.serviciosEnCiclo;
    const faltan = 4 - count;
    if (count === 3) {
      return 'El próximo servicio otorgará un bono especial de $20.00 MXN al cliente.';
    }
    return `Falta(n) ${faltan} servicio(s) para el bono especial de $20.00 MXN.`;
  }

  async toggleAptitudPromo(nuevoValor: boolean): Promise<void> {
    const c = this.selectedCliente();
    if (!c?.id) return;
    try {
      const updated = await this.api.updateCliente(c.id, { apto_promociones: nuevoValor });
      this.selectedCliente.set({ ...c, ...updated });
      this.snack.open(
        nuevoValor ? 'Cliente inscrito en el programa de lealtad' : 'Cliente excluido del programa de lealtad',
        'OK',
        { duration: 3000 }
      );
    } catch {
      this.snack.open('Error al actualizar el estado de lealtad', 'Cerrar');
    }
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadSucursales(), this.loadCategoriasIngreso()]);

    this.form.get('sucursal_id')?.valueChanges.subscribe((val) => {
      if (val) localStorage.setItem('nc_last_sucursal_id', val);
    });

    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'nuevo') {
      this.isEdit.set(true);
      this.pedidoId.set(id);
      await this.loadPedido(id);
    } else {
      const lastSucursal = localStorage.getItem('nc_last_sucursal_id');
      const matched = this.sucursales().find((s) => s.id === lastSucursal);
      const defaultSucursalId = matched ? matched.id : this.sucursales().length ? this.sucursales()[0].id : '';
      if (defaultSucursalId) {
        this.form.patchValue({ sucursal_id: defaultSucursalId });
      }
      this.setFechaOffset(1);
    }
  }

  agregarPrendaRapida(prenda: string): void {
    const actual = (this.form.get('descripcion')?.value || '').trim();
    const nuevoTexto = actual ? `${actual}, ${prenda}` : prenda;
    this.form.patchValue({ descripcion: nuevoTexto });
  }

  actualizarTarifaKg(valor: string | number): void {
    const num = Math.max(0, Number(valor) || 0);
    this.tarifaKg.set(num);
    if (num > 0) {
      localStorage.setItem(STORAGE_TARIFA_KG, String(num));
    }
  }

  aplicarCalculoKilos(): void {
    const kg = Number(this.kilosCaptura()) || 0;
    if (kg <= 0) return;

    const tarifa = this.tarifaKg();
    const etiquetaKg = `${kg} kg lavado y secado`;
    const descActual = (this.form.get('descripcion')?.value || '').trim();
    const nuevaDesc = descActual ? `${descActual}, ${etiquetaKg}` : etiquetaKg;
    this.form.patchValue({ descripcion: nuevaDesc });

    if (tarifa > 0) {
      const subtotalKg = Math.round(kg * tarifa * 100) / 100;
      const totalActual = Number(this.form.get('monto_total')?.value) || 0;
      this.form.patchValue({ monto_total: Math.round((totalActual + subtotalKg) * 100) / 100 });
    }

    this.kilosCaptura.set(null);
  }

  setFechaOffset(dias: number): void {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    d.setHours(12, 0, 0, 0);
    this.form.patchValue({ fecha_entrega_estimada: d });
  }

  isFechaOffsetActivo(dias: number): boolean {
    const val = this.form.get('fecha_entrega_estimada')?.value;
    if (!val) return false;
    const current = new Date(val);
    const target = new Date();
    target.setDate(target.getDate() + dias);
    return (
      current.getFullYear() === target.getFullYear() &&
      current.getMonth() === target.getMonth() &&
      current.getDate() === target.getDate()
    );
  }

  get saldoMaximoPendiente(): number {
    const total = Number(this.form.get('monto_total')?.value) || 0;
    const desc = this.descuentoInicial();
    return Math.max(0, total - desc);
  }

  get anticipoCalculado(): number {
    const total = Number(this.form.get('monto_total')?.value) || 0;
    const saldo = Number(this.form.get('saldo_pendiente')?.value) || 0;
    const desc = this.descuentoInicial();
    return Math.max(0, total - desc - saldo);
  }

  aplicarPresetAnticipo(tipo: 'cero' | 'total' | 'mitad'): void {
    const maxPendiente = this.saldoMaximoPendiente;
    if (tipo === 'cero') {
      this.form.patchValue({ saldo_pendiente: 0 });
    } else if (tipo === 'total') {
      this.form.patchValue({ saldo_pendiente: maxPendiente });
    } else if (tipo === 'mitad') {
      this.form.patchValue({ saldo_pendiente: Math.round(maxPendiente / 2) });
    }
  }

  displayCliente(cliente: Cliente | string | null): string {
    if (typeof cliente === 'string') return cliente;
    return cliente && cliente.nombre ? cliente.nombre : '';
  }

  selectCliente(c: Cliente): void {
    this.selectedCliente.set(c);
    this.form.patchValue({
      cliente_nombre: c.nombre,
      cliente_telefono: c.telefono,
      cliente_id: c.id,
    });
    this.form.controls.cliente_nombre.disable();
    this.form.controls.cliente_telefono.disable();
  }

  clearCliente(): void {
    this.selectedCliente.set(null);
    this.form.patchValue({ cliente_nombre: '', cliente_telefono: '', cliente_id: '' });
    this.form.controls.cliente_nombre.enable();
    this.form.controls.cliente_telefono.enable();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;

    const listaArchivos = Array.from(files);
    input.value = '';

    for (const rawFile of listaArchivos) {
      const comprimido = await this.comprimirImagenCliente(rawFile);
      const previewUrl = URL.createObjectURL(comprimido);
      this.fotos.update((prev) => [...prev, { file: comprimido, url: previewUrl }]);
    }
  }

  private comprimirImagenCliente(file: File): Promise<File> {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/')) {
        resolve(file);
        return;
      }

      const img = new Image();
      const objUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objUrl);
        const maxDim = 1280;
        let width = img.naturalWidth;
        let height = img.naturalHeight;

        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const cleanName = file.name.replace(/\.[^.]+$/, '') + '.webp';
            resolve(new File([blob], cleanName, { type: 'image/webp' }));
          },
          'image/webp',
          0.8
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(objUrl);
        resolve(file);
      };

      img.src = objUrl;
    });
  }

  async removeFoto(index: number): Promise<void> {
    const foto = this.fotos()[index];

    if (foto.id && this.pedidoId()) {
      const dialogData: ConfirmDialogData = {
        title: 'Eliminar evidencia',
        message: '¿Estás seguro de eliminar esta evidencia permanentemente?',
        icon: 'delete_forever',
        color: 'warn',
      };

      const dialogRef = this.dialog.open(ConfirmDialogComponent, {
        data: dialogData,
        width: '360px',
        panelClass: 'custom-modal-panel',
      });

      const confirmacion = await firstValueFrom(dialogRef.afterClosed());
      if (!confirmacion) return;

      this.loading.set(true);
      try {
        await this.api.deleteEvidencia(this.pedidoId()!, foto.id);
        this.snack.open('Evidencia eliminada', 'OK', { duration: 2000 });
        this.fotos.update((prev) => prev.filter((_, i) => i !== index));
      } catch {
        this.snack.open('Error al eliminar evidencia', 'Cerrar');
      } finally {
        this.loading.set(false);
      }
    } else {
      if (foto.url.startsWith('blob:')) {
        URL.revokeObjectURL(foto.url);
      }
      this.fotos.update((prev) => prev.filter((_, i) => i !== index));
    }
  }

  async loadSucursales(): Promise<void> {
    try {
      this.sucursales.set(await this.api.listSucursales({ activo: 1 }));
    } catch {
      // Manejado globalmente por ApiClientService
    }
  }

  async loadCategoriasIngreso(): Promise<void> {
    try {
      const cats = await this.api.listCategorias('ingreso');
      const activas = cats.filter((c) => c.activo !== false);
      const lista = activas.length > 0 ? activas : cats;
      this.categoriasIngreso.set(lista);

      if (!this.categoriaIngresoId() && lista.length > 0) {
        this.categoriaIngresoId.set(lista.length > 1 ? lista[1].id : lista[0].id);
      }
    } catch {
      // El backend aplica categoria por defecto si falla la precarga
    }
  }

  seleccionarCategoriaIngreso(id: string): void {
    this.categoriaIngresoId.set(id);
    this.mostrarSelectorCategoria.set(false);
  }

  async loadPedido(id: string): Promise<void> {
    this.loading.set(true);
    try {
      const p = await this.api.getPedido(id);
      if (!p) throw new Error('Pedido no encontrado');

      this.pedidoCargado.set(p);
      this.currentFolio.set(p.folio || '');
      this.estadoOriginal.set(p.estado);

      const totalVal = Number(p.monto_total) || 0;
      const pendienteVal = Number(p.saldo_pendiente) || 0;
      const descuentoVal = Number(p.descuento_aplicado) || 0;
      this.montoPagadoInicial.set(Math.max(0, totalVal - descuentoVal - pendienteVal));
      this.descuentoInicial.set(descuentoVal);

      const evidencias = await this.api.listEvidencias(id);

      this.form.patchValue(
        {
          cliente_nombre: p.cliente_nombre,
          cliente_telefono: p.cliente_telefono,
          cliente_id: p.cliente_id,
          sucursal_id: p.sucursal_id,
          descripcion: p.descripcion,
          monto_total: Number(p.monto_total),
          saldo_pendiente: Number(p.saldo_pendiente),
          fecha_entrega_estimada: p.fecha_entrega_estimada ? new Date(p.fecha_entrega_estimada + 'T00:00:00') : new Date(),
          estado: p.estado,
        },
        { emitEvent: false }
      );

      if (p.cliente_id) {
        try {
          const clienteReal = await this.api.getCliente(p.cliente_id);
          if (clienteReal) {
            this.selectedCliente.set(clienteReal);
          } else {
            this.selectedCliente.set({
              id: p.cliente_id,
              nombre: p.cliente_nombre || '',
              telefono: p.cliente_telefono || '',
              permite_whatsapp: true,
              frecuencia_recordatorio: 0,
              monedero: 0,
            });
          }
        } catch {
          this.selectedCliente.set({
            id: p.cliente_id,
            nombre: p.cliente_nombre || '',
            telefono: p.cliente_telefono || '',
            permite_whatsapp: true,
            frecuencia_recordatorio: 0,
            monedero: 0,
          });
        }

        this.form.controls.cliente_nombre.disable();
        this.form.controls.cliente_telefono.disable();
      }

      this.fotos.set(
        evidencias.map((e) => ({
          url: e.url,
          id: e.id,
        }))
      );
    } catch {
      this.snack.open('Error al cargar pedido', 'Cerrar');
      this.location.back();
    } finally {
      this.loading.set(false);
    }
  }

  abrirModalTicketActual(): void {
    const base = this.pedidoCargado();
    if (!base) return;
    const v = this.form.getRawValue();
    const sucursalNombre = this.sucursales().find((s) => s.id === v.sucursal_id)?.nombre || base.sucursal_nombre;
    const pedidoVista: Pedido = {
      ...base,
      cliente_nombre: v.cliente_nombre || base.cliente_nombre,
      cliente_telefono: v.cliente_telefono || base.cliente_telefono,
      descripcion: v.descripcion || base.descripcion,
      monto_total: Number(v.monto_total || 0),
      saldo_pendiente: Number(v.saldo_pendiente || 0),
      sucursal_nombre: sucursalNombre,
    };

    this.dialog.open(TicketDialogComponent, {
      data: { pedido: pedidoVista, esCreacion: false } as TicketDialogData,
      width: '390px',
    });
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    const esEntregado = v.estado === 'entregado';
    const esListo = v.estado === 'listo';
    const montoTotal = Number(v.monto_total) || 0;
    const saldoPend = Number(v.saldo_pendiente) || 0;
    const anticipo = Math.max(0, montoTotal - this.descuentoInicial() - saldoPend);
    const nombreCliente = v.cliente_nombre || 'Cliente';
    const telefonoCliente = v.cliente_telefono || '';

    let montoCobradoEntrega = 0;
    let metodoCobroEntrega: MetodoPago | undefined;
    let categoriaCobroEntrega: string | null | undefined;

    if (this.isEdit() && esEntregado && this.estadoOriginal() !== 'entregado' && saldoPend > 0) {
      const dialogRef = this.dialog.open(EntregaDialogComponent, {
        data: {
          nombreCliente,
          folio: this.currentFolio(),
          saldoPendiente: saldoPend,
          montoTotal,
        },
        disableClose: true,
        width: '400px',
        panelClass: 'custom-modal-panel',
      });

      const decision = await firstValueFrom(dialogRef.afterClosed());
      if (!decision) return;

      if (decision.accion === 'cobrar') {
        montoCobradoEntrega = saldoPend;
        metodoCobroEntrega = decision.metodoPago || 'efectivo';
        categoriaCobroEntrega = decision.categoriaIngresoId;
      }
    }

    this.saving.set(true);

    try {
      let clientId = v.cliente_id;

      if (!clientId) {
        const nuevoCliente = await this.api.createCliente({
          nombre: v.cliente_nombre || '',
          telefono: v.cliente_telefono || '',
          permite_whatsapp: true,
          apto_promociones: false,
        });
        clientId = nuevoCliente.id;
      }

      const fechaEntregaIso = v.fecha_entrega_estimada
        ? new Date(v.fecha_entrega_estimada).toISOString().split('T')[0]
        : undefined;

      const sucursalNombre = this.sucursales().find((s) => s.id === v.sucursal_id)?.nombre || 'Mostrador';
      let resultadoPedido: Pedido;

      if (this.isEdit() && this.pedidoId()) {
        const updatePayload: PedidoUpdatePayload = {
          descripcion: v.descripcion || '',
          sucursal_id: v.sucursal_id,
          monto_total: montoTotal,
          saldo_pendiente: saldoPend,
          fecha_entrega_estimada: fechaEntregaIso,
          estado: v.estado || 'recibido',
        };
        if (montoCobradoEntrega > 0) {
          updatePayload.monto_cobrado = montoCobradoEntrega;
          updatePayload.metodo_pago = metodoCobroEntrega;
          if (categoriaCobroEntrega) {
            updatePayload.categoria_ingreso_id = categoriaCobroEntrega;
          }
        }
        resultadoPedido = await this.api.updatePedido(this.pedidoId()!, updatePayload);
      } else {
        const createPayload: PedidoCreatePayload = {
          cliente_id: clientId,
          sucursal_id: v.sucursal_id,
          descripcion: v.descripcion || '',
          monto_total: montoTotal,
          saldo_pendiente: saldoPend,
          fecha_entrega_estimada: fechaEntregaIso,
          registrar_pago: anticipo > 0,
          metodo_pago: anticipo > 0 ? this.metodoPago() : null,
          ...(anticipo > 0 && this.categoriaIngresoId() ? { categoria_ingreso_id: this.categoriaIngresoId() } : {}),
        };
        resultadoPedido = await this.api.createPedido(createPayload);
      }

      const pedidoIdFinal = resultadoPedido.id;
      const nuevasFotos = this.fotos().filter((f) => f.file);
      if (pedidoIdFinal && nuevasFotos.length > 0) {
        const uploads = nuevasFotos.map((f) =>
          this.api.uploadEvidencia(pedidoIdFinal, f.file!, 'ingreso', v.evidencia_nota || '')
        );
        await Promise.all(uploads);
      }

      const pedidoEnriquecido: Pedido = {
        ...resultadoPedido,
        cliente_nombre: nombreCliente,
        cliente_telefono: telefonoCliente,
        sucursal_nombre: sucursalNombre,
        descripcion: v.descripcion || resultadoPedido.descripcion,
      };

      if (!this.isEdit()) {
        const etiquetaMetodo =
          anticipo > 0 ? this.metodosPago.find((m) => m.id === this.metodoPago())?.label : undefined;

        if (this.ticketService.autoPrintEnabled) {
          await this.ticketService.imprimirTicket({
            ...pedidoEnriquecido,
            metodo_pago_texto: etiquetaMetodo,
          });
        }

        const ticketRef = this.dialog.open(TicketDialogComponent, {
          data: {
            pedido: pedidoEnriquecido,
            esCreacion: true,
            metodoPagoTexto: etiquetaMetodo,
          } as TicketDialogData,
          width: '390px',
        });

        await firstValueFrom(ticketRef.afterClosed());
        this.router.navigateByUrl('/pedidos');
        return;
      }

      if (esEntregado && this.estadoOriginal() !== 'entregado') {
        const msjEntrega =
          montoCobradoEntrega > 0
            ? `Pedido entregado y cobro de $${montoCobradoEntrega.toFixed(2)} registrado en caja`
            : saldoPend > 0
              ? 'Pedido entregado. Saldo registrado en Deudas'
              : 'Pedido entregado';
        this.snack.open(msjEntrega, 'OK', { duration: 3500 });
        this.router.navigateByUrl('/pedidos');
        return;
      }

      if (esListo && this.estadoOriginal() !== 'listo') {
        if (resultadoPedido.whatsapp_disparado) {
          this.snack.open(`Pedido ${resultadoPedido.folio} LISTO y cliente notificado por WhatsApp`, 'OK', {
            duration: 3500,
          });
          this.router.navigateByUrl('/pedidos');
          return;
        }

        if (telefonoCliente) {
          const dialogRef = this.dialog.open(AccionPedidoDialogComponent, {
            data: {
              titulo: 'Pedido Listo',
              mensaje: `El pedido ${resultadoPedido.folio} para ${nombreCliente} está listo. ¿Deseas avisarle por WhatsApp?`,
              acciones: [{ texto: 'Avisar por WhatsApp', icono: 'chat', valor: 'whatsapp', color: 'whatsapp' }],
            } as AccionPedidoDialogData,
            disableClose: true,
            width: '400px',
            panelClass: 'custom-modal-panel',
          });

          const accion = await firstValueFrom(dialogRef.afterClosed());
          if (accion === 'whatsapp') {
            this.pedidoActions.sendWhatsapp({ ...pedidoEnriquecido, estado: 'listo' });
          }
        }
        this.router.navigateByUrl('/pedidos');
        return;
      }

      this.snack.open('Pedido actualizado', 'OK', { duration: 2500 });
      this.router.navigateByUrl('/pedidos');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Ocurrió un problema';
      this.snack.open('Error: ' + msg, 'Cerrar');
    } finally {
      this.saving.set(false);
    }
  }

  setStatus(estado: Pedido['estado']): void {
    this.form.patchValue({ estado });
  }
}
