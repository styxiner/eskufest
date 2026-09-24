import type { AllowedContentType } from './types';

/** Row of the `media` table. All queries are parameterized; no SQL is built from input. */
export interface MediaRow {
  id: string;
  object_key: string;
  owner_sub: string;
  original_name: string;
  content_type: AllowedContentType;
  size_bytes: number;
  status: 'pending' | 'ready';
  created_at: string;
  completed_at: string | null;
}

export interface PageCursor {
  createdAt: string;
  id: string;
}

export function insertPending(db: D1Database, row: Omit<MediaRow, 'status' | 'completed_at'>) {
  return db
    .prepare(
      `INSERT INTO media (id, object_key, owner_sub, original_name, content_type, size_bytes, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    )
    .bind(row.id, row.object_key, row.owner_sub, row.original_name, row.content_type, row.size_bytes, row.created_at)
    .run();
}

export function findById(db: D1Database, id: string) {
  return db.prepare('SELECT * FROM media WHERE id = ?').bind(id).first<MediaRow>();
}

/** Uploads created by a user since `sinceIso`, plus how many of them are still pending. */
export async function uploadCounts(db: D1Database, ownerSub: string, sinceIso: string) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS recent, COALESCE(SUM(status = 'pending'), 0) AS pending
       FROM media WHERE owner_sub = ? AND created_at >= ?`,
    )
    .bind(ownerSub, sinceIso)
    .first<{ recent: number; pending: number }>();
  return { recent: row?.recent ?? 0, pending: row?.pending ?? 0 };
}

/** Transitions pending -> ready only for the uploader; returns false if nothing changed. */
export async function markReady(db: D1Database, id: string, ownerSub: string, completedAt: string): Promise<boolean> {
  const result = await db
    .prepare(`UPDATE media SET status = 'ready', completed_at = ? WHERE id = ? AND owner_sub = ? AND status = 'pending'`)
    .bind(completedAt, id, ownerSub)
    .run();
  return result.meta.changes === 1;
}

/** Newest first, keyset pagination on (created_at, id). */
export async function listReady(db: D1Database, limit: number, cursor: PageCursor | null): Promise<MediaRow[]> {
  const statement = cursor
    ? db
        .prepare(
          `SELECT * FROM media WHERE status = 'ready' AND (created_at, id) < (?, ?)
           ORDER BY created_at DESC, id DESC LIMIT ?`,
        )
        .bind(cursor.createdAt, cursor.id, limit)
    : db.prepare(`SELECT * FROM media WHERE status = 'ready' ORDER BY created_at DESC, id DESC LIMIT ?`).bind(limit);
  return (await statement.all<MediaRow>()).results;
}

export function deleteById(db: D1Database, id: string) {
  return db.prepare('DELETE FROM media WHERE id = ?').bind(id).run();
}

export async function listStalePending(db: D1Database, createdBeforeIso: string, limit: number): Promise<MediaRow[]> {
  const result = await db
    .prepare(`SELECT * FROM media WHERE status = 'pending' AND created_at < ? ORDER BY created_at LIMIT ?`)
    .bind(createdBeforeIso, limit)
    .all<MediaRow>();
  return result.results;
}
