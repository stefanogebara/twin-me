/**
 * Tests for parseWhoop() in gdprImportService — proves the
 * physiological_cycles.csv parser reads the REAL Whoop export headers.
 *
 * Regression context: the parser looked up 'HRV (ms)' and 'Resting heart rate',
 * but real Whoop exports use 'Heart rate variability (ms)' and
 * 'Resting heart rate (bpm)'. The mismatch made the lookups undefined for every
 * row, so the "Average HRV" and "Average resting heart rate" observations were
 * silently never produced. Verified the header row against multiple real Whoop
 * physiological_cycles.csv exports.
 */

import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
// parseWhoop lives in the split-out parser module; gdprImportService only
// re-exports a handful of helpers and never re-exported parseWhoop, so
// importing it from there yielded undefined and threw on every call.
import { parseWhoop } from '../../../../api/services/gdpr/parsers/whoop.js';

// Real Whoop physiological_cycles.csv header row (verified against actual exports).
const REAL_HEADER =
  'Cycle start time,Cycle end time,Cycle timezone,Recovery score %,' +
  'Resting heart rate (bpm),Heart rate variability (ms),Skin temp (celsius),' +
  'Blood oxygen %,Day Strain,Energy burned (cal)';

// Three days of cycle data. Columns line up with REAL_HEADER above:
//   Recovery score %, Resting heart rate (bpm), Heart rate variability (ms),
//   ..., Day Strain
const ROWS = [
  '2026-06-01 04:00:00,2026-06-02 04:00:00,UTC-04:00,72,54,88.5,33.1,96,12.3,2100',
  '2026-06-02 04:00:00,2026-06-03 04:00:00,UTC-04:00,65,57,75.2,33.0,95,14.1,2300',
  '2026-06-03 04:00:00,2026-06-04 04:00:00,UTC-04:00,80,52,102.7,33.2,97,9.8,1900',
];

function buildWhoopZip(csv) {
  const zip = new AdmZip();
  zip.addFile('physiological_cycles.csv', Buffer.from(csv, 'utf8'));
  return zip.toBuffer();
}

describe('parseWhoop — physiological_cycles header mapping', () => {
  const buffer = buildWhoopZip([REAL_HEADER, ...ROWS].join('\n'));

  it('produces an Average HRV observation from the real "Heart rate variability (ms)" header', () => {
    const observations = parseWhoop(buffer);
    const hrv = observations.find((o) => o.startsWith('Average HRV'));
    expect(hrv).toBeDefined();
    // (88.5 + 75.2 + 102.7) / 3 = 88.8
    expect(hrv).toContain('88.8ms');
    expect(hrv).toContain('3 nights');
  });

  it('produces an Average resting heart rate observation from the real "Resting heart rate (bpm)" header', () => {
    const observations = parseWhoop(buffer);
    const rhr = observations.find((o) => o.startsWith('Average resting heart rate'));
    expect(rhr).toBeDefined();
    // (54 + 57 + 52) / 3 = 54.3
    expect(rhr).toContain('54.3 bpm');
    expect(rhr).toContain('3 days');
  });

  it('still produces recovery and strain observations from the same export', () => {
    const observations = parseWhoop(buffer);
    expect(observations.some((o) => o.startsWith('Whoop recovery average'))).toBe(true);
    expect(observations.some((o) => o.startsWith('Average daily strain'))).toBe(true);
  });

  it('tolerates a legacy header variant ("HRV (ms)") without dropping the signal', () => {
    const legacyHeader =
      'Cycle start time,Cycle end time,Cycle timezone,Recovery score %,' +
      'Resting heart rate,HRV (ms),Skin temp (celsius),Blood oxygen %,Day Strain,Energy burned (cal)';
    const legacyBuffer = buildWhoopZip([legacyHeader, ...ROWS].join('\n'));
    const observations = parseWhoop(legacyBuffer);
    expect(observations.some((o) => o.startsWith('Average HRV'))).toBe(true);
    expect(observations.some((o) => o.startsWith('Average resting heart rate'))).toBe(true);
  });
});
