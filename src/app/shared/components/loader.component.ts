import { Component, inject } from '@angular/core';
import { NgIf } from '@angular/common';
import { LoaderService } from '../../core/loader.service';

@Component({
  selector: 'app-loader',
  standalone: true,
  imports: [NgIf],
  template: `
    <div class="loader-overlay" *ngIf="isLoading()">
      <div class="loader-container">
        <div class="bubbly-spinner"></div>
        <p>Procesando...</p>
      </div>
    </div>
  `,
  styles: [`
    .loader-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      /* Fondo desenfocado estilo glassmorphism */
      background: rgba(255, 255, 255, 0.4);
      backdrop-filter: saturate(180%) blur(8px);
      -webkit-backdrop-filter: saturate(180%) blur(8px);
      z-index: 9999; /* Asegura estar en lo más alto */
      display: flex;
      justify-content: center;
      align-items: center;
      
      /* Animación de entrada suave con un retraso estratégico de 100ms
         para evitar parpadeos visuales si la petición dura menos de eso. */
      opacity: 0;
      animation: fadeInOverlay 0.25s ease-out 0.1s forwards;
    }
    .loader-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      /* Pequeño overlay blanco translúcido alrededor del spinner */
      background: rgba(255, 255, 255, 0.75);
      padding: 30px 40px;
      border-radius: 24px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);

      /* Escala de rebote elegante centrada */
      transform: scale(0.9);
      animation: popInContainer 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.1s forwards;
    }
    .loader-container p {
      font-weight: 600;
      color: #0073ff;
      letter-spacing: 0.5px;
      margin: 0;
      animation: pulse 1.5s infinite ease-in-out;
    }
    .bubbly-spinner {
      width: 55px;
      height: 55px;
      border-radius: 50%;
      /* Colores dinámicos del estilo base */
      background: conic-gradient(from 0deg, #0073ff, #ff41f8, #0073ff);
      mask-image: radial-gradient(transparent 55%, black 56%);
      -webkit-mask-image: radial-gradient(transparent 55%, black 56%);
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      100% { transform: rotate(360deg); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    @keyframes fadeInOverlay {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes popInContainer {
      from { transform: scale(0.85); }
      to { transform: scale(1); }
    }
  `]
})
export class LoaderComponent {
  private loader = inject(LoaderService);
  // Vinculamos la señal del servicio a la plantilla
  isLoading = this.loader.isLoading;
}
