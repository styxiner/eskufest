import type { Principal } from '../auth/access-token';
import { forbidden } from '../auth/authorize';
import type { Config } from '../config';
import { HttpError, notFound } from '../errors/http-error';
import { readJsonObject } from '../http/body';
import { json } from '../http/responses';
import type { AuthenticatedHandler } from '../http/router';
import { contentDisposition, sanitizeFileName } from './filename';
import { newMediaId, objectKeyFor, parseMediaId } from './ids';
import { canCompleteUpload, canDeleteMedia, canViewMedia } from './policy';
import { presignDownload, presignUpload } from './presign';
import {
  deleteById,
  findById,
  insertPending,
  listReady,
  markReady,
  uploadCounts,
  type MediaRow,
  type PageCursor,
} from './repository';
import { SNIFF_BYTES, sniffSignature } from './sniff';
import { isAllowedContentType, mediaType } from './types';

/** Abuse limits per user (sliding 24 h window). */
export const MAX_PENDING_UPLOADS = 20;
export const MAX_UPLOADS_PER_DAY = 500;
const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 100;

const access = (row: MediaRow) => ({ ownerSub: row.owner_sub, status: row.status });

function ttlFor(config: Config, row: MediaRow): number {
  return mediaType(row.content_type).kind === 'video' ? config.videoUrlTtlSeconds : config.imageUrlTtlSeconds;
}

/** Public representation of a media item. Never exposes other users' `sub` or R2 keys. */
async function toItem(config: Config, principal: Principal, row: MediaRow) {
  const download = await presignDownload(config, row.id, ttlFor(config, row));
  return {
    id: row.id,
    name: row.original_name,
    contentType: row.content_type,
    kind: mediaType(row.content_type).kind,
    size: row.size_bytes,
    createdAt: row.created_at,
    mine: row.owner_sub === principal.sub,
    canDelete: canDeleteMedia(principal, access(row)),
    url: download.url,
    urlExpiresAt: download.expiresAt,
  };
}

// --- cursor ---------------------------------------------------------------

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function encodeCursor(row: MediaRow): string {
  return btoa(`${row.created_at}|${row.id}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeCursor(raw: string | null): PageCursor | null {
  if (raw === null) return null;
  const invalid = new HttpError(400, 'invalid_cursor', 'Invalid cursor.');
  if (raw.length > 128 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw invalid;
  let decoded: string;
  try {
    decoded = atob(raw.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    throw invalid;
  }
  const [createdAt, id, ...rest] = decoded.split('|');
  if (rest.length > 0 || !createdAt || !ISO_UTC.test(createdAt) || !id) throw invalid;
  try {
    return { createdAt, id: parseMediaId(id) };
  } catch {
    throw invalid;
  }
}

function pageSize(raw: string | null): number {
  if (raw === null) return PAGE_SIZE_DEFAULT;
  const size = Number(raw);
  if (!Number.isInteger(size) || size < 1 || size > PAGE_SIZE_MAX) {
    throw new HttpError(400, 'invalid_limit', `limit must be between 1 and ${PAGE_SIZE_MAX}.`);
  }
  return size;
}

// --- handlers -------------------------------------------------------------

/** GET /api/media?limit=&cursor= */
export const listMedia: AuthenticatedHandler = async ({ request, env, config, principal }) => {
  const params = new URL(request.url).searchParams;
  const limit = pageSize(params.get('limit'));
  const rows = await listReady(env.DB, limit + 1, decodeCursor(params.get('cursor')));
  const page = rows.slice(0, limit).filter((row) => canViewMedia(principal, access(row)));
  const items = await Promise.all(page.map((row) => toItem(config, principal, row)));
  const last = rows.length > limit ? rows[limit - 1] : undefined;
  return json({ items, nextCursor: last ? encodeCursor(last) : null });
};

/** POST /api/media  {fileName, size, contentType} -> presigned single-use PUT */
export const createUpload: AuthenticatedHandler = async ({ request, env, config, principal }) => {
  const body = await readJsonObject(request);
  const { contentType, size } = body;

  if (!isAllowedContentType(contentType)) {
    throw new HttpError(415, 'unsupported_type', 'File type not allowed.');
  }
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0) {
    throw new HttpError(400, 'invalid_size', 'Invalid file size.');
  }
  if (size > config.maxUploadBytes) {
    throw new HttpError(413, 'file_too_large', 'File too large.');
  }
  const fileName = sanitizeFileName(body['fileName'], contentType);
  if (fileName === null) {
    throw new HttpError(400, 'invalid_file_name', 'File name or extension not allowed for this type.');
  }

  const now = new Date();
  const counts = await uploadCounts(env.DB, principal.sub, new Date(now.getTime() - 24 * 3600 * 1000).toISOString());
  if (counts.pending >= MAX_PENDING_UPLOADS || counts.recent >= MAX_UPLOADS_PER_DAY) {
    throw new HttpError(429, 'upload_quota_exceeded', 'Too many uploads, try again later.');
  }

  const id = newMediaId();
  await insertPending(env.DB, {
    id,
    object_key: objectKeyFor(id),
    owner_sub: principal.sub,
    original_name: fileName,
    content_type: contentType,
    size_bytes: size,
    created_at: now.toISOString(),
  });

  const upload = await presignUpload(config, id, contentType, size, now);
  // Content-Length is set by the browser from the file itself; it is signed anyway.
  const clientHeaders = Object.fromEntries(
    Object.entries(upload.headers).filter(([name]) => name !== 'Content-Length'),
  );
  return json(
    { id, upload: { method: 'PUT', url: upload.url, headers: clientHeaders, expiresAt: upload.expiresAt } },
    { status: 201 },
  );
};

/** POST /api/media/:id/complete -> verifies the stored object and publishes it. */
export const completeUpload: AuthenticatedHandler = async ({ env, config, principal, params }) => {
  const id = parseMediaId(params['id']);
  const row = await findById(env.DB, id);
  if (!row || !canCompleteUpload(principal, access(row))) throw notFound();

  const key = objectKeyFor(row.id);
  const head = await env.MEDIA_BUCKET.head(key);
  if (!head) throw new HttpError(409, 'upload_missing', 'The file has not been uploaded yet.');

  const head64 = await env.MEDIA_BUCKET.get(key, { range: { offset: 0, length: SNIFF_BYTES } });
  const firstBytes = head64 ? new Uint8Array(await head64.arrayBuffer()) : new Uint8Array();
  const valid =
    head.size === row.size_bytes &&
    head.size <= config.maxUploadBytes &&
    head.httpMetadata?.contentType === row.content_type &&
    sniffSignature(firstBytes) === mediaType(row.content_type).signature;

  if (!valid) {
    await env.MEDIA_BUCKET.delete(key);
    await deleteById(env.DB, row.id);
    throw new HttpError(422, 'invalid_file', 'The file content does not match its declared type.');
  }

  const completedAt = new Date().toISOString();
  if (!(await markReady(env.DB, row.id, principal.sub, completedAt))) throw notFound();
  return json(await toItem(config, principal, { ...row, status: 'ready', completed_at: completedAt }));
};

/** GET /api/media/:id/url[?download=1] -> short-lived GET URL */
export const getMediaUrl: AuthenticatedHandler = async ({ request, env, config, principal, params }) => {
  const id = parseMediaId(params['id']);
  const row = await findById(env.DB, id);
  if (!row || !canViewMedia(principal, access(row))) throw notFound();

  const download = new URL(request.url).searchParams.get('download') === '1';
  const signed = await presignDownload(config, row.id, ttlFor(config, row), {
    ...(download ? { contentDisposition: contentDisposition('attachment', row.original_name) } : {}),
  });
  return json({ url: signed.url, expiresAt: signed.expiresAt });
};

/** DELETE /api/media/:id -> owner or admin. */
export const deleteMedia: AuthenticatedHandler = async ({ env, principal, params }) => {
  const id = parseMediaId(params['id']);
  const row = await findById(env.DB, id);
  // Items the caller cannot even see are reported as missing (no probing).
  const visible = row && (canViewMedia(principal, access(row)) || row.owner_sub === principal.sub);
  if (!row || !visible) throw notFound();
  if (!canDeleteMedia(principal, access(row))) throw forbidden();

  // Object first: deleting a missing object is a no-op, so a retry after a D1 failure is safe.
  await env.MEDIA_BUCKET.delete(objectKeyFor(row.id));
  await deleteById(env.DB, row.id);
  return new Response(null, { status: 204 });
};
