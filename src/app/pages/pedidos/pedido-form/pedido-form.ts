import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Location } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom, from, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

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
import { PedidoActionsService } from '../../../core/pedido-actions.service';
import { TicketPrintService } from '../../../core/ticket-print.service';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import {
  AccionPedidoDialogComponent,
  AccionPedidoDialogData,
} from '../dialogs/accion-pedido-dialog.component';
import {
  EntregaDialogComponent,
  EntregaDialogData,
  EntregaDialogResponse,
} from '../dialogs/entrega-dialog.component';
import { TicketDialogComponent, TicketDialogData } from '../dialogs/ticket-dialog.component';
import {
  PedidoStageMeta,
  formatCurrencyMXN,
  formatLocalDateFromInput,
  getPedidoStageMeta,
  parseLocalDateInput,
} from '../pedidos.helpers';

export interface FotoPreview {
  file?: File;
  url: string;
  id?: string;
}

export interface MetodoPagoOption {
  id: MetodoPago;
  label: string;
  icon: string;
}

export interface FechaPresetOption {
  dias: number;
  label: string;
}

const STORAGE_TARIFA_KG = 'nc_tarifa_kg';
const STORAGE_LAST_SUCURSAL = 'nc_last_sucursal_id';
const MAX_IMAGE_DIM = 1280;
const LOYALTY_CYCLE_SIZE = 4;
const LOYALTY_WALLET_CAP = 50;

function validateLocalDateControl(control: AbstractControl): ValidationErrors | null {
  const raw: unknown = control.value;
  if (typeof raw !== 'string' || !raw.trim()) {
    return null;
  }
  return parseLocalDateInput(raw) ? null : { invalidDate: true };
}

function isClienteRecord(value: unknown): value is Cliente {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return 'id' in value && 'nombre' in value && 'telefono' in value;
}

@Component({
  selector: 'app-pedido-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatIconModule,
    MatAutocompleteModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './pedido-form.html',
  styleUrls: ['./pedido-form.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PedidoFormComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiClientService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly ticketService = inject(TicketPrintService);
  private readonly pedidoActions = inject(PedidoActionsService);
  private readonly destroyRef = inject(DestroyRef);
  public readonly location = inject(Location);

  readonly ESTADOS: readonly Pedido['estado'][] = [
    'recibido',
    'lavando',
    'secando',
    'doblando',
    'listo',
    'entregado',
    'cancelado',
  ];

  readonly statusSteps: readonly PedidoStageMeta[] = this.ESTADOS.map((estado) =>
    getPedidoStageMeta(estado)
  );

  readonly prendasRapidas: readonly string[] = [
    'Lavado y secado',
    'Edredón Mat.',
    'Edredón King',
    'Cobertor',
    'Sábanas',
    'Tenis',
    'Planchado',
  ];

  readonly metodosPago: readonly MetodoPagoOption[] = [
    { id: 'efectivo', label: 'Efectivo', icon: 'attach_money' },
    { id: 'transferencia', label: 'Transferencia', icon: 'sync_alt' },
    { id: 'tarjeta', label: 'Tarjeta', icon: 'credit_card' },
    { id: 'mercado_pago', label: 'Mercado Pago', icon: 'qr_code_scanner' },
  ];

  readonly fechaPresets: readonly FechaPresetOption[] = [
    { dias: 0, label: 'Hoy' },
    { dias: 1, label: 'Mañana' },
    { dias: 2, label: 'En 2 días' },
    { dias: 3, label: 'En 3 días' },
  ];

  readonly cicloSlots: readonly number[] = [0, 1, 2, 3];

  loading = signal<boolean>(false);
  saving = signal<boolean>(false);
  isEdit = signal<boolean>(false);
  pedidoId = signal<string | null>(null);
  pedidoCargado = signal<Pedido | null>(null);

  sucursales = signal<Sucursal[]>([]);
  categoriasIngreso = signal<Categoria[]>([]);
  categoriaIngresoId = signal<string | null>(null);
  mostrarSelectorCategoria = signal<boolean>(false);
  clientesFiltrados = signal<Cliente[]>([]);
  fotos = signal<FotoPreview[]>([]);
  deletingFotoIndex = signal<number | null>(null);
  selectedCliente = signal<Cliente | null>(null);
  currentFolio = signal<string>('');
  togglingPromo = signal<boolean>(false);

  montoPagadoInicial = signal<number>(0);
  descuentoInicial = signal<number>(0);
  estadoOriginal = signal<Pedido['estado']>('recibido');

  metodoPago = signal<MetodoPago>('efectivo');
  kilosCaptura = signal<number | null>(null);
  tarifaKg = signal<number>(this.readStoredTarifaKg());
  posExpanded = signal<boolean>(false);

  estadoActual = signal<Pedido['estado']>('recibido');
  sucursalSeleccionada = signal<string>('');
  montoTotal = signal<number>(0);
  saldoPendiente = signal<number>(0);
  fechaEntrega = signal<string>(formatLocalDateFromInput(new Date()));
  formInvalid = signal<boolean>(true);
  submitAttempted = signal<boolean>(false);

  lightboxIndex = signal<number | null>(null);

  titulo = computed(() => (this.isEdit() ? 'Editar pedido' : 'Nuevo pedido'));
  usaSegmentadoSucursal = computed(
    () => this.sucursales().length > 0 && this.sucursales().length <= 4
  );
  categoriaIngresoNombre = computed(
    () =>
      this.categoriasIngreso().find((c) => c.id === this.categoriaIngresoId())?.nombre ||
      'Automática'
  );
  saldoMaximoPendiente = computed(() => Math.max(0, this.montoTotal() - this.descuentoInicial()));
  anticipoCalculado = computed(() =>
    Math.max(0, this.montoTotal() - this.descuentoInicial() - this.saldoPendiente())
  );
  subtotalKilosPreview = computed(() => {
    const kg = this.kilosCaptura() ?? 0;
    const tarifa = this.tarifaKg();
    return kg > 0 && tarifa > 0 ? Math.round(kg * tarifa * 100) / 100 : 0;
  });

  serviciosEnCiclo = computed(
    () => (this.selectedCliente()?.contador_servicios ?? 0) % LOYALTY_CYCLE_SIZE
  );
  proximaGanancia = computed(() => {
    const monedero = this.selectedCliente()?.monedero ?? 0;
    if (monedero >= LOYALTY_WALLET_CAP) {
      return 0;
    }
    return this.serviciosEnCiclo() === 3 ? 20 : 10;
  });
  promoProgressPercent = computed(() => (this.serviciosEnCiclo() / LOYALTY_CYCLE_SIZE) * 100);
  loyaltyMessage = computed(() => {
    const monedero = this.selectedCliente()?.monedero ?? 0;
    if (monedero >= LOYALTY_WALLET_CAP) {
      return 'Límite de monedero ($50.00 MXN) alcanzado. Sugiere al cliente canjear su saldo.';
    }
    const count = this.serviciosEnCiclo();
    const faltan = LOYALTY_CYCLE_SIZE - count;
    if (count === 3) {
      return 'El próximo servicio otorgará un bono especial de $20.00 MXN al cliente.';
    }
    return `Falta(n) ${faltan} servicio(s) para el bono especial de $20.00 MXN.`;
  });

  lightboxFoto = computed<FotoPreview | null>(() => {
    const idx = this.lightboxIndex();
    const list = this.fotos();
    if (idx === null || idx < 0 || idx >= list.length) {
      return null;
    }
    return list[idx];
  });
  lightboxCounter = computed<string>(() => {
    const idx = this.lightboxIndex();
    const total = this.fotos().length;
    if (idx === null || total === 0) {
      return '';
    }
    return `${idx + 1} / ${total}`;
  });
  canNavigateLightbox = computed<boolean>(() => this.fotos().length > 1);
  canSave = computed<boolean>(() => !this.formInvalid() && !this.saving() && !this.loading());

  form = this.fb.nonNullable.group({
    cliente_nombre: ['', Validators.required],
    cliente_telefono: ['', [Validators.required, Validators.minLength(10)]],
    cliente_id: [''],
    sucursal_id: ['', Validators.required],
    descripcion: [''],
    monto_total: [0, Validators.min(0)],
    saldo_pendiente: [0, Validators.min(0)],
    fecha_entrega_estimada: [
      formatLocalDateFromInput(new Date()),
      [Validators.required, validateLocalDateControl],
    ],
    estado: this.fb.nonNullable.control<Pedido['estado']>('recibido'),
    evidencia_nota: [''],
  });

  constructor() {
    this.form.controls.cliente_nombre.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((rawVal: unknown) => {
          if (this.selectedCliente() || typeof rawVal !== 'string' || !rawVal.trim()) {
            return of<{ data: Cliente[]; count: number }>({ data: [], count: 0 });
          }
          return from(this.api.listClientes({ q: rawVal.trim(), limit: 5 })).pipe(
            catchError(() => of<{ data: Cliente[]; count: number }>({ data: [], count: 0 }))
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((res) => this.clientesFiltrados.set(res.data));

    this.form.controls.cliente_telefono.valueChanges
      .pipe(
        debounceTime(450),
        distinctUntilChanged(),
        switchMap((val) => {
          const clean = typeof val === 'string' ? val.trim() : '';
          if (this.selectedCliente() || clean.length < 10) {
            return of<{ data: Cliente[]; count: number }>({ data: [], count: 0 });
          }
          return from(this.api.listClientes({ q: clean, limit: 1 })).pipe(
            catchError(() => of<{ data: Cliente[]; count: number }>({ data: [], count: 0 }))
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((res) => {
        if (res.data.length > 0 && !this.selectedCliente()) {
          this.selectCliente(res.data[0]);
          this.snack.open('Cliente vinculado automáticamente', 'OK', { duration: 2500 });
        }
      });

    this.form.controls.monto_total.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((val) => {
        const total = Number(val) || 0;
        this.montoTotal.set(total);
        if (!this.isEdit()) {
          this.form.controls.saldo_pendiente.setValue(total, { emitEvent: false });
          this.saldoPendiente.set(total);
        } else {
          const pagado = this.montoPagadoInicial();
          const desc = this.descuentoInicial();
          const nuevoPendiente = Math.max(0, total - desc - pagado);
          this.form.controls.saldo_pendiente.setValue(nuevoPendiente, { emitEvent: false });
          this.saldoPendiente.set(nuevoPendiente);
        }
      });

    this.form.controls.saldo_pendiente.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((val) => this.saldoPendiente.set(Number(val) || 0));

    this.form.controls.fecha_entrega_estimada.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((val) => this.fechaEntrega.set(formatLocalDateFromInput(val)));

    this.form.controls.estado.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((val) => this.estadoActual.set(val));

    this.form.controls.sucursal_id.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((val) => {
        const clean = val || '';
        this.sucursalSeleccionada.set(clean);
        if (clean) {
          this.writeStorage(STORAGE_LAST_SUCURSAL, clean);
        }
      });

    this.form.statusChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.formInvalid.set(this.form.invalid));
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(event: KeyboardEvent): void {
    if (this.lightboxIndex() === null) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeLightbox();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.prevLightbox();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.nextLightbox();
    }
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadSucursales(), this.loadCategoriasIngreso()]);

    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'nuevo') {
      this.isEdit.set(true);
      this.pedidoId.set(id);
      await this.loadPedido(id);
      return;
    }

    const lastSucursal = this.readStorage(STORAGE_LAST_SUCURSAL);
    const matched = this.sucursales().find((s) => s.id === lastSucursal);
    const defaultSucursalId = matched
      ? matched.id
      : this.sucursales().length > 0
        ? this.sucursales()[0].id
        : '';
    if (defaultSucursalId) {
      this.form.patchValue({ sucursal_id: defaultSucursalId });
    }
    this.setFechaOffset(1);
    this.formInvalid.set(this.form.invalid);
  }

  ngOnDestroy(): void {
    for (const foto of this.fotos()) {
      if (foto.url.startsWith('blob:')) {
        URL.revokeObjectURL(foto.url);
      }
    }
  }

  formatMxn(valor: number): string {
    return formatCurrencyMXN(valor, { decimals: 2 });
  }

  getLoyaltyMessage(): string {
    return this.loyaltyMessage();
  }

  async toggleAptitudPromo(nuevoValor: boolean): Promise<void> {
    const cliente = this.selectedCliente();
    if (!cliente?.id || this.togglingPromo()) {
      return;
    }
    this.togglingPromo.set(true);
    try {
      const updated = await this.api.updateCliente(cliente.id, { apto_promociones: nuevoValor });
      this.selectedCliente.set({ ...cliente, ...updated });
      this.snack.open(
        nuevoValor
          ? 'Cliente inscrito en el programa de lealtad'
          : 'Cliente excluido del programa de lealtad',
        'OK',
        { duration: 3000 }
      );
    } catch {
      this.snack.open('Error al actualizar el estado de lealtad', 'Cerrar');
    } finally {
      this.togglingPromo.set(false);
    }
  }

  selectSucursal(sucursalId: string): void {
    this.form.patchValue({ sucursal_id: sucursalId });
    this.form.controls.sucursal_id.markAsTouched();
  }

  agregarPrendaRapida(prenda: string): void {
    const actual = (this.form.controls.descripcion.value || '').trim();
    const nuevoTexto = actual ? `${actual}, ${prenda}` : prenda;
    this.form.patchValue({ descripcion: nuevoTexto });
  }

  onKilosInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.validity.badInput) {
      return;
    }
    const raw = target.value.trim();
    if (!raw) {
      this.kilosCaptura.set(null);
      return;
    }
    const parsed = Number(raw);
    this.kilosCaptura.set(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
  }

  onTarifaInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.validity.badInput) {
      return;
    }
    this.actualizarTarifaKg(target.value);
  }

  actualizarTarifaKg(valor: string | number): void {
    const num = Math.max(0, Number(valor) || 0);
    this.tarifaKg.set(num);
    if (num > 0) {
      this.writeStorage(STORAGE_TARIFA_KG, String(num));
    }
  }

  aplicarCalculoKilos(): void {
    const kg = Number(this.kilosCaptura()) || 0;
    if (kg <= 0) {
      return;
    }

    const tarifa = this.tarifaKg();
    const etiquetaKg = `${kg} kg lavado y secado`;
    const descActual = (this.form.controls.descripcion.value || '').trim();
    const nuevaDesc = descActual ? `${descActual}, ${etiquetaKg}` : etiquetaKg;
    this.form.patchValue({ descripcion: nuevaDesc });

    if (tarifa > 0) {
      const subtotalKg = Math.round(kg * tarifa * 100) / 100;
      const totalActual = Number(this.form.controls.monto_total.value) || 0;
      this.form.patchValue({ monto_total: Math.round((totalActual + subtotalKg) * 100) / 100 });
    }

    this.kilosCaptura.set(null);
  }

  onFechaEntregaChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    const raw = target.value.trim();
    if (!raw) {
      this.form.patchValue({ fecha_entrega_estimada: '' });
      return;
    }
    const normalized = formatLocalDateFromInput(raw);
    if (normalized && normalized !== this.form.controls.fecha_entrega_estimada.value) {
      this.form.patchValue({ fecha_entrega_estimada: normalized });
    }
  }

  togglePosExpanded(): void {
    this.posExpanded.update((prev) => !prev);
  }

  setFechaOffset(dias: number): void {
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dias);
    const localIso = formatLocalDateFromInput(target);
    this.form.patchValue({ fecha_entrega_estimada: localIso });
    this.fechaEntrega.set(localIso);
  }

  isFechaOffsetActivo(dias: number): boolean {
    const current = parseLocalDateInput(this.fechaEntrega());
    if (!current) {
      return false;
    }
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dias);
    return (
      current.getFullYear() === target.getFullYear() &&
      current.getMonth() === target.getMonth() &&
      current.getDate() === target.getDate()
    );
  }

  aplicarPresetAnticipo(tipo: 'cero' | 'total' | 'mitad'): void {
    const maxPendiente = this.saldoMaximoPendiente();
    if (tipo === 'cero') {
      this.form.patchValue({ saldo_pendiente: 0 });
    } else if (tipo === 'total') {
      this.form.patchValue({ saldo_pendiente: maxPendiente });
    } else {
      this.form.patchValue({ saldo_pendiente: Math.round(maxPendiente / 2) });
    }
  }

  displayCliente(cliente: Cliente | string | null): string {
    if (typeof cliente === 'string') {
      return cliente;
    }
    return cliente && cliente.nombre ? cliente.nombre : '';
  }

  onClienteOptionSelected(event: MatAutocompleteSelectedEvent): void {
    const value: unknown = event.option.value;
    if (isClienteRecord(value)) {
      this.selectCliente(value);
    }
  }

  selectCliente(cliente: Cliente): void {
    this.selectedCliente.set(cliente);
    this.form.patchValue({
      cliente_nombre: cliente.nombre,
      cliente_telefono: cliente.telefono,
      cliente_id: cliente.id,
    });
    this.form.controls.cliente_nombre.disable();
    this.form.controls.cliente_telefono.disable();
    this.formInvalid.set(this.form.invalid);
  }

  clearCliente(): void {
    this.selectedCliente.set(null);
    this.clientesFiltrados.set([]);
    this.form.patchValue({ cliente_nombre: '', cliente_telefono: '', cliente_id: '' });
    this.form.controls.cliente_nombre.enable();
    this.form.controls.cliente_telefono.enable();
    this.formInvalid.set(this.form.invalid);
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files || input.files.length === 0) {
      return;
    }

    const listaArchivos = Array.from(input.files);
    input.value = '';

    for (const rawFile of listaArchivos) {
      const comprimido = await this.comprimirImagenCliente(rawFile);
      const previewUrl = URL.createObjectURL(comprimido);
      this.fotos.update((prev) => [...prev, { file: comprimido, url: previewUrl }]);
    }
  }

  async removeFoto(index: number): Promise<void> {
    const foto = this.fotos()[index];
    if (!foto) {
      return;
    }

    const currentPedidoId = this.pedidoId();
    if (foto.id && currentPedidoId) {
      const dialogData: ConfirmDialogData = {
        title: 'Eliminar evidencia',
        message: '¿Estás seguro de eliminar esta evidencia permanentemente?',
        icon: 'delete_forever',
        color: 'warn',
      };

      const dialogRef = this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean | undefined>(
        ConfirmDialogComponent,
        {
          data: dialogData,
          width: '360px',
          panelClass: 'custom-modal-panel',
        }
      );

      const confirmacion = await firstValueFrom(dialogRef.afterClosed());
      if (!confirmacion) {
        return;
      }

      this.deletingFotoIndex.set(index);
      try {
        await this.api.deleteEvidencia(currentPedidoId, foto.id);
        this.snack.open('Evidencia eliminada', 'OK', { duration: 2000 });
        this.fotos.update((prev) => prev.filter((_, i) => i !== index));
        this.reconcileLightboxAfterRemoval(index);
      } catch {
        this.snack.open('Error al eliminar evidencia', 'Cerrar');
      } finally {
        this.deletingFotoIndex.set(null);
      }
      return;
    }

    if (foto.url.startsWith('blob:')) {
      URL.revokeObjectURL(foto.url);
    }
    this.fotos.update((prev) => prev.filter((_, i) => i !== index));
    this.reconcileLightboxAfterRemoval(index);
  }

  openLightbox(index: number): void {
    if (index < 0 || index >= this.fotos().length) {
      return;
    }
    this.lightboxIndex.set(index);
  }

  closeLightbox(): void {
    this.lightboxIndex.set(null);
  }

  prevLightbox(): void {
    const total = this.fotos().length;
    if (this.lightboxIndex() === null || total <= 1) {
      return;
    }
    this.lightboxIndex.update((i) => (i === null ? null : (i - 1 + total) % total));
  }

  nextLightbox(): void {
    const total = this.fotos().length;
    if (this.lightboxIndex() === null || total <= 1) {
      return;
    }
    this.lightboxIndex.update((i) => (i === null ? null : (i + 1) % total));
  }

  onLightboxBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeLightbox();
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
      const pedido = await this.api.getPedido(id);
      if (!pedido) {
        throw new Error('Pedido no encontrado');
      }

      this.pedidoCargado.set(pedido);
      this.currentFolio.set(pedido.folio || '');
      this.estadoOriginal.set(pedido.estado);

      const totalVal = Number(pedido.monto_total) || 0;
      const pendienteVal = Number(pedido.saldo_pendiente) || 0;
      const descuentoVal = Number(pedido.descuento_aplicado) || 0;
      this.montoPagadoInicial.set(Math.max(0, totalVal - descuentoVal - pendienteVal));
      this.descuentoInicial.set(descuentoVal);

      const evidencias = await this.api.listEvidencias(id);
      const fechaLocal =
        formatLocalDateFromInput(pedido.fecha_entrega_estimada) ||
        formatLocalDateFromInput(new Date());

      this.form.patchValue(
        {
          cliente_nombre: pedido.cliente_nombre || '',
          cliente_telefono: pedido.cliente_telefono || '',
          cliente_id: pedido.cliente_id || '',
          sucursal_id: pedido.sucursal_id || '',
          descripcion: pedido.descripcion || '',
          monto_total: totalVal,
          saldo_pendiente: pendienteVal,
          fecha_entrega_estimada: fechaLocal,
          estado: pedido.estado,
        },
        { emitEvent: false }
      );

      if (pedido.cliente_id) {
        const fallbackCliente: Cliente = {
          id: pedido.cliente_id,
          nombre: pedido.cliente_nombre || '',
          telefono: pedido.cliente_telefono || '',
          permite_whatsapp: true,
          frecuencia_recordatorio: 0,
          monedero: 0,
        };
        try {
          const clienteReal = await this.api.getCliente(pedido.cliente_id);
          this.selectedCliente.set(clienteReal ?? fallbackCliente);
        } catch {
          this.selectedCliente.set(fallbackCliente);
        }

        this.form.controls.cliente_nombre.disable({ emitEvent: false });
        this.form.controls.cliente_telefono.disable({ emitEvent: false });
      }

      this.syncFormSignals();
      this.fotos.set(
        evidencias.map((ev) => ({
          url: ev.url,
          id: ev.id,
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
    if (!base) {
      return;
    }
    const v = this.form.getRawValue();
    const sucursalNombre =
      this.sucursales().find((s) => s.id === v.sucursal_id)?.nombre || base.sucursal_nombre;
    const pedidoVista: Pedido = {
      ...base,
      cliente_nombre: v.cliente_nombre || base.cliente_nombre,
      cliente_telefono: v.cliente_telefono || base.cliente_telefono,
      descripcion: v.descripcion || base.descripcion,
      monto_total: Number(v.monto_total || 0),
      saldo_pendiente: Number(v.saldo_pendiente || 0),
      fecha_entrega_estimada:
        formatLocalDateFromInput(v.fecha_entrega_estimada) || base.fecha_entrega_estimada,
      sucursal_nombre: sucursalNombre,
    };

    this.dialog.open<TicketDialogComponent, TicketDialogData>(TicketDialogComponent, {
      data: { pedido: pedidoVista, esCreacion: false },
      width: '390px',
    });
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.formInvalid.set(true);
      this.submitAttempted.set(true);
      return;
    }
    if (this.saving()) {
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
      const dialogRef = this.dialog.open<
        EntregaDialogComponent,
        EntregaDialogData,
        EntregaDialogResponse | undefined
      >(EntregaDialogComponent, {
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
      if (!decision) {
        return;
      }

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

      // Envia fecha local YYYY-MM-DD sin pasar por toISOString para evitar desfase UTC
      const fechaEntregaIso = formatLocalDateFromInput(v.fecha_entrega_estimada) || undefined;
      const sucursalNombre =
        this.sucursales().find((s) => s.id === v.sucursal_id)?.nombre || 'Mostrador';
      let resultadoPedido: Pedido;

      const currentPedidoId = this.pedidoId();
      if (this.isEdit() && currentPedidoId) {
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
        resultadoPedido = await this.api.updatePedido(currentPedidoId, updatePayload);
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
          ...(anticipo > 0 && this.categoriaIngresoId()
            ? { categoria_ingreso_id: this.categoriaIngresoId() }
            : {}),
        };
        resultadoPedido = await this.api.createPedido(createPayload);
      }

      const pedidoIdFinal = resultadoPedido.id;
      const nuevasFotos = this.fotos().filter(
        (foto): foto is FotoPreview & { file: File } => Boolean(foto.file)
      );
      if (pedidoIdFinal && nuevasFotos.length > 0) {
        const uploads = nuevasFotos.map((foto) =>
          this.api.uploadEvidencia(pedidoIdFinal, foto.file, 'ingreso', v.evidencia_nota || '')
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

        const ticketRef = this.dialog.open<TicketDialogComponent, TicketDialogData>(
          TicketDialogComponent,
          {
            data: {
              pedido: pedidoEnriquecido,
              esCreacion: true,
              metodoPagoTexto: etiquetaMetodo,
            },
            width: '390px',
          }
        );

        await firstValueFrom(ticketRef.afterClosed());
        await this.router.navigateByUrl('/pedidos');
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
        await this.router.navigateByUrl('/pedidos');
        return;
      }

      if (esListo && this.estadoOriginal() !== 'listo') {
        if (resultadoPedido.whatsapp_disparado) {
          this.snack.open(
            `Pedido ${resultadoPedido.folio} LISTO y cliente notificado por WhatsApp`,
            'OK',
            { duration: 3500 }
          );
          await this.router.navigateByUrl('/pedidos');
          return;
        }

        if (telefonoCliente) {
          const dialogRef = this.dialog.open<
            AccionPedidoDialogComponent,
            AccionPedidoDialogData,
            string | undefined
          >(AccionPedidoDialogComponent, {
            data: {
              titulo: 'Pedido listo',
              mensaje: `El pedido ${resultadoPedido.folio} para ${nombreCliente} está listo. ¿Deseas avisarle por WhatsApp?`,
              acciones: [
                {
                  texto: 'Avisar por WhatsApp',
                  icono: 'chat',
                  valor: 'whatsapp',
                  color: 'whatsapp',
                },
              ],
            },
            disableClose: true,
            width: '400px',
            panelClass: 'custom-modal-panel',
          });

          const accion = await firstValueFrom(dialogRef.afterClosed());
          if (accion === 'whatsapp') {
            this.pedidoActions.sendWhatsapp({ ...pedidoEnriquecido, estado: 'listo' });
          }
        }
        await this.router.navigateByUrl('/pedidos');
        return;
      }

      this.snack.open('Pedido actualizado', 'OK', { duration: 2500 });
      await this.router.navigateByUrl('/pedidos');
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

  cancelar(): void {
    this.location.back();
  }

  private syncFormSignals(): void {
    const v = this.form.getRawValue();
    this.montoTotal.set(Number(v.monto_total) || 0);
    this.saldoPendiente.set(Number(v.saldo_pendiente) || 0);
    this.fechaEntrega.set(formatLocalDateFromInput(v.fecha_entrega_estimada));
    this.estadoActual.set(v.estado || 'recibido');
    this.sucursalSeleccionada.set(v.sucursal_id || '');
    this.formInvalid.set(this.form.invalid);
  }

  private reconcileLightboxAfterRemoval(removedIndex: number): void {
    const current = this.lightboxIndex();
    if (current === null) {
      return;
    }
    const remaining = this.fotos().length;
    if (remaining === 0) {
      this.lightboxIndex.set(null);
    } else if (current >= remaining) {
      this.lightboxIndex.set(remaining - 1);
    } else if (removedIndex < current) {
      this.lightboxIndex.set(current - 1);
    }
  }

  private readStorage(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private writeStorage(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Ignora restricciones de almacenamiento privado del navegador
    }
  }

  private readStoredTarifaKg(): number {
    const parsed = Number(this.readStorage(STORAGE_TARIFA_KG) || 0);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
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
        let width = img.naturalWidth;
        let height = img.naturalHeight;

        if (width > MAX_IMAGE_DIM || height > MAX_IMAGE_DIM) {
          if (width >= height) {
            height = Math.round((height * MAX_IMAGE_DIM) / width);
            width = MAX_IMAGE_DIM;
          } else {
            width = Math.round((width * MAX_IMAGE_DIM) / height);
            height = MAX_IMAGE_DIM;
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
}
