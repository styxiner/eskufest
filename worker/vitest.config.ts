import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Fixed, obviously fake test configuration. Tests never talk to a real Auth0 tenant or R2.
export const TEST_VARS = {
  AUTH0_DOMAIN: 'tenant.test.example',
  AUTH0_AUDIENCE: 'https://api.test.example',
  AUTH0_ISSUER: 'https://tenant.test.example/',
  AUTH0_CLAIMS_NAMESPACE: 'https://album.test.example/',
  ALLOWED_ORIGIN: 'https://album.test.example',
  MAX_UPLOAD_BYTES: '1048576',
  R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
  R2_BUCKET_NAME: 'album-media',
  R2_JURISDICTION: 'eu',
  UPLOAD_URL_TTL_SECONDS: '600',
  IMAGE_URL_TTL_SECONDS: '600',
  VIDEO_URL_TTL_SECONDS: '3600',
  // Fake credentials with the right shape. Presigning is local; tests never reach R2.
  R2_ACCESS_KEY_ID: 'a'.repeat(32),
  R2_SECRET_ACCESS_KEY: 'b'.repeat(64),
};

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // Tests run fully offline: never connect bindings to real Cloudflare resources.
      remoteBindings: false,
      miniflare: {
        bindings: { ...TEST_VARS, TEST_MIGRATIONS: await readD1Migrations('./migrations') },
      },
    }),
  ],
  test: {
    setupFiles: ['./test/apply-migrations.ts'],
  },
}));
