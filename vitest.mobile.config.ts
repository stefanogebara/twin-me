import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // DOM-backed screen tests use the web renderer and its React. Native primitives are
  // mocked: these check handlers/state, not native rendering or React 19 compatibility.
  resolve: { alias: { react: fileURLToPath(new URL('./node_modules/react', import.meta.url)) } },
  test: { environment: 'node', include: ['mobile/tests/**/*.test.{ts,tsx}'], maxWorkers: 2, isolate: true },
});
