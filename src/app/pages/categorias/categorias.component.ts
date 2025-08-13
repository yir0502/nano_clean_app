import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiClientService } from '../../core/api-client.service';
import { Categoria } from '../../core/models';

@Component({
  selector: 'app-categorias',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './categorias.component.html',
  styleUrls: ['./categorias.component.scss']
})
export class CategoriasComponent implements OnInit {
  ingresos = signal<Categoria[]>([]);
  egresos  = signal<Categoria[]>([]);
  constructor(private api: ApiClientService){}
  async ngOnInit(){
    this.ingresos.set(await this.api.listCategorias('ingreso'));
    this.egresos.set(await this.api.listCategorias('egreso'));
  }
}