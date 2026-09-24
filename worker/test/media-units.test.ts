import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { parseConfig } from '../src/config';
import { cleanupStaleUploads, STALE_UPLOAD_MS } from '../src/media/cleanup';
import { contentDisposition, sanitizeFileName } from '../src/media/filename';
import { presignDownload } from '../src/media/presign';
import { markReady } from '../src/media/repository';
import { sniffSignature } from '../src/media/sniff';
import { bytes, resetStorage, row, seedMedia } from './helpers/media';

describe('sniffSignature', () => {
  const ascii = (text: string) => new TextEncoder().encode(text);
  it.each([
    ['jpeg', bytes.jpeg],
    ['png', bytes.png],
    ['gif', ascii('GIF89a......')],
    ['webp', ascii('RIFF\0\0\0\0WEBPVP8 ')],
    ['isobmff', bytes.mov],
    ['webm', new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84, ...ascii('webm')])],
  ] as const)('detects %s', (expected, content) => {
    expect(sniffSignature(content)).toBe(expected);
  });

  it.each([
    ['html', bytes.html],
    ['svg', ascii('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['matroska (not webm)', new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...ascii('matroska')])],
    ['empty', new Uint8Array()],
    ['truncated jpeg', new Uint8Array([0xff, 0xd8])],
  ])('rejects %s', (_label, content) => {
    expect(sniffSignature(content)).toBeNull();
  });
});

describe('sanitizeFileName', () => {
  it.each([
    ['IMG_0001.JPG', 'IMG_0001.jpg'],
    ['C:\\fotos\\verano.jpeg', 'verano.jpeg'],
    ['  mi   foto .jpg', 'mi foto.jpg'],
    ['a\u0000b\u200Bc\u202E.jpg', 'abc.jpg'],
  ])('%j -> %j', (input, expected) => {
    expect(sanitizeFileName(input, 'image/jpeg')).toBe(expected);
  });

  it('caps the length', () => {
    expect(sanitizeFileName(`${'x'.repeat(500)}.jpg`, 'image/jpeg')?.length).toBe(200);
  });
});

describe('contentDisposition', () => {
  it('produces an ASCII fallback and a UTF-8 name, without header injection', () => {
    expect(contentDisposition('attachment', 'año "1";\r\nX-Evil: 1.jpg')).toBe(
      `attachment; filename="a_o _1____X-Evil: 1.jpg"; filename*=UTF-8''a%C3%B1o%20%221%22%3B%0D%0AX-Evil%3A%201.jpg`,
    );
  });
});

describe('presignDownload', () => {
  const config = parseConfig(env);
  const id = crypto.randomUUID();

  it('is stable within a TTL window (cache friendly) and valid for at most 2 x TTL', async () => {
    const t0 = new Date('2026-09-24T10:00:10Z');
    const a = await presignDownload(config, id, 600, { now: t0 });
    const b = await presignDownload(config, id, 600, { now: new Date('2026-09-24T10:09:59Z') });
    const c = await presignDownload(config, id, 600, { now: new Date('2026-09-24T10:10:00Z') });
    expect(a.url).toBe(b.url);
    expect(c.url).not.toBe(a.url);
    expect(a.expiresAt).toBe('2026-09-24T10:20:00.000Z');
  });
});

describe('cleanupStaleUploads', () => {
  beforeEach(resetStorage);

  it('removes abandoned pending uploads and keeps everything else', async () => {
    const now = new Date();
    const old = new Date(now.getTime() - STALE_UPLOAD_MS - 1000).toISOString();
    const stale = await seedMedia({ status: 'pending', createdAt: old }, bytes.jpeg);
    const fresh = await seedMedia({ status: 'pending' });
    const oldReady = await seedMedia({ status: 'ready', createdAt: old }, bytes.jpeg);

    expect(await cleanupStaleUploads(env, now)).toBe(1);
    expect(await row(stale)).toBeNull();
    expect(await env.MEDIA_BUCKET.head(`media/${stale}`)).toBeNull();
    expect(await row(fresh)).not.toBeNull();
    expect(await row(oldReady)).not.toBeNull();
  });
});

describe('markReady', () => {
  beforeEach(resetStorage);

  it('only transitions pending rows owned by the caller', async () => {
    const pending = await seedMedia({ status: 'pending', owner: 'auth0|ana' });
    const ready = await seedMedia({ status: 'ready', owner: 'auth0|ana' });
    expect(await markReady(env.DB, pending, 'auth0|bea', new Date().toISOString())).toBe(false);
    expect(await markReady(env.DB, ready, 'auth0|ana', new Date().toISOString())).toBe(false);
    expect(await markReady(env.DB, pending, 'auth0|ana', new Date().toISOString())).toBe(true);
  });
});
