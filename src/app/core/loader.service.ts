import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoaderService {
  /**
   * Signal reactivo que mantiene el estado global de carga.
   * Se enciende cuando hay peticiones en curso.
   */
  isLoading = signal<boolean>(false);
  
  // Llevamos la cuenta en caso de que haya múltiples peticiones simultáneas
  private requestCount = 0;

  show() {
    this.requestCount++;
    this.isLoading.set(true);
  }

  hide() {
    this.requestCount--;
    if (this.requestCount <= 0) {
      this.requestCount = 0;
      this.isLoading.set(false);
    }
  }
}
