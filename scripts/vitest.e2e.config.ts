import { defineConfig } from 'vitest/config';

// Opt-in config for scripts/e2e-sync-smoke.test.ts (needs a running backend; see the header of that file).
export default defineConfig({
  root: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  test: { environment: 'node', include: ['scripts/**/*.test.ts'] },
});
