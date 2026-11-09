import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import {
  MatDialogModule,
  MAT_DIALOG_DATA,
  MatDialogTitle,
  MatDialogContent,
  MatDialogActions,
} from '@angular/material/dialog';

@Component({
  selector: 'app-campaign-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatDialogModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
  ],
  template: `
    <h2 mat-dialog-title>⚙️ Plantillas de Campaña</h2>
    <div mat-dialog-content class="form-cols">
      <p class="mb-4 text-gray-600" style="font-size: 13px;">
        Usa <strong>[Nombre]</strong> y <strong>[Monedero]</strong> para personalizar. Los textos quedarán guardados en tu dispositivo.
      </p>

      <h3>Mensaje Promocional</h3>
      <mat-form-field appearance="outline" style="width: 100%">
        <mat-label>Plantilla de texto</mat-label>
        <textarea matInput rows="3" [(ngModel)]="data.promoMsg"></textarea>
      </mat-form-field>

      <mat-form-field appearance="outline" style="width: 100%">
        <mat-label>Link de Imágen / Página (Opcional)</mat-label>
        <input matInput [(ngModel)]="data.promoLink" placeholder="https://imgur.com/...jpg">
        <mat-hint>Pegar link para crear vista previa en WhatsApp.</mat-hint>
      </mat-form-field>

      <h3 style="margin-top: 16px;">Recordatorio</h3>
      <mat-form-field appearance="outline" style="width: 100%">
        <mat-label>Plantilla para inactivos</mat-label>
        <textarea matInput rows="3" [(ngModel)]="data.remMsg"></textarea>
      </mat-form-field>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" [mat-dialog-close]="data">Guardar Plantillas</button>
    </div>
  `,
  styles: [`
    .form-cols { display: flex; flex-direction: column; gap: 4px; padding-top: 10px; min-width: 320px; }
    h3 { font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #3f51b5; }
  `],
})
export class CampaignSettingsDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: any) {}
}

