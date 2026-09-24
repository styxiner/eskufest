import { describe, expect, it } from 'vitest';

import type { Principal } from '../src/auth/access-token';
import { assertAccess } from '../src/auth/authorize';
import { objectKeyFor, parseMediaId } from '../src/media/ids';
import { canCompleteUpload, canDeleteMedia, canViewMedia, type MediaAccessView } from '../src/media/policy';

const member: Principal = { sub: 'auth0|member', approved: true, role: 'member' };
const other: Principal = { sub: 'auth0|other', approved: true, role: 'member' };
const admin: Principal = { sub: 'auth0|admin', approved: true, role: 'admin' };
const pendingAdmin: Principal = { sub: 'auth0|x', approved: false, role: 'admin' };
const pendingOwner: Principal = { sub: 'auth0|member', approved: false, role: 'member' };

const ready: MediaAccessView = { ownerSub: 'auth0|member', status: 'ready' };
const uploading: MediaAccessView = { ownerSub: 'auth0|member', status: 'pending' };

describe('assertAccess', () => {
  it('authenticated: any valid principal', () => {
    expect(() => assertAccess(pendingOwner, 'authenticated')).not.toThrow();
  });

  it('approved: rejects unapproved principals', () => {
    expect(() => assertAccess(member, 'approved')).not.toThrow();
    expect(() => assertAccess(pendingOwner, 'approved')).toThrow(expect.objectContaining({ status: 403, code: 'not_approved' }));
  });

  it('admin: requires approval AND the admin role', () => {
    expect(() => assertAccess(admin, 'admin')).not.toThrow();
    expect(() => assertAccess(member, 'admin')).toThrow(expect.objectContaining({ status: 403, code: 'forbidden' }));
    expect(() => assertAccess(pendingAdmin, 'admin')).toThrow(expect.objectContaining({ code: 'not_approved' }));
  });
});

describe('media policy', () => {
  it('view: approved users see ready items only', () => {
    expect(canViewMedia(member, ready)).toBe(true);
    expect(canViewMedia(other, ready)).toBe(true);
    expect(canViewMedia(member, uploading)).toBe(false);
    expect(canViewMedia(pendingAdmin, ready)).toBe(false);
  });

  it('delete: owner or admin, never unapproved users', () => {
    expect(canDeleteMedia(member, ready)).toBe(true);
    expect(canDeleteMedia(admin, ready)).toBe(true);
    expect(canDeleteMedia(other, ready)).toBe(false);
    expect(canDeleteMedia(pendingAdmin, ready)).toBe(false);
    expect(canDeleteMedia(pendingOwner, ready)).toBe(false);
  });

  it('complete: only the uploader, only while pending', () => {
    expect(canCompleteUpload(member, uploading)).toBe(true);
    expect(canCompleteUpload(member, ready)).toBe(false);
    expect(canCompleteUpload(other, uploading)).toBe(false);
    expect(canCompleteUpload(admin, uploading)).toBe(false);
    expect(canCompleteUpload(pendingOwner, uploading)).toBe(false);
  });
});

describe('media ids and object keys', () => {
  it('accepts canonical UUID v4 and builds media/{id}', () => {
    const id = crypto.randomUUID();
    expect(parseMediaId(id)).toBe(id);
    expect(objectKeyFor(id)).toBe(`media/${id}`);
  });

  it.each(['', '../x', 'media/x', '*', `${crypto.randomUUID()}/../x`, ' '.repeat(36)])('never builds a key from %j', (id) => {
    expect(() => objectKeyFor(id)).toThrow(expect.objectContaining({ status: 404 }));
  });
});
