import type { AuthConfig } from '@auth0/auth0-angular';
import type { AppConfig } from '../config/app-config';

/** Minimal OIDC scopes: identity for display only. Authorization comes from the API. */
export const AUTH0_SCOPES = 'openid profile email';

/**
 * Auth0 SPA configuration: Authorization Code + PKCE (the SDK default), access tokens
 * for our API audience only, tokens kept in memory (never localStorage), rotating
 * refresh tokens. The iframe fallback re-establishes the session after a reload; it
 * relies on the Auth0 custom domain being same-site with the app.
 */
export function buildAuth0Config(config: AppConfig, appBaseUrl: string): AuthConfig {
  return {
    domain: config.auth0Domain,
    clientId: config.auth0ClientId,
    authorizationParams: {
      audience: config.auth0Audience,
      scope: AUTH0_SCOPES,
      redirect_uri: appBaseUrl,
    },
    cacheLocation: 'memory',
    useRefreshTokens: true,
    useRefreshTokensFallback: true,
    errorPath: '/auth-error',
    httpInterceptor: {
      // Attach the access token ONLY to our API. Never to R2 presigned URLs or third parties.
      allowedList: [{ uri: `${config.apiUrl}/api/*`, tokenOptions: { authorizationParams: { audience: config.auth0Audience } } }],
    },
  };
}

/** Absolute URL of the app root (respects <base href>), without query or hash. */
export function appBaseUrl(doc: Document): string {
  const url = new URL('.', doc.baseURI);
  url.search = '';
  url.hash = '';
  return url.href;
}
