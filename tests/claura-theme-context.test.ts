import { describe, it, expect } from 'vitest';
import { normalizeTheme, resolveTheme, THEME_STORAGE_KEY } from '../src/contexts/ThemeContext';

// Claura port Phase 1 — contract for the unlocked theme machinery.
// Pure logic only (node env); the provider is a thin shell around these.

describe('normalizeTheme', () => {
  it('passes through valid themes', () => {
    expect(normalizeTheme('light')).toBe('light');
    expect(normalizeTheme('dark')).toBe('dark');
    expect(normalizeTheme('system')).toBe('system');
  });

  it('falls back to dark for anything invalid (corrupt storage, old values)', () => {
    expect(normalizeTheme(null)).toBe('dark');
    expect(normalizeTheme(undefined)).toBe('dark');
    expect(normalizeTheme('')).toBe('dark');
    expect(normalizeTheme('LIGHT')).toBe('dark');
    expect(normalizeTheme('auto')).toBe('dark');
    expect(normalizeTheme(42)).toBe('dark');
  });
});

describe('resolveTheme', () => {
  it('explicit choices ignore the OS preference', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('system follows the OS preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('storage key', () => {
  it('matches the key the /preview design prototypes persist, so a choice carries over', () => {
    expect(THEME_STORAGE_KEY).toBe('claura-theme');
  });
});
