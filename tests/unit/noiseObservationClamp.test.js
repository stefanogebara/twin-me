/**
 * Regression guard for NOISE_OBSERVATION_PATTERNS in memoryStreamService.js.
 *
 * Background: pre-2026-05-16, branch-creation and other periodic GitHub
 * snapshots were rated importance 7-8 by the LLM importance rater. They
 * drowned out genuinely meaningful memories (Renan's strategic advice was
 * buried at rank 33+ because 20+ "Created branch twin-voice-fixes" rows
 * had literal string-match advantage on "twin-me").
 *
 * Fix: clamp matching observations to importance 3-4 BEFORE the LLM rater
 * runs. This test pins the patterns + cap values so a future edit to the
 * regex list can't silently lower the cap or drop a pattern.
 *
 * This file used to hold an INLINE COPY of the pattern array, to avoid loading
 * memoryStreamService.js (Supabase + embedding service). A copy cannot guard
 * the real list, though — edits to the source would sail past a green suite,
 * which is precisely what this file claims to prevent. It now imports the real
 * export behind the same mocks memoryQuality.test.js uses, so the module graph
 * is still inert.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../api/services/database.js', () => ({
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('../../api/services/embeddingService.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0)),
  vectorToString: vi.fn().mockReturnValue('[0,0,0]'),
}));
vi.mock('../../api/services/llmGateway.js', () => ({
  complete: vi.fn().mockResolvedValue({ content: '5' }),
  stream: vi.fn(),
  TIER_CHAT: 'chat',
  TIER_ANALYSIS: 'analysis',
  TIER_EXTRACTION: 'extraction',
}));
process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const { clampNoiseObservation, applyImportanceFloor } =
  await import('../../api/services/memoryStreamService.js');

describe('clampNoiseObservation', () => {
  describe('branch creation (cap 3)', () => {
    it('clamps the exact format emitted by observationFetchers/github.js', () => {
      expect(clampNoiseObservation('Created branch "twin-voice-fixes" in twin-me')).toBe(3);
    });

    it('clamps codex-style branch names with slashes and dates', () => {
      expect(
        clampNoiseObservation('Created branch "codex/launch-hardening-env-ci-2026-05-13" in PLAYFUNDED')
      ).toBe(3);
    });

    it('clamps multi-word repo names', () => {
      expect(clampNoiseObservation('Created branch "stripe-test-preview" in twin-me')).toBe(3);
    });
  });

  describe('GitHub annual/periodic snapshots', () => {
    it('clamps language distribution to 3', () => {
      expect(
        clampNoiseObservation('Your GitHub language distribution: TypeScript (45%), JavaScript (30%)')
      ).toBe(3);
    });

    it('clamps annual activity summary to 4', () => {
      expect(
        clampNoiseObservation('Your GitHub 2026 activity: 1840 contributions — 1200 commits, 400 PRs')
      ).toBe(4);
    });

    it('clamps commit-days rolling stat to 4', () => {
      expect(clampNoiseObservation('Committed code on 22 days in the last 30 days on GitHub')).toBe(4);
    });

    it('clamps current streak to 4', () => {
      expect(clampNoiseObservation('Current GitHub contribution streak: 12 consecutive days')).toBe(4);
    });
  });

  /**
   * optmem-brain audit, Phase 0 item 3. Snapshot metrics — accumulated
   * mutable-state LEVELS like an unread count or mailbox size — were rated 7-8
   * by the LLM and then floored at 6 by applyImportanceFloor, while the archival
   * job only collects platform_data at importance <= 4. That is the catch-22
   * that made "40,443 unread emails" mathematically immortal. Clamping them to
   * 4 puts them back under the EXISTING archive threshold, no schema change.
   *
   * The line to hold: clamp LEVELS, never TRANSITIONS. "Inbox grew by 12" is an
   * immutable event that stays true forever; "has 40,443 unread" is wrong within
   * hours. The audit's own guidance is to prefer transitions over levels, so
   * demoting the deltas would be backwards.
   */
  describe('snapshot metrics — accumulated levels (cap 4)', () => {
    it('clamps the canonical 40k unread-count baseline', () => {
      expect(clampNoiseObservation('Has a backlog of 40443 unread emails in inbox')).toBe(4);
    });

    it('clamps the unread baseline at every urgency phrasing', () => {
      expect(clampNoiseObservation('Has a moderate pile of 30 unread emails in inbox')).toBe(4);
      expect(clampNoiseObservation('Has 12 unread emails in inbox')).toBe(4);
    });

    it('clamps lifetime mailbox size', () => {
      expect(clampNoiseObservation('Manages a very large mailbox (50 000+ messages)')).toBe(4);
      expect(clampNoiseObservation('Manages a large mailbox (~52k messages)')).toBe(4);
      expect(clampNoiseObservation('Manages a moderate-sized mailbox (~5k messages)')).toBe(4);
      expect(clampNoiseObservation('Manages a lean mailbox (800 messages)')).toBe(4);
    });

    it('clamps the read-percentage, which is derived from lifetime totals', () => {
      expect(
        clampNoiseObservation('Reads 92% of incoming email (37000 of 40000 inbox messages read)')
      ).toBe(4);
    });

    it('clamps the Outlook inbox size snapshot', () => {
      expect(
        clampNoiseObservation('Outlook inbox contains approximately 52,431 messages (very large inbox)')
      ).toBe(4);
    });
  });

  describe('transitions and events are NOT clamped — they never go stale', () => {
    it('leaves the unread DELTA alone (an immutable event, the good kind)', () => {
      expect(
        clampNoiseObservation('Inbox grew by 12 unread emails in the last 30 minutes')
      ).toBeNull();
      expect(
        clampNoiseObservation('Cleared 43 unread emails from the inbox since yesterday')
      ).toBeNull();
    });

    it('leaves inbox zero alone — an achievement, not a running total', () => {
      expect(
        clampNoiseObservation('Practices inbox zero — 0 unread emails in inbox')
      ).toBeNull();
    });

    it('leaves windowed activity stats alone (self-anchoring to a period)', () => {
      expect(
        clampNoiseObservation('Email activity this week is moderate (~120 per week) — ~90 received, ~30 sent')
      ).toBeNull();
    });

    it('leaves behavioural traits alone', () => {
      expect(
        clampNoiseObservation('Tends to send emails in the morning (from recent sent patterns)')
      ).toBeNull();
      expect(
        clampNoiseObservation('Uses 14 custom email labels including: Work, Family, Receipts')
      ).toBeNull();
    });
  });

  describe('non-matching observations pass through (null → LLM rater handles them)', () => {
    it('does not clamp meaningful PR titles', () => {
      expect(clampNoiseObservation('Merged PR in twin-me: "Add Renan concept retrieval"')).toBeNull();
    });

    it('does not clamp commit-message pushes', () => {
      expect(
        clampNoiseObservation('Pushed 3 commits to twin-me on main — "fix retrieval bias", "add tests"')
      ).toBeNull();
    });

    it('does not clamp repo creation (low volume, real signal)', () => {
      expect(clampNoiseObservation('Created new GitHub repository: seatable-experiments')).toBeNull();
    });

    it('does not clamp Renan-style facts that surface concept advice', () => {
      expect(
        clampNoiseObservation('Renan said: design TwinMe for the mainstream user, kill the auteur features')
      ).toBeNull();
    });
  });

  /**
   * The payoff. Clamping only helps if the score SURVIVES applyImportanceFloor
   * (platform_data is otherwise floored at 6) and lands at or under the Tier-2
   * archive predicate in cron-memory-forgetting.js:
   *   .lte('importance_score', 4).eq('retrieval_count', 0)
   * Without the noiseClamped exemption the floor would silently undo all of it.
   */
  describe('clamped snapshots survive the floor and clear the archive bar', () => {
    const ARCHIVE_MAX_IMPORTANCE = 4;

    const SNAPSHOTS = [
      'Has a backlog of 40443 unread emails in inbox',
      'Has 12 unread emails in inbox',
      'Manages a very large mailbox (50 000+ messages)',
      'Reads 92% of incoming email (37000 of 40000 inbox messages read)',
      'Outlook inbox contains approximately 52,431 messages (very large inbox)',
    ];

    it('every snapshot pattern ends up archivable, not floored back to 6', () => {
      for (const content of SNAPSHOTS) {
        const score = clampNoiseObservation(content);
        expect(score).not.toBeNull();
        const final = applyImportanceFloor('platform_data', score, { noiseClamped: true });
        expect(final).toBeLessThanOrEqual(ARCHIVE_MAX_IMPORTANCE);
      }
    });

    it('an ordinary platform observation is still floored at 6 (unchanged behaviour)', () => {
      expect(clampNoiseObservation('Discovered new artist: Radiohead')).toBeNull();
      expect(applyImportanceFloor('platform_data', 3)).toBe(6);
    });

    it('a delta stays unclamped and keeps the normal floor', () => {
      const content = 'Inbox grew by 12 unread emails in the last 30 minutes';
      expect(clampNoiseObservation(content)).toBeNull();
      expect(applyImportanceFloor('platform_data', 5)).toBe(6);
    });
  });

  it('regex order does not matter — first match wins, no cap is ever raised', () => {
    // No pattern in the list should produce a score above 4. If a future PR
    // raises a cap, this guard fails.
    const samples = [
      'Created branch "x" in y',
      'Your GitHub language distribution: foo',
      'Your GitHub 2026 activity: 1 contributions',
      'Committed code on 1 days in the last 1 days',
      'Current GitHub contribution streak: 1 consecutive days',
    ];
    for (const s of samples) {
      const score = clampNoiseObservation(s);
      expect(score).not.toBeNull();
      expect(score).toBeLessThanOrEqual(4);
      expect(score).toBeGreaterThanOrEqual(3);
    }
  });
});
