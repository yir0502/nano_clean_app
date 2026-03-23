import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { LoaderService } from './loader.service';

/**
 * Intercepta todas las llamadas HTTP salientes, activa el LoaderGlobal
 * y asegura que se apague cuando la petición finalice (éxito o error).
 */
export const loaderInterceptor: HttpInterceptorFn = (req, next) => {
  const loader = inject(LoaderService);
  
  // Encendemos el loader de manera asíncrona para no interferir con el ciclo actual de Angular
  Promise.resolve().then(() => loader.show());

  return next(req).pipe(
    // Apagamos al finalizar (falla o éxito)
    finalize(() => Promise.resolve().then(() => loader.hide()))
  );
};
