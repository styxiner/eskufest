import { env } from 'cloudflare:workers';
import { afterAll, beforeAll, beforeEach, describe, expect, it, type MockInstance } from 'vitest';

import { MAX_PENDING_UPLOADS } from '../src/media/routes';
import { api, bytes, resetStorage, row, seedMedia, users } from './helpers/media';
import { mockJwksEndpoint } from './helpers/tokens';

let fetchSpy: MockInstance<typeof fetch>;
beforeAll(() => {
  fetchSpy = mockJwksEndpoint();
});
afterAll(() => fetchSpy.mockRestore());
beforeEach(resetStorage);

const R2_HOST = '0123456789abcdef0123456789abcdef.eu.r2.cloudflarestorage.com';
const upload = (body: unknown, token?: string) => (token ? Promise.resolve(token) : users.ana.token()).then((t) => api('POST', '/api/media', t, body));
const valid = { fileName: 'playa.jpg', size: 12, contentType: 'image/jpeg' };

describe('POST /api/media (request upload)', () => {
  it('creates a pending row and a presigned, single-use PUT URL bound to type and size', async () => {
    const response = await upload(valid);
    expect(response.status).toBe(201);
    const body = await response.json<{ id: string; upload: { url: string; method: string; headers: Record<string, string> } }>();

    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    const url = new URL(body.upload.url);
    expect(url.host).toBe(R2_HOST);
    expect(url.pathname).toBe(`/album-media/media/${body.id}`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host;if-none-match');
    expect(url.search).not.toContain('b'.repeat(64)); // the secret never leaves the Worker
    expect(body.upload.method).toBe('PUT');
    expect(body.upload.headers).toEqual({ 'Content-Type': 'image/jpeg', 'If-None-Match': '*' });

    expect(await row(body.id)).toMatchObject({ owner_sub: users.ana.sub, status: 'pending', size_bytes: 12, original_name: 'playa.jpg' });
  });

  it.each(['text/html', 'image/svg+xml', 'application/octet-stream', 'image/heic', 'IMAGE/JPEG', 'image/jpeg; x=y', 42])(
    'rejects content type %j',
    async (contentType) => {
      expect((await upload({ ...valid, contentType })).status).toBe(415);
    },
  );

  it('rejects files larger than MAX_UPLOAD_BYTES', async () => {
    const response = await upload({ ...valid, size: 1048577 });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: 'file_too_large' } });
  });

  it.each([0, -1, 1.5, '12', null, Number.MAX_SAFE_INTEGER + 1])('rejects size %j', async (size) => {
    expect((await upload({ ...valid, size })).status).toBe(400);
  });

  it.each(['foto.html', 'foto.jpg.html', 'foto', '.jpg', 'foto.png', 'foto.svg', 42, ''])(
    'rejects file name %j for image/jpeg',
    async (fileName) => {
      expect((await upload({ ...valid, fileName })).status).toBe(400);
    },
  );

  it('never uses the file name for the object key and sanitizes it for display', async () => {
    const response = await upload({ ...valid, fileName: '../../etc/\u202Egnp.jpg\u0000' });
    const { id, upload: presigned } = await response.json<{ id: string; upload: { url: string } }>();
    expect(new URL(presigned.url).pathname).toBe(`/album-media/media/${id}`);
    expect((await row(id))?.['original_name']).toBe('gnp.jpg');
  });

  it('requires a JSON body of bounded size', async () => {
    const token = await users.ana.token();
    expect((await api('POST', '/api/media', token, [valid])).status).toBe(400);
    expect((await api('POST', '/api/media', token, { ...valid, fileName: 'x'.repeat(5000) + '.jpg' })).status).toBe(413);
  });

  it(`limits pending uploads per user to ${MAX_PENDING_UPLOADS}`, async () => {
    for (let i = 0; i < MAX_PENDING_UPLOADS; i++) await seedMedia({ status: 'pending' });
    const response = await upload(valid);
    expect(response.status).toBe(429);
    // Other users are not affected.
    expect((await upload(valid, await users.bea.token())).status).toBe(201);
  });
});

describe('POST /api/media/:id/complete', () => {
  it('publishes a valid upload', async () => {
    const id = await seedMedia({ status: 'pending' }, bytes.jpeg);
    const response = await api('POST', `/api/media/${id}/complete`, await users.ana.token());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id, kind: 'image', mine: true, canDelete: true, name: 'foto.jpg' });
    expect(await row(id)).toMatchObject({ status: 'ready' });
  });

  it('accepts a QuickTime (ftyp qt) file declared as video/quicktime', async () => {
    const id = await seedMedia({ status: 'pending', contentType: 'video/quicktime', name: 'v.mov' }, bytes.mov);
    expect((await api('POST', `/api/media/${id}/complete`, await users.ana.token())).status).toBe(200);
  });

  it.each([
    ['HTML declared as JPEG', bytes.html, 'image/jpeg'],
    ['PNG declared as JPEG', bytes.png, 'image/jpeg'],
    ['JPEG declared as MP4', bytes.jpeg, 'video/mp4'],
  ])('rejects and deletes spoofed content: %s', async (_label, content, contentType) => {
    const id = await seedMedia({ status: 'pending', contentType }, content);
    const response = await api('POST', `/api/media/${id}/complete`, await users.ana.token());
    expect(response.status).toBe(422);
    expect(await env.MEDIA_BUCKET.head(`media/${id}`)).toBeNull();
    expect(await row(id)).toBeNull();
  });

  it('rejects objects whose size differs from the declared one', async () => {
    const id = await seedMedia({ status: 'pending', size: 999 }, bytes.jpeg);
    expect((await api('POST', `/api/media/${id}/complete`, await users.ana.token())).status).toBe(422);
  });

  it('answers 409 while the object has not been uploaded', async () => {
    const id = await seedMedia({ status: 'pending' });
    expect((await api('POST', `/api/media/${id}/complete`, await users.ana.token())).status).toBe(409);
    expect(await row(id)).toMatchObject({ status: 'pending' });
  });

  it("does not let another user (even an admin) complete someone's upload", async () => {
    const id = await seedMedia({ status: 'pending' }, bytes.jpeg);
    expect((await api('POST', `/api/media/${id}/complete`, await users.bea.token())).status).toBe(404);
    expect((await api('POST', `/api/media/${id}/complete`, await users.admin.token())).status).toBe(404);
    expect(await row(id)).toMatchObject({ status: 'pending' });
  });

  it("cannot be used by another user to delete someone's invalid upload", async () => {
    const id = await seedMedia({ status: 'pending' }, bytes.html);
    expect((await api('POST', `/api/media/${id}/complete`, await users.bea.token())).status).toBe(404);
    expect(await env.MEDIA_BUCKET.head(`media/${id}`)).not.toBeNull();
    expect(await row(id)).toMatchObject({ status: 'pending' });
  });

  it('does not complete twice or unknown ids', async () => {
    const id = await seedMedia({ status: 'ready' }, bytes.jpeg);
    expect((await api('POST', `/api/media/${id}/complete`, await users.ana.token())).status).toBe(404);
    expect((await api('POST', `/api/media/${crypto.randomUUID()}/complete`, await users.ana.token())).status).toBe(404);
  });
});

describe('GET /api/media (list)', () => {
  it('lists only ready items with presigned URLs, without leaking owners or keys', async () => {
    const mine = await seedMedia({ owner: users.ana.sub }, bytes.jpeg);
    const theirs = await seedMedia({ owner: users.bea.sub }, bytes.jpeg);
    const pending = await seedMedia({ status: 'pending' });

    const response = await api('GET', '/api/media', await users.ana.token());
    const { items, nextCursor } = await response.json<{ items: Record<string, unknown>[]; nextCursor: string | null }>();
    expect(items.map((i) => i['id']).sort()).toEqual([mine, theirs].sort());
    expect(items.map((i) => i['id'])).not.toContain(pending);
    expect(nextCursor).toBeNull();

    const byId = Object.fromEntries(items.map((i) => [i['id'], i]));
    expect(byId[mine]).toMatchObject({ mine: true, canDelete: true });
    expect(byId[theirs]).toMatchObject({ mine: false, canDelete: false });
    const serialized = JSON.stringify(items);
    expect(serialized).not.toContain('auth0|');
    expect(serialized).not.toContain('object_key');

    const url = new URL(String(byId[mine]?.['url']));
    expect(url.host).toBe(R2_HOST);
    expect(url.pathname).toBe(`/album-media/media/${mine}`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('1200'); // 2 x image TTL window
  });

  it('lets admins delete anything', async () => {
    await seedMedia({ owner: users.bea.sub }, bytes.jpeg);
    const { items } = await (await api('GET', '/api/media', await users.admin.token())).json<{ items: { canDelete: boolean }[] }>();
    expect(items[0]?.canDelete).toBe(true);
  });

  it('paginates newest first with an opaque cursor', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push(await seedMedia({ createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() }));
    const token = await users.ana.token();

    const first = await (await api('GET', '/api/media?limit=2', token)).json<{ items: { id: string }[]; nextCursor: string }>();
    expect(first.items.map((i) => i.id)).toEqual([ids[4], ids[3]]);
    const second = await (await api('GET', `/api/media?limit=2&cursor=${first.nextCursor}`, token)).json<{ items: { id: string }[]; nextCursor: string }>();
    expect(second.items.map((i) => i.id)).toEqual([ids[2], ids[1]]);
    const third = await (await api('GET', `/api/media?limit=2&cursor=${second.nextCursor}`, token)).json<{ items: { id: string }[]; nextCursor: string | null }>();
    expect(third.items.map((i) => i.id)).toEqual([ids[0]]);
    expect(third.nextCursor).toBeNull();
  });

  it.each(['limit=0', 'limit=101', 'limit=abc', 'cursor=%27%20OR%201%3D1--', `cursor=${btoa("x' OR 1=1|y")}`, 'cursor=' + 'A'.repeat(200)])(
    'rejects invalid query %s',
    async (query) => {
      expect((await api('GET', `/api/media?${query}`, await users.ana.token())).status).toBe(400);
    },
  );
});

describe('GET /api/media/:id/url', () => {
  it('returns a short-lived URL for a visible item', async () => {
    const id = await seedMedia({ owner: users.bea.sub }, bytes.jpeg);
    const { url } = await (await api('GET', `/api/media/${id}/url`, await users.ana.token())).json<{ url: string }>();
    expect(new URL(url).pathname).toBe(`/album-media/media/${id}`);
    expect(new URL(url).searchParams.has('response-content-disposition')).toBe(false);
  });

  it('adds an attachment disposition with the sanitized name for downloads', async () => {
    const id = await seedMedia({ name: 'mi "foto".jpg' }, bytes.jpeg);
    const { url } = await (await api('GET', `/api/media/${id}/url?download=1`, await users.ana.token())).json<{ url: string }>();
    expect(new URL(url).searchParams.get('response-content-disposition')).toBe(
      `attachment; filename="mi _foto_.jpg"; filename*=UTF-8''mi%20%22foto%22.jpg`,
    );
  });

  it('uses the longer TTL for videos', async () => {
    const id = await seedMedia({ contentType: 'video/mp4', name: 'v.mp4' });
    const { url } = await (await api('GET', `/api/media/${id}/url`, await users.ana.token())).json<{ url: string }>();
    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('7200');
  });

  it('hides pending and unknown items', async () => {
    const pending = await seedMedia({ status: 'pending' });
    expect((await api('GET', `/api/media/${pending}/url`, await users.ana.token())).status).toBe(404);
    expect((await api('GET', `/api/media/${crypto.randomUUID()}/url`, await users.ana.token())).status).toBe(404);
  });
});

describe('DELETE /api/media/:id', () => {
  it('lets the owner delete (object and row)', async () => {
    const id = await seedMedia({}, bytes.jpeg);
    expect((await api('DELETE', `/api/media/${id}`, await users.ana.token())).status).toBe(204);
    expect(await env.MEDIA_BUCKET.head(`media/${id}`)).toBeNull();
    expect(await row(id)).toBeNull();
  });

  it("forbids deleting someone else's visible item", async () => {
    const id = await seedMedia({ owner: users.bea.sub }, bytes.jpeg);
    const response = await api('DELETE', `/api/media/${id}`, await users.ana.token());
    expect(response.status).toBe(403);
    expect(await env.MEDIA_BUCKET.head(`media/${id}`)).not.toBeNull();
    expect(await row(id)).not.toBeNull();
  });

  it("hides someone else's pending upload (404)", async () => {
    const id = await seedMedia({ owner: users.bea.sub, status: 'pending' });
    expect((await api('DELETE', `/api/media/${id}`, await users.ana.token())).status).toBe(404);
    expect(await row(id)).not.toBeNull();
  });

  it('lets admins delete any item', async () => {
    const id = await seedMedia({ owner: users.bea.sub }, bytes.jpeg);
    expect((await api('DELETE', `/api/media/${id}`, await users.admin.token())).status).toBe(204);
    expect(await row(id)).toBeNull();
  });

  it('lets owners cancel their own pending upload', async () => {
    const id = await seedMedia({ status: 'pending' });
    expect((await api('DELETE', `/api/media/${id}`, await users.ana.token())).status).toBe(204);
  });

  it('answers 404 for unknown ids', async () => {
    expect((await api('DELETE', `/api/media/${crypto.randomUUID()}`, await users.admin.token())).status).toBe(404);
  });
});
