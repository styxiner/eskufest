import { authorize } from './auth/authorize';
import { getConfig } from './config';
import { HttpError } from './errors/http-error';
import { assertOriginAllowed, preflight, withCors } from './http/cors';
import { errorResponse, withSecurityHeaders } from './http/responses';
import { cleanupStaleUploads } from './media/cleanup';
import { router } from './routes';

async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const config = getConfig(env);
  if (request.method === 'OPTIONS') return preflight(request, config.allowedOrigin);
  assertOriginAllowed(request, config.allowedOrigin);

  const { route, params } = router.resolve(request.method, request.url);
  const base = { request, env, ctx, config, params };
  if (route.access === 'public') return route.handler({ ...base, principal: null });

  // Authentication + route-level authorization happen here, before any handler code.
  const principal = await authorize(request, config, route.access);
  return route.handler({ ...base, principal });
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    let response: Response;
    try {
      response = await handle(request, env, ctx);
    } catch (error) {
      if (error instanceof HttpError) {
        response = errorResponse(error);
      } else {
        // Log only the error itself; never the request headers (they carry tokens).
        console.error('Unhandled error:', error);
        response = errorResponse(new HttpError(500, 'internal_error', 'Internal error.'));
      }
    }

    let allowedOrigin: string | undefined;
    try {
      allowedOrigin = getConfig(env).allowedOrigin;
    } catch {
      allowedOrigin = undefined;
    }
    const secured = withSecurityHeaders(response);
    return allowedOrigin ? withCors(request, secured, allowedOrigin) : secured;
  },

  async scheduled(_controller, env): Promise<void> {
    const removed = await cleanupStaleUploads(env);
    if (removed > 0) console.warn(`Removed ${removed} abandoned upload(s).`);
  },
} satisfies ExportedHandler<Env>;
