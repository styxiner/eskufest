import { objectKeyFor } from './ids';
import { deleteById, listStalePending } from './repository';

/** Pending uploads older than this are considered abandoned. */
export const STALE_UPLOAD_MS = 6 * 3600 * 1000;
const BATCH = 100;

/** Removes abandoned uploads (row + any partially uploaded object). Runs from the cron trigger. */
export async function cleanupStaleUploads(env: Env, now = new Date()): Promise<number> {
  const stale = await listStalePending(env.DB, new Date(now.getTime() - STALE_UPLOAD_MS).toISOString(), BATCH);
  for (const row of stale) {
    await env.MEDIA_BUCKET.delete(objectKeyFor(row.id));
    await deleteById(env.DB, row.id);
  }
  return stale.length;
}
