import { HttpError } from '../errors/http-error';

const ALLOWED_METHODS = ['GET', 'POST', 'DELETE'] as const;
const ALLOWED_HEADERS = new Set(['authorization', 'content-type']);
const PREFLIGHT_MAX_AGE_SECONDS = '600';

const forbiddenOrigin = () => new HttpError(403, 'origin_not_allowed', 'Origin not allowed.');

/**
 * Rejects requests coming from a browser origin other than the configured one.
 * Requests without an Origin header (non-browser clients) pass through: they still
 * need a valid access token, CORS is not an authorization mechanism.
 */
export function assertOriginAllowed(request: Request, allowedOrigin: string): void {
  const origin = request.headers.get('Origin');
  if (origin !== null && origin !== allowedOrigin) throw forbiddenOrigin();
}

/** Answers a CORS preflight. Only the exact allowed origin, methods and headers pass. */
export function preflight(request: Request, allowedOrigin: string): Response {
  assertOriginAllowed(request, allowedOrigin);
  if (request.headers.get('Origin') === null) throw forbiddenOrigin();

  const method = request.headers.get('Access-Control-Request-Method') ?? '';
  if (!(ALLOWED_METHODS as readonly string[]).includes(method)) {
    throw new HttpError(403, 'cors_method_not_allowed', 'Method not allowed by CORS policy.');
  }

  const requested = (request.headers.get('Access-Control-Request-Headers') ?? '')
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  if (requested.some((header) => !ALLOWED_HEADERS.has(header))) {
    throw new HttpError(403, 'cors_header_not_allowed', 'Header not allowed by CORS policy.');
  }

  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': ALLOWED_METHODS.join(', '),
      'Access-Control-Allow-Headers': [...ALLOWED_HEADERS].join(', '),
      'Access-Control-Max-Age': PREFLIGHT_MAX_AGE_SECONDS,
    },
  });
}

/** Adds CORS headers when the request comes from the allowed origin. Never uses `*`. */
export function withCors(request: Request, response: Response, allowedOrigin: string): Response {
  const withHeaders = new Response(response.body, response);
  withHeaders.headers.append('Vary', 'Origin');
  if (request.headers.get('Origin') === allowedOrigin) {
    withHeaders.headers.set('Access-Control-Allow-Origin', allowedOrigin);
  }
  return withHeaders;
}
