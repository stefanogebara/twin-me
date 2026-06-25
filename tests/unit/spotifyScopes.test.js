import { describe, it, expect } from 'vitest';
import {
  spotifyScopesFor,
  SPOTIFY_ENTERTAINMENT_SCOPES,
  SPOTIFY_RITUAL_SCOPES,
  SPOTIFY_SOUL_SCOPES,
} from '../../api/config/oauthScopes.js';

// OAuth consolidation (M2 #10): one Spotify connect surface, scope set chosen by
// a `scopeSet` param. Canonical soul-sig connect = the ENTERTAINMENT set (what
// /entertainment/connect/spotify already granted → no re-consent for existing
// users); 'ritual' opts into playback-control scopes.
describe('spotifyScopesFor', () => {
  it('defaults to the ENTERTAINMENT (canonical soul) set', () => {
    expect(spotifyScopesFor()).toBe(SPOTIFY_ENTERTAINMENT_SCOPES);
    expect(spotifyScopesFor(undefined)).toBe(SPOTIFY_ENTERTAINMENT_SCOPES);
    expect(spotifyScopesFor('soul')).toBe(SPOTIFY_ENTERTAINMENT_SCOPES); // any non-ritual value
  });

  it('returns the RITUAL set only for scopeSet="ritual"', () => {
    expect(spotifyScopesFor('ritual')).toBe(SPOTIFY_RITUAL_SCOPES);
  });

  it('keeps the three Spotify scope sets genuinely distinct', () => {
    expect(SPOTIFY_ENTERTAINMENT_SCOPES).not.toEqual(SPOTIFY_RITUAL_SCOPES);
    expect(SPOTIFY_ENTERTAINMENT_SCOPES).not.toEqual(SPOTIFY_SOUL_SCOPES);
    expect(SPOTIFY_RITUAL_SCOPES).not.toEqual(SPOTIFY_SOUL_SCOPES);
  });

  it('only the ritual set carries playback-control scopes', () => {
    expect(SPOTIFY_RITUAL_SCOPES).toContain('user-modify-playback-state');
    expect(SPOTIFY_RITUAL_SCOPES).toContain('streaming');
    expect(SPOTIFY_ENTERTAINMENT_SCOPES).not.toContain('user-modify-playback-state');
    expect(SPOTIFY_ENTERTAINMENT_SCOPES).not.toContain('streaming');
  });
});
