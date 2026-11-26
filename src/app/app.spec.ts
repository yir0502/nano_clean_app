import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';

import { AppComponent } from './app.component';
import { AuthService } from './core/auth.service';

type AuthServiceStub = Pick<
  AuthService,
  'isLoggedIn' | 'token' | 'orgId' | 'isTokenExpired' | 'login' | 'logout'
>;

describe('AppComponent', () => {
  let authStub: AuthServiceStub;

  beforeEach(async () => {
    authStub = {
      isLoggedIn: signal<boolean>(false),
      token: '',
      orgId: '',
      isTokenExpired: () => false,
      login: async () => undefined,
      logout: jasmine.createSpy('logout'),
    };

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render app container and toolbar', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.app-container')).not.toBeNull();
    expect(compiled.querySelector('mat-toolbar')).not.toBeNull();
  });
});
