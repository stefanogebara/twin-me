/**
 * Unit tests for src/lib/hummingbirdWidget.ts — the pure helpers behind the
 * desktop Hummingbird context seeding and the Widget's text-only action
 * summaries (P1 wire-the-loop).
 */
import { describe, it, expect } from 'vitest';
import {
  HUMMINGBIRD_CONTEXT_TTL_MS,
  normalizeClipAppName,
  parseHummingbirdContext,
  summarizeActionStart,
  summarizeActionResult,
  summarizeActionFailure,
} from '../../src/lib/hummingbirdWidget';

const NOW = 1_750_000_000_000;

function payload(clips: unknown, timestamp: number = NOW): string {
  return JSON.stringify({ clips, timestamp });
}

describe('normalizeClipAppName', () => {
  it('title-cases all-lowercase process names', () => {
    expect(normalizeClipAppName('brave')).toBe('Brave');
    expect(normalizeClipAppName('google chrome')).toBe('Google Chrome');
  });

  it('title-cases all-uppercase names', () => {
    expect(normalizeClipAppName('CODE')).toBe('Code');
  });

  it('preserves intentional mixed casing', () => {
    expect(normalizeClipAppName('VS Code')).toBe('VS Code');
    expect(normalizeClipAppName('IntelliJ IDEA')).toBe('IntelliJ IDEA');
  });

  it('trims and returns empty string for whitespace-only input', () => {
    expect(normalizeClipAppName('  spotify  ')).toBe('Spotify');
    expect(normalizeClipAppName('   ')).toBe('');
  });
});

describe('parseHummingbirdContext', () => {
  it('parses a valid payload and normalizes app casing', () => {
    const raw = payload([
      { app: 'brave', title: 'TwinMe replan doc' },
      { app: 'VS Code', title: 'Widget.tsx' },
    ]);
    expect(parseHummingbirdContext(raw, NOW)).toEqual([
      { app: 'Brave', title: 'TwinMe replan doc' },
      { app: 'VS Code', title: 'Widget.tsx' },
    ]);
  });

  it('returns [] for null, empty, or malformed JSON', () => {
    expect(parseHummingbirdContext(null, NOW)).toEqual([]);
    expect(parseHummingbirdContext('', NOW)).toEqual([]);
    expect(parseHummingbirdContext('{not json', NOW)).toEqual([]);
    expect(parseHummingbirdContext('42', NOW)).toEqual([]);
  });

  it('returns [] when timestamp is missing or stale', () => {
    expect(parseHummingbirdContext(JSON.stringify({ clips: [{ app: 'brave', title: '' }] }), NOW)).toEqual([]);
    const stale = payload([{ app: 'brave', title: '' }], NOW - HUMMINGBIRD_CONTEXT_TTL_MS - 1);
    expect(parseHummingbirdContext(stale, NOW)).toEqual([]);
  });

  it('accepts a payload just inside the TTL', () => {
    const fresh = payload([{ app: 'brave', title: '' }], NOW - HUMMINGBIRD_CONTEXT_TTL_MS + 1000);
    expect(parseHummingbirdContext(fresh, NOW)).toHaveLength(1);
  });

  it('skips entries without a usable app name and tolerates junk entries', () => {
    const raw = payload([
      { app: '', title: 'no app' },
      { app: 42, title: 'numeric app' },
      'not an object',
      null,
      { app: 'spotify' }, // missing title -> empty string
    ]);
    expect(parseHummingbirdContext(raw, NOW)).toEqual([{ app: 'Spotify', title: '' }]);
  });

  it('caps at 6 clips and truncates long titles', () => {
    const clips = Array.from({ length: 10 }, (_, i) => ({
      app: `app${i}`,
      title: 'x'.repeat(500),
    }));
    const out = parseHummingbirdContext(payload(clips), NOW);
    expect(out).toHaveLength(6);
    expect(out[0].title.length).toBe(160);
  });
});

describe('summarizeActionStart', () => {
  it('labels known tool families', () => {
    expect(summarizeActionStart('gmail_search')).toBe('Checking Gmail...');
    expect(summarizeActionStart('calendar_today')).toBe('Checking your calendar...');
  });

  it('de-snake-cases unknown tools', () => {
    expect(summarizeActionStart('web_search')).toBe('Checking web search...');
  });
});

describe('summarizeActionResult', () => {
  it('counts gmail results across known data shapes', () => {
    expect(summarizeActionResult('gmail_search', { messages: [1, 2, 3] })).toBe('Found 3 emails.');
    expect(summarizeActionResult('gmail_search', { emails: [1] })).toBe('Found 1 email.');
    expect(summarizeActionResult('gmail_search', [1, 2])).toBe('Found 2 emails.');
    expect(summarizeActionResult('gmail_search', { messages: [] })).toBe('No emails found.');
  });

  it('counts calendar events with singular/plural/empty wording', () => {
    expect(summarizeActionResult('calendar_today', { events: [1, 2] })).toBe('2 events on your calendar.');
    expect(summarizeActionResult('calendar_upcoming', { events: [1] })).toBe('1 event on your calendar.');
    expect(summarizeActionResult('calendar_today', { events: [] })).toBe('Nothing on your calendar.');
  });

  it('falls back to a neutral line when the payload is uncountable', () => {
    expect(summarizeActionResult('gmail_search', { weird: true })).toBe('Checked Gmail.');
    expect(summarizeActionResult('calendar_today', undefined)).toBe('Checked your calendar.');
  });

  it('never reports counts for write tools', () => {
    expect(summarizeActionResult('gmail_send', { messages: [] })).toBe('Done.');
    expect(summarizeActionResult('calendar_create', null)).toBe('Done.');
  });

  it('defaults to Done. for unknown tools', () => {
    expect(summarizeActionResult('drive_search', { files: [1] })).toBe('Done.');
    expect(summarizeActionResult('totally_new_tool', null)).toBe('Done.');
  });
});

describe('summarizeActionFailure', () => {
  it('produces a visible failure line', () => {
    expect(summarizeActionFailure('gmail_search')).toBe("Couldn't check Gmail.");
    expect(summarizeActionFailure('calendar_today')).toBe("Couldn't check your calendar.");
  });
});
