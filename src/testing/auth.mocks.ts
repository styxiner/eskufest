import { type Provider } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { BehaviorSubject, of, ReplaySubject } from 'rxjs';
import { vi } from 'vitest';

import { APP_CONFIG, type AppConfig } from '../app/core/config/app-config';

export const TEST_CONFIG: AppConfig = {
  auth0Domain: 'tenant.test.example',
  auth0ClientId: 'test-client-id',
  auth0Audience: 'https://api.test.example',
  apiUrl: 'https://api.test.example',
};

export function createAuthServiceMock({ authenticated = false, loading = false } = {}) {
  return {
    isAuthenticated$: new BehaviorSubject(authenticated),
    isLoading$: new BehaviorSubject(loading),
    user$: new BehaviorSubject<{ email?: string } | null>(authenticated ? { email: 'ana@test.example' } : null),
    error$: new ReplaySubject<unknown>(1),
    loginWithRedirect: vi.fn(() => of(undefined)),
    logout: vi.fn(() => of(undefined)),
    getAccessTokenSilently: vi.fn(() => of('token')),
  };
}

export type AuthServiceMock = ReturnType<typeof createAuthServiceMock>;

export function provideAuthMocks(auth: AuthServiceMock): Provider[] {
  return [
    { provide: AuthService, useValue: auth },
    { provide: APP_CONFIG, useValue: TEST_CONFIG },
  ];
}
