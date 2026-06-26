// src/app/app.config.ts
import { ApplicationConfig, isDevMode, LOCALE_ID } from '@angular/core';
import { provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './core/auth.interceptor';
import { loaderInterceptor } from './core/loader.interceptor';
import { MAT_SNACK_BAR_DEFAULT_OPTIONS } from '@angular/material/snack-bar';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideAnimations(),
    { provide: LOCALE_ID, useValue: 'es-MX' },
    provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode() }),
    
    // Interceptores: Autenticación global y Loader automático
    provideHttpClient(withFetch(), withInterceptors([authInterceptor, loaderInterceptor])), 

    // Configuración por defecto para avisos y notificaciones (Toast)
    { 
      provide: MAT_SNACK_BAR_DEFAULT_OPTIONS, 
      useValue: { 
        duration: 2500, 
        horizontalPosition: 'center', 
        verticalPosition: 'bottom' 
      } 
    }
  ],
};