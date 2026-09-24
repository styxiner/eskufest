import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { vi } from 'vitest';

export const API = 'https://api.test.example';
export const ORIGIN = 'https://album.test.example';
export const ISSUER = 'https://tenant.test.example/';
export const AUDIENCE = 'https://api.test.example';
export const NS = 'https://album.test.example/';
const JWKS_URL = 'https://tenant.test.example/.well-known/jwks.json';
const KID = 'test-key-1';

const tenantKeys = await generateKeyPair('RS256', { extractable: true });
/** A key pair the tenant does NOT publish (used to forge tokens). */
export const attackerKeys = await generateKeyPair('RS256', { extractable: true });

const publicJwk = { ...(await exportJWK(tenantKeys.publicKey)), kid: KID, alg: 'RS256', use: 'sig' };

/** Serves the fake tenant JWKS; any other outbound request fails the test. */
export function mockJwksEndpoint() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === JWKS_URL) return Response.json({ keys: [publicJwk] });
    throw new Error(`Unexpected outbound fetch in test: ${url}`);
  });
}

export interface TokenOptions {
  claims?: JWTPayload;
  issuer?: string;
  audience?: string | string[];
  subject?: string | null;
  expiresIn?: string | number | null;
  notBefore?: string | number;
  key?: CryptoKey;
  kid?: string;
}

/** Signs an access token that looks like one issued by the test tenant. */
export async function accessToken(options: TokenOptions = {}): Promise<string> {
  const jwt = new SignJWT({ [`${NS}approved`]: true, [`${NS}role`]: 'member', ...options.claims })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: options.kid ?? KID })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? [AUDIENCE, `${ISSUER}userinfo`])
    .setIssuedAt();
  if (options.expiresIn !== null) jwt.setExpirationTime(options.expiresIn ?? '1h');
  if (options.subject !== null) jwt.setSubject(options.subject ?? 'auth0|user-1');
  if (options.notBefore !== undefined) jwt.setNotBefore(options.notBefore);
  return jwt.sign(options.key ?? tenantKeys.privateKey);
}

export function base64url(value: string | Uint8Array): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
