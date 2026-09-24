import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { catchError, map, of, switchMap, take } from 'rxjs';

import { isPendingApprovalError, SessionService } from './session.service';

/**
 * UX guard for album routes. Not a security boundary: the Worker rejects every
 * request without a valid, approved access token regardless of what the UI does.
 */
export const approvedGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const session = inject(SessionService);
  const router = inject(Router);

  return auth.isAuthenticated$.pipe(
    take(1),
    switchMap((authenticated) => {
      if (!authenticated) {
        session.login(state.url);
        return of(false);
      }
      return session.loadMe().pipe(
        map((me) => (me.status === 'approved' ? true : router.parseUrl('/pending'))),
        catchError((error: unknown) => {
          if (isPendingApprovalError(error)) return of(router.parseUrl('/pending'));
          if (error instanceof HttpErrorResponse && error.status === 401) {
            session.login(state.url);
            return of(false);
          }
          return of(router.parseUrl('/error'));
        }),
      );
    }),
  );
};

/** Sends already-authenticated users from the login screen to the album. */
export const redirectAuthenticatedGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated$.pipe(
    take(1),
    map((authenticated) => (authenticated ? router.parseUrl('/album') : true)),
  );
};
