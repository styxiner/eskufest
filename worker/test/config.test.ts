import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config';

const valid = env as unknown as Env;
const withVar = (name: keyof Env, value: string) => ({ ...valid, [name]: value }) as Env;

describe('parseConfig', () => {
  it('accepts the test configuration', () => {
    expect(parseConfig(valid)).toMatchObject({ allowedOrigin: 'https://album.test.example', maxUploadBytes: 1048576 });
  });

  it.each([
    ['AUTH0_DOMAIN', 'REPLACE_ME'],
    ['AUTH0_DOMAIN', 'https://tenant.test.example'],
    ['AUTH0_AUDIENCE', 'REPLACE_ME'],
    ['AUTH0_ISSUER', 'REPLACE_ME'],
    ['AUTH0_ISSUER', 'http://tenant.test.example/'],
    ['AUTH0_ISSUER', 'https://tenant.test.example'],
    ['AUTH0_CLAIMS_NAMESPACE', 'REPLACE_ME'],
    ['ALLOWED_ORIGIN', '*'],
    ['ALLOWED_ORIGIN', 'https://album.test.example/'],
    ['ALLOWED_ORIGIN', 'http://album.test.example'],
    ['MAX_UPLOAD_BYTES', '0'],
    ['MAX_UPLOAD_BYTES', 'abc'],
  ] as const)('rejects %s=%s', (name, value) => {
    expect(() => parseConfig(withVar(name, value))).toThrow();
  });
});
