/** Response of GET /api/me. The API is the source of truth for authorization. */
export interface Me {
  sub: string;
  status: 'approved' | 'pending';
  role: 'member' | 'admin' | null;
}

/** Error envelope returned by the Worker. */
export interface ApiErrorBody {
  error: { code: string; message: string };
}

export function apiErrorCode(body: unknown): string | null {
  const code = (body as Partial<ApiErrorBody> | null)?.error?.code;
  return typeof code === 'string' ? code : null;
}
