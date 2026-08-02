/**
 * Engine tests for the Story Chapters interview (lifeStoryService.js).
 *
 * The engine is the Phase 0 core: a pure state machine deciding
 * follow-up vs advance vs chapter-done (Park et al. 2024 interviewer
 * pattern, bounded by turnBudget to respect TwinMe's dropout history),
 * plus reflection-notes merging and fail-open LLM output parsing.
 *
 * LLM gateway is mocked — assessTurn tests assert prompt composition
 * (privacy pivot, reflection notes, anti-drilling rules) and utterance
 * assembly (verbatim next-question ask), not model behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn(),
  TIER_ANALYSIS: 'analysis',
  TIER_EXTRACTION: 'extraction',
}));

const { complete } = await import('../../../api/services/llmGateway.js');
const {
  nextStep,
  mergeReflectionNotes,
  parseAssessment,
  assessTurn,
  getChapter,
} = await import('../../../api/services/lifeStoryService.js');

const chapter = {
  id: 'test_chapter',
  title: 'Test Chapter',
  intro: 'Intro line.',
  estimatedMinutes: 4,
  questions: [
    { id: 'q1', text: 'First scripted question?', objective: 'Learn thing one', turnBudget: 2 },
    { id: 'q2', text: 'Second scripted question?', objective: 'Learn thing two', turnBudget: 0 },
    { id: 'q3', text: 'Third scripted question?', objective: 'Learn thing three' },
  ],
};

describe('nextStep — follow-up/advance state machine', () => {
  it('follows up when objective not achieved and budget remains', () => {
    const step = nextStep({
      chapter,
      questionIndex: 0,
      followupsUsed: 0,
      assessment: { objectiveAchieved: false, followUp: 'Can you say more?' },
    });
    expect(step.action).toBe('followup');
    expect(step.questionIndex).toBe(0);
    expect(step.followupsUsed).toBe(1);
  });

  it('advances when the objective is achieved even with budget remaining', () => {
    const step = nextStep({
      chapter,
      questionIndex: 0,
      followupsUsed: 0,
      assessment: { objectiveAchieved: true, followUp: 'Ignored follow-up' },
    });
    expect(step.action).toBe('advance');
    expect(step.questionIndex).toBe(1);
    expect(step.followupsUsed).toBe(0); // reset for the new question
  });

  it('forces advance when the turn budget is exhausted (never drills past cap)', () => {
    const step = nextStep({
      chapter,
      questionIndex: 0,
      followupsUsed: 2, // q1 budget is 2
      assessment: { objectiveAchieved: false, followUp: 'One more thing?' },
    });
    expect(step.action).toBe('advance');
    expect(step.questionIndex).toBe(1);
  });

  it('respects a per-question turnBudget of 0 (no follow-ups ever)', () => {
    const step = nextStep({
      chapter,
      questionIndex: 1,
      followupsUsed: 0,
      assessment: { objectiveAchieved: false, followUp: 'Why?' },
    });
    expect(step.action).toBe('advance');
  });

  it('privacy decline advances immediately regardless of budget', () => {
    const step = nextStep({
      chapter,
      questionIndex: 0,
      followupsUsed: 0,
      assessment: { objectiveAchieved: false, privacyDeclined: true, followUp: 'But why?' },
    });
    expect(step.action).toBe('advance');
    expect(step.questionIndex).toBe(1);
  });

  it('missing follow-up text advances even when objective not achieved', () => {
    const step = nextStep({
      chapter,
      questionIndex: 0,
      followupsUsed: 0,
      assessment: { objectiveAchieved: false, followUp: null },
    });
    expect(step.action).toBe('advance');
  });

  it('completes the chapter when advancing past the last question', () => {
    const step = nextStep({
      chapter,
      questionIndex: 2,
      followupsUsed: 0,
      assessment: { objectiveAchieved: true, followUp: null },
    });
    expect(step.action).toBe('chapter_done');
  });
});

describe('mergeReflectionNotes — running interviewer memory', () => {
  it('merges without mutating either input', () => {
    const existing = { grew_up: 'small town' };
    const updates = { current_city: 'Lisbon' };
    const merged = mergeReflectionNotes(existing, updates);
    expect(merged).toEqual({ grew_up: 'small town', current_city: 'Lisbon' });
    expect(existing).toEqual({ grew_up: 'small town' });
    expect(updates).toEqual({ current_city: 'Lisbon' });
  });

  it('newer notes win on key collision', () => {
    const merged = mergeReflectionNotes({ job: 'student' }, { job: 'founder' });
    expect(merged.job).toBe('founder');
  });

  it('drops empty and non-string values from updates', () => {
    const merged = mergeReflectionNotes({}, { a: '', b: null, c: 42, d: 'kept' });
    expect(merged).toEqual({ d: 'kept' });
  });

  it('tolerates null/undefined inputs', () => {
    expect(mergeReflectionNotes(null, { a: 'x' })).toEqual({ a: 'x' });
    expect(mergeReflectionNotes({ a: 'x' }, undefined)).toEqual({ a: 'x' });
  });
});

describe('parseAssessment — fail-open LLM output parsing', () => {
  it('parses a clean JSON object', () => {
    const parsed = parseAssessment(
      '{"objectiveAchieved": false, "followUp": "What year was that?", "bridge": "Got it."}'
    );
    expect(parsed.objectiveAchieved).toBe(false);
    expect(parsed.followUp).toBe('What year was that?');
  });

  it('parses JSON wrapped in a markdown fence', () => {
    const parsed = parseAssessment(
      '```json\n{"objectiveAchieved": true, "followUp": null, "bridge": "Thanks."}\n```'
    );
    expect(parsed.objectiveAchieved).toBe(true);
  });

  it('fails OPEN on malformed output: advance, never trap the user in a loop', () => {
    const parsed = parseAssessment('So, I think the user answered well enough...');
    expect(parsed.objectiveAchieved).toBe(true);
    expect(parsed.followUp).toBeNull();
  });

  it('fails open on empty/undefined content', () => {
    expect(parseAssessment('').objectiveAchieved).toBe(true);
    expect(parseAssessment(undefined).objectiveAchieved).toBe(true);
  });
});

describe('assessTurn — LLM call + utterance assembly', () => {
  beforeEach(() => {
    complete.mockReset();
  });

  const baseArgs = {
    userId: 'user-1',
    chapter,
    questionIndex: 0,
    followupsUsed: 0,
    transcript: [
      { role: 'assistant', content: 'First scripted question?', questionId: 'q1' },
      { role: 'user', content: 'I grew up in Minas.', questionId: 'q1' },
    ],
    reflectionNotes: { grew_up: 'Minas Gerais' },
  };

  it('returns a follow-up utterance when the objective is unmet and budget remains', async () => {
    complete.mockResolvedValue({
      content: '{"objectiveAchieved": false, "followUp": "What was Minas like for you as a kid?", "bridge": "", "notes": {}}',
    });

    const result = await assessTurn(baseArgs);
    expect(result.kind).toBe('followup');
    expect(result.utterance).toBe('What was Minas like for you as a kid?');
    expect(result.questionIndex).toBe(0);
  });

  it('advances with the NEXT scripted question verbatim, prefixed by the bridge', async () => {
    complete.mockResolvedValue({
      content: '{"objectiveAchieved": true, "followUp": null, "bridge": "A small-town start explains a lot.", "notes": {}}',
    });

    const result = await assessTurn(baseArgs);
    expect(result.kind).toBe('question');
    expect(result.questionIndex).toBe(1);
    // Verbatim-first-ask: the scripted text must appear unmodified
    expect(result.utterance).toContain('Second scripted question?');
    expect(result.utterance).toContain('A small-town start explains a lot.');
  });

  it('signals chapter_done after the last question', async () => {
    complete.mockResolvedValue({
      content: '{"objectiveAchieved": true, "followUp": null, "bridge": "Thank you.", "notes": {}}',
    });

    const result = await assessTurn({ ...baseArgs, questionIndex: 2 });
    expect(result.kind).toBe('chapter_done');
  });

  it('surfaces note updates from the assessment for the caller to merge', async () => {
    complete.mockResolvedValue({
      content: '{"objectiveAchieved": true, "followUp": null, "bridge": "", "notes": {"hometown": "Minas Gerais"}}',
    });

    const result = await assessTurn(baseArgs);
    expect(result.noteUpdates).toEqual({ hometown: 'Minas Gerais' });
  });

  it('includes reflection notes, the objective, privacy-pivot and anti-drilling rules in the prompt', async () => {
    complete.mockResolvedValue({
      content: '{"objectiveAchieved": true, "followUp": null, "bridge": "", "notes": {}}',
    });

    await assessTurn(baseArgs);
    const call = complete.mock.calls[0][0];
    expect(call.tier).toBe('analysis');
    const prompt = `${call.system || ''}\n${JSON.stringify(call.messages)}`;
    expect(prompt).toContain('Minas Gerais'); // reflection notes injected
    expect(prompt).toContain('Learn thing one'); // current objective injected
    expect(prompt.toLowerCase()).toContain('privacy'); // pivot rule present
    expect(prompt).toContain('NEVER'); // anti-drilling / anti-affirmation rules present
  });

  it('fails open to advancing when the LLM call throws (never blocks the user)', async () => {
    complete.mockRejectedValue(new Error('gateway down'));

    const result = await assessTurn(baseArgs);
    expect(result.kind).toBe('question');
    expect(result.questionIndex).toBe(1);
    expect(result.utterance).toContain('Second scripted question?');
  });
});

describe('getChapter', () => {
  it('returns null for unknown chapter ids', () => {
    expect(getChapter('nope')).toBeNull();
  });

  it('returns the real chapter from the script by id', () => {
    const ch = getChapter('your_story');
    expect(ch).not.toBeNull();
    expect(ch.questions.length).toBeGreaterThan(0);
  });
});
