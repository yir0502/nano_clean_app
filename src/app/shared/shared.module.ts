import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgChartsModule } from 'ng2-charts';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatListModule } from '@angular/material/list';
import { MatCardModule } from '@angular/material/card';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSnackBarModule } from '@angular/material/snack-bar';

@NgModule({
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, NgChartsModule,
    MatIconModule, MatButtonModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatListModule, MatCardModule, MatToolbarModule, MatSnackBarModule,
    MatButtonToggleModule
  ],
  exports: [
    CommonModule, FormsModule, ReactiveFormsModule, NgChartsModule,
    MatIconModule, MatButtonModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatListModule, MatCardModule, MatToolbarModule, MatSnackBarModule,
    MatButtonToggleModule
  ]
})
export class SharedModule {}
