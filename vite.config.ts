/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * NASA OSDR sends no CORS headers, so the browser reaches it through a same-origin path. `/nasa-osdr/eda/api/...`
 * is forwarded to https://visualization.osdr.nasa.gov/eda/api/... in dev and in `vite preview`; a production
 * deployment needs the same rewrite on its web server.
 */
const nasaOsdrProxy = {
  '/nasa-osdr': { target: 'https://visualization.osdr.nasa.gov', changeOrigin: true, rewrite: (path: string) => path.replace('/nasa-osdr', '') },
};

export default defineConfig({
  plugins: [react()],
  server: { proxy: nasaOsdrProxy },
  preview: { proxy: nasaOsdrProxy },
  test: {
    // Core and adapter tests run in node. Component tests opt in with `// @vitest-environment jsdom`.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-support/setup.ts'],
  },
});
