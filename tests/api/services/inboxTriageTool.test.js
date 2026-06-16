/**
 * inbox_triage tool — on-demand inbox triage over twin chat / WhatsApp.
 * Runs generateInboxBrief, maps to a compact response, and queues the top
 * reply proposal only when there are real emails (status ok + count > 0).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateInboxBriefMock = vi.fn();
const proposeTopEmailReplyMock = vi.fn();

// platform_connections lookup (isConnected) → connected.
vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ limit: () => ({ single: () => Promise.resolve({ data: { id: 'c1' } }) }) }) }) }),
    }),
  },
}));

vi.mock('../../../api/services/inboxIntelligenceService.js', () => ({
  generateInboxBrief: (...a) => generateInboxBriefMock(...a),
  proposeTopEmailReply: (...a) => proposeTopEmailReplyMock(...a),
}));

const { executeTool } = await import('../../../api/services/toolRegistry.js');
const { registerGoogleWorkspaceTools } = await import('../../../api/services/tools/googleWorkspaceTools.js');
registerGoogleWorkspaceTools();

const run = () => executeTool('u1', 'inbox_triage', {}, { bypassAutonomy: true });

beforeEach(() => {
  generateInboxBriefMock.mockReset();
  proposeTopEmailReplyMock.mockReset();
  proposeTopEmailReplyMock.mockResolvedValue({ proposed: true });
});

describe('inbox_triage tool', () => {
  it('returns the brief and queues a reply proposal when there are real emails', async () => {
    generateInboxBriefMock.mockResolvedValue({
      status: 'ok',
      message: '2 emails need your attention…',
      count: 2,
      emails: [
        { id: 'm1', from: 'Pedro <p@a.com>', subject: 'Proposal', summary: 'wants a call', draft: 'ok', score: 8 },
        { id: 'm2', from: 'Ana <a@b.com>', subject: 'Invoice', summary: 'overdue', draft: 'paying', score: 6 },
      ],
    });

    const out = await run();
    expect(out.success).toBe(true);
    expect(out.data.status).toBe('ok');
    expect(out.data.count).toBe(2);
    expect(out.data.message).toContain('attention');
    // Only the safe fields are surfaced (no draft/score leak in the tool result).
    expect(out.data.emails[0]).toEqual({ from: 'Pedro <p@a.com>', subject: 'Proposal', summary: 'wants a call' });
    expect(proposeTopEmailReplyMock).toHaveBeenCalledTimes(1);
  });

  it('does not queue a proposal when the inbox is clear', async () => {
    generateInboxBriefMock.mockResolvedValue({ status: 'no_unread', message: 'Inbox zero.', count: 0, emails: [] });

    const out = await run();
    expect(out.data.status).toBe('no_unread');
    expect(out.data.count).toBe(0);
    expect(proposeTopEmailReplyMock).not.toHaveBeenCalled();
  });

  it('stays non-fatal if the proposal step throws', async () => {
    generateInboxBriefMock.mockResolvedValue({ status: 'ok', message: 'x', count: 1, emails: [{ id: 'm1', from: 'P <p@a.com>', subject: 'S', summary: 'y', draft: 'd', score: 7 }] });
    proposeTopEmailReplyMock.mockRejectedValue(new Error('boom'));

    const out = await run();
    expect(out.data.status).toBe('ok'); // brief still returned despite proposal failure
  });
});
