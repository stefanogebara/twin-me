/**
 * Schema validation for the Story Chapters interview script.
 *
 * The script is data (api/config/lifeStoryScript.js) consumed by
 * lifeStoryService.js. These tests pin the contract the engine relies on:
 * unique ids, per-question objectives (the follow-up engine's steering
 * signal), bounded turn budgets (the anti-dropout cap), and the verbatim
 * broad opener from Park et al. 2024 that makes chapter 1 the densest
 * signal source.
 */
import { describe, it, expect } from 'vitest';

const { LIFE_STORY_CHAPTERS, DEFAULT_TURN_BUDGET } = await import(
  '../../../api/config/lifeStoryScript.js'
);

describe('lifeStoryScript — schema contract', () => {
  it('defines exactly 8 chapters', () => {
    expect(LIFE_STORY_CHAPTERS).toHaveLength(8);
  });

  it('every chapter has id, title, intro, estimatedMinutes, and 3-6 questions', () => {
    for (const ch of LIFE_STORY_CHAPTERS) {
      expect(ch.id).toMatch(/^[a-z_]+$/);
      expect(typeof ch.title).toBe('string');
      expect(ch.title.length).toBeGreaterThan(0);
      expect(typeof ch.intro).toBe('string');
      expect(ch.estimatedMinutes).toBeGreaterThanOrEqual(3);
      expect(ch.estimatedMinutes).toBeLessThanOrEqual(6);
      expect(ch.questions.length).toBeGreaterThanOrEqual(3);
      expect(ch.questions.length).toBeLessThanOrEqual(6);
    }
  });

  it('chapter ids are unique', () => {
    const ids = LIFE_STORY_CHAPTERS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('question ids are unique across the whole script', () => {
    const qids = LIFE_STORY_CHAPTERS.flatMap(c => c.questions.map(q => q.id));
    expect(new Set(qids).size).toBe(qids.length);
  });

  it('every question has text and an objective for the follow-up engine', () => {
    for (const ch of LIFE_STORY_CHAPTERS) {
      for (const q of ch.questions) {
        expect(q.text.length).toBeGreaterThan(10);
        expect(q.objective.length).toBeGreaterThan(10);
        // Questions must not contain emojis (hard product rule)
        expect(/\p{Extended_Pictographic}/u.test(q.text)).toBe(false);
      }
    }
  });

  it('turn budgets are bounded 0-3 where set, and the default is 2', () => {
    expect(DEFAULT_TURN_BUDGET).toBe(2);
    for (const ch of LIFE_STORY_CHAPTERS) {
      for (const q of ch.questions) {
        if (q.turnBudget !== undefined) {
          expect(q.turnBudget).toBeGreaterThanOrEqual(0);
          expect(q.turnBudget).toBeLessThanOrEqual(3);
        }
      }
    }
  });

  it('chapter 1 is the life-story chapter and opens with the broad life-story ask', () => {
    const first = LIFE_STORY_CHAPTERS[0];
    expect(first.id).toBe('your_story');
    const opener = first.questions[0].text.toLowerCase();
    expect(opener).toContain('story of your life');
    expect(opener).toContain('childhood');
  });

  it('total scripted answering time lands in the paper-validated 25-40 minute band', () => {
    const total = LIFE_STORY_CHAPTERS.reduce((sum, c) => sum + c.estimatedMinutes, 0);
    expect(total).toBeGreaterThanOrEqual(25);
    expect(total).toBeLessThanOrEqual(40);
  });
});
