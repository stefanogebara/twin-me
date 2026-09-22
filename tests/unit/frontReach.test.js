/** The front-end import walker sees every kind of import Vite follows, and only one statement at a time. */
import { describe, expect, it } from 'vitest';
import { frontImportsOf, resolveFront } from '../../scripts/ci/front-reach.mjs';

describe('frontImportsOf', () => {
  it('sees bindings, side effects, re-exports, dynamic imports, the alias and CSS @import', () => {
    const src = `
      import React from 'react';
      import Page from './Page';
      import '../../styles/money-setup.css';
      import { a } from '@/lib/a';
      export { b } from './b';
      const C = lazy(() => import("./pages/C"));
      @import './register.css';
      @import url("./kit.css");
    `;
    expect(frontImportsOf(src)).toEqual(['./Page', '../../styles/money-setup.css', '@/lib/a', './b', './pages/C', './register.css', './kit.css']);
  });
  it('never runs from one statement into the next', () => {
    /* The old regex let a side-effect import swallow everything up to a later `from`. */
    const src = "import './x.css';\nimport y from './y';\n";
    expect(frontImportsOf(src)).toEqual(['./x.css', './y']);
  });
});

describe('resolveFront', () => {
  it('resolves the alias and extension-less specifiers like Vite', () => {
    const files = new Set(['/r/src/lib/a.ts', '/r/src/pages/C.tsx', '/r/src/ui/index.tsx', '/r/src/styles/k.css']);
    const exists = (f) => files.has(f);
    expect(resolveFront('/r/src/App.tsx', '@/lib/a', { root: '/r', exists })).toBe('/r/src/lib/a.ts');
    expect(resolveFront('/r/src/App.tsx', './pages/C', { root: '/r', exists })).toBe('/r/src/pages/C.tsx');
    expect(resolveFront('/r/src/App.tsx', './ui', { root: '/r', exists })).toBe('/r/src/ui/index.tsx');
    expect(resolveFront('/r/src/index.css', './styles/k.css', { root: '/r', exists })).toBe('/r/src/styles/k.css');
    expect(resolveFront('/r/src/App.tsx', './missing', { root: '/r', exists })).toBe(null);
  });
});
