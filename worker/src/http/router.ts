import type { Principal } from '../auth/access-token';
import type { Config } from '../config';
import { methodNotAllowed, notFound } from '../errors/http-error';

/**
 * Access level required by a route, enforced by the dispatcher BEFORE the handler runs.
 * - public:        no token needed
 * - authenticated: valid access token (approved or not)
 * - approved:      valid token with the `approved` claim
 * - admin:         approved and role=admin
 */
export type Access = 'public' | 'authenticated' | 'approved' | 'admin';

interface BaseContext {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  config: Config;
  params: Record<string, string>;
}

export interface PublicContext extends BaseContext {
  principal: null;
}

export interface AuthenticatedContext extends BaseContext {
  principal: Principal;
}

export type RequestContext = PublicContext | AuthenticatedContext;

type Result = Promise<Response> | Response;
export type PublicHandler = (context: PublicContext) => Result;
export type AuthenticatedHandler = (context: AuthenticatedContext) => Result;

export type Route =
  | { method: string; pathname: string; pattern: URLPattern; access: 'public'; handler: PublicHandler }
  | {
      method: string;
      pathname: string;
      pattern: URLPattern;
      access: Exclude<Access, 'public'>;
      handler: AuthenticatedHandler;
    };

/** Minimal method + path router based on the standard URLPattern API. */
export class Router {
  private readonly table: Route[] = [];

  /** Registers a route that anyone may call. Use sparingly. */
  public(method: string, pathname: string, handler: PublicHandler): this {
    this.table.push({ method, pathname, pattern: new URLPattern({ pathname }), access: 'public', handler });
    return this;
  }

  /** Registers a route whose handler only runs after `access` has been verified. */
  protected(method: string, pathname: string, access: Exclude<Access, 'public'>, handler: AuthenticatedHandler): this {
    this.table.push({ method, pathname, pattern: new URLPattern({ pathname }), access, handler });
    return this;
  }

  /** Registered routes (used by tests to check that every route is protected). */
  get routes(): readonly Route[] {
    return this.table;
  }

  resolve(method: string, url: string): { route: Route; params: Record<string, string> } {
    const allowed: string[] = [];
    for (const route of this.table) {
      const match = route.pattern.exec(url);
      if (!match) continue;
      if (route.method !== method) {
        allowed.push(route.method);
        continue;
      }
      const params: Record<string, string> = {};
      for (const [key, value] of Object.entries(match.pathname.groups)) {
        if (value !== undefined) params[key] = value;
      }
      return { route, params };
    }
    throw allowed.length > 0 ? methodNotAllowed(allowed) : notFound();
  }
}
