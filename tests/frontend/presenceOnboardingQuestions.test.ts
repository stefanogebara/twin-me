/**
 * "Três perguntas" (Phase 2, T7): after the voice note, the onboarding asks
 * only what the note left open, three at most, in a fixed order of harm:
 * who has died (the worst confusion), what never to bring up, what she loves
 * telling, then the family's own tone and words.
 */
import { describe, it, expect } from 'vitest';
import { openQuestions, QUESTION_POOL } from '../../src/pages/presence/onboardingQuestions';

const full = {
  tone: 'Gentle teasing',
  people: [{ name: 'Jorge', relation: 'marido (falecido)', calledBy: '' }, { name: 'Ana', relation: 'filha', calledBy: 'Aninha' }],
  anchors: { place: 'Ubatuba', dish: 'bolo de chocolate', person: '' },
  boundaries: ['a herança'],
};

describe('openQuestions', () => {
  it('asks about the dead, the boundaries and the stories when the note said nothing of them', () => {
    const ids = openQuestions({ tone: '', people: [{ name: 'Ana', relation: 'filha', calledBy: '' }], anchors: { place: '', dish: '', person: '' }, boundaries: [] }).map((q) => q.id);
    expect(ids).toEqual(['deceased', 'boundary', 'anchor']);
  });

  it('skips what the note answered and fills up to three with the family\'s own tone and words', () => {
    const ids = openQuestions({ ...full, tone: '' }).map((q) => q.id);
    expect(ids).toEqual(['tone', 'language']);
    expect(openQuestions(full).map((q) => q.id)).toEqual(['language']);
  });

  it('counts a person as dead only from the relation the family wrote', () => {
    const ids = openQuestions({ ...full, people: [{ name: 'Jorge', relation: 'marido', calledBy: '' }] }).map((q) => q.id);
    expect(ids[0]).toBe('deceased');
  });

  it('never asks more than three', () => {
    expect(openQuestions({ tone: '', people: [], anchors: { place: '', dish: '', person: '' }, boundaries: [] })).toHaveLength(3);
    expect(QUESTION_POOL.length).toBeGreaterThanOrEqual(4);
  });

  it('every question knows which fact it becomes', () => {
    for (const q of QUESTION_POOL) expect(['biography', 'boundary', 'anchor', 'tone', 'language']).toContain(q.factKind);
  });
});
