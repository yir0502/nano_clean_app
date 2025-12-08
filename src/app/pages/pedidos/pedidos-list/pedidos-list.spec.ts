import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PedidosListComponent } from './pedidos-list';

describe('PedidosListComponent', () => {
  let component: PedidosListComponent;
  let fixture: ComponentFixture<PedidosListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PedidosListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PedidosListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
