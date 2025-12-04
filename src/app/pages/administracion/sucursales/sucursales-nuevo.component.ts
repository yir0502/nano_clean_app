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
    <div class="header-content">
   <button mat-icon-button (click)="close()">
    <mat-icon>arrow_back</mat-icon>
   </button>
   <h2>Nueva Sucursal</h2>
  </div>

    <div class="content-container">
   
   <p class="form-title">Registrar Sucursal</p>
   
   <form [formGroup]="form">
    
        <mat-form-field appearance="outline" class="full-width">
     <mat-label>Nombre de la Sucursal*</mat-label>
     <input matInput formControlName="nombre" placeholder="Ej. Sucursal Centro" autocomplete="off">
     <mat-error *ngIf="form.controls.nombre.invalid">El nombre es requerido</mat-error>
    </mat-form-field>

   </form>
  </div>

    <div class="action-footer">
   <button mat-button class="cancel-button" (click)="close()" [disabled]="saving()">
    Cancelar
   </button>
   <button mat-flat-button class="save-button"
        (click)="save()" 
        [disabled]="form.invalid || saving()">
    <mat-icon *ngIf="!saving()">save</mat-icon>
    <mat-spinner *ngIf="saving()" diameter="20"></mat-spinner>
    <span *ngIf="!saving()"> Guardar</span>
   </button>
  </div>
 `,
  styles: [`
  /* --- Estilo de Encabezado --- */
  .header-content {
   display: flex;
   align-items: center;
   padding: 8px 16px;
   border-bottom: 1px solid #e0e0e0;
   background-color: white;
   position: sticky;
   top: 0;
   z-index: 10;
  }
  .header-content h2 { margin: 0 0 0 16px; font-weight: 500; font-size: 20px; }

  /* --- Contenedor Principal --- */
  .content-container { 
   padding: 16px; 
   max-width: 600px; 
   margin: 0 auto; 
  }
  .form-title {
   font-size: 1.1em;
   font-weight: 600;
   margin-top: 0;
  }
  .full-width { width: 100%; margin-bottom: 16px; }

  /* --- Estilo del Pie de Acción (Action Footer) --- */
  .action-footer {
   display: flex;
   justify-content: flex-end; /* Alinear a la derecha */
   padding: 8px 16px;
   background: white;
   border-top: 1px solid #e0e0e0;
   gap: 8px; /* Espacio entre botones */
  }

  /* Estilo de los botones */
  .save-button {
   background-color: #4CAF50; /* Un color verde para guardar, similar al check de la imagen 1 */
   color: white;
   height: 48px;
   padding: 0 24px;
  }
  .cancel-button {
   color: rgba(0, 0, 0, 0.6);
   height: 48px;
  }
  
  mat-spinner { 
   display: inline-block; 
   margin-right: 8px; 
   vertical-align: middle; 
  }
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