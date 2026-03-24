import { Component, inject } from '@angular/core';
import { NgIf } from '@angular/common';
import { LoaderService } from '../../core/loader.service';

@Component({
  selector: 'app-loader',
  standalone: true,
  imports: [NgIf],
  template: `
    <div class="loader-pill" *ngIf="isLoading()">
      <div class="bubbly-spinner"></div>
      <span>Procesando...</span>
    </div>
  `,
  styles: [`
    .loader-pill {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 10px;
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: saturate(180%) blur(12px);
      -webkit-backdrop-filter: saturate(180%) blur(12px);
      padding: 8px 18px 8px 12px;
      border-radius: 50px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.08);
      pointer-events: none;

      opacity: 0;
      transform: translateY(-10px);
      animation: slideIn 0.3s ease-out 0.1s forwards;
    }

    .loader-pill span {
      font-size: 13px;
      font-weight: 600;
      color: #0073ff;
      letter-spacing: 0.3px;
      animation: pulse 1.5s infinite ease-in-out;
    }

    .bubbly-spinner {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: conic-gradient(from 0deg, #0073ff, #ff41f8, #0073ff);
      mask-image: radial-gradient(transparent 55%, black 56%);
      -webkit-mask-image: radial-gradient(transparent 55%, black 56%);
      animation: spin 1s linear infinite;
      flex-shrink: 0;
    }

    @keyframes spin {
      100% { transform: rotate(360deg); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `]
})
export class LoaderComponent {
  private loader = inject(LoaderService);
  isLoading = this.loader.isLoading;
}
