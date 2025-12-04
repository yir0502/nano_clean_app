import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

// Material Modules
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

// Servicios y Modelos
import { ApiClientService } from '../../../core/api-client.service';
import { Categoria } from '../../../core/models';

@Component({
  selector: 'app-categorias-listado',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule, MatIconModule, MatButtonModule, MatListModule, 
    MatDividerModule, MatProgressSpinnerModule
  ],
  template: `
    <div class="sticky-toolbar">
      <div class="title-toolbar">
        <button mat-icon-button (click)="goToAdmin()">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <h2>Listado de Categorías</h2>
      </div>
      <p>Gestionar Tipos de Transacciones de Ingresos y Egresos.</p>
    </div>

    <div class="content-container">
      
      <div *ngIf="loading()">
        <mat-spinner diameter="30"></mat-spinner>
        <p>Cargando categorías...</p>
      </div>

      <div *ngIf="!loading() && categorias().length === 0" class="empty-state">
        <mat-icon>sentiment_dissatisfied</mat-icon>
        <p>No se encontraron categorías.</p>
      </div>

    <mat-nav-list *ngIf="!loading() && categorias().length > 0">
      <div *ngFor="let categoria of categorias(); let last = last">
        
        <div mat-list-item class="categoria-item">
          <mat-icon matListItemIcon 
                    [color]="categoria.tipo === 'ingreso' ? 'primary' : 'warn'">
            {{ categoria.tipo === 'ingreso' ? 'arrow_upward' : 'arrow_downward' }}
          </mat-icon>
          <div matListItemTitle>{{ categoria.nombre }}</div>
          <div matListItemLine>{{ getTipoLabel(categoria.tipo) }}</div>

          <button mat-icon-button 
                  matListItemMeta 
                  color="warn" 
                  (click)="deleteCategoria($event, categoria.id, categoria.nombre)">
            <mat-icon>delete</mat-icon>
          </button>
        </div>
        <mat-divider *ngIf="!last"></mat-divider>
      </div>
    </mat-nav-list>

    </div>
  `,
  styles: [`
    .title-toolbar { display: flex; align-items: center; }
    .title-toolbar h2 { margin: 0 0 0 8px; }
    .title-toolbar button mat-icon { color: black; }
    
    .sticky-toolbar p { margin: 0 12px; font-size: 13px;}
    .sticky-toolbar { position: sticky; top: 45px; z-index: 10; background: white; padding: 10px 0 10px 0; border-bottom: 1px solid #e0e0e0; }

    .content-container { padding: 12px; max-width: 800px; padding-bottom: 120px; margin-top: 30px; }
    
    .empty-state {
      text-align: center;
      padding: 40px 0;
      color: rgba(0, 0, 0, 0.54);
    }
    .empty-state mat-icon { font-size: 48px; height: 48px; width: 48px; margin-bottom: 16px; }

    mat-nav-list .categoria-item{ 
      border-radius: 4px; 
      display: grid; 
      grid-template-columns: auto 1fr auto auto; 
      align-items: center;
      justify-content: start;
      gap: 12px;
      padding: 8px 0;
      margin: 4px 0;
    }
  `]
})
export class CategoriasListadoComponent implements OnInit {
  private api = inject(ApiClientService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  categorias = signal<Categoria[]>([]);
  loading = signal(true);

  ngOnInit() {
    this.loadCategorias();
  }

  async loadCategorias() {
    this.loading.set(true);
    try {
      // Cargamos todas las categorías (sin filtro de tipo)
      const data = await this.api.listCategorias(); 
      this.categorias.set(data);
    } catch (e) {
      this.snackBar.open('Error al cargar categorías', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading.set(false);
    }
  }

  async deleteCategoria(event: MouseEvent, id: string, nombre: string) {
      // Ya no es estrictamente necesario, pero es un buen hábito.
      event.stopPropagation(); 
      
      const confirmacion = confirm(`¿Estás seguro de que deseas eliminar la categoría "${nombre}"? Esta acción no se puede deshacer.`);

      if (confirmacion) {
        this.loading.set(true); 
        
        try {
          await this.api.deleteCategoria(id);

          this.snackBar.open(`Categoría "${nombre}" eliminada con éxito.`, 'Cerrar', { duration: 3000 });
          this.loadCategorias(); 

        } catch (e: any) {
          // En caso de error, el control se queda aquí.
          console.error("Error al eliminar categoría:", e);
          this.snackBar.open(e?.message || 'Error al intentar eliminar la categoría.', 'Cerrar', { duration: 5000 });
          this.loading.set(false); // Desactiva el spinner y MANTIENE la vista.
        }
      } 
      // Si el usuario cancela, el flujo termina aquí, y la vista permanece.
  }

  getTipoLabel(tipo: 'ingreso' | 'egreso'): string {
    return tipo === 'ingreso' ? 'Tipo: Ingreso' : 'Tipo: Egreso';
  }

  goToAdmin() {
    this.router.navigate(['/administracion']);
  }
}