import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormGroup } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { ApiClientService } from '../../core/api-client.service';
import { Categoria, Movimiento } from '../../core/models';

@Component({
  selector: 'app-movimiento-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  templateUrl: './movimiento-form.component.html',
  styleUrls: ['./movimiento-form.component.scss']
})
export class MovimientoFormComponent implements OnInit {
  categorias: Categoria[] = [];
  id?: string;
  fg!: FormGroup;

  constructor(
    private fb: FormBuilder,
    private api: ApiClientService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  async ngOnInit() {
    this.fg = this.fb.group({
      tipo: ['ingreso', Validators.required],
      monto: [0, [Validators.required, Validators.min(0)]],
      fecha: [new Date().toISOString().slice(0,10), Validators.required],
      categoria_id: [''],
      metodo_pago: [''],
      nota: ['']
    });

    this.categorias = await this.api.listCategorias();
    this.id = this.route.snapshot.paramMap.get('id') || undefined;
  }

  async save(){
    const payload = this.fg.getRawValue() as Omit<Movimiento,'id'|'org_id'>;
    if (!this.id) await this.api.createMovimiento(payload as any);
    else await this.api.updateMovimiento(this.id, payload);
    this.router.navigate(['/movimientos']);
  }
}