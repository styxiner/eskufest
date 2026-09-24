import { exports } from 'cloudflare:workers';
import { afterAll, beforeAll, describe, expect, it, type MockInstance } from 'vitest';

import { router } from '../src/routes';
import { accessToken, API, NS, mockJwksEndpoint } from './helpers/tokens';

let fetchSpy: MockInstance<typeof fetch>;
beforeAll(() => {
  fetchSpy = mockJwksEndpoint();
});
afterAll(() => fetchSpy.mockRestore());

const SAMPLE_ID = '3f1c2a4e-9b7d-4c1e-8a2b-5d6e7f8a9b0c';

const pending = { [`${NS}approved`]: undefined };
const tokens = {
  member: () => accessToken(),
  admin: () => accessToken({ claims: { [`${NS}role`]: 'admin' } }),
  pending: () => accessToken({ claims: pending }),
  // Someone who managed to get role=admin but is not approved must still be locked out.
  pendingAdmin: () => accessToken({ claims: { ...pending, [`${NS}role`]: 'admin' } }),
  expired: () => accessToken({ expiresIn: Math.floor(Date.now() / 1000) - 60 }),
};

function call(method: string, path: string, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const body = method === 'POST' ? '{}' : null;
  return exports.default.fetch(new Request(`${API}${path}`, { method, headers, body }));
}

const protectedRoutes = router.routes
  .filter((route) => route.access !== 'public')
  .map((route) => ({
    method: route.method,
    access: route.access,
    path: route.pathname.replace(':id', SAMPLE_ID),
    name: `${route.method} ${route.pathname}`,
  }));
const approvedRoutes = protectedRoutes.filter((route) => route.access === 'approved' || route.access === 'admin');

describe('route table', () => {
  it('has exactly one public route: the health check', () => {
    const publicRoutes = router.routes.filter((route) => route.access === 'public');
    expect(publicRoutes.map((r) => `${r.method} ${r.pathname}`)).toEqual(['GET /api/health']);
  });

  it('requires approval on every media route', () => {
    for (const route of router.routes.filter((r) => r.pathname.startsWith('/api/media'))) {
      expect(['approved', 'admin'], `${route.method} ${route.pathname}`).toContain(route.access);
    }
  });
});

describe.each(protectedRoutes)('$name', ({ method, path, access }) => {
  it('rejects anonymous callers with 401', async () => {
    expect((await call(method, path)).status).toBe(401);
  });

  it('rejects invalid and expired tokens with 401', async () => {
    expect((await call(method, path, 'a.b.c')).status).toBe(401);
    expect((await call(method, path, await tokens.expired())).status).toBe(401);
  });

  if (access !== 'authenticated') {
    it('rejects pending users with 403 not_approved', async () => {
      const response = await call(method, path, await tokens.pending());
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: 'not_approved' } });
    });

    it('rejects pending users even with an admin role claim', async () => {
      expect((await call(method, path, await tokens.pendingAdmin())).status).toBe(403);
    });
  }

  it('lets approved members through the authorization layer', async () => {
    const status = (await call(method, path, await tokens.member())).status;
    expect(status).not.toBe(401);
    expect(status).not.toBe(403);
  });
});

describe('GET /api/me for pending users', () => {
  it('is allowed so the UI can show the pending state', async () => {
    const response = await call('GET', '/api/me', await tokens.pending());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'pending', role: null });
  });
});

describe('media ids from the URL', () => {
  const malicious = [
    '..%2F..%2Fsecret',
    '%2e%2e',
    'media%2Fother',
    'not-a-uuid',
    SAMPLE_ID.toUpperCase(),
    '3f1c2a4e-9b7d-1c1e-8a2b-5d6e7f8a9b0c', // UUID v1
    `${SAMPLE_ID}%00`,
    `${SAMPLE_ID}.jpg`,
  ];

  it.each(malicious)('rejects %s with 404 for approved users', async (id) => {
    const token = await tokens.member();
    for (const [method, path] of [
      ['GET', `/api/media/${id}/url`],
      ['DELETE', `/api/media/${id}`],
      ['POST', `/api/media/${id}/complete`],
    ] as const) {
      const response = await call(method, path, token);
      expect(response.status, `${method} ${path}`).toBe(404);
    }
  });

  it('authenticates before validating ids (no probing without a token)', async () => {
    expect((await call('GET', '/api/media/not-a-uuid/url')).status).toBe(401);
    expect((await call('GET', '/api/media/not-a-uuid/url', await tokens.pending())).status).toBe(403);
  });
});

describe('admin tokens', () => {
  it('pass the approved routes like any approved user', async () => {
    for (const { method, path } of approvedRoutes) {
      const status = (await call(method, path, await tokens.admin())).status;
      expect([401, 403], `${method} ${path}`).not.toContain(status);
    }
  });
});
