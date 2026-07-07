/**
 * Orchestration tests for voiceReplyService — the M1 voice-reply pipeline.
 *
 * All collaborators are injected, so this pins the control flow (gather context
 * → assemble prompt via the real pure core → model → parse → persist a *pending*
 * action) and its resilience, with no DB/LLM. The prompt assembly + honesty
 * guard themselves are pinned in voiceReplyPrompt.test.js.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { generateVoiceReply } = await import('../../../api/services/voiceReplyService.js');

const input = () => ({
  userId: 'user-1',
  counterpart: { name: 'Maria', handle: 'maria@x.com' },
  channel: 'gmail',
  threadRef: 'thread-9',
  thread: { subject: 'Lunch next week?', messages: [{ author: 'Maria', text: 'Free for lunch next week?' }] },
});

const okDeps = (over = {}) => ({
  getVoice: vi.fn(async () => ({ instructions: 'Warm but direct.', stylometrics: { avgSentenceWords: 11 } })),
  getRegister: vi.fn(async () => 'informal with Maria, no sign-off'),
  getMemories: vi.fn(async () => [{ content: 'User travels 12-16 July' }]),
  getDirectives: vi.fn(async () => [{ content: 'Be concise in replies' }]),
  callModel: vi.fn(async () => ({ content: '{"draft":"Tuesday works — see you at noon.","why":[{"kind":"register","note":"casual, no sign-off"}]}' })),
  persist: vi.fn(async (row) => ({ id: 'act-1', ...row })),
  ...over,
});

describe('generateVoiceReply', () => {
  it('produces a pending voice_reply action on the happy path', async () => {
    const deps = okDeps();
    const r = await generateVoiceReply(input(), deps);

    expect(r.ok).toBe(true);
    expect(deps.persist).toHaveBeenCalledTimes(1);
    const row = deps.persist.mock.calls[0][0];
    expect(row).toMatchObject({
      user_id: 'user-1',
      type: 'voice_reply',
      status: 'pending',
      channel: 'gmail',
      thread_ref: 'thread-9',
      recipient: 'maria@x.com',
      draft_text: 'Tuesday works — see you at noon.',
      why_signals: [{ kind: 'register', note: 'casual, no sign-off' }],
    });
    expect(r.action.id).toBe('act-1');
  });

  it('flows the gathered context into the model prompt', async () => {
    const deps = okDeps();
    await generateVoiceReply(input(), deps);
    const prompt = deps.callModel.mock.calls[0][0];
    const system = prompt.messages[0].content;
    expect(system).toContain('Warm but direct.');
    expect(system).toContain('informal with Maria');
    expect(system).toContain('- User travels 12-16 July');
    expect(system).toContain('- Be concise in replies');
    expect(prompt.messages[1].content).toContain('Free for lunch next week?');
  });

  it('never persists when the model call throws', async () => {
    const deps = okDeps({ callModel: vi.fn(async () => { throw new Error('502'); }) });
    const r = await generateVoiceReply(input(), deps);
    expect(r).toEqual({ ok: false, error: 'model_failed' });
    expect(deps.persist).not.toHaveBeenCalled();
  });

  it('never persists an unusable draft', async () => {
    const deps = okDeps({ callModel: vi.fn(async () => ({ content: 'the model rambled, no json' })) });
    const r = await generateVoiceReply(input(), deps);
    expect(r).toEqual({ ok: false, error: 'unparseable' });
    expect(deps.persist).not.toHaveBeenCalled();
  });

  it('degrades a failing context leg to empty and still drafts (resilience)', async () => {
    const deps = okDeps({ getMemories: vi.fn(async () => { throw new Error('pgbouncer cold'); }) });
    const r = await generateVoiceReply(input(), deps);
    expect(r.ok).toBe(true);
    const system = deps.callModel.mock.calls[0][0].messages[0].content;
    expect(system).toContain('(none relevant)'); // memory leg degraded
  });

  it('applies the honesty guard end-to-end (memory chip dropped when no memories)', async () => {
    const deps = okDeps({
      getMemories: vi.fn(async () => []),
      callModel: vi.fn(async () => ({ content: '{"draft":"ok","why":[{"kind":"memory","note":"used your trip"},{"kind":"voice","note":"kept it short"}]}' })),
    });
    const r = await generateVoiceReply(input(), deps);
    expect(r.ok).toBe(true);
    const row = deps.persist.mock.calls[0][0];
    expect(row.why_signals).toEqual([{ kind: 'voice', note: 'kept it short' }]);
  });

  it('rejects missing input without touching collaborators', async () => {
    const deps = okDeps();
    expect(await generateVoiceReply({}, deps)).toEqual({ ok: false, error: 'missing_input' });
    expect(deps.callModel).not.toHaveBeenCalled();
    expect(deps.persist).not.toHaveBeenCalled();
  });
});
