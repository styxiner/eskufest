/**
 * An error that is safe to expose to the client. `code` is a stable machine-readable
 * identifier; `message` must never contain secrets, tokens or internal details.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFound = () => new HttpError(404, 'not_found', 'Not found.');

export const methodNotAllowed = (allowed: readonly string[]) =>
  new HttpError(405, 'method_not_allowed', 'Method not allowed.', { Allow: allowed.join(', ') });
