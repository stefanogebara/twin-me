/**
 * Tests for voiceReplyLearning — the M1 loop-closer (edit/reject → directives).
 *
 * buildLearningSignal is pure; learnFromResolution runs against injected
 * extract/merge fakes, so no LLM/DB. Reuses twinSelfImprovement's proven
 * extractor + merge in prod (mocked here).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { buildLearningSignal, learnFromResolution } =
  await import('../../../api/services/voiceReplyLearning.js');

describe('buildLearningSignal', () => {
  it('turns a reject-with-reason into (draft, reason)', () => {
    expect(buildLearningSignal({ status: 'rejected', draft_text: 'Dear Maria, ...', reject_reason: 'too formal' }))
      .toEqual({ shouldLearn: true, prevTwin: 'Dear Maria, ...', userMsg: 'too formal' });
  });

  it('skips a reject with no reason (nothing to learn)', () => {
    expect(buildLearningSignal({ status: 'rejected', draft_text: 'hi', reject_reason: '   ' }))
      .toEqual({ shouldLearn: false, reason: 'no_reason' });
  });

  it('turns a meaningful edit into (draft, edited-version)', () => {
    const r = buildLearningSignal({ status: 'edited', draft_text: 'Dear Maria, I would be delighted.', final_text: 'yo maria — down for lunch' });
    expect(r.shouldLearn).toBe(true);
    expect(r.prevTwin).toBe('Dear Maria, I would be delighted.');
    expect(r.userMsg).toContain('yo maria — down for lunch');
  });

  it('skips an edit that only changed whitespace/case', () => {
    expect(buildLearningSignal({ status: 'edited', draft_text: 'See you Tue.', final_text: '  see you   TUE.  ' }))
      .toEqual({ shouldLearn: false, reason: 'no_change' });
  });

  it('skips an approved (sent) action', () => {
    expect(buildLearningSignal({ status: 'sent', draft_text: 'ok' }))
      .toEqual({ shouldLearn: false, reason: 'approved' });
  });

  it('skips when there is no draft to learn against', () => {
    expect(buildLearningSignal({ status: 'rejected', reject_reason: 'x' }))
      .toEqual({ shouldLearn: false, reason: 'no_draft' });
  });
});

const deps = (over = {}) => ({
  extract: vi.fn(async () => [
    { content: 'The user prefers casual, brief replies', category: 'tone' },
  ]),
  merge: vi.fn(async () => ({ directiveId: 'd1', outcome: 'directive_created' })),
  ...over,
});

const rejected = { id: 'a1', status: 'rejected', draft_text: 'Dear Maria,', reject_reason: 'too formal' };

describe('learnFromResolution', () => {
  it('extracts from (reason, draft) and merges the directive', async () => {
    const d = deps();
    const r = await learnFromResolution({ userId: 'u1', action: rejected }, d);
    expect(d.extract).toHaveBeenCalledWith('too formal', 'Dear Maria,');
    expect(d.merge).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1',
      candidate: { content: 'The user prefers casual, brief replies', category: 'tone' },
    }));
    expect(r).toEqual({ learned: 1 });
  });

  it('frames an edit with the user\'s actual version', async () => {
    const d = deps();
    await learnFromResolution({
      userId: 'u1',
      action: { id: 'a2', status: 'edited', draft_text: 'Dear Maria,', final_text: 'yo maria' },
    }, d);
    const [userMsg, prevTwin] = d.extract.mock.calls[0];
    expect(prevTwin).toBe('Dear Maria,');
    expect(userMsg).toContain('yo maria');
  });

  it('never calls the extractor for an approved action', async () => {
    const d = deps();
    const r = await learnFromResolution({ userId: 'u1', action: { id: 'a3', status: 'sent', draft_text: 'ok' } }, d);
    expect(r).toEqual({ learned: 0, skipped: 'approved' });
    expect(d.extract).not.toHaveBeenCalled();
  });

  it('degrades to learned:0 when extraction throws', async () => {
    const d = deps({ extract: vi.fn(async () => { throw new Error('llm down'); }) });
    expect(await learnFromResolution({ userId: 'u1', action: rejected }, d)).toEqual({ learned: 0, skipped: 'extract_failed' });
  });

  it('skips when the extractor finds nothing durable', async () => {
    const d = deps({ extract: vi.fn(async () => []) });
    expect(await learnFromResolution({ userId: 'u1', action: rejected }, d)).toEqual({ learned: 0, skipped: 'no_candidates' });
  });

  it('only counts created/reinforced outcomes, and survives a merge failure', async () => {
    const d = deps({
      extract: vi.fn(async () => [{ content: 'a', category: 'tone' }, { content: 'b', category: 'tone' }, { content: 'c', category: 'tone' }]),
      merge: vi.fn()
        .mockResolvedValueOnce({ outcome: 'directive_created' })
        .mockResolvedValueOnce({ outcome: 'ignored_dedup_threshold' })
        .mockRejectedValueOnce(new Error('db blip')),
    });
    expect(await learnFromResolution({ userId: 'u1', action: rejected }, d)).toEqual({ learned: 1 });
    expect(d.merge).toHaveBeenCalledTimes(3);
  });

  it('rejects missing input', async () => {
    const d = deps();
    expect(await learnFromResolution({}, d)).toEqual({ learned: 0, skipped: 'missing_input' });
    expect(d.extract).not.toHaveBeenCalled();
  });
});
