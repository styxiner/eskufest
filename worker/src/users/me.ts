import { json } from '../http/responses';
import type { AuthenticatedHandler } from '../http/router';

/** GET /api/me: identity and authorization state of the caller, as seen by the API. */
export const getMe: AuthenticatedHandler = ({ principal }) =>
  json({
    sub: principal.sub,
    status: principal.approved ? 'approved' : 'pending',
    role: principal.approved ? principal.role : null,
  });
