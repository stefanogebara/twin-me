import { describe, it, expect } from 'vitest';
import { pickBackgroundVariant, type BackgroundMode } from '../src/lib/backgroundVariant';
import type { ResolvedTheme } from '../src/contexts/ThemeContext';

// Nocturne flip (2026-09-01). This used to assert that 'natural' + dark chose
// the DayNight photo set. That set is retired along with every other legacy
// background: the canvas is flat obsidian, painted in code, and 'ambient' is
// now the only variant there is.
//
// The signature still takes both arguments so the bg_mode preference plumbing
// and its callers stay untouched — which is exactly why this test exists. If
// photography ever comes back, it comes back deliberately, by editing this
// test first.

const MODES: BackgroundMode[] = ['natural', 'dark'];
const THEMES: ResolvedTheme[] = ['light', 'dark'];

describe('pickBackgroundVariant', () => {
  it('resolves to the ambient canvas for every mode/theme pair', () => {
    for (const mode of MODES) {
      for (const theme of THEMES) {
        expect(pickBackgroundVariant(mode, theme)).toBe('ambient');
      }
    }
  });

  it('never returns the retired daynight variant', () => {
    const results = MODES.flatMap((mode) =>
      THEMES.map((theme) => pickBackgroundVariant(mode, theme)),
    );
    expect(results).not.toContain('daynight');
  });
});
