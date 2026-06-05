/**
 * Tests for spotify/detectIntent.js. Same shape as the Whoop detector
 * tests — the regex behaviour is the spec, so each it() is a routing
 * promise.
 */

import { describe, it, expect } from 'vitest';
import { detectSpotifyIntent } from '../../../../api/services/spotify/detectIntent.js';

describe('detectSpotifyIntent', () => {
  describe('null intent', () => {
    it('returns null for empty input', () => {
      expect(detectSpotifyIntent('')).toEqual({ kind: null });
    });
    it('returns null for whitespace', () => {
      expect(detectSpotifyIntent('   ')).toEqual({ kind: null });
    });
    it('returns null for a non-music question', () => {
      expect(detectSpotifyIntent('what should I cook for dinner')).toEqual({ kind: null });
    });
  });

  describe('snapshot', () => {
    it('matches "what music is playing" (music-noun only)', () => {
      expect(detectSpotifyIntent('what music is playing')).toEqual({ kind: 'snapshot' });
    });
    it('matches "any new albums I should know about"', () => {
      expect(detectSpotifyIntent('any new albums I should know about')).toEqual({
        kind: 'snapshot',
      });
    });
    it('matches "what band are you into"', () => {
      // "you" is the twin — this is a music noun query.
      expect(detectSpotifyIntent('what band are you into')).toEqual({ kind: 'snapshot' });
    });
  });

  describe('recent_listening', () => {
    it('matches "what have I been listening to"', () => {
      const r = detectSpotifyIntent('what have I been listening to');
      expect(r.kind).toBe('recent_listening');
    });
    it('matches "what did I listen to today"', () => {
      const r = detectSpotifyIntent('what did I listen to today');
      expect(r.kind).toBe('recent_listening');
    });
    it('matches "show me my recent tracks"', () => {
      const r = detectSpotifyIntent('show me my recent tracks');
      expect(r.kind).toBe('recent_listening');
    });
    it('matches "top artists this week"', () => {
      const r = detectSpotifyIntent('top artists this week');
      expect(r.kind).toBe('recent_listening');
    });
    it('matches "what are my top tracks"', () => {
      const r = detectSpotifyIntent('what are my top tracks');
      expect(r.kind).toBe('recent_listening');
    });
    it('matches "what genres have I been into"', () => {
      const r = detectSpotifyIntent('what genres have I been into');
      expect(r.kind).toBe('recent_listening');
    });
    it('matches "my music mood lately"', () => {
      const r = detectSpotifyIntent('my music mood lately');
      expect(r.kind).toBe('recent_listening');
    });
    it('matches "who am I listening to most"', () => {
      const r = detectSpotifyIntent('who am I listening to most');
      expect(r.kind).toBe('recent_listening');
    });
  });

  describe('defensive', () => {
    it('returns null for undefined input', () => {
      expect(detectSpotifyIntent(undefined)).toEqual({ kind: null });
    });
    it('is case-insensitive', () => {
      expect(detectSpotifyIntent('WHAT HAVE I BEEN LISTENING TO').kind).toBe('recent_listening');
    });
  });
});
