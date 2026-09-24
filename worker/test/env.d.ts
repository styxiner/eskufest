import type { D1Migration } from 'cloudflare:test';

declare global {
  namespace Cloudflare {
    // Test-only binding injected by vitest.config.ts.
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
