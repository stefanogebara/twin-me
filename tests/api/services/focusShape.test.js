/**
 * Tests for the PURE core of focus-shape — the gates (enough sessions, enough
 * apps, fast-switching profile, a real deep dive), median dwell, longest-stretch
 * detection, the friendly-app label map, and the candidate text. The DB gather
 * is glue (verified live).
 */
import { describe, it, expect } from 'vitest';
import {
  friendlyApp,
  median,
  computeFocusShape,
  buildFocusShapeCandidate,
} from '../../../api/services/focusShape.js';

// n sessions of `app` each lasting `sec` seconds.
const s = (app, n, sec) => Array.from({ length: n }, () => ({ app, dwellSec: sec }));

describe('friendlyApp', () => {
  it('maps known process names to human labels', () => {
    expect(friendlyApp('chrome')).toBe('Chrome');
    expect(friendlyApp('WindowsTerminal')).toBe('Windows Terminal');
    expect(friendlyApp('EXCEL')).toBe('Excel');
    expect(friendlyApp('msedge.exe')).toBe('Edge');
  });
  it('title-cases unknown apps and splits camelCase', () => {
    expect(friendlyApp('MyCoolApp')).toBe('My Cool App');
    expect(friendlyApp('some_tool')).toBe('Some Tool');
  });
  it('returns null for empty/invalid input', () => {
    expect(friendlyApp('')).toBeNull();
    expect(friendlyApp(null)).toBeNull();
  });
});

describe('median', () => {
  it('handles odd and even lengths without mutating input', () => {
    const input = [5, 1, 3];
    expect(median(input)).toBe(3);
    expect(input).toEqual([5, 1, 3]); // unmutated
    expect(median([4, 2, 8, 6])).toBe(5);
    expect(median([])).toBe(0);
  });
});

describe('computeFocusShape', () => {
  it('surfaces fast switching + the longest deep dive', () => {
    const sessions = [
      ...s('brave', 200, 5),   // rapid flipping (workhorse browser)
      ...s('slack', 30, 8),
      ...s('WindowsTerminal', 20, 6),
      ...s('explorer', 10, 5),
      { app: 'chrome', dwellSec: 2280 }, // one 38-min deep dive
    ];
    const r = computeFocusShape(sessions);
    expect(r).not.toBeNull();
    expect(r.medianSec).toBe(5);
    expect(r.distinctApps).toBe(5);
    expect(r.longestMin).toBe(38);
    expect(r.longestApp).toBe('Chrome');
    expect(r.totalSessions).toBe(261);
  });

  it('returns null without enough sessions', () => {
    const sessions = [...s('brave', 10, 5), { app: 'chrome', dwellSec: 1200 }];
    expect(computeFocusShape(sessions)).toBeNull();
  });

  it('returns null without enough distinct apps', () => {
    const sessions = [...s('brave', 80, 5), { app: 'brave', dwellSec: 1200 }];
    expect(computeFocusShape(sessions)).toBeNull(); // 1 app
  });

  it('returns null when focuses are not actually short (no fast-switching)', () => {
    // 60 long sessions across 5 apps → median far above the fast threshold.
    const sessions = [
      ...s('code', 20, 300), ...s('chrome', 15, 200), ...s('slack', 10, 120),
      ...s('notion', 10, 90), ...s('terminal', 8, 150),
      { app: 'code', dwellSec: 1800 },
    ];
    expect(computeFocusShape(sessions)).toBeNull();
  });

  it('returns null when there is no real deep dive (no contrast)', () => {
    // fast switching but the longest stretch is only ~3 min (< MIN_DEEP_SEC).
    const sessions = [
      ...s('brave', 200, 5), ...s('slack', 30, 8),
      ...s('terminal', 20, 6), ...s('explorer', 10, 5),
      { app: 'chrome', dwellSec: 180 },
    ];
    expect(computeFocusShape(sessions)).toBeNull();
  });

  it('ignores zero/negative/non-finite dwell and blank apps', () => {
    const sessions = [
      ...s('brave', 200, 5), ...s('slack', 30, 8),
      ...s('terminal', 20, 6), ...s('explorer', 10, 5),
      { app: 'brave', dwellSec: 0 }, { app: '', dwellSec: 50 },
      { app: 'x', dwellSec: NaN },
      { app: 'chrome', dwellSec: 1200 },
    ];
    const r = computeFocusShape(sessions);
    expect(r).not.toBeNull();
    expect(r.totalSessions).toBe(261); // the 3 junk rows excluded
  });
});

describe('buildFocusShapeCandidate', () => {
  it('reads back the shape with a natural median phrase', () => {
    const c = buildFocusShapeCandidate({
      medianSec: 5, distinctApps: 27, longestMin: 38, longestApp: 'Chrome', totalSessions: 400,
    });
    expect(c).toMatch(/barely a few seconds/);
    expect(c).toMatch(/27 different apps/);
    expect(c).toMatch(/38 minutes in Chrome/);
  });
  it('says "about N seconds" for a slower-but-still-fast median', () => {
    const c = buildFocusShapeCandidate({
      medianSec: 18, distinctApps: 9, longestMin: 22, longestApp: 'Figma', totalSessions: 120,
    });
    expect(c).toMatch(/about 18 seconds/);
  });
  it('returns null for no finding', () => {
    expect(buildFocusShapeCandidate(null)).toBeNull();
    expect(buildFocusShapeCandidate({ longestApp: null })).toBeNull();
  });
});
