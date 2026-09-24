import { DOCUMENT } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { createAuthServiceMock, provideAuthMocks, TEST_CONFIG, type AuthServiceMock } from '../../../testing/auth.mocks';
import { APP_CONFIG } from '../config/app-config';
import { isPendingApprovalError, SessionService } from './session.service';

describe('SessionService', () => {
  let auth: AuthServiceMock;
  let service: SessionService;
  let http: HttpTestingController;

  beforeEach(() => {
    auth = createAuthServiceMock({ authenticated: true });
    TestBed.configureTestingModule({
      providers: [provideAuthMocks(auth), provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SessionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('exposes the authentication state from the SDK', () => {
    expect(service.isAuthenticated()).toBe(true);
    auth.isAuthenticated$.next(false);
    expect(service.isAuthenticated()).toBe(false);
  });

  it('loads /api/me once and caches it', () => {
    const results: unknown[] = [];
    service.loadMe().subscribe((me) => results.push(me));
    http.expectOne('https://api.test.example/api/me').flush({ sub: 'auth0|1', status: 'approved', role: 'member' });
    service.loadMe().subscribe((me) => results.push(me));
    http.expectNone('https://api.test.example/api/me');
    expect(results).toHaveLength(2);
    expect(service.me()?.status).toBe('approved');
  });

  it('logs in remembering the target route', () => {
    service.login('/album');
    expect(auth.loginWithRedirect).toHaveBeenCalledWith({ appState: { target: '/album' } });
  });

  it('opens the signup screen', () => {
    service.signup();
    expect(auth.loginWithRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ authorizationParams: { screen_hint: 'signup' } }),
    );
  });

  it('logs out locally and at Auth0, returning to the app root', () => {
    service.loadMe().subscribe();
    http.expectOne('https://api.test.example/api/me').flush({ sub: 'auth0|1', status: 'approved', role: 'member' });

    service.logout();

    expect(service.me()).toBeNull();
    const returnTo = new URL('.', TestBed.inject(DOCUMENT).baseURI).href;
    expect(auth.logout).toHaveBeenCalledWith({ logoutParams: { returnTo } });
  });
});

describe('SessionService with placeholder configuration', () => {
  it('refuses to start a login against the placeholder tenant', () => {
    const auth = createAuthServiceMock();
    TestBed.configureTestingModule({
      providers: [
        provideAuthMocks(auth),
        { provide: APP_CONFIG, useValue: { ...TEST_CONFIG, auth0Domain: 'auth0-domain.invalid' } },
        provideHttpClient(),
      ],
    });
    const service = TestBed.inject(SessionService);
    service.login();
    service.signup();
    expect(service.misconfigured).toBe(true);
    expect(auth.loginWithRedirect).not.toHaveBeenCalled();
  });
});

describe('isPendingApprovalError', () => {
  it('recognizes the denial from the post-login Action', () => {
    expect(isPendingApprovalError({ error: 'access_denied', error_description: 'pending_approval' })).toBe(true);
  });

  it.each([
    [{ error: 'access_denied', error_description: 'User cancelled' }],
    [{ error: 'login_required', error_description: 'pending_approval' }],
    [{ error: 'access_denied', error_description: '<img src=x onerror=alert(1)>' }],
    [null],
    [new Error('boom')],
  ])('does not treat %j as pending', (error) => {
    expect(isPendingApprovalError(error)).toBe(false);
  });
});
