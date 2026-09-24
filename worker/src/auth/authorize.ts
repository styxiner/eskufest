import type { Config } from '../config';
import { HttpError } from '../errors/http-error';
import type { Access } from '../http/router';
import { authenticate, type Principal } from './access-token';

export const notApproved = () =>
  new HttpError(403, 'not_approved', 'Your account is pending approval.');

export const forbidden = () => new HttpError(403, 'forbidden', 'Forbidden.');

/** Checks that an authenticated principal satisfies a non-public access level. */
export function assertAccess(principal: Principal, access: Exclude<Access, 'public'>): void {
  if (access === 'authenticated') return;
  if (!principal.approved) throw notApproved();
  if (access === 'admin' && principal.role !== 'admin') throw forbidden();
}

/** Authenticates the request (401 on failure) and enforces the route's access level (403). */
export async function authorize(
  request: Request,
  config: Config,
  access: Exclude<Access, 'public'>,
): Promise<Principal> {
  const principal = await authenticate(request, config);
  assertAccess(principal, access);
  return principal;
}
