import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '@auth0/auth0-angular';
import { Observable, of, tap } from 'rxjs';

import { APP_CONFIG, isPlaceholderConfig } from '../config/app-config';
import type { Me } from '../api/api.models';
import { appBaseUrl } from './auth0-config';

/** Auth0 error returned when the post-login Action denies an unapproved user. */
export const PENDING_APPROVAL_DESCRIPTION = 'pending_approval';

/**
 * Tells whether an Auth0 redirect error means "account pending approval".
 * Only compares against a constant: the error text comes from the URL and is never rendered.
 */
export function isPendingApprovalError(error: unknown): boolean {
  const e = error as { error?: unknown; error_description?: unknown } | null;
  return e?.error === 'access_denied' && e?.error_description === PENDING_APPROVAL_DESCRIPTION;
}

/**
 * Session facade over the Auth0 SDK plus the API's view of the user.
 * UI state only: every real authorization decision is taken by the Worker.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);
  private readonly document = inject(DOCUMENT);

  readonly isAuthenticated = toSignal(this.auth.isAuthenticated$, { initialValue: false });
  readonly isLoading = toSignal(this.auth.isLoading$, { initialValue: true });
  /** ID token profile, for display only. Never used for authorization. */
  readonly user = toSignal(this.auth.user$, { initialValue: null });
  readonly error$ = this.auth.error$;

  /** Built without real configuration (see scripts/generate-config.mjs). */
  readonly misconfigured = isPlaceholderConfig(this.config);

  private readonly meState = signal<Me | null>(null);
  readonly me = this.meState.asReadonly();

  /** GET /api/me, cached for the lifetime of the page. */
  loadMe({ refresh = false } = {}): Observable<Me> {
    const cached = this.meState();
    if (cached && !refresh) return of(cached);
    return this.http.get<Me>(`${this.config.apiUrl}/api/me`).pipe(tap((me) => this.meState.set(me)));
  }

  login(target = '/album'): void {
    if (this.misconfigured) return;
    this.auth.loginWithRedirect({ appState: { target } }).subscribe();
  }

  signup(): void {
    if (this.misconfigured) return;
    this.auth
      .loginWithRedirect({ appState: { target: '/album' }, authorizationParams: { screen_hint: 'signup' } })
      .subscribe();
  }

  logout(): void {
    this.meState.set(null);
    this.auth.logout({ logoutParams: { returnTo: appBaseUrl(this.document) } }).subscribe();
  }

  /**
   * Removes OAuth callback parameters (?code, ?state, ?error...) from the address bar once
   * the SDK has consumed them. With hash routing they would otherwise survive navigation
   * and be re-processed (and fail) on reload.
   */
  clearCallbackParams(): void {
    const location = this.document.location;
    const params = new URLSearchParams(location.search);
    if (!params.has('state')) return;
    this.document.defaultView?.history.replaceState(null, '', `${location.pathname}${location.hash}`);
  }
}
