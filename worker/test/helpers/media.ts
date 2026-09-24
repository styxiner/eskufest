import { env, exports } from 'cloudflare:workers';

import { accessToken, API, NS } from './tokens';

export const users = {
  ana: { sub: 'auth0|ana', token: () => accessToken({ subject: 'auth0|ana' }) },
  bea: { sub: 'auth0|bea', token: () => accessToken({ subject: 'auth0|bea' }) },
  admin: { sub: 'auth0|admin', token: () => accessToken({ subject: 'auth0|admin', claims: { [`${NS}role`]: 'admin' } }) },
};

export const bytes = {
  jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]),
  png: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]),
  html: new TextEncoder().encode('<html><script>alert(1)</script></html>'),
  mov: new Uint8Array([0, 0, 0, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20, 0, 0, 0, 0]),
};

export async function api(method: string, path: string, token?: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return exports.default.fetch(
    new Request(`${API}${path}`, { method, headers, body: body === undefined ? null : JSON.stringify(body) }),
  );
}

export async function resetStorage() {
  await env.DB.prepare('DELETE FROM media').run();
  const listed = await env.MEDIA_BUCKET.list();
  await Promise.all(listed.objects.map((object) => env.MEDIA_BUCKET.delete(object.key)));
}

interface SeedOptions {
  owner?: string;
  status?: 'pending' | 'ready';
  contentType?: string;
  name?: string;
  size?: number;
  createdAt?: string;
}

/** Inserts a media row directly (and optionally its object), bypassing the API. */
export async function seedMedia(options: SeedOptions = {}, content?: Uint8Array) {
  const id = crypto.randomUUID();
  const contentType = options.contentType ?? 'image/jpeg';
  const size = options.size ?? content?.byteLength ?? 12;
  await env.DB.prepare(
    `INSERT INTO media (id, object_key, owner_sub, original_name, content_type, size_bytes, status, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      `media/${id}`,
      options.owner ?? users.ana.sub,
      options.name ?? 'foto.jpg',
      contentType,
      size,
      options.status ?? 'ready',
      options.createdAt ?? new Date().toISOString(),
      options.status === 'pending' ? null : new Date().toISOString(),
    )
    .run();
  if (content) await env.MEDIA_BUCKET.put(`media/${id}`, content, { httpMetadata: { contentType } });
  return id;
}

export const row = (id: string) => env.DB.prepare('SELECT * FROM media WHERE id = ?').bind(id).first();
