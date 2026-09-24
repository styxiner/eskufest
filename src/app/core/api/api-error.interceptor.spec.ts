import { HttpClient, type HttpInterceptorFn, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { throwError } from 'rxjs';
import { vi } from 'vitest';

import { APP_CONFIG } from '../config/app-config';
import { TEST_CONFIG } from '../../../testing/auth.mocks';
import { apiErrorInterceptor } from './api-error.interceptor';

/** Simulates authHttpInterceptorFn failing to obtain a token (refresh denied by the Action). */
let tokenError: unknown = null;
const fakeAuthInterceptor: HttpInterceptorFn = (req, next) => (tokenError ? throwError(() => tokenError) : next(req));

describe('apiErrorInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tokenError = null;
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_CONFIG, useValue: TEST_CONFIG },
        provideRouter([]),
        provideHttpClient(withInterceptors([apiErrorInterceptor, fakeAuthInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  it('sends users to /pending when the API says they are not approved, and still propagates the error', () => {
    const errors: unknown[] = [];
    http.get('https://api.test.example/api/media').subscribe({ error: (e) => errors.push(e) });
    controller
      .expectOne('https://api.test.example/api/media')
      .flush({ error: { code: 'not_approved', message: 'x' } }, { status: 403, statusText: 'Forbidden' });
    expect(navigate).toHaveBeenCalledWith('/pending');
    expect(errors).toHaveLength(1);
  });

  it('does not navigate for other API errors', () => {
    http.get('https://api.test.example/api/media/1').subscribe({ error: () => undefined });
    controller
      .expectOne('https://api.test.example/api/media/1')
      .flush({ error: { code: 'forbidden', message: 'x' } }, { status: 403, statusText: 'Forbidden' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores responses from other hosts, even with the same error shape', () => {
    http.get('https://api.test.example.evil.example/x').subscribe({ error: () => undefined });
    controller
      .expectOne('https://api.test.example.evil.example/x')
      .flush({ error: { code: 'not_approved', message: 'x' } }, { status: 403, statusText: 'Forbidden' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('sends revoked users to /pending when the token refresh is denied by the Action', () => {
    tokenError = { error: 'access_denied', error_description: 'pending_approval' };
    const errors: unknown[] = [];
    http.get('https://api.test.example/api/media').subscribe({ error: (e) => errors.push(e) });
    controller.expectNone('https://api.test.example/api/media');
    expect(navigate).toHaveBeenCalledWith('/pending');
    expect(errors).toEqual([tokenError]);
  });

  it('does not navigate for other token errors', () => {
    tokenError = { error: 'login_required' };
    http.get('https://api.test.example/api/media').subscribe({ error: () => undefined });
    expect(navigate).not.toHaveBeenCalled();
  });
});
