import { AwsV4Signer } from 'aws4fetch';
import type { Config } from '../config';
import { objectKeyFor } from './ids';

// Derived SigV4 signing keys, reused within the isolate.
const signingKeyCache = new Map<string, ArrayBuffer>();

export interface PresignedRequest {
  url: string;
  /** Headers the client MUST send verbatim (they are part of the signature). */
  headers: Record<string, string>;
  expiresAt: string;
}

function amzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

async function presign(
  config: Config,
  id: string,
  method: 'GET' | 'PUT',
  { signedAt, ttlSeconds, headers = {}, query = {} }: {
    signedAt: Date;
    ttlSeconds: number;
    headers?: Record<string, string>;
    query?: Record<string, string>;
  },
): Promise<PresignedRequest> {
  const url = new URL(`${config.r2.endpoint}/${config.r2.bucket}/${objectKeyFor(id)}`);
  // Always explicit: aws4fetch would otherwise default to 24 hours.
  url.searchParams.set('X-Amz-Expires', String(ttlSeconds));
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);

  const signer = new AwsV4Signer({
    method,
    url: url.toString(),
    headers,
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
    service: 's3',
    region: 'auto',
    signQuery: true,
    // Sign every header we pass (aws4fetch skips Content-Type/Length by default).
    allHeaders: true,
    datetime: amzDate(signedAt),
    cache: signingKeyCache,
  });
  const signed = await signer.sign();
  return {
    url: signed.url.toString(),
    headers,
    expiresAt: new Date(signedAt.getTime() + ttlSeconds * 1000).toISOString(),
  };
}

/**
 * PUT URL for one specific object. R2 rejects the upload unless the request carries
 * exactly these Content-Type and Content-Length values, and `If-None-Match: *` makes
 * the URL single-use: once the object exists it cannot be overwritten.
 */
export function presignUpload(config: Config, id: string, contentType: string, size: number, now = new Date()) {
  return presign(config, id, 'PUT', {
    signedAt: now,
    ttlSeconds: config.uploadUrlTtlSeconds,
    headers: { 'Content-Type': contentType, 'Content-Length': String(size), 'If-None-Match': '*' },
  });
}

/**
 * GET URL for one object. The signing time is rounded down to a window of `ttl`
 * seconds so the URL stays identical within the window (browser cache hits); it is
 * valid for between `ttl` and `2 * ttl` seconds after being issued.
 */
export function presignDownload(
  config: Config,
  id: string,
  ttlSeconds: number,
  { contentDisposition, now = new Date() }: { contentDisposition?: string; now?: Date } = {},
) {
  const windowMs = ttlSeconds * 1000;
  const signedAt = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const query: Record<string, string> = {};
  if (contentDisposition) query['response-content-disposition'] = contentDisposition;
  return presign(config, id, 'GET', { signedAt, ttlSeconds: ttlSeconds * 2, query });
}
