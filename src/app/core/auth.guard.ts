import { CanMatchFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

export const authGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  
  if (auth.isLoggedIn() && !auth.isTokenExpired()) {
    return true;
  }
  
  // Limpiar sesión basurizada si expiró y echar al usuario
  if (auth.isLoggedIn()) auth.logout();
  
  router.navigateByUrl('/login');
  return false;
};