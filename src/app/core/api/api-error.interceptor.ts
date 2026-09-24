import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { isPendingApprovalError } from '../auth/session.service';
import { APP_CONFIG } from '../config/app-config';
import { apiErrorCode } from './api.models';

/**
 * Maps authorization failures of calls to OUR API to navigation. It reacts to what the
 * Worker (or Auth0) decided; it never decides anything by itself.
 *
 * Must be registered BEFORE authHttpInterceptorFn so it also sees token-acquisition
 * errors, e.g. a revoked user whose refresh is denied by the post-login Action.
 */
export const apiErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const config = inject(APP_CONFIG);
  const router = inject(Router);
  if (!req.url.startsWith(`${config.apiUrl}/`)) return next(req);

  return next(req).pipe(
    catchError((error: unknown) => {
      const notApproved =
        (error instanceof HttpErrorResponse && error.status === 403 && apiErrorCode(error.error) === 'not_approved') ||
        isPendingApprovalError(error);
      if (notApproved) void router.navigateByUrl('/pending');
      return throwError(() => error);
    }),
  );
};
