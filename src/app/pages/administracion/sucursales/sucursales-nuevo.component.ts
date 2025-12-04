import { Component, inject, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

// Material Modules
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/auth.service';

import { ApiClientService } from '../../../core/api-client.service';

@Component({
  selector: 'app-sucursales-nuevo',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule, 
    MatToolbarModule, MatIconModule, MatSnackBarModule, MatProgressSpinnerModule
  ],
  template: `
    <mat-toolbar color="primary" class="sticky-toolbar">
      <button mat-icon-button (click)="close()">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <span>Nueva Sucursal</span>
    </mat-toolbar>

    <div class="content-container">
      <mat-card>
        <mat-card-header>
          <mat-card-title>Detalles</mat-card-title>
        </mat-card-header>
        
        <mat-card-content>
          <form [formGroup]="form">
            
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Nombre de la Sucursal</mat-label>
              <input matInput formControlName="nombre" placeholder="Ej. Sucursal Centro" autocomplete="off">
              <mat-error *ngIf="form.controls.nombre.invalid">Requerido</mat-error>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Dirección</mat-label>
              <input matInput formControlName="direccion" placeholder="Ej. Av. Principal #123" autocomplete="off">
            </mat-form-field>

          </form>
        </mat-card-content>

        <mat-card-actions align="end">
          <button mat-button (click)="close()" [disabled]="saving()">Cancelar</button>
          <button mat-raised-button color="primary" 
                  (click)="save()" 
                  [disabled]="form.invalid || saving()">
            <mat-icon *ngIf="!saving()">save</mat-icon>
            <mat-spinner *ngIf="saving()" diameter="20"></mat-spinner>
            <span *ngIf="!saving()"> Guardar</span>
            <span *ngIf="saving()"> Guardando...</span>
          </button>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
  styles: [`
    .sticky-toolbar { position: sticky; top: 0; z-index: 10; }
    .content-container { padding: 16px; max-width: 600px; margin: 0 auto; }
    .full-width { width: 100%; margin-bottom: 8px; }
    mat-card-actions button { min-width: 100px; }
    mat-spinner { display: inline-block; margin-right: 8px; vertical-align: middle; }
  `]
})
export class SucursalesNuevoComponent {
  private fb = inject(FormBuilder);
  private api = inject(ApiClientService);
  private router = inject(Router);
  private snack = inject(MatSnackBar);
  private location = inject(Location);
  private auth = inject(AuthService);
  
  saving = signal<boolean>(false);

  form = this.fb.group({
    nombre: this.fb.nonNullable.control<string>('', { validators: [Validators.required] }),
    direccion: this.fb.nonNullable.control<string>(''),
    activo: this.fb.nonNullable.control<boolean>(true),
    org_id: this.auth.orgId
  });

  async save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const v = this.form.getRawValue();

    try {
      // Asumiendo que existe este método en tu ApiClientService
      await this.api.createSucursal(v);
      
      this.snack.open('Sucursal creada exitosamente', 'OK', { duration: 2500 });
      this.close();
    } catch (e: any) {
      console.error(e);
      this.snack.open(e?.message || 'Error al guardar sucursal', 'OK', { duration: 3000 });
    } finally {
      this.saving.set(false);
    }
  }

  close() {
    // Intenta volver atrás en el historial, si no hay historial, va al listado
    if (window.history.length > 1) {
      this.location.back();
    } else {
      this.router.navigateByUrl('/administracion');
    }
  }
}