import { Component, ElementRef, OnDestroy, AfterViewInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import jsQR from 'jsqr';

interface NativeBarcodeResult {
  rawValue?: string;
}

interface NativeBarcodeDetector {
  detect(source: HTMLVideoElement): Promise<NativeBarcodeResult[]>;
}

interface WindowWithBarcodeDetector {
  BarcodeDetector?: new (options: { formats: string[] }) => NativeBarcodeDetector;
}

@Component({
  selector: 'app-qr-scanner-dialog',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="scanner-modal">
      <header class="scanner-header">
        <div class="title-wrap">
          <span class="header-icon">
            <mat-icon aria-hidden="true">qr_code_scanner</mat-icon>
          </span>
          <h3>Escanear ticket o bolsa</h3>
        </div>
        <button type="button" class="btn-close" (click)="cerrar()" aria-label="Cerrar">
          <mat-icon aria-hidden="true">close</mat-icon>
        </button>
      </header>

      <div class="viewport">
        <video #videoEl autoplay playsinline muted></video>
        <canvas #canvasEl class="hidden-canvas"></canvas>
        <div class="reticle" *ngIf="!errorCamara() && !iniciandoCamara()"></div>

        <div class="loading-overlay" *ngIf="iniciandoCamara() && !errorCamara()">
          <mat-icon aria-hidden="true">videocam</mat-icon>
          <span>Iniciando cámara...</span>
        </div>

        <div class="error-overlay" *ngIf="errorCamara()" role="alert">
          <span class="error-icon">
            <mat-icon aria-hidden="true">videocam_off</mat-icon>
          </span>
          <p>{{ errorCamara() }}</p>
          <button type="button" class="btn-retry" (click)="reintentarCamara()">
            <mat-icon aria-hidden="true">refresh</mat-icon>
            <span>Reintentar</span>
          </button>
        </div>
      </div>

      <p class="hint">
        Apunta al código QR del ticket o talón de bolsa para localizar o entregar el pedido al instante.
      </p>

      <button type="button" class="btn-cancel" (click)="cerrar()">
        Cancelar
      </button>
    </div>
  `,
  styles: [`
    .scanner-modal {
      padding: 18px 20px 20px;
      max-width: 390px;
      background: #ffffff;
      font-family: var(--font-ui);
      font-variant-numeric: tabular-nums;
      color: #0f172a;
    }

    .scanner-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      margin-bottom: 14px;
    }

    .title-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .header-icon {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      flex-shrink: 0;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: var(--brand-primary, #196aff);
    }

    .header-icon mat-icon {
      font-size: 19px;
      width: 19px;
      height: 19px;
    }

    .title-wrap h3 {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.02em;
      line-height: 1.25;
    }

    .btn-close {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      padding: 0;
      border-radius: 10px;
      border: 1px solid #e2e8f0;
      background: #f8fafc;
      color: #475569;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease;
    }

    .btn-close:hover {
      background: #f1f5f9;
      border-color: #cbd5e1;
      color: #0f172a;
    }

    .btn-close mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    button:focus-visible {
      outline: 2px solid var(--brand-primary, #196aff);
      outline-offset: 2px;
    }

    .viewport {
      position: relative;
      width: 100%;
      aspect-ratio: 1;
      background: #0f172a;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .hidden-canvas {
      display: none;
    }

    .reticle {
      position: absolute;
      width: 66%;
      height: 66%;
      border: 2px solid #38bdf8;
      border-radius: 14px;
      box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.42);
      pointer-events: none;
    }

    .loading-overlay,
    .error-overlay {
      position: absolute;
      inset: 0;
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      background: rgba(15, 23, 42, 0.88);
      color: #f8fafc;
      gap: 10px;
    }

    .loading-overlay {
      font-size: 13px;
      font-weight: 600;
      color: #e2e8f0;
    }

    .loading-overlay mat-icon {
      font-size: 30px;
      width: 30px;
      height: 30px;
      color: #38bdf8;
    }

    .error-icon {
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: rgba(239, 68, 68, 0.16);
      border: 1px solid rgba(248, 113, 113, 0.32);
      color: #f87171;
    }

    .error-icon mat-icon {
      font-size: 26px;
      width: 26px;
      height: 26px;
    }

    .error-overlay p {
      margin: 0;
      font-size: 13px;
      line-height: 1.45;
      color: #f1f5f9;
      max-width: 260px;
    }

    .btn-retry {
      min-height: 38px;
      padding: 0 14px;
      border-radius: 10px;
      border: 0;
      background: var(--brand-primary, #196aff);
      color: #ffffff;
      font-family: inherit;
      font-size: 13px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      cursor: pointer;
    }

    .btn-retry mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .btn-retry:hover {
      filter: brightness(1.08);
    }

    .hint {
      font-size: 12.5px;
      color: #475569;
      text-align: center;
      margin: 12px 0 14px;
      line-height: 1.45;
    }

    .btn-cancel {
      width: 100%;
      min-height: 40px;
      padding: 8px 14px;
      border-radius: 10px;
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      color: #334155;
      font-family: inherit;
      font-size: 13.5px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
    }

    .btn-cancel:hover {
      background: #f1f5f9;
      border-color: #94a3b8;
      color: #0f172a;
    }
  `],
})
export class QrScannerDialogComponent implements AfterViewInit, OnDestroy {
  @ViewChild('videoEl') videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasEl') canvasRef!: ElementRef<HTMLCanvasElement>;

  private dialogRef = inject(MatDialogRef<QrScannerDialogComponent, string | null>);
  private stream: MediaStream | null = null;
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private detector: NativeBarcodeDetector | null = null;
  private scanningFrame = false;
  private destruido = false;

  iniciandoCamara = signal<boolean>(true);
  errorCamara = signal<string>('');

  async ngAfterViewInit(): Promise<void> {
    const win = window as Window & WindowWithBarcodeDetector;
    if (win.BarcodeDetector) {
      try {
        this.detector = new win.BarcodeDetector({ formats: ['qr_code'] });
      } catch {
        this.detector = null;
      }
    }
    await this.iniciarCamara();
  }

  ngOnDestroy(): void {
    this.destruido = true;
    this.detenerRecursos();
  }

  reintentarCamara(): void {
    this.detenerRecursos();
    void this.iniciarCamara();
  }

  private async iniciarCamara(): Promise<void> {
    this.errorCamara.set('');
    this.iniciandoCamara.set(true);

    if (!navigator.mediaDevices?.getUserMedia) {
      this.iniciandoCamara.set(false);
      this.errorCamara.set('Este navegador no permite acceso a la cámara. Usa un lector USB/Bluetooth o escribe el folio.');
      return;
    }

    try {
      const nuevoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (this.destruido) {
        nuevoStream.getTracks().forEach((t) => t.stop());
        return;
      }

      this.stream = nuevoStream;
      const video = this.videoRef.nativeElement;
      video.srcObject = this.stream;
      await video.play();

      if (this.destruido) {
        this.detenerRecursos();
        return;
      }

      this.iniciandoCamara.set(false);

      this.scanTimer = setInterval(() => {
        void this.procesarFrame();
      }, 140);
    } catch {
      if (this.destruido) return;
      this.iniciandoCamara.set(false);
      this.errorCamara.set('No se pudo abrir la cámara. Verifica los permisos del navegador.');
    }
  }

  private async procesarFrame(): Promise<void> {
    if (this.scanningFrame || this.destruido) return;
    const video = this.videoRef?.nativeElement;
    if (!video || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) return;

    this.scanningFrame = true;
    try {
      if (this.detector) {
        const barcodes = await this.detector.detect(video);
        const match = barcodes.find((b) => Boolean(b.rawValue?.trim()));
        if (match?.rawValue) {
          this.finalizarConValor(match.rawValue);
          return;
        }
      }

      const canvas = this.canvasRef.nativeElement;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w === 0 || h === 0) return;

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const decoded = jsQR(imageData.data, w, h, { inversionAttempts: 'dontInvert' });
      if (decoded?.data) {
        this.finalizarConValor(decoded.data);
      }
    } catch {
      // Ignorar errores transitorios de frame individual durante escaneo continuo
    } finally {
      this.scanningFrame = false;
    }
  }

  private finalizarConValor(raw: string): void {
    const match = /\b(LAV-[A-Z0-9]{4,8})\b/i.exec(raw.trim());
    const resultado = match ? match[1].toUpperCase() : raw.trim();
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(60);
    }
    this.destruido = true;
    this.detenerRecursos();
    this.dialogRef.close(resultado);
  }

  private detenerRecursos(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    const video = this.videoRef?.nativeElement;
    if (video && video.srcObject) {
      video.srcObject = null;
    }
  }

  cerrar(): void {
    this.destruido = true;
    this.detenerRecursos();
    this.dialogRef.close(null);
  }
}
