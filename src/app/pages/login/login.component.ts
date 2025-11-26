import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { SharedModule } from '../../shared/shared.module';
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, SharedModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  loading = false;
  err = '';
  fg!: FormGroup;
  hide = true;
  shake = false;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.fg = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  async submit() {
    this.err = '';
    this.loading = true;
    try {
      const { email, password } = this.fg.getRawValue();
      await this.auth.login(String(email), String(password));
      this.router.navigateByUrl('/resumen');
    } catch (e: any) {
      this.err = e?.message || 'Error de autenticación';
      // Activa el shake por ~450 ms
      this.shake = false; // resetea si ya estaba
      requestAnimationFrame(() => {
        this.shake = true;
        setTimeout(() => (this.shake = false), 500);
      });

      // (Opcional) vibración leve en móviles
      if ('vibrate' in navigator) { try { navigator.vibrate?.(60); } catch { } }
    } finally {
      this.loading = false;
    }
  }
}