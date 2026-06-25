/**
 * draftEmailInUserVoice — generates a personality-matched body AND persists it
 * as a real Gmail draft via draftEmail, threading the reply when
 * replyToMessageId is present. (Previously it returned only body text and never
 * created a draft.) Returns the draftEmail result, or null on failure so the
 * gmail_draft tool falls back to a generic draft.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const completeMock = vi.fn();
const draftEmailMock = vi.fn();

vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: (...a) => completeMock(...a),
  TIER_ANALYSIS: 'analysis',
}));

vi.mock('../../../api/services/googleWorkspaceActions.js', () => ({
  draftEmail: (...a) => draftEmailMock(...a),
}));

// Personality profile + voice examples queries — minimal chainable builder.
vi.mock('../../../api/services/database.js', () => {
  function builder() {
    const b = {};
    b.select = () => b;
    b.eq = () => b;
    b.order = () => b;
    b.single = () => Promise.resolve({ data: null });           // no profile
    b.limit = () => Promise.resolve({ data: [] });               // no examples
    return b;
  }
  return { supabaseAdmin: { from: () => builder() } };
});

const { draftEmailInUserVoice } = await import('../../../api/services/departmentExecutors/communicationsExecutor.js');

beforeEach(() => {
  completeMock.mockReset();
  draftEmailMock.mockReset();
});

describe('draftEmailInUserVoice', () => {
  it('creates a threaded Gmail draft and returns the draftEmail result', async () => {
    completeMock.mockResolvedValue({ content: 'Sure, Friday works for me.' });
    draftEmailMock.mockResolvedValue({ success: true, draftId: 'd1', messageId: 'msg1' });

    const out = await draftEmailInUserVoice('u1', {
      to: 'pedro@acme.com', subject: 'Re: Partnership', context: 'say yes to Friday', replyToMessageId: 'm1',
    });

    expect(out).toEqual({ success: true, draftId: 'd1', messageId: 'msg1' });
    expect(draftEmailMock).toHaveBeenCalledWith('u1', {
      to: 'pedro@acme.com',
      subject: 'Re: Partnership',
      body: 'Sure, Friday works for me.',
      replyToMessageId: 'm1',
    });
  });

  it('returns null (falls back) when body generation is empty', async () => {
    completeMock.mockResolvedValue({ content: '' });
    const out = await draftEmailInUserVoice('u1', { to: 'p@a.com', subject: 'Hi', context: '' });
    expect(out).toBeNull();
    expect(draftEmailMock).not.toHaveBeenCalled();
  });

  it('returns null when the Gmail draft creation fails', async () => {
    completeMock.mockResolvedValue({ content: 'body' });
    draftEmailMock.mockResolvedValue({ success: false, error: 'gmail down' });
    const out = await draftEmailInUserVoice('u1', { to: 'p@a.com', subject: 'Hi', context: '' });
    expect(out).toBeNull();
  });
});
