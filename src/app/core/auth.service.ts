import { Injectable, signal } from '@angular/core';
import { ENV } from './env';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private tokenKey = 'sb_token';
  private orgKey = 'sb_org_id';

  isLoggedIn = signal<boolean>(!!localStorage.getItem(this.tokenKey));

  get token() { return localStorage.getItem(this.tokenKey) || ''; }
  get orgId() { return localStorage.getItem(this.orgKey) || ''; }

  isTokenExpired(): boolean {
    const t = this.token;
    if (!t) return true;
    try {
      const payloadBase64 = t.split('.')[1];
      const decodedJson = atob(payloadBase64);
      const payload = JSON.parse(decodedJson);
      if (!payload.exp) return false; 
      // Si la fecha actual en segundos supera la fecha exp (menos 5s de margen), expiró
      return (Date.now() / 1000) > (payload.exp - 5);
    } catch (e) {
      return true; // Token malformado
    }
  }

  async login(email: string, password: string) {
    const r = await fetch(`${ENV.API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!r.ok) {
      const e = await r.json().catch(()=>({error:r.statusText}));
      throw new Error(e.error || 'Login failed');
    }
    const data = await r.json();
    const token = data?.access_token;
    const orgId = data?.org_id;
    if (!token) throw new Error('No token from server');
    localStorage.setItem(this.tokenKey, token);
    if (orgId) localStorage.setItem(this.orgKey, orgId);
    this.isLoggedIn.set(true);
  }

  logout(){
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.orgKey);
    this.isLoggedIn.set(false);
  }
}