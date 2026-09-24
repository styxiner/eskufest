import { notFound } from '../errors/http-error';

// Canonical lowercase UUID v4, exactly as produced by crypto.randomUUID().
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function newMediaId(): string {
  return crypto.randomUUID();
}

/**
 * Validates a media id coming from the URL. Anything that is not a canonical UUID v4
 * (path traversal, encoded slashes, other keys of the bucket...) is a plain 404.
 */
export function parseMediaId(raw: string | undefined): string {
  if (raw === undefined || !UUID_V4.test(raw)) throw notFound();
  return raw;
}

/** The ONLY way an R2 object key is built. Never from client input other than a validated id. */
export function objectKeyFor(id: string): string {
  return `media/${parseMediaId(id)}`;
}
