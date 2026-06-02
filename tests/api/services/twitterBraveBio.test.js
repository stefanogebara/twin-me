/**
 * cleanBio() — rejects X/Twitter's "JavaScript is disabled" no-JS fallback page
 * (and similar chrome) that Brave sometimes indexes as a profile bio, so the
 * discovery "look you up" reveal never shows junk. Pure function; no network.
 */
import { describe, it, expect } from 'vitest';
import { cleanBio } from '../../../api/services/enrichment/twitterBraveProvider.js';

describe('twitterBraveProvider cleanBio', () => {
  it('rejects the exact X.com no-JS fallback string observed in production', () => {
    const junk =
      "We've detected that JavaScript is disabled in this browser. Please enable " +
      'JavaScript or switch to a supported browser to continue using x.com. You can ' +
      'see a list of supported browsers in our Help Cent';
    expect(cleanBio(junk)).toBeNull();
  });

  it('rejects related boilerplate variants', () => {
    expect(cleanBio('Please enable JavaScript to continue.')).toBeNull();
    expect(cleanBio('Switch to a supported browser.')).toBeNull();
    expect(cleanBio('Log in to X to see the latest.')).toBeNull();
    expect(cleanBio('See the latest posts from Stefano')).toBeNull();
  });

  it('rejects empty, whitespace, and non-strings', () => {
    expect(cleanBio('')).toBeNull();
    expect(cleanBio('   ')).toBeNull();
    expect(cleanBio('ok')).toBeNull(); // < 3 chars after trim
    expect(cleanBio(null)).toBeNull();
    expect(cleanBio(undefined)).toBeNull();
    expect(cleanBio(42)).toBeNull();
  });

  it('keeps a genuine bio untouched', () => {
    const real = 'Founder at TwinMe. Building AI twins with soul. Coffee + code.';
    expect(cleanBio(real)).toBe(real);
    expect(cleanBio('  AI researcher. Olympics nerd.  ')).toBe('AI researcher. Olympics nerd.');
  });
});
