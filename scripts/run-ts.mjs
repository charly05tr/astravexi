// Runs a TypeScript script through Vite's SSR loader, so scripts share the extensionless imports and JSON
// imports of src/ without a build step. Usage: node scripts/run-ts.mjs scripts/<file>.ts [args...]
import { createServer } from 'vite';
import { resolve } from 'node:path';

const [entry, ...args] = process.argv.slice(2);
if (!entry) {
  console.error('Usage: node scripts/run-ts.mjs <script.ts> [args...]');
  process.exit(2);
}
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
});
let code = 0;
try {
  const mod = await server.ssrLoadModule(resolve(entry));
  if (typeof mod.main === 'function') await mod.main(args);
} catch (error) {
  console.error(error);
  code = 1;
} finally {
  await server.close();
}
process.exit(code);
