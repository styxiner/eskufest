import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { API, ORIGIN } from './helpers/tokens';

const call = (path: string, init?: RequestInit) => exports.default.fetch(new Request(`${API}${path}`, init));

describe('routing and response headers', () => {
  it('answers the health check with security headers', async () => {
    const response = await call('/api/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
  });

  it('returns a JSON 404 for unknown paths', async () => {
    const response = await call('/api/../../etc/passwd');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: 'not_found', message: 'Not found.' } });
  });

  it('returns 405 with Allow for a known path and wrong method', async () => {
    const response = await call('/api/health', { method: 'DELETE' });
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET');
  });
});

describe('CORS', () => {
  it('reflects only the configured origin, never *', async () => {
    const response = await call('/api/health', { headers: { Origin: ORIGIN } });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(response.headers.get('Vary')).toContain('Origin');
  });

  it('rejects requests from other origins', async () => {
    const response = await call('/api/health', { headers: { Origin: 'https://evil.example' } });
    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('rejects look-alike origins', async () => {
    for (const origin of [`${ORIGIN}.evil.example`, 'http://album.test.example', `${ORIGIN}:8443`, 'null']) {
      const response = await call('/api/health', { headers: { Origin: origin } });
      expect(response.status, origin).toBe(403);
    }
  });

  it('answers a valid preflight', async () => {
    const response = await call('/api/media', {
      method: 'OPTIONS',
      headers: {
        Origin: ORIGIN,
        'Access-Control-Request-Method': 'DELETE',
        'Access-Control-Request-Headers': 'Authorization, Content-Type',
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, DELETE');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });

  it('rejects preflights for disallowed origins, methods or headers', async () => {
    const cases: Record<string, string>[] = [
      { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' },
      { Origin: ORIGIN, 'Access-Control-Request-Method': 'PUT' },
      { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-forwarded-for' },
      { 'Access-Control-Request-Method': 'GET' },
    ];
    for (const headers of cases) {
      const response = await call('/api/media', { method: 'OPTIONS', headers });
      expect(response.status, JSON.stringify(headers)).toBe(403);
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeNull();
    }
  });
});
