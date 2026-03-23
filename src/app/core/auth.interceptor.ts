import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  
  // 0. Validar proactivamente antes de enviar nada
  // Evitas que la app se quede colgada esperando al server si el token ya murió localmente
  if (auth.token && auth.isTokenExpired()) {
    auth.logout();
    router.navigateByUrl('/login');
    return throwError(() => new Error('Sesión expirada de manera local'));
  }

  const token = auth.token;

  // 1. Clonar la petición e inyectar el token si existe
  let authReq = req;
  if (token) {
    authReq = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
  }

  // 2. Manejar la respuesta y detectar errores 401
  return next(authReq).pipe(
    catchError((err) => {
      if (err.status === 401) {
        // Sesión expirada o inválida
        auth.logout();
        router.navigateByUrl('/login');
      }
      return throwError(() => err);
    })
  );
};