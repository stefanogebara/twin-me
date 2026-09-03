/**
 * portraitAskService — no uncited sentence (Portrait spec, Ask)
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../api/services/llmGateway.js', () => ({ complete: vi.fn(), TIER_CHAT: 'chat' }));
vi.mock('../../../api/services/redisClient.js', () => ({ get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../api/services/portraitService.js', () => ({
  loadPortrait: vi.fn(),
  SOURCE_LABEL: { spotify: 'Spotify', google_calendar: 'Calendar', whoop: 'Whoop' },
}));
vi.mock('../../../api/services/logger.js', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

const { parseAskReply, notYetLine, buildAskPrompt, answerFromPortrait } = await import('../../../api/services/portraitAskService.js');

const portrait = {
  owner: 'Stefano',
  sources: [{ platform: 'spotify' }, { platform: 'whoop' }],
  readings: [
    { id: 'r1', text: 'You put the same songs on repeat to get into deep work.', verdict: null, evidence: [{ source: 'spotify' }, { source: 'github' }] },
    { id: 'r2', text: 'You train even on the days your body asks for rest.', verdict: 'wrong', evidence: [{ source: 'whoop' }, { source: 'whoop' }] },
  ],
};

describe('parseAskReply', () => {
  it('keeps the answer and only the ids that exist', () => {
    expect(parseAskReply('Sure: {"answer": "I loop songs.", "cites": ["r1", "ghost"]}', ['r1', 'r2'])).toEqual({ a: 'I loop songs.', cites: ['r1'] });
  });
  it('is null without a citation, an answer, or JSON', () => {
    expect(parseAskReply('{"answer": "Guessing.", "cites": []}', ['r1'])).toBeNull();
    expect(parseAskReply('{"answer": "", "cites": ["r1"]}', ['r1'])).toBeNull();
    expect(parseAskReply('plain text', ['r1'])).toBeNull();
  });
});

describe('notYetLine', () => {
  it('names a source that is not connected yet', () => {
    expect(notYetLine([{ platform: 'spotify' }])).toContain('Connecting Calendar would help');
  });
});

describe('buildAskPrompt', () => {
  it('lists readings with ids and their sources, and forbids guessing', () => {
    const [system, user] = buildAskPrompt({ owner: 'Stefano', readings: portrait.readings, question: 'Am I resting?' });
    expect(system.content).toContain('[r1] You put the same songs on repeat');
    expect(system.content).toContain('spotify, github');
    expect(system.content).toContain('do not guess');
    expect(user.content).toBe('Am I resting?');
  });
});

describe('answerFromPortrait', () => {
  it('answers with citations when the model cites', async () => {
    const complete = vi.fn().mockResolvedValue({ content: '{"answer":"I put the same songs on repeat.","cites":["r1"]}' });
    const reply = await answerFromPortrait(portrait, 'What do I do to focus?', { complete });
    expect(reply).toEqual({ a: 'I put the same songs on repeat.', cites: ['r1'] });
    expect(complete.mock.calls[0][0].serviceName).toBe('portrait-ask');
  });

  it('leaves disputed readings out of what the model may cite', async () => {
    const complete = vi.fn().mockResolvedValue({ content: '{"answer":"I train tired.","cites":["r2"]}' });
    const reply = await answerFromPortrait(portrait, 'Do I rest?', { complete });
    expect(reply.cites).toEqual([]);
    expect(reply.a).toContain('I do not know that about myself yet');
  });

  it('declines, naming a source, when the model cannot cite', async () => {
    const complete = vi.fn().mockResolvedValue({ content: '{"answer":"","cites":[]}' });
    const reply = await answerFromPortrait(portrait, 'What is my favourite city?', { complete });
    expect(reply.cites).toEqual([]);
    expect(reply.a).toContain('Connecting Calendar would help');
  });

  it('never calls the model when there are no readings', async () => {
    const complete = vi.fn();
    const reply = await answerFromPortrait({ owner: 'X', sources: [], readings: [] }, 'Anything?', { complete });
    expect(complete).not.toHaveBeenCalled();
    expect(reply.cites).toEqual([]);
  });
});
