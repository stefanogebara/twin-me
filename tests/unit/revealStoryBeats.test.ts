import { describe, it, expect } from 'vitest';
import { splitIntoBeats } from '../../src/components/landing/RevealStory';

const SAMPLE =
  'You move through worlds with a fluid, almost chameleonic energy, your digital presence hinting at a mind that refuses to be pinned to a single domain. There is a tension here between the meticulous, logical architecture of code and a deep-seated attraction to the expressive, aesthetic realms of fashion. You seem driven by a curiosity that is both technical and deeply human. This is not a scattered pursuit.';

describe('splitIntoBeats (reveal card story)', () => {
  it('splits a multi-sentence reading into 2-4 beats', () => {
    const beats = splitIntoBeats(SAMPLE);
    expect(beats.length).toBeGreaterThanOrEqual(2);
    expect(beats.length).toBeLessThanOrEqual(4);
  });

  it('never loses content: beats reassemble to the original text', () => {
    const beats = splitIntoBeats(SAMPLE);
    expect(beats.join(' ')).toBe(SAMPLE.replace(/\s+/g, ' ').trim());
  });

  it('merges a trailing fragment into the previous beat instead of a tiny card', () => {
    const beats = splitIntoBeats(SAMPLE);
    for (const b of beats) expect(b.length).toBeGreaterThan(50);
  });

  it('a single short sentence yields one beat', () => {
    expect(splitIntoBeats('You are curious.')).toEqual(['You are curious.']);
  });

  it('caps at 4 beats for very long readings', () => {
    const long = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} carries a reasonably long observation about the person being read here.`).join(' ');
    expect(splitIntoBeats(long).length).toBeLessThanOrEqual(4);
  });
});
