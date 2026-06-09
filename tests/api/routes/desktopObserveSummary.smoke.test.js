/**
 * Smoke tests for api/routes/desktop-observe-summary.js
 * POST /api/desktop/observe-summary — desktop onboarding "Here's what I noticed".
 *
 * Turns the locally-captured app+title list into a first-person summary + insight.
 * Unauthenticated by design (body is the only input, no DB). llmGateway.complete
 * is mocked so tests never hit the network.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

process.env.NODE_ENV = 'test';

const completeMock = vi.fn();

vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: (...a) => completeMock(...a),
  TIER_ANALYSIS: 'analysis',
}));

const observeSummaryRoutes = (await import('../../../api/routes/desktop-observe-summary.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/desktop', observeSummaryRoutes);
  return app;
}

describe('desktop observe-summary route smoke', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when clips is not an array', async () => {
    const res = await request(createApp())
      .post('/api/desktop/observe-summary')
      .send({ clips: 'nope' });
    expect(res.status).toBe(400);
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('returns 400 when no clip has a usable app name', async () => {
    const res = await request(createApp())
      .post('/api/desktop/observe-summary')
      .send({ clips: [{ title: 'no app here' }, { app: '   ' }] });
    expect(res.status).toBe(400);
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('summarizes clips into {summary, insight, actions} and sends apps + name to TIER_ANALYSIS', async () => {
    completeMock.mockResolvedValue({
      content: JSON.stringify({
        summary: 'You moved between Cursor and Brave while working on twin-ai-learn.',
        insight: 'I could help you turn that into a quick task list.',
        actions: ['Recap today commits', 'Draft a status update'],
      }),
    });
    const res = await request(createApp())
      .post('/api/desktop/observe-summary')
      .send({
        name: 'Stefano',
        clips: [
          { app: 'Cursor', title: 'server.js — twin-ai-learn' },
          { app: 'Brave', title: 'twinme.me' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.summary).toContain('Cursor');
    expect(res.body.insight).toBeTruthy();
    expect(Array.isArray(res.body.actions)).toBe(true);
    expect(res.body.actions).toEqual(['Recap today commits', 'Draft a status update']);
    expect(completeMock).toHaveBeenCalledTimes(1);
    const arg = completeMock.mock.calls[0][0];
    expect(arg.tier).toBe('analysis');
    const promptText = JSON.stringify(arg.messages) + (arg.system || '');
    expect(promptText).toContain('Cursor');
    expect(promptText).toContain('Brave');
    expect(promptText).toContain('Stefano');
  });

  it('v2 prompt instructs the model to quote proper nouns and propose actions', async () => {
    // The v2 specificity push is pure prompt work — these assertions pin the
    // intent so the prompt cannot regress to the generic v1 form without
    // tripping the tests.
    completeMock.mockResolvedValue({
      content: JSON.stringify({ summary: 'x', insight: 'y' }),
    });
    await request(createApp())
      .post('/api/desktop/observe-summary')
      .send({ clips: [{ app: 'Cursor', title: 'x' }] });
    const system = completeMock.mock.calls[0][0].system || '';
    expect(system).toMatch(/proper noun/i);
    expect(system).toMatch(/verbatim/i);
    expect(system).toMatch(/INTENT/i);
    expect(system).toMatch(/actions/i);
    // Honesty constraint kept from v1 — guards against the prompt drifting
    // into "fabricate something specific".
    expect(system).toMatch(/never invent/i);
  });

  it('returns actions=[] (not null) when the model omits the field', async () => {
    completeMock.mockResolvedValue({
      content: JSON.stringify({ summary: 'x', insight: 'y' }),
    });
    const res = await request(createApp())
      .post('/api/desktop/observe-summary')
      .send({ clips: [{ app: 'Cursor', title: 'x' }] });
    expect(res.status).toBe(200);
    expect(res.body.actions).toEqual([]);
  });

  it('caps actions at 3, drops non-strings + empties, trims whitespace', async () => {
    completeMock.mockResolvedValue({
      content: JSON.stringify({
        summary: 'x',
        insight: 'y',
        actions: [
          '  Action one  ',
          'Action two',
          '',
          null,
          { not: 'a string' },
          'Action three',
          'Action four (should be dropped)',
        ],
      }),
    });
    const res = await request(createApp())
      .post('/api/desktop/observe-summary')
      .send({ clips: [{ app: 'Cursor', title: 'x' }] });
    expect(res.status).toBe(200);
    expect(res.body.actions).toEqual(['Action one', 'Action two', 'Action three']);
  });

  it('parses a ```json-fenced LLM response', async () => {
    completeMock.mockResolvedValue({
      content: '```json\n{"summary":"A short summary.","insight":"An insight."}\n```',
    });
    const res = await request(createApp())
      .post('/api/desktop/observe-summary')
      .send({ clips: [{ app: 'Slack', title: 'general' }] });
    expect(res.status).toBe(200);
    expect(res.body.summary).toBe('A short summary.');
    expect(res.body.insight).toBe('An insight.');
  });

  it('returns 502 when the LLM output cannot be parsed', async () => {
    completeMock.mockResolvedValue({ content: 'totally not json' });
    const res = await request(createApp())
      .post('/api/desktop/observe-summary')
      .send({ clips: [{ app: 'Code', title: 'x' }] });
    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
  });

  it('returns 502 when the LLM call throws', async () => {
    completeMock.mockRejectedValue(new Error('llm down'));
    const res = await request(createApp())
      .post('/api/desktop/observe-summary')
      .send({ clips: [{ app: 'Code', title: 'x' }] });
    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
  });
});
