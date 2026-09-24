import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { createAuthServiceMock, provideAuthMocks, type AuthServiceMock } from '../testing/auth.mocks';
import { App } from './app';

describe('App', () => {
  function render(auth: AuthServiceMock) {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideAuthMocks(auth), provideRouter([]), provideHttpClient()],
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const logoutButton = (el: HTMLElement) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Cerrar sesión'));

  it('renders the header and a main landmark', () => {
    const el = render(createAuthServiceMock());
    expect(el.querySelector('h1')?.textContent).toContain('Álbum');
    expect(el.querySelector('main')).not.toBeNull();
  });

  it('shows a loading status while the SDK restores the session', () => {
    const el = render(createAuthServiceMock({ loading: true }));
    expect(el.querySelector('[role=status]')?.textContent).toContain('Cargando');
  });

  it('hides logout for anonymous users', () => {
    expect(logoutButton(render(createAuthServiceMock()))).toBeUndefined();
  });

  it('logs out from the header', () => {
    const auth = createAuthServiceMock({ authenticated: true });
    logoutButton(render(auth))?.click();
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });
});
