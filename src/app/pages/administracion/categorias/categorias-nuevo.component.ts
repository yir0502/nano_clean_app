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
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { AuthService } from '../../../core/auth.service';

import { ApiClientService } from '../../../core/api-client.service';

@Component({
  selector: 'app-categorias-nuevo',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule, 
    MatToolbarModule, MatIconModule, MatSnackBarModule, MatProgressSpinnerModule,
    MatButtonToggleModule
  ],
  template: `
    <div class="header-content">
      <button mat-icon-button (click)="close()">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <h2>Nueva Categoría</h2>
    </div>

    <div class="content-container">
      <mat-card>
        
      <p class="form-title">Registrar Sucursal</p>

      <mat-card-content>
          <form [formGroup]="form">

            <div class="type-selector">
              <mat-button-toggle-group formControlName="tipo" class="full-width-toggle">
                <mat-button-toggle value="ingreso" class="toggle-ingreso">
                  <mat-icon>arrow_upward</mat-icon> Ingreso
                </mat-button-toggle>
                <mat-button-toggle value="egreso" class="toggle-egreso">
                  <mat-icon>arrow_downward</mat-icon> Egreso
                </mat-button-toggle>
              </mat-button-toggle-group>
            </div>
            
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Nombre de la Categoría</mat-label>
              <input matInput formControlName="nombre" placeholder="Ej. Ventas, Suministros" autocomplete="off">
              <mat-error *ngIf="form.controls.nombre.invalid">Requerido</mat-error>
            </mat-form-field>

          </form>
        </mat-card-content>

      </mat-card>
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
    </div>
  `,
  styles: [`
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
    .form-title {
      font-size: 1.1em;
      font-weight: 600;
      margin-top: 0;
    }

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
    .content-container { padding: 16px; max-width: 600px; margin: 0 auto; }
    .full-width { width: 100%; margin-bottom: 8px; }
    
    /* Estilos del Toggle iguales a movimientos para consistencia visual */
    .type-selector { margin-bottom: 20px; text-align: center; }
    .full-width-toggle { width: 100%; display: flex; }
    .full-width-toggle mat-button-toggle { flex: 1; }
    
    /* Colores opcionales para diferenciar visualmente */
    ::ng-deep .toggle-ingreso.mat-button-toggle-checked { background-color: #e8f5e9 !important; color: #2e7d32 !important; }
    ::ng-deep .toggle-egreso.mat-button-toggle-checked { background-color: #ffebee !important; color: #c62828 !important; }

    mat-spinner { display: inline-block; margin-right: 8px; vertical-align: middle; }
  `]
})
export class CategoriasNuevoComponent {
  private fb = inject(FormBuilder);
  private api = inject(ApiClientService);
  private router = inject(Router);
  private snack = inject(MatSnackBar);
  private location = inject(Location);
  private auth = inject(AuthService);

  saving = signal<boolean>(false);

  form = this.fb.group({
    nombre: this.fb.nonNullable.control<string>('', { validators: [Validators.required] }),
    tipo: this.fb.nonNullable.control<'ingreso'|'egreso'>('egreso', { validators: [Validators.required] }),
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
      await this.api.createCategoria(v); 
      
      this.snack.open('Categoría creada exitosamente', 'OK', { duration: 2500 });
      this.close();
    } catch (e: any) {
      console.error(e);
      this.snack.open(e?.message || 'Error al guardar categoría', 'OK', { duration: 3000 });
    } finally {
      this.saving.set(false);
    }
  }

  close() {
    if (window.history.length > 1) {
      this.location.back();
    } else {
      this.router.navigateByUrl('/administracion');
    }
  }
}