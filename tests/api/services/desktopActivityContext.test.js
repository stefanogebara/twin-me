/**
 * Tests for desktopActivityContext — P1 wire-the-loop (2026-06-11).
 *
 * The desktop Hummingbird panel seeds chat requests with
 * context.hummingbird_clips ([{ app, title }]). These are untrusted
 * client strings (window titles can contain anything) headed straight
 * for the twin system prompt, so the contract under test is:
 *   - cap at 6 entries
 *   - strip C0/C1 control characters
 *   - cap each field at 200 chars
 *   - skip entries with empty/missing app or title
 *   - never throw on malformed input; return null section when empty
 */
import { describe, it, expect } from 'vitest';
import {
  sanitizeHummingbirdClips,
  buildRecentActivitySection,
  MAX_HUMMINGBIRD_CLIPS,
  MAX_CLIP_FIELD_CHARS,
} from '../../../api/services/desktopActivityContext.js';

const clip = (app, title) => ({ app, title });

describe('sanitizeHummingbirdClips', () => {
  it('returns [] for non-array input', () => {
    expect(sanitizeHummingbirdClips(undefined)).toEqual([]);
    expect(sanitizeHummingbirdClips(null)).toEqual([]);
    expect(sanitizeHummingbirdClips('not-an-array')).toEqual([]);
    expect(sanitizeHummingbirdClips({ app: 'X', title: 'Y' })).toEqual([]);
    expect(sanitizeHummingbirdClips(42)).toEqual([]);
  });

  it('passes through clean clips unchanged', () => {
    const input = [clip('VS Code', 'twin-chat.js'), clip('Chrome', 'Supabase Dashboard')];
    expect(sanitizeHummingbirdClips(input)).toEqual([
      { app: 'VS Code', title: 'twin-chat.js' },
      { app: 'Chrome', title: 'Supabase Dashboard' },
    ]);
  });

  it('caps the list at MAX_HUMMINGBIRD_CLIPS (6)', () => {
    const input = Array.from({ length: 10 }, (_, i) => clip(`App${i}`, `Title${i}`));
    const result = sanitizeHummingbirdClips(input);
    expect(result).toHaveLength(MAX_HUMMINGBIRD_CLIPS);
    expect(result[5]).toEqual({ app: 'App5', title: 'Title5' });
  });

  it('strips control characters from app and title', () => {
    const ctrl = String.fromCharCode(0x07); // BEL
    const nul = String.fromCharCode(0x00);
    const c1 = String.fromCharCode(0x9b); // CSI (C1 range)
    const input = [clip(`Chro${nul}me`, `Tab${ctrl}one${c1}two`)];
    const [result] = sanitizeHummingbirdClips(input);
    expect(result.app).toBe('Chro me');
    expect(result.title).toBe('Tab one two');
  });

  it('collapses newlines and whitespace runs to single spaces', () => {
    const input = [clip('Slack', 'line one\n\nline   two\tthree')];
    const [result] = sanitizeHummingbirdClips(input);
    expect(result.title).toBe('line one line two three');
  });

  it('caps each field at MAX_CLIP_FIELD_CHARS (200)', () => {
    const long = 'x'.repeat(500);
    const [result] = sanitizeHummingbirdClips([clip(long, long)]);
    expect(result.app).toHaveLength(MAX_CLIP_FIELD_CHARS);
    expect(result.title).toHaveLength(MAX_CLIP_FIELD_CHARS);
  });

  it('skips entries with empty, whitespace-only, or missing fields', () => {
    const input = [
      clip('', 'no app'),
      clip('No title', ''),
      clip('   ', 'whitespace app'),
      clip('Whitespace title', '   '),
      { app: 'Missing title' },
      { title: 'Missing app' },
      null,
      undefined,
      'not-an-object',
      clip('Kept', 'This one survives'),
    ];
    expect(sanitizeHummingbirdClips(input)).toEqual([
      { app: 'Kept', title: 'This one survives' },
    ]);
  });

  it('skips entries with non-string app/title (numbers, objects)', () => {
    const input = [clip(123, 'numeric app'), clip('Obj title', { nested: true }), clip('OK', 'fine')];
    expect(sanitizeHummingbirdClips(input)).toEqual([{ app: 'OK', title: 'fine' }]);
  });

  it('is idempotent — sanitizing sanitized output is a no-op', () => {
    const once = sanitizeHummingbirdClips([clip('App', ('Ti' + String.fromCharCode(0x0a) + 'tle').repeat(60))]);
    expect(sanitizeHummingbirdClips(once)).toEqual(once);
  });
});

describe('buildRecentActivitySection', () => {
  it('renders the exact header and one line per clip', () => {
    const section = buildRecentActivitySection([
      clip('VS Code', 'twin-chat.js'),
      clip('Chrome', 'Supabase Dashboard'),
    ]);
    expect(section).toBe(
      '=== RECENT ACTIVITY (from your desktop) ===\n' +
        '- VS Code: twin-chat.js\n' +
        '- Chrome: Supabase Dashboard'
    );
  });

  it('returns null when there is nothing to show', () => {
    expect(buildRecentActivitySection(undefined)).toBeNull();
    expect(buildRecentActivitySection([])).toBeNull();
    expect(buildRecentActivitySection('garbage')).toBeNull();
    // All entries malformed -> still null, not an empty section
    expect(buildRecentActivitySection([clip('', ''), { app: 'x' }])).toBeNull();
  });

  it('sanitizes raw input itself (defense in depth when called directly)', () => {
    const section = buildRecentActivitySection(
      Array.from({ length: 9 }, (_, i) => clip(`App${i}`, `Line\n${i}`))
    );
    const lines = section.split('\n');
    expect(lines[0]).toBe('=== RECENT ACTIVITY (from your desktop) ===');
    expect(lines).toHaveLength(1 + MAX_HUMMINGBIRD_CLIPS);
    expect(lines[1]).toBe('- App0: Line 0');
  });
});
