import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { type ActivatedRouteSnapshot, Router, type RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { firstValueFrom, isObservable, of, throwError, type Observable } from 'rxjs';
import { vi } from 'vitest';

import { createAuthServiceMock, provideAuthMocks, type AuthServiceMock } from '../../../testing/auth.mocks';
import { approvedGuard, redirectAuthenticatedGuard } from './approved.guard';
import { SessionService } from './session.service';

type GuardResult = boolean | UrlTree;

function setup(authenticated: boolean) {
  const auth = createAuthServiceMock({ authenticated });
  TestBed.configureTestingModule({
    providers: [provideAuthMocks(auth), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  });
  return { auth, http: TestBed.inject(HttpTestingController), router: TestBed.inject(Router) };
}

function run(guard: typeof approvedGuard, url = '/album'): Promise<GuardResult> {
  const result = TestBed.runInInjectionContext(() =>
    guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
  ) as Observable<GuardResult> | GuardResult;
  return firstValueFrom(isObservable(result) ? result : of(result));
}

const ME_URL = 'https://api.test.example/api/me';

describe('approvedGuard', () => {
  let auth: AuthServiceMock;
  let http: HttpTestingController;
  let router: Router;

  describe('when not authenticated', () => {
    beforeEach(() => ({ auth, http, router } = setup(false)));

    it('blocks and starts the login flow keeping the target route', async () => {
      expect(await run(approvedGuard, '/album')).toBe(false);
      expect(auth.loginWithRedirect).toHaveBeenCalledWith({ appState: { target: '/album' } });
      http.expectNone(ME_URL);
    });
  });

  describe('when authenticated', () => {
    beforeEach(() => ({ auth, http, router } = setup(true)));

    it('allows approved users (as reported by the API)', async () => {
      const result = run(approvedGuard);
      http.expectOne(ME_URL).flush({ sub: 'auth0|1', status: 'approved', role: 'member' });
      expect(await result).toBe(true);
    });

    it('sends pending users to /pending', async () => {
      const result = run(approvedGuard);
      http.expectOne(ME_URL).flush({ sub: 'auth0|1', status: 'pending', role: null });
      expect(router.serializeUrl((await result) as UrlTree)).toBe('/pending');
    });

    it('restarts login when the API rejects the token', async () => {
      const result = run(approvedGuard);
      http.expectOne(ME_URL).flush({ error: { code: 'unauthorized' } }, { status: 401, statusText: 'Unauthorized' });
      expect(await result).toBe(false);
      expect(auth.loginWithRedirect).toHaveBeenCalled();
    });

    it('sends other failures to /error', async () => {
      const result = run(approvedGuard);
      http.expectOne(ME_URL).flush(null, { status: 500, statusText: 'Server Error' });
      expect(router.serializeUrl((await result) as UrlTree)).toBe('/error');
    });

    it('sends users whose token refresh was denied (revoked) to /pending', async () => {
      const session = TestBed.inject(SessionService);
      vi.spyOn(session, 'loadMe').mockReturnValue(
        throwError(() => ({ error: 'access_denied', error_description: 'pending_approval' })),
      );
      expect(router.serializeUrl((await run(approvedGuard)) as UrlTree)).toBe('/pending');
    });

    it('sends network failures to /error', async () => {
      const result = run(approvedGuard);
      http.expectOne(ME_URL).error(new ProgressEvent('error'));
      expect(router.serializeUrl((await result) as UrlTree)).toBe('/error');
    });
  });
});

describe('redirectAuthenticatedGuard', () => {
  it('shows the login page to anonymous users', async () => {
    setup(false);
    expect(await run(redirectAuthenticatedGuard, '/')).toBe(true);
  });

  it('sends authenticated users to the album', async () => {
    const { router } = setup(true);
    expect(router.serializeUrl((await run(redirectAuthenticatedGuard, '/')) as UrlTree)).toBe('/album');
  });
});
