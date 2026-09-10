import { describe, expect, it } from 'vitest';
import { deriveReadiness, READY_MIN_ANCHORS, READY_MIN_PEOPLE } from '../../api/services/presenceReadiness.js';

const base = { people: 0, anchors: 0, boundaries: 0, biography: 0, notes_queued: 0, conversations: 0 };

describe('deriveReadiness', () => {
  it('is not ready on an empty presence and explains every gap as a consequence', () => {
    const r = deriveReadiness({ caredForName: 'Sofia', tone: '', counts: base, hasIntro: false });
    expect(r.ready).toBe(false);
    expect(r.score).toBe(0);
    expect(r.knows).toEqual([]);
    expect(r.missing).toEqual(expect.arrayContaining([
      expect.stringContaining('Nobody in her family map'),
      expect.stringContaining('first call will be small talk'),
      expect.stringContaining('tone with her is not set'),
      expect.stringContaining('voice note fills most of this'),
    ]));
  });

  it('gates on the documented minimums: people >= 2, anchors >= 2, tone set', () => {
    const almost = { ...base, people: READY_MIN_PEOPLE, anchors: READY_MIN_ANCHORS - 1 };
    expect(deriveReadiness({ caredForName: 'Sofia', tone: 'Gentle teasing', counts: almost, hasIntro: false }).ready).toBe(false);
    const enough = { ...base, people: READY_MIN_PEOPLE, anchors: READY_MIN_ANCHORS };
    expect(deriveReadiness({ caredForName: 'Sofia', tone: 'Gentle teasing', counts: enough, hasIntro: false }).ready).toBe(true);
    expect(deriveReadiness({ caredForName: 'Sofia', tone: '', counts: enough, hasIntro: false }).ready).toBe(false);
  });

  it('does not block a small family: one child and two stories is ready', () => {
    const r = deriveReadiness({ caredForName: 'Sofia', tone: 'Very affectionate', counts: { ...base, people: 2, anchors: 2 }, hasIntro: false });
    expect(r.ready).toBe(true);
  });

  it('flags a single mapped person as a confusion risk', () => {
    const r = deriveReadiness({ caredForName: 'Sofia', tone: 'x', counts: { ...base, people: 1, anchors: 2 }, hasIntro: true });
    expect(r.ready).toBe(false);
    expect(r.missing.some((m) => m.includes('Only one person mapped'))).toBe(true);
  });

  it('scores a fully seeded presence at 100 and speaks in plain language', () => {
    const r = deriveReadiness({
      caredForName: 'Sofia', tone: 'Storytelling',
      counts: { ...base, people: 4, anchors: 3, boundaries: 2, biography: 12, conversations: 2 },
      hasIntro: true,
    });
    expect(r.score).toBe(100);
    expect(r.missing).toEqual([]);
    expect(r.knows.join(' ')).toMatch(/4 people in Sofia's life/);
    expect(r.knows.join(' ')).toMatch(/12 facts/);
    expect(r.knows.join(' ')).toMatch(/2 past conversations/);
  });

  it('never exceeds 100 and clamps each component', () => {
    const r = deriveReadiness({ caredForName: 'S', tone: 't', counts: { ...base, people: 40, anchors: 40, boundaries: 40, biography: 400, conversations: 400 }, hasIntro: true });
    expect(r.score).toBe(100);
  });
});
