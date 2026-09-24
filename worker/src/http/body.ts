import { HttpError } from '../errors/http-error';

const invalidBody = () => new HttpError(400, 'invalid_body', 'Invalid request body.');

/**
 * Reads a small JSON object body. Requires `Content-Type: application/json` (which also
 * forces a CORS preflight) and caps the size before parsing.
 */
export async function readJsonObject(request: Request, maxBytes = 4096): Promise<Record<string, unknown>> {
  const type = request.headers.get('Content-Type') ?? '';
  if (!/^application\/json(\s*;\s*charset=utf-8)?$/i.test(type)) {
    throw new HttpError(415, 'unsupported_media_type', 'Expected application/json.');
  }
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > maxBytes) throw new HttpError(413, 'body_too_large', 'Request body too large.');

  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > maxBytes) throw new HttpError(413, 'body_too_large', 'Request body too large.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(buffer));
  } catch {
    throw invalidBody();
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw invalidBody();
  return parsed as Record<string, unknown>;
}
