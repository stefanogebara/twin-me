import { describe, it, expect } from 'vitest';
import { toPortraitData } from '../../src/lib/portraitLive';

const reading = (id: string, extra: Record<string, unknown> = {}) => ({
  id, domain: 'motivation', text: `Reading ${id}.`, sourceReflection: id,
  evidence: [
    { source: 'github', at: '2026-09-03', event: 'Started a change' },
    { source: 'github', at: '2026-09-03', event: 'Finished it' },
  ],
  writtenAt: '2026-09-03', supportedAt: '2026-09-03', verdict: null, ...extra,
});

describe('toPortraitData', () => {
  it('maps a full payload and keeps only readings with two receipts', () => {
    const data = toPortraitData({
      owner: 'Stefano',
      sources: [{ platform: 'github', label: 'GitHub', read: '182 items', since: '2026-06-08T10:00:00Z', kinds: 'work' }],
      question: { fromReadings: ['r1', 'ghost'], evidenceLine: 'GitHub, today: Started a change.', question: 'Does this sound like you?', answers: ['Yes', 'No'], yourAnswer: null },
      signature: [{ domain: 'motivation', line: 'You work in bursts.', from: ['r1', 'r2'] }, { domain: 'nope', line: 'x', from: [] }],
      readings: [reading('r1', { verdict: 'true' }), reading('r2', { evidence: [{ source: 'x', at: '', event: 'only one' }] }), { id: 'r3' }],
    });
    expect(data.readings.map((r) => r.id)).toEqual(['r1']);
    expect(data.readings[0].verdict).toBe('true');
    expect(data.signature).toEqual([{ domain: 'motivation', line: 'You work in bursts.', from: ['r1'] }]);
    expect(data.question?.fromReadings).toEqual(['r1']);
    expect(data.sources[0].since).toBe('2026-06-08');
    expect(data.ask).toEqual([]);
  });

  it('never crashes on an empty or malformed payload', () => {
    expect(toPortraitData(null)).toEqual({ owner: 'Your', sources: [], question: null, signature: [], readings: [], ask: [] });
    expect(toPortraitData({ readings: 'nope', question: 'nope', signature: 5 }).readings).toEqual([]);
  });

  it('normalises an unknown domain and an unknown verdict', () => {
    const data = toPortraitData({ readings: [reading('r1', { domain: 'weird', verdict: 'maybe' })] });
    expect(data.readings[0].domain).toBe('personality');
    expect(data.readings[0].verdict).toBeNull();
  });
});
