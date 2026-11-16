import { Component, ElementRef, OnDestroy, AfterViewInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
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
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="scanner-modal">
      <div class="scanner-header">
        <div class="title-wrap">
          <mat-icon>qr_code_scanner</mat-icon>
          <h3>Escanear Ticket o Bolsa</h3>
        </div>
        <button mat-icon-button (click)="cerrar()" aria-label="Cerrar escáner">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="viewport">
        <video #videoEl autoplay playsinline muted></video>
        <canvas #canvasEl class="hidden-canvas"></canvas>
        <div class="reticle" *ngIf="!errorCamara()"></div>
        <div class="error-overlay" *ngIf="errorCamara()">
          <mat-icon>videocam_off</mat-icon>
          <p>{{ errorCamara() }}</p>
        </div>
      </div>

      <p class="hint">
        Apunta al código QR del ticket o talón de bolsa para localizar o entregar el pedido al instante.
      </p>

      <button mat-stroked-button class="btn-cancel" (click)="cerrar()">
        Cancelar
      </button>
    </div>
  `,
  styles: [`
    .scanner-modal {
      padding: 16px;
      max-width: 380px;
      font-family: 'Roboto', 'Helvetica Neue', sans-serif;
    }
    .scanner-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .title-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #0f172a;
    }
    .title-wrap h3 {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 700;
    }
    .viewport {
      position: relative;
      width: 100%;
      aspect-ratio: 1;
      background: #0f172a;
      border-radius: 14px;
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
      border-radius: 16px;
      box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.42);
      pointer-events: none;
    }
    .error-overlay {
      position: absolute;
      inset: 0;
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      color: #f8fafc;
      gap: 8px;
    }
    .error-overlay mat-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
      color: #f87171;
    }
    .hint {
      font-size: 12px;
      color: #475569;
      text-align: center;
      margin: 12px 0;
      line-height: 1.4;
    }
    .btn-cancel {
      width: 100%;
      height: 42px;
      border-radius: 10px !important;
    }
  `],
})
export class QrScannerDialogComponent implements AfterViewInit, OnDestroy {
  @ViewChild('videoEl') videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasEl') canvasRef!: ElementRef<HTMLCanvasElement>;

  private dialogRef = inject(MatDialogRef<QrScannerDialogComponent>);
  private stream: MediaStream | null = null;
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private detector: NativeBarcodeDetector | null = null;
  private scanningFrame = false;

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
    this.detenerRecursos();
  }

  private async iniciarCamara(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.errorCamara.set('Este navegador no permite acceso a la cámara. Usa un lector USB/Bluetooth o escribe el folio.');
      return;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      const video = this.videoRef.nativeElement;
      video.srcObject = this.stream;
      await video.play();

      this.scanTimer = setInterval(() => {
        void this.procesarFrame();
      }, 140);
    } catch {
      this.errorCamara.set('No se pudo abrir la cámara. Verifica los permisos del navegador.');
    }
  }

  private async procesarFrame(): Promise<void> {
    if (this.scanningFrame) return;
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
  }

  cerrar(): void {
    this.detenerRecursos();
    this.dialogRef.close(null);
  }
}
