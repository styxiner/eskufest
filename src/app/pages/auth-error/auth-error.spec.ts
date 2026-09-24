import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { createAuthServiceMock, provideAuthMocks } from '../../../testing/auth.mocks';
import { AuthErrorPage } from './auth-error';

describe('AuthErrorPage', () => {
  function render(error: unknown) {
    const auth = createAuthServiceMock();
    auth.error$.next(error);
    TestBed.configureTestingModule({
      imports: [AuthErrorPage],
      providers: [provideAuthMocks(auth), provideRouter([]), provideHttpClient()],
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(AuthErrorPage);
    fixture.detectChanges();
    return { fixture, navigate, auth };
  }

  it('redirects to the pending screen when the Action denied an unapproved user', () => {
    const { navigate } = render({ error: 'access_denied', error_description: 'pending_approval' });
    expect(navigate).toHaveBeenCalledWith('/pending', { replaceUrl: true });
  });

  it('shows a generic message and never renders the error description', () => {
    const payload = '<img src=x onerror=alert(1)>Llama al 555';
    const { fixture, navigate } = render({ error: 'access_denied', error_description: payload });
    const element = fixture.nativeElement as HTMLElement;
    expect(navigate).not.toHaveBeenCalled();
    expect(element.textContent).toContain('No se ha podido iniciar sesión');
    expect(element.textContent).not.toContain('555');
    expect(element.querySelector('img')).toBeNull();
  });

  it('offers to log in again', () => {
    const { fixture, auth } = render({ error: 'server_error' });
    (fixture.nativeElement as HTMLElement).querySelector('button')?.click();
    expect(auth.loginWithRedirect).toHaveBeenCalled();
  });
});
