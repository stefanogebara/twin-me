/**
 * Characterization tests for textProcessor — the pure text extraction/cleaning
 * methods on the exported singleton. DB methods (processUserData, storeText,
 * markAsProcessed, getProcessingStats) are Supabase-bound and not covered.
 *
 * Pins: per-platform text extraction, URL/code-block/whitespace/unicode
 * normalization, the naive language heuristic, content-type mapping, word
 * counting, and context extraction shapes.
 */
import { describe, it, expect } from 'vitest';
import textProcessor from '../../../api/services/textProcessor.js';

describe('normalizeText', () => {
  it('replaces URLs with the [URL] token', () => {
    expect(textProcessor.normalizeText('see https://example.com/x now')).toBe('see [URL] now');
  });

  it('replaces fenced code blocks with [CODE_BLOCK] and inline code with [CODE]', () => {
    expect(textProcessor.normalizeText('run ```const x = 1;``` here')).toBe('run [CODE_BLOCK] here');
    expect(textProcessor.normalizeText('call `foo()` please')).toBe('call [CODE] please');
  });

  it('collapses runs of whitespace and trims', () => {
    expect(textProcessor.normalizeText('  too    many\n\tspaces  ')).toBe('too many spaces');
  });

  it('collapses excessive repeated punctuation to a single mark', () => {
    expect(textProcessor.normalizeText('really???')).toBe('really?');
    expect(textProcessor.normalizeText('wow!!! nice...')).toBe('wow! nice.');
  });

  it('returns empty string for falsy input', () => {
    expect(textProcessor.normalizeText('')).toBe('');
    expect(textProcessor.normalizeText(null)).toBe('');
    expect(textProcessor.normalizeText(undefined)).toBe('');
  });

  it('applies NFKC unicode normalization', () => {
    // Fullwidth "Ａ" (U+FF21) normalizes to ASCII "A" under NFKC.
    expect(textProcessor.normalizeText('ＡBC')).toBe('ABC');
  });
});

describe('extractGitHubText', () => {
  it('extracts commit message', () => {
    expect(textProcessor.extractGitHubText({ message: 'fix bug' }, 'commit')).toBe('fix bug');
  });

  it('joins issue/PR title and body with a blank line', () => {
    expect(textProcessor.extractGitHubText({ title: 'T', body: 'B' }, 'issue')).toBe('T\n\nB');
    expect(textProcessor.extractGitHubText({ title: 'PR', body: '' }, 'pull_request')).toBe('PR\n\n');
  });

  it('returns empty string for an unknown data type', () => {
    expect(textProcessor.extractGitHubText({ message: 'x' }, 'unknown_type')).toBe('');
  });
});

describe('extractDiscordText', () => {
  it('prefers global_name over username for a profile', () => {
    expect(textProcessor.extractDiscordText({ global_name: 'Neo', username: 'neo123' }, 'profile')).toBe('Neo');
  });

  it('falls back to username when global_name is absent', () => {
    expect(textProcessor.extractDiscordText({ username: 'neo123' }, 'profile')).toBe('neo123');
  });

  it('formats a connection as "type: name"', () => {
    expect(textProcessor.extractDiscordText({ type: 'spotify', name: 'My Spotify' }, 'connection'))
      .toBe('spotify: My Spotify');
  });
});

describe('extractLinkedInText', () => {
  it('joins profile name parts', () => {
    expect(textProcessor.extractLinkedInText({ name: 'Ada Lovelace', given_name: 'Ada', family_name: 'Lovelace' }, 'profile'))
      .toBe('Ada Lovelace Ada Lovelace');
  });

  it('prefers post text over commentary', () => {
    expect(textProcessor.extractLinkedInText({ text: 'hello', commentary: 'ignored' }, 'post')).toBe('hello');
    expect(textProcessor.extractLinkedInText({ commentary: 'fallback' }, 'post')).toBe('fallback');
  });
});

describe('extractText — platform routing', () => {
  it('routes to the correct per-platform extractor', () => {
    expect(textProcessor.extractText({ message: 'm' }, 'github', 'commit')).toBe('m');
    expect(textProcessor.extractText({ username: 'u' }, 'discord', 'profile')).toBe('u');
  });

  it('returns empty string for an unsupported platform', () => {
    expect(textProcessor.extractText({ anything: 1 }, 'spotify', 'track')).toBe('');
  });
});

describe('detectLanguage (naive heuristic)', () => {
  it('labels text as en when >20% of the first 100 words are common English words', () => {
    // 4 common words (the, is, and, of) out of 5 words = 80% > 20%.
    expect(textProcessor.detectLanguage('the cat is fast and quick of course')).toBe('en');
  });

  it('labels text with few English function words as unknown', () => {
    expect(textProcessor.detectLanguage('gato veloz corre rapido pelo campo verde')).toBe('unknown');
  });
});

describe('mapContentType', () => {
  it('maps known data types to content types', () => {
    expect(textProcessor.mapContentType('commit')).toBe('message');
    expect(textProcessor.mapContentType('issue')).toBe('post');
    expect(textProcessor.mapContentType('issue_comment')).toBe('comment');
    expect(textProcessor.mapContentType('repository')).toBe('description');
    expect(textProcessor.mapContentType('guild')).toBe('metadata');
  });

  it('defaults unknown data types to "other"', () => {
    expect(textProcessor.mapContentType('nonexistent')).toBe('other');
  });
});

describe('countWords', () => {
  it('counts whitespace-separated non-empty tokens', () => {
    expect(textProcessor.countWords('one two three')).toBe(3);
  });

  it('ignores leading/trailing/multiple spaces', () => {
    expect(textProcessor.countWords('  a   b  ')).toBe(2);
  });
});

describe('extractContext', () => {
  it('extracts GitHub commit context (sha, additions, deletions)', () => {
    const ctx = textProcessor.extractContext(
      { repo: 'me/repo', url: 'http://x', sha: 'abc', additions: 5, deletions: 2, created_at: '2026-01-01' },
      'github',
      'commit',
    );
    expect(ctx.repo).toBe('me/repo');
    expect(ctx.sha).toBe('abc');
    expect(ctx.additions).toBe(5);
    expect(ctx.timestamp).toBe('2026-01-01');
  });

  it('extracts Discord guild context (name, id, member_count)', () => {
    const ctx = textProcessor.extractContext(
      { name: 'My Server', id: 'g1', approximate_member_count: 42 },
      'discord',
      'guild',
    );
    expect(ctx.guild_name).toBe('My Server');
    expect(ctx.member_count).toBe(42);
  });

  it('returns an empty object for an unhandled platform', () => {
    expect(textProcessor.extractContext({ a: 1 }, 'spotify', 'track')).toEqual({});
  });
});
