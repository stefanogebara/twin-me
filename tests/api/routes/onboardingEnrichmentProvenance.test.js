/**
 * Enrichment provenance guard (issue #237).
 *
 * Third-party email-lookup data is a GUESS about who the user is, and the
 * lookup can match the wrong human. For this user it did: it wrote "Based in
 * Lugano, Switzerland" as a fact at importance 8. The user's own correction a
 * month later landed at importance 7, so the fabrication outranked the truth
 * by construction and the twin repeated it for four and a half months.
 *
 * These tests pin the properties that make that impossible to repeat:
 * enrichment writes must be marked unverified, carry third-party provenance,
 * and score below anything the user actually said.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC = readFileSync(
  resolve(__dirname, '../../../api/routes/onboarding-soul-signature.js'),
  'utf8'
);

/** The addMemory(...) call that writes enrichment facts. */
function enrichmentWriteBlock() {
  const marker = SRC.indexOf("source: 'onboarding_enrichment'");
  expect(marker, 'enrichment write not found — did the source string change?').toBeGreaterThan(-1);
  // Widen to the enclosing addMemory( ... ) call: back to the nearest addMemory,
  // forward far enough to include the options object.
  const start = SRC.lastIndexOf('addMemory(', marker);
  return SRC.slice(start, marker + 600);
}

/** Importance used by the user's OWN onboarding answers, for comparison. */
function calibrationImportance() {
  const marker = SRC.indexOf("source: 'onboarding_calibration'");
  const block = SRC.slice(marker, marker + 700);
  const m = /importanceScore:\s*(\d+)/.exec(block);
  return m ? +m[1] : null;
}

describe('onboarding enrichment provenance (#237)', () => {
  const block = enrichmentWriteBlock();

  it('marks enrichment facts as unverified third-party data', () => {
    expect(block).toMatch(/provenance:\s*'third_party_enrichment'/);
    expect(block).toMatch(/verified:\s*false/);
  });

  it('scores enrichment BELOW the user\'s own onboarding answers', () => {
    const enrich = /importanceScore:\s*(\d+)/.exec(block);
    expect(enrich, 'no importanceScore on the enrichment write').not.toBeNull();
    const enrichScore = +enrich[1];
    const userScore = calibrationImportance();

    expect(userScore, 'could not read onboarding_calibration importance').not.toBeNull();
    expect(
      enrichScore,
      `enrichment (${enrichScore}) must rank below the user's own answers (${userScore}) — ` +
      'the Lugano fabrication won because it was 8 and the correction was 7'
    ).toBeLessThan(userScore);
  });

  it('never writes enrichment at the old importance 8', () => {
    expect(block).not.toMatch(/importanceScore:\s*8/);
  });

  it('lowers confidence below the 0.70 default fact prior', () => {
    const m = /confidence:\s*([\d.]+)/.exec(block);
    expect(m, 'enrichment write must set an explicit confidence').not.toBeNull();
    expect(+m[1]).toBeLessThan(0.7);
  });

  it('records reasoning explaining the data may describe someone else', () => {
    expect(block).toMatch(/reasoning:/);
  });
});
