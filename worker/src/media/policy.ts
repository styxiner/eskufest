import type { Principal } from '../auth/access-token';

/**
 * Per-object authorization rules for media. Every rule requires an approved principal,
 * even though routes already enforce it, so the policy is safe to reuse anywhere.
 *
 * Callers must answer 404 (not 403) when a rule denies access to an existing object,
 * so that ids cannot be probed. Today every approved user can see every ready item;
 * per-user visibility would be added here and only here.
 */
export interface MediaAccessView {
  ownerSub: string;
  status: 'pending' | 'ready';
}

export function canViewMedia(principal: Principal, media: MediaAccessView): boolean {
  return principal.approved && media.status === 'ready';
}

export function canDeleteMedia(principal: Principal, media: MediaAccessView): boolean {
  return principal.approved && (principal.role === 'admin' || media.ownerSub === principal.sub);
}

/** Only the uploader can finalize their own pending upload. */
export function canCompleteUpload(principal: Principal, media: MediaAccessView): boolean {
  return principal.approved && media.status === 'pending' && media.ownerSub === principal.sub;
}
