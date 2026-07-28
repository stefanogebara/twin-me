/**
 * GOAL: WhatsApp habit loop — the yes/skip protocol round trip stays intact.
 * ==========================================================================
 * Shipped: PR #178 (offer folded into morning brief) on top of the
 * thread-approvals rail (2026-06-12).
 *
 * The invariant a user would feel break: the morning message offers an action
 * and tells them to reply "yes" or "skip" — so (a) the offer text must land
 * LAST in the composed message (the reply attaches to the end of the thread),
 * and (b) the classifier must still resolve the exact words the offer line
 * tells the user to send. If either side drifts, the user replies "yes" into
 * the void and the loop silently dies.
 *
 * This is a cross-module pin (dailyHabitLoop composer <-> threadApprovals
 * classifier), which unit tests of either module alone don't guarantee.
 */
// threadApprovals imports the supabase client module, which requires these at
// import time. Stub if absent (mirrors ci.yml); no query ever runs here —
// classifyProtocolReply is pure. Per-file isolation (vitest isolate:true)
// keeps these stubs from leaking to other files.
process.env.SUPABASE_URL ||= 'https://goals-stub.supabase.co';
process.env.SUPABASE_ANON_KEY ||= 'goals-stub-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'goals-stub-service-role-key';

import { describe, it, expect } from 'vitest';

const { combineBriefingWithOffer, isDailyActionOfferEnabled } = await import(
  '../../api/services/dailyHabitLoop.js'
);
const { classifyProtocolReply } = await import('../../api/services/threadApprovals.js');

// The exact shape offerNextProposal() emits (threadApprovals.js) — if that
// template changes, update this fixture AND re-verify the round trip below.
const OFFER = `One more thing — I'd like to: reply to Jordan. Reply "yes" and I'll do it, or "skip".`;
const BRIEF = 'Good morning, Stefano. Two meetings today, recovery is high.';

describe('goal: habit-loop protocol round trip', () => {
  it('composed morning message puts the offer (and its protocol line) LAST', () => {
    const msg = combineBriefingWithOffer(BRIEF, OFFER);
    expect(msg.endsWith(OFFER)).toBe(true);
    expect(msg).toBe(`${BRIEF}\n\n${OFFER}`);
  });

  it('the words the offer line asks for still resolve: yes -> approve, skip -> reject', () => {
    // English + pt-BR variants the user base actually sends
    expect(classifyProtocolReply('yes')).toBe('approve');
    expect(classifyProtocolReply('sim')).toBe('approve');
    expect(classifyProtocolReply('skip')).toBe('reject');
    expect(classifyProtocolReply('nao')).toBe('reject');
  });

  it('long conversational replies stay conversation, not button presses', () => {
    expect(classifyProtocolReply('yes, and could you also move my 3pm meeting?')).toBe(null);
  });

  it('the offer stays flag-gated: default OFF, strict "true" only', () => {
    const prev = process.env.DAILY_ACTION_OFFER_ENABLED;
    try {
      delete process.env.DAILY_ACTION_OFFER_ENABLED;
      expect(isDailyActionOfferEnabled()).toBe(false);
      process.env.DAILY_ACTION_OFFER_ENABLED = 'TRUE';
      expect(isDailyActionOfferEnabled()).toBe(false);
      process.env.DAILY_ACTION_OFFER_ENABLED = 'true';
      expect(isDailyActionOfferEnabled()).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.DAILY_ACTION_OFFER_ENABLED;
      else process.env.DAILY_ACTION_OFFER_ENABLED = prev;
    }
  });
});
