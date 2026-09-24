import { HttpError } from './errors/http-error';

export interface Config {
  auth0Domain: string;
  auth0Audience: string;
  auth0Issuer: string;
  claimsNamespace: string;
  allowedOrigin: string;
  maxUploadBytes: number;
  r2: {
    /** https://<account>[.<jurisdiction>].r2.cloudflarestorage.com */
    endpoint: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
  uploadUrlTtlSeconds: number;
  imageUrlTtlSeconds: number;
  videoUrlTtlSeconds: number;
}

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const LOCAL_ORIGINS = new Set(['http://localhost:4200', 'http://127.0.0.1:4200']);

function httpsUrl(value: string, name: string, { trailingSlash }: { trailingSlash: boolean }): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} is not a valid URL`);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must be a plain https URL`);
  }
  if (trailingSlash !== value.endsWith('/')) {
    throw new Error(`${name} must ${trailingSlash ? '' : 'not '}end with "/"`);
  }
  return value;
}

function origin(value: string): string {
  if (LOCAL_ORIGINS.has(value)) return value;
  const url = httpsUrl(value, 'ALLOWED_ORIGIN', { trailingSlash: false });
  if (new URL(url).origin !== url) throw new Error('ALLOWED_ORIGIN must be an origin (no path)');
  return url;
}

function integer(value: string, name: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function r2(env: Env): Config['r2'] {
  if (!/^[0-9a-f]{32}$/.test(env.R2_ACCOUNT_ID)) throw new Error('R2_ACCOUNT_ID is invalid');
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(env.R2_BUCKET_NAME)) throw new Error('R2_BUCKET_NAME is invalid');
  if (!['', 'eu', 'fedramp'].includes(env.R2_JURISDICTION)) throw new Error('R2_JURISDICTION is invalid');
  // Only the shape is checked; the values are never logged.
  if (!/^[0-9a-f]{32}$/.test(env.R2_ACCESS_KEY_ID ?? '')) throw new Error('R2_ACCESS_KEY_ID secret is missing or invalid');
  if (!/^[0-9a-f]{64}$/.test(env.R2_SECRET_ACCESS_KEY ?? '')) {
    throw new Error('R2_SECRET_ACCESS_KEY secret is missing or invalid');
  }
  const jurisdiction = env.R2_JURISDICTION ? `.${env.R2_JURISDICTION}` : '';
  return {
    endpoint: `https://${env.R2_ACCOUNT_ID}${jurisdiction}.r2.cloudflarestorage.com`,
    bucket: env.R2_BUCKET_NAME,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  };
}

/** Parses and validates the Worker configuration. Throws on any invalid value. */
export function parseConfig(env: Env): Config {
  if (!HOSTNAME.test(env.AUTH0_DOMAIN)) throw new Error('AUTH0_DOMAIN must be a hostname');
  if (!env.AUTH0_AUDIENCE || env.AUTH0_AUDIENCE === 'REPLACE_ME') throw new Error('AUTH0_AUDIENCE is not set');

  // R2 single PUT limit is 5 GiB.
  const maxUploadBytes = integer(env.MAX_UPLOAD_BYTES, 'MAX_UPLOAD_BYTES', 1, 5 * 1024 ** 3);

  return {
    auth0Domain: env.AUTH0_DOMAIN,
    auth0Audience: env.AUTH0_AUDIENCE,
    auth0Issuer: httpsUrl(env.AUTH0_ISSUER, 'AUTH0_ISSUER', { trailingSlash: true }),
    claimsNamespace: httpsUrl(env.AUTH0_CLAIMS_NAMESPACE, 'AUTH0_CLAIMS_NAMESPACE', { trailingSlash: true }),
    allowedOrigin: origin(env.ALLOWED_ORIGIN),
    maxUploadBytes,
    r2: r2(env),
    // Short lifetimes: a leaked URL is only useful briefly and only for one object.
    uploadUrlTtlSeconds: integer(env.UPLOAD_URL_TTL_SECONDS, 'UPLOAD_URL_TTL_SECONDS', 60, 3600),
    imageUrlTtlSeconds: integer(env.IMAGE_URL_TTL_SECONDS, 'IMAGE_URL_TTL_SECONDS', 60, 3600),
    videoUrlTtlSeconds: integer(env.VIDEO_URL_TTL_SECONDS, 'VIDEO_URL_TTL_SECONDS', 60, 4 * 3600),
  };
}

const cache = new WeakMap<Env, Config>();

/**
 * Returns the validated config, failing closed with a generic 500 if it is invalid.
 * The detailed reason is only logged server-side.
 */
export function getConfig(env: Env): Config {
  let config = cache.get(env);
  if (!config) {
    try {
      config = parseConfig(env);
    } catch (error) {
      console.error('Invalid Worker configuration:', (error as Error).message);
      throw new HttpError(500, 'server_misconfigured', 'Server misconfigured.');
    }
    cache.set(env, config);
  }
  return config;
}
