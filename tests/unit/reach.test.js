/** The import walker behind the unmount: static ESM edges, resolved the way Node resolves them. */
import { describe, expect, it } from 'vitest';
import { importsOf, resolveImport, reachable, mounts } from '../../scripts/ci/reach.mjs';

describe('importsOf', () => {
  it('finds static, dynamic and re-exported relative imports and nothing bare', () => {
    const src = `
      import a from './a.js';
      import { b } from '../lib/b.js';
      import express from 'express';
      export { c } from './c.js';
      const d = await import('./d.js');
      import type { T } from './types';
    `;
    expect(importsOf(src)).toEqual(['./a.js', '../lib/b.js', './c.js', './d.js', './types']);
  });
});

describe('resolveImport', () => {
  it('tries the file, then .js, then index.js', () => {
    const files = new Set(['/r/api/x.js', '/r/api/lib/index.js']);
    const exists = (f) => files.has(f);
    expect(resolveImport('/r/api/server.js', './x', { exists })).toBe('/r/api/x.js');
    expect(resolveImport('/r/api/server.js', './lib', { exists })).toBe('/r/api/lib/index.js');
    expect(resolveImport('/r/api/server.js', './missing', { exists })).toBe(null);
  });
});

describe('reachable', () => {
  it('walks the graph from the roots and stops at the leaves', () => {
    const fsMap = {
      'api/a.js': "import './b.js'; import x from 'left-alone';",
      'api/b.js': "export * from './c.js';",
      'api/c.js': '',
      'api/orphan.js': "import './a.js';",
    };
    const root = '/repo';
    const abs = (f) => `${root}/${f}`;
    const exists = (f) => Object.keys(fsMap).some((k) => abs(k) === f);
    const read = (f) => fsMap[f.replace(`${root}/`, '')];
    const seen = reachable(['api/a.js'], { root, read, exists });
    expect([...seen].sort()).toEqual(['api/a.js', 'api/b.js', 'api/c.js']);
  });
});

describe('mounts', () => {
  it('reads the path and the router file of every app.use, through middleware arguments', () => {
    const server = `
      import moneyRoutes from './routes/money.js';
      import twinRoutes from './routes/twin.js';
      import cronX from './routes/cron-x.js';
      app.use('/api/auth/verify', verifyLimiter);
      app.use('/api/money', authenticateUser, moneyRoutes);
      app.use('/api/twin',
        aiLimiter,
        twinRoutes);
      app.use('/api/cron/x', legacyTwinGate, cronX); // a comment
    `;
    expect(mounts(server)).toEqual([
      { path: '/api/auth/verify', file: null, gated: false },
      { path: '/api/money', file: 'api/routes/money.js', gated: false },
      { path: '/api/twin', file: 'api/routes/twin.js', gated: false },
      { path: '/api/cron/x', file: 'api/routes/cron-x.js', gated: true },
    ]);
  });
});
