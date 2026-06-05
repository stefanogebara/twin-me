import { describe, it, expect } from 'vitest';
import { detectGithubIntent } from '../../../../api/services/github/detectIntent.js';

describe('detectGithubIntent', () => {
  it('returns null for empty', () => expect(detectGithubIntent('').kind).toBeNull());
  it('matches "what have I been coding" → activity', () =>
    expect(detectGithubIntent('what have I been coding lately').kind).toBe('activity'));
  it('matches "github activity" → activity', () =>
    expect(detectGithubIntent('my github activity this week').kind).toBe('activity'));
  it('matches "recent commits" → activity', () =>
    expect(detectGithubIntent('recent commits to my repo').kind).toBe('activity'));
  it('matches "top repos" → activity', () =>
    expect(detectGithubIntent('what are my top repos').kind).toBe('activity'));
  it('matches plain "github" → snapshot', () =>
    expect(detectGithubIntent('check github').kind).toBe('snapshot'));
  it('null for non-github question', () =>
    expect(detectGithubIntent('what color is the sky').kind).toBeNull());
});
