import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSelectModule } from '@angular/material/select';
import { Cliente } from '../../core/models';

@Component({
  selector: 'app-cliente-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule, 
    MatInputModule, MatFormFieldModule, MatSlideToggleModule, MatSelectModule
  ],
  template: `
    <h2 mat-dialog-title>{{ data ? 'Editar' : 'Nuevo' }} Cliente</h2>
    
    <form [formGroup]="form" (ngSubmit)="save()">
      <div mat-dialog-content class="dialog-content">
        
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Nombre Completo</mat-label>
          <input matInput formControlName="nombre" placeholder="Ej: Juan Pérez">
          <mat-error *ngIf="form.get('nombre')?.hasError('required')">Requerido</mat-error>
        </mat-form-field>

        <div class="row">
          <mat-form-field appearance="outline" class="half-width">
            <mat-label>Teléfono (WhatsApp)</mat-label>
            <input matInput formControlName="telefono" type="tel" placeholder="52...">
            <mat-error *ngIf="form.get('telefono')?.hasError('required')">Requerido</mat-error>
          </mat-form-field>
          
          <mat-form-field appearance="outline" class="half-width">
            <mat-label>Email (Opcional)</mat-label>
            <input matInput formControlName="email">
            <mat-error *ngIf="form.get('email')?.hasError('email')">Email inválido</mat-error>
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Dirección</mat-label>
          <textarea matInput formControlName="direccion" rows="2"></textarea>
        </mat-form-field>

        <hr class="divider">
        
        <div class="toggle-row">
          <span class="toggle-label">¿Permite notificaciones por WhatsApp?</span>
          <mat-slide-toggle formControlName="permite_whatsapp" color="primary">
            {{ form.get('permite_whatsapp')?.value ? 'Sí' : 'No' }}
          </mat-slide-toggle>
        </div>

        <mat-form-field appearance="outline" class="full-width" *ngIf="form.get('permite_whatsapp')?.value">
          <mat-label>Recordatorio automático</mat-label>
          <mat-select formControlName="frecuencia_recordatorio">
            <mat-option [value]="0">Manual (Sin automático)</mat-option>
            <mat-option [value]="7">Semanal (7 días)</mat-option>
            <mat-option [value]="15">Quincenal (15 días)</mat-option>
            <mat-option [value]="30">Mensual (30 días)</mat-option>
          </mat-select>
          <mat-hint>Cada cuánto recordarle traer ropa.</mat-hint>
        </mat-form-field>

      </div>

      <div mat-dialog-actions align="end">
        <button mat-button type="button" (click)="dialogRef.close()">Cancelar</button>
        <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid">Guardar</button>
      </div>
    </form>
  `,
  styles: [`
    .dialog-content { display: flex; flex-direction: column; gap: 12px; padding-top: 10px; min-width: 300px; }
    .full-width { width: 100%; }
    .row { display: flex; gap: 12px; }
    .half-width { flex: 1; }
    .divider { margin: 8px 0; border: 0; border-top: 1px solid #eee; }
    .toggle-row { display: flex; justify-content: space-between; align-items: center; background: #f9fafb; padding: 12px; border-radius: 8px; }
    .toggle-label { font-size: 14px; font-weight: 500; color: #374151; }
  `]
})
export class ClienteDialogComponent implements OnInit {
  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<ClienteDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Cliente | null
  ) {
    this.form = this.fb.group({
      nombre: ['', Validators.required],
      telefono: ['', [Validators.required, Validators.minLength(10)]],
      email: ['', [Validators.email]],
      direccion: [''],
      permite_whatsapp: [true],
      frecuencia_recordatorio: [15],
      org_id: localStorage.getItem('sb_org_id') || ''
    });
  }

  ngOnInit(): void {
    if (this.data) {
      this.form.patchValue(this.data);
    }
  }

  save() {
    if (this.form.valid) {
      this.dialogRef.close(this.form.value);
    }
  }
}