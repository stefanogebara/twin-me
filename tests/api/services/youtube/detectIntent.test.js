import { describe, it, expect } from 'vitest';
import { detectYoutubeIntent } from '../../../../api/services/youtube/detectIntent.js';

describe('detectYoutubeIntent', () => {
  it('returns null for empty', () => expect(detectYoutubeIntent('').kind).toBeNull());
  it('matches "what have I been watching" → watching', () =>
    expect(detectYoutubeIntent('what have I been watching').kind).toBe('watching'));
  it('matches "top channels" → watching', () =>
    expect(detectYoutubeIntent('what are my top channels').kind).toBe('watching'));
  it('matches "recently liked videos" → watching', () =>
    expect(detectYoutubeIntent('recently liked videos').kind).toBe('watching'));
  it('matches plain "youtube" → snapshot', () =>
    expect(detectYoutubeIntent('check youtube').kind).toBe('snapshot'));
  it('null for non-youtube question', () =>
    expect(detectYoutubeIntent('what color is the sky').kind).toBeNull());
});
