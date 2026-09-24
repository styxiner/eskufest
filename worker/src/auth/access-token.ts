import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import type { Config } from '../config';
import { HttpError } from '../errors/http-error';

export type Role = 'member' | 'admin';

/** The authenticated caller, derived exclusively from a verified access token. */
export interface Principal {
  /** Stable Auth0 user id. The only identifier used for authorization and ownership. */
  sub: string;
  /** Set by the post-login Action from app_metadata.isApproved. */
  approved: boolean;
  role: Role;
}

// Access tokens from Auth0 are ~1 KB; anything much larger is not ours.
const MAX_TOKEN_LENGTH = 8192;
const CLOCK_TOLERANCE_SECONDS = 5;

const jwksCache = new Map<string, JWTVerifyGetKey>();

/** One JWKS resolver per isolate and domain: jose caches keys and rate-limits refetches. */
function jwksFor(auth0Domain: string): JWTVerifyGetKey {
  let jwks = jwksCache.get(auth0Domain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${auth0Domain}/.well-known/jwks.json`), {
      timeoutDuration: 3000,
    });
    jwksCache.set(auth0Domain, jwks);
  }
  return jwks;
}

export const unauthorized = () =>
  new HttpError(401, 'unauthorized', 'Authentication required.', {
    'WWW-Authenticate': 'Bearer error="invalid_token"',
  });

/** Extracts the bearer token from the Authorization header. Tokens are never read from the URL. */
export function bearerToken(request: Request): string {
  const header = request.headers.get('Authorization');
  const match = header ? /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(header) : null;
  if (!match?.[1] || match[1].length > MAX_TOKEN_LENGTH) throw unauthorized();
  return match[1];
}

function principalFrom(payload: JWTPayload, namespace: string): Principal {
  if (typeof payload.sub !== 'string' || payload.sub.length === 0 || payload.sub.length > 255) {
    throw unauthorized();
  }
  const approved = payload[`${namespace}approved`] === true;
  const role: Role = payload[`${namespace}role`] === 'admin' ? 'admin' : 'member';
  return { sub: payload.sub, approved, role };
}

/**
 * Verifies an Auth0 access token: RS256 signature against the tenant JWKS, exact issuer,
 * exact audience, exp/nbf/iat. Any failure results in the same generic 401.
 */
export async function verifyAccessToken(token: string, config: Config): Promise<Principal> {
  try {
    const { payload } = await jwtVerify(token, jwksFor(config.auth0Domain), {
      issuer: config.auth0Issuer,
      audience: config.auth0Audience,
      algorithms: ['RS256'],
      requiredClaims: ['sub', 'exp', 'iat'],
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    });
    return principalFrom(payload, config.claimsNamespace);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (!(error instanceof errors.JOSEError)) {
      // JWKS unreachable or similar: do not turn an outage into "authenticated".
      console.error('Access token verification failed unexpectedly:', (error as Error).name);
    }
    throw unauthorized();
  }
}

export async function authenticate(request: Request, config: Config): Promise<Principal> {
  return verifyAccessToken(bearerToken(request), config);
}
