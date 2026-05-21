/**
 * Audit 2026-05-21 P5: rebalance celebration + stress_nudge.
 *
 * Before this commit:
 *   - stress_nudge fired exactly ONCE in 3 months because MAX_TX_AGE_MS
 *     was 15 minutes (Pluggy/Plaid sync is daily, transactions arrive
 *     12-48h after the swipe, so every fresh tx was already too old).
 *   - celebration fired exactly ONCE in 3 months because the LLM prompt
 *     listed it as one of 4 valid categories but never told the model
 *     to actively LOOK for wins.
 *
 * Tests pin both fixes so a future "let's tighten this for spam control"
 * refactor doesn't accidentally re-break them.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('P5 threshold + prompt fixes', () => {
  describe('stress_nudge MAX_TX_AGE_MS — covers the daily sync window', () => {
    it('is set to 24 hours so retrospective nudges fire on bank-sync data', () => {
      const src = fs.readFileSync(
        path.resolve(process.cwd(), 'api/services/transactions/transactionNudgeService.js'),
        'utf8',
      );
      // Pull the assignment line exactly.
      const m = src.match(/const\s+MAX_TX_AGE_MS\s*=\s*([^;]+);/);
      expect(m, 'MAX_TX_AGE_MS declaration is present').not.toBeNull();

      const expr = m[1].trim();
      // Use a sandboxed eval — this is a constant arithmetic expression.
      const value = Function(`"use strict"; return (${expr});`)();
      expect(value, 'MAX_TX_AGE_MS in milliseconds').toBe(24 * 60 * 60 * 1000);
    });

    it('is NOT the old 15-minute value that caused the audit miss', () => {
      const src = fs.readFileSync(
        path.resolve(process.cwd(), 'api/services/transactions/transactionNudgeService.js'),
        'utf8',
      );
      // Defense against accidentally reverting via copy-paste.
      // The old line was: const MAX_TX_AGE_MS = 15 * 60 * 1000;
      expect(src).not.toMatch(/const\s+MAX_TX_AGE_MS\s*=\s*15\s*\*\s*60\s*\*\s*1000\s*;/);
    });
  });

  describe('Insight prompt — encourages celebration', () => {
    const promptSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'twin-research/insight-config.js'),
      'utf8',
    );

    it('contains a "CELEBRATE WINS" section', () => {
      expect(promptSrc).toMatch(/CELEBRATE WINS/i);
    });

    it('names the streak / milestone / trend-reversal / new-behavior triggers', () => {
      expect(promptSrc).toMatch(/streak/i);
      expect(promptSrc).toMatch(/milestone/i);
      expect(promptSrc).toMatch(/trend\s+reversal|trend reversal/i);
      expect(promptSrc).toMatch(/new behavior/i);
    });

    it('shows a celebration example among the GREAT insights', () => {
      // The example line we added is tagged [celebration] inside the
      // examples block. Catches accidental removal during prompt edits.
      expect(promptSrc).toMatch(/\[celebration\][\s\S]*GitHub commits/);
    });

    it('still treats celebration as a valid category in the JSON schema', () => {
      // The Return ONLY a JSON array contract still has celebration.
      expect(promptSrc).toMatch(/"category":\s*"[^"]*celebration[^"]*"/);
    });

    it('still has the hallucination guard above the encouragement', () => {
      // Make sure the encouragement didn't displace the hallucination
      // guard — celebration WITHOUT data-grounding would be the worst
      // failure mode ("great job!" empty).
      expect(promptSrc).toMatch(/HALLUCINATION GUARD/);
    });
  });
});
