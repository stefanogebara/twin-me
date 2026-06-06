import { describe, it, expect } from 'vitest';
import { detectRedditIntent } from '../../../../api/services/reddit/detectIntent.js';

describe('detectRedditIntent', () => {
  it('returns null for empty', () => expect(detectRedditIntent('').kind).toBeNull());
  it('matches "what subreddits am I in" → activity', () =>
    expect(detectRedditIntent('what subreddits am I in').kind).toBe('activity'));
  it('matches "top subreddits" → activity', () =>
    expect(detectRedditIntent('what are my top subreddits').kind).toBe('activity'));
  it('matches "my reddit activity" → activity', () =>
    expect(detectRedditIntent('show me my reddit activity').kind).toBe('activity'));
  it('matches "am I a lurker" → activity', () =>
    expect(detectRedditIntent('am I a reddit lurker').kind).toBe('activity'));
  it('matches "my reddit karma" → activity', () =>
    expect(detectRedditIntent('how much reddit karma do I have').kind).toBe('activity'));
  it('matches "r/programming" shorthand → snapshot', () =>
    expect(detectRedditIntent('something about r/programming').kind).toBe('snapshot'));
  it('matches plain "reddit" → snapshot', () =>
    expect(detectRedditIntent('check reddit').kind).toBe('snapshot'));
  it('null for non-reddit question', () =>
    expect(detectRedditIntent('what color is the sky').kind).toBeNull());
});
