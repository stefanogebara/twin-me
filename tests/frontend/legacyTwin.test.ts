/** The twin's pages are parked by pattern, and nothing of the product is (2026-09-22). */
import { describe, expect, it } from 'vitest';
import { LEGACY_TWIN_PAGES, legacyTwinEnabled, parkedPage } from '../../src/lib/legacyTwin';

describe('parkedPage', () => {
  it('parks the twin\'s pages, including the ones with a parameter', () => {
    for (const p of ['/today', '/talk-to-twin', '/soul-signature', '/s/abc-123', '/p/00000000-0000-4000-8000-000000000001', '/insights/spotify', '/money/insights', '/settings/voice']) {
      expect(parkedPage(p), p).toBe(true);
    }
  });

  it('never parks the product, sign-in, the front door, Presence, the legal pages or the admin', () => {
    for (const p of ['/', '/money', '/money/month', '/money/plan', '/money/you', '/money/account', '/money/chat', '/money/setup',
      '/auth', '/login', '/signin', '/oauth/callback', '/auth/callback', '/oauth/gmail/callback', '/beta', '/waitlist', '/landing', '/pricing',
      '/presence', '/presence/home', '/presence/people', '/call/tok', '/presence/join/tok',
      '/privacy-policy', '/terms', '/terms-of-service', '/download', '/desktop-handoff',
      '/admin/beta', '/admin/beta/invites', '/admin/llm-costs', '/system', '/preview/money', '/home', '/dashboard']) {
      expect(parkedPage(p), p).toBe(false);
    }
  });

  it('matches whole segments only', () => {
    expect(parkedPage('/todayish')).toBe(false);
    expect(parkedPage('/goals')).toBe(true);
    expect(parkedPage('/goalsetting')).toBe(false);
  });

  it('lists every pattern once', () => {
    expect(new Set(LEGACY_TWIN_PAGES).size).toBe(LEGACY_TWIN_PAGES.length);
  });
});

describe('legacyTwinEnabled', () => {
  it('is off unless told true, in any case', () => {
    expect(legacyTwinEnabled(undefined)).toBe(false);
    expect(legacyTwinEnabled('')).toBe(false);
    expect(legacyTwinEnabled('false')).toBe(false);
    expect(legacyTwinEnabled('true')).toBe(true);
    expect(legacyTwinEnabled('TRUE')).toBe(true);
  });
});
