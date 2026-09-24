import { json } from './http/responses';
import { Router } from './http/router';
import { completeUpload, createUpload, deleteMedia, getMediaUrl, listMedia } from './media/routes';
import { getMe } from './users/me';

/** The complete API surface. Every route declares its access level explicitly. */
export const router = new Router()
  // Liveness probe. Unauthenticated on purpose; reveals nothing.
  .public('GET', '/api/health', () => json({ status: 'ok' }))
  // Needs a valid token but not approval, so the UI can show the "pending" state.
  .protected('GET', '/api/me', 'authenticated', getMe)
  .protected('GET', '/api/media', 'approved', listMedia)
  .protected('POST', '/api/media', 'approved', createUpload)
  .protected('POST', '/api/media/:id/complete', 'approved', completeUpload)
  .protected('GET', '/api/media/:id/url', 'approved', getMediaUrl)
  .protected('DELETE', '/api/media/:id', 'approved', deleteMedia);
