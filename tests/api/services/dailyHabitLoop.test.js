/**
 * Tests for dailyHabitLoop — the composer that folds the top pending action's
 * offer into the morning WhatsApp briefing as ONE message, plus the env gate.
 *
 * Bug-classes these pin:
 *
 *   - Losing the yes/skip protocol line. The reply rail (threadApprovals)
 *     resolves a short "yes"/"skip" against the awaiting proposal, and the offer
 *     text ends in that protocol line. If the composer dropped or buried the
 *     offer, the morning message would arm a proposal the user can't act on.
 *     So: when an offer exists it MUST be present and MUST come last.
 *
 *   - Sending an empty/ragged message when there's no action to offer. No offer
 *     (null — nothing pending, or one already awaiting) must yield the briefing
 *     alone, cleanly trimmed, never "brief\n\n" with a dangling separator.
 *
 *   - Flag defaulting ON. The loop must be OFF unless DAILY_ACTION_OFFER_ENABLED
 *     is exactly "true", so merging is inert until an explicit per-deploy flip.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  combineBriefingWithOffer,
  isDailyActionOfferEnabled,
} from '../../../api/services/dailyHabitLoop.js';

describe('combineBriefingWithOffer', () => {
  const brief = 'Good morning, Stefano. Two meetings today, recovery is high.';
  const offer = 'One more thing — I\'d like to: reply to Jordan. Reply "yes" and I\'ll do it, or "skip".';

  it('joins briefing + offer with a blank line, offer LAST', () => {
    const msg = combineBriefingWithOffer(brief, offer);
    expect(msg).toBe(`${brief}\n\n${offer}`);
    expect(msg.endsWith(offer)).toBe(true); // protocol line must land at the end
  });

  it('returns the briefing alone (trimmed) when there is no offer', () => {
    expect(combineBriefingWithOffer(brief, null)).toBe(brief);
    expect(combineBriefingWithOffer(brief, '')).toBe(brief);
    expect(combineBriefingWithOffer(brief, '   ')).toBe(brief);
  });

  it('never leaves a dangling separator', () => {
    expect(combineBriefingWithOffer(`${brief}  `, null)).toBe(brief);
    expect(combineBriefingWithOffer(brief, null)).not.toContain('\n\n');
  });

  it('falls back to the offer alone when the briefing is empty', () => {
    expect(combineBriefingWithOffer('', offer)).toBe(offer);
    expect(combineBriefingWithOffer(null, offer)).toBe(offer);
  });

  it('trims both sides before joining', () => {
    expect(combineBriefingWithOffer(`  ${brief}  `, `  ${offer}  `)).toBe(`${brief}\n\n${offer}`);
  });

  it('returns empty string when both are empty', () => {
    expect(combineBriefingWithOffer('', '')).toBe('');
    expect(combineBriefingWithOffer(null, null)).toBe('');
  });
});

describe('isDailyActionOfferEnabled', () => {
  const original = process.env.DAILY_ACTION_OFFER_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.DAILY_ACTION_OFFER_ENABLED;
    else process.env.DAILY_ACTION_OFFER_ENABLED = original;
  });

  it('is OFF by default (unset)', () => {
    delete process.env.DAILY_ACTION_OFFER_ENABLED;
    expect(isDailyActionOfferEnabled()).toBe(false);
  });

  it('is ON only for the exact string "true"', () => {
    process.env.DAILY_ACTION_OFFER_ENABLED = 'true';
    expect(isDailyActionOfferEnabled()).toBe(true);
  });

  it('treats any other value as OFF (no accidental truthiness)', () => {
    for (const v of ['1', 'yes', 'TRUE', 'on', '']) {
      process.env.DAILY_ACTION_OFFER_ENABLED = v;
      expect(isDailyActionOfferEnabled()).toBe(false);
    }
  });
});
