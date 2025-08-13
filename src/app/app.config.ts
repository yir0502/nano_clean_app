import { ApplicationConfig, isDevMode, LOCALE_ID } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withFetch } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimations(), // Si no quieres animaciones: provideNoopAnimations()
    { provide: LOCALE_ID, useValue: 'es-MX' },
    provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode() }),
    provideHttpClient(withFetch()),
  ],
};