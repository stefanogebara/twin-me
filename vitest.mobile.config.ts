import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['mobile/tests/**/*.test.ts'], maxWorkers: 2, isolate: true } });
