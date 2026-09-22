/**
 * Goal: every file under src/ is reached from src/main.tsx (2026-09-22).
 *
 * The 22 September audit's frontend half: with the retired twin's routes out of App.tsx, 308
 * of 540 files under src/ were reachable from nothing, and 78 of the 109 type errors and 20 of
 * the 66 lint errors lived in them. They are deleted; this keeps the count at zero, so a page
 * that loses its route also loses its files, in the same pull request.
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { frontFiles, frontReachable, frontUnreachable } from '../../scripts/ci/front-reach.mjs';

const ROOT = path.resolve(new URL('../../', import.meta.url).pathname);

describe('the front end has no unreachable file', () => {
  it('reaches the product from the entry', () => {
    const reached = frontReachable(['src/main.tsx'], { root: ROOT });
    for (const f of ['src/App.tsx', 'src/pages/money/MoneyV2Page.tsx', 'src/pages/money/MoneyChatPage.tsx', 'src/styles/register.css', 'src/styles/money-chat.css', 'src/pages/Parked.tsx']) {
      expect(reached.has(f), f).toBe(true);
    }
  });
  it('leaves nothing under src/ unreached', () => {
    expect(frontFiles(ROOT).length).toBeGreaterThan(150);
    expect(frontUnreachable(ROOT)).toEqual([]);
  });
});
