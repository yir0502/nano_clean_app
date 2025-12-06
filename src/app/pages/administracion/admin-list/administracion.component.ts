import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule, NgFor, NgIf } from '@angular/common';

// Módulos de Angular Material
import { MatCardModule } from '@angular/material/card';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { MatButtonModule } from '@angular/material/button';


interface AdminOption {
  label: string;
  icon: string;
  description: string;
  path: string;
}

@Component({
  selector: 'app-administracion',
  standalone: true,
  // Aquí importamos todos los módulos que usamos en la plantilla
  imports: [
    CommonModule, NgFor, NgIf, RouterLink,
    MatCardModule, MatToolbarModule, MatIconModule, MatListModule, MatDividerModule, MatButtonModule
  ],
  // Referenciamos los archivos externos
  templateUrl: './administracion.component.html',
  styleUrl: './administracion.component.scss' // Usaremos styleUrl para el archivo CSS/SCSS
})
export class AdministracionComponent {
  // Lista de opciones de administración
  adminOptions: AdminOption[] = [
    {
      label: 'Categorías',
      icon: 'category',
      description: 'Gestiona categorías de Ingresos y Egresos.',
      path: 'categorias/listado'
    },
    {
      label: 'Sucursales',
      icon: 'store',
      description: 'Define las sucursales y puntos de venta.',
      path: 'sucursales/listado'
    } 
  ];
}