import { describe, it, expect } from 'vitest';
import { deriveState, supportLine, groupReadings, daysSince, findScripted } from '../../src/lib/portrait';
import type { Reading } from '../../src/data/demoPortrait';

const base: Reading = {
  id: 'r', domain: 'motivation', text: 'You work in bursts.', sourceReflection: 'x',
  evidence: [
    { source: 'github', at: '2026-09-01', event: 'Opened PR #1' },
    { source: 'spotify', at: '2026-09-03 09:35', event: 'Pipe Down, Drake' },
  ],
  writtenAt: '2026-09-01', supportedAt: '2026-09-03', verdict: null,
};
const now = new Date('2026-09-04T12:00:00Z');

describe('deriveState', () => {
  it('is new when written in the last 7 days', () => {
    expect(deriveState(base, now)).toBe('new');
  });
  it('is standing after 7 days while supported within 45', () => {
    expect(deriveState({ ...base, writtenAt: '2026-08-01', supportedAt: '2026-08-20' }, now)).toBe('standing');
  });
  it('fades after 45 days without support', () => {
    expect(deriveState({ ...base, writtenAt: '2026-06-01', supportedAt: '2026-07-01' }, now)).toBe('fading');
  });
  it('hardens with a true verdict: fades only after 120 days', () => {
    expect(deriveState({ ...base, writtenAt: '2026-06-01', supportedAt: '2026-07-01', verdict: 'true' }, now)).toBe('standing');
    expect(deriveState({ ...base, writtenAt: '2026-04-01', supportedAt: '2026-04-15', verdict: 'true' }, now)).toBe('fading');
  });
  it('is disputed when the verdict is wrong, whatever the dates', () => {
    expect(deriveState({ ...base, verdict: 'wrong' }, now)).toBe('disputed');
  });
});

describe('supportLine', () => {
  it('counts events, distinct sources and the span in days', () => {
    expect(supportLine(base)).toBe('Seen 2 times over 3 days, from GitHub and Spotify');
  });
  it('says 1 day for evidence on a single day', () => {
    expect(supportLine({ ...base, evidence: [base.evidence[1], base.evidence[1]] })).toBe('Seen 2 times over 1 day, from Spotify');
  });
});

describe('groupReadings', () => {
  it('groups in ledger order and keeps disputed out of the standing set', () => {
    const g = groupReadings([
      base,
      { ...base, id: 'old', writtenAt: '2026-08-01', supportedAt: '2026-08-20' },
      { ...base, id: 'gone', writtenAt: '2026-06-01', supportedAt: '2026-07-01' },
      { ...base, id: 'no', verdict: 'wrong' },
    ], now);
    expect(g.map((x) => [x.state, x.readings.map((r) => r.id)])).toEqual([
      ['new', ['r']], ['standing', ['old']], ['fading', ['gone']], ['disputed', ['no']],
    ]);
  });
});

describe('daysSince', () => {
  it('rounds down whole days', () => {
    expect(daysSince('2026-09-01', now)).toBe(3);
  });
});

describe('findScripted', () => {
  const scripts = [{ q: 'Am I resting enough?', a: 'Not really.', cites: ['r06'] }];
  it('matches a typed question loosely', () => {
    expect(findScripted(scripts, 'am i resting ENOUGH')?.cites).toEqual(['r06']);
  });
  it('returns null when nothing matches', () => {
    expect(findScripted(scripts, 'what is my name')).toBeNull();
  });
});
