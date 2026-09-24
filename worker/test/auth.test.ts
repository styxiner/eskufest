import { env, exports } from 'cloudflare:workers';
import { afterAll, beforeAll, describe, expect, it, type MockInstance } from 'vitest';
import { verifyAccessToken } from '../src/auth/access-token';
import { parseConfig } from '../src/config';
import { accessToken, API, attackerKeys, AUDIENCE, base64url, ISSUER, mockJwksEndpoint, NS } from './helpers/tokens';

let fetchSpy: MockInstance<typeof fetch>;
beforeAll(() => {
  fetchSpy = mockJwksEndpoint();
});
afterAll(() => fetchSpy.mockRestore());

const me = (headers: Record<string, string> = {}, path = '/api/me') =>
  exports.default.fetch(new Request(`${API}${path}`, { headers }));
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function expectUnauthorized(response: Response) {
  expect(response.status).toBe(401);
  expect(response.headers.get('WWW-Authenticate')).toBe('Bearer error="invalid_token"');
  // Same generic body for every failure: no oracle for attackers.
  expect(await response.json()).toEqual({ error: { code: 'unauthorized', message: 'Authentication required.' } });
}

describe('GET /api/me with a valid token', () => {
  it('returns the identity of an approved member', async () => {
    const response = await me(bearer(await accessToken()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sub: 'auth0|user-1', status: 'approved', role: 'member' });
  });

  it('returns the admin role from the namespaced claim', async () => {
    const response = await me(bearer(await accessToken({ claims: { [`${NS}role`]: 'admin' } })));
    expect(await response.json()).toMatchObject({ status: 'approved', role: 'admin' });
  });

  it('accepts a token whose aud is only the API', async () => {
    const response = await me(bearer(await accessToken({ audience: AUDIENCE })));
    expect(response.status).toBe(200);
  });

  it('reports pending when the approved claim is missing', async () => {
    const response = await me(bearer(await accessToken({ claims: { [`${NS}approved`]: undefined } })));
    expect(await response.json()).toEqual({ sub: 'auth0|user-1', status: 'pending', role: null });
  });

  it.each([['true'], [1], [false], [null]])('treats approved=%j as pending (strict boolean)', async (value) => {
    const response = await me(bearer(await accessToken({ claims: { [`${NS}approved`]: value } })));
    expect(await response.json()).toMatchObject({ status: 'pending' });
  });

  it('ignores non-namespaced or foreign-namespace claims', async () => {
    const token = await accessToken({
      claims: {
        [`${NS}approved`]: undefined,
        approved: true,
        role: 'admin',
        'https://evil.example/approved': true,
        [`${NS}role`]: 'superadmin',
      },
    });
    expect(await (await me(bearer(token))).json()).toEqual({ sub: 'auth0|user-1', status: 'pending', role: null });
  });
});

describe('GET /api/me rejects', () => {
  it('requests without Authorization', async () => {
    await expectUnauthorized(await me());
  });

  it('non-Bearer schemes and malformed headers', async () => {
    const token = await accessToken();
    for (const value of [`Basic ${token}`, `bearer${token}`, `Bearer  ${token}`, `Bearer ${token} x`, 'Bearer abc', 'Bearer ']) {
      await expectUnauthorized(await me({ Authorization: value }));
    }
  });

  it('tokens passed in the query string', async () => {
    await expectUnauthorized(await me({}, `/api/me?access_token=${await accessToken()}`));
  });

  it('oversized tokens', async () => {
    const token = await accessToken({ claims: { padding: 'x'.repeat(10_000) } });
    await expectUnauthorized(await me(bearer(token)));
  });

  it('expired tokens', async () => {
    const expired = await accessToken({ expiresIn: Math.floor(Date.now() / 1000) - 60 });
    await expectUnauthorized(await me(bearer(expired)));
  });

  it('tokens without exp (non-expiring)', async () => {
    await expectUnauthorized(await me(bearer(await accessToken({ expiresIn: null }))));
  });

  it('tokens not yet valid (nbf in the future)', async () => {
    await expectUnauthorized(await me(bearer(await accessToken({ notBefore: '10m' }))));
  });

  it('tokens for another audience (e.g. an ID token, whose aud is the client id)', async () => {
    for (const audience of ['ZEJG89DLbwaG6mUdvofI4HwlTqBrPE8C', 'https://other-api.example', `${AUDIENCE}/`]) {
      await expectUnauthorized(await me(bearer(await accessToken({ audience }))));
    }
  });

  it('tokens from another issuer', async () => {
    for (const issuer of ['https://evil.example/', 'https://tenant.test.example', `${ISSUER}x/`]) {
      await expectUnauthorized(await me(bearer(await accessToken({ issuer }))));
    }
  });

  it('tokens signed with a key the tenant does not publish', async () => {
    await expectUnauthorized(await me(bearer(await accessToken({ key: attackerKeys.privateKey }))));
    await expectUnauthorized(await me(bearer(await accessToken({ key: attackerKeys.privateKey, kid: 'unknown' }))));
  });

  it('tampered payloads', async () => {
    const [header, , signature] = (await accessToken()).split('.');
    const forgedPayload = base64url(
      JSON.stringify({ sub: 'auth0|admin', iss: ISSUER, aud: AUDIENCE, iat: 1, exp: 9999999999, [`${NS}role`]: 'admin' }),
    );
    await expectUnauthorized(await me(bearer(`${header}.${forgedPayload}.${signature}`)));
  });

  it('alg=none tokens', async () => {
    const header = base64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
    const payload = base64url(
      JSON.stringify({ sub: 'auth0|x', iss: ISSUER, aud: AUDIENCE, iat: 1, exp: 9999999999, [`${NS}approved`]: true }),
    );
    await expectUnauthorized(await me(bearer(`${header}.${payload}.`)));
    await expectUnauthorized(await me(bearer(`${header}.${payload}.AAAA`)));
  });

  it('HS256 tokens (algorithm confusion)', async () => {
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: 'test-key-1' }));
    const payload = base64url(
      JSON.stringify({ sub: 'auth0|x', iss: ISSUER, aud: AUDIENCE, iat: 1, exp: 9999999999, [`${NS}approved`]: true }),
    );
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${payload}`)));
    await expectUnauthorized(await me(bearer(`${header}.${payload}.${base64url(signature)}`)));
  });

  it('tokens without sub', async () => {
    await expectUnauthorized(await me(bearer(await accessToken({ subject: null }))));
  });

  it('valid tokens when the JWKS endpoint is unreachable (fail closed)', async () => {
    const config = { ...parseConfig(env), auth0Domain: 'unreachable.test.example' };
    fetchSpy.mockRejectedValueOnce(new Error('network down'));
    await expect(verifyAccessToken(await accessToken(), config)).rejects.toMatchObject({ status: 401 });
    expect(fetchSpy).toHaveBeenLastCalledWith(
      'https://unreachable.test.example/.well-known/jwks.json',
      expect.anything(),
    );
  });
});
