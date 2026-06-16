/**
 * inboxIntelligenceService.proposeTopEmailReply — bridges the top triaged
 * thread into a gmail_draft threaded-reply proposal on the approval rail.
 * Picks the top scored email with a real human sender + draft, threads via
 * replyToMessageId, de-dupes against pending proposals, never targets self.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let pendingProposals = [];
const proposeMock = vi.fn();

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { email: 'me@twin.com' } }) }) }),
    }),
  },
}));

vi.mock('../../../api/services/departmentService.js', () => ({
  proposeDepartmentAction: (...a) => proposeMock(...a),
  getPendingProposals: () => Promise.resolve(pendingProposals),
}));

// Keep heavy module-load deps inert; proposeTopEmailReply doesn't call these.
vi.mock('../../../api/services/googleWorkspaceActions.js', () => ({
  getEmails: vi.fn(), getEmail: vi.fn(), draftEmail: vi.fn(),
}));
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn(), TIER_EXTRACTION: 'x', TIER_ANALYSIS: 'y',
}));

const { proposeTopEmailReply } = await import('../../../api/services/inboxIntelligenceService.js');

const okBrief = (emails) => ({ status: 'ok', emails, count: emails.length, message: 'x' });
const pedro = {
  id: 'm1', from: 'Pedro Alves <pedro@acme.com>', subject: 'Partnership proposal',
  summary: 'wants a call this week', draft: 'Sure, Friday works.', score: 8, category: 'opportunity',
};

beforeEach(() => {
  pendingProposals = [];
  proposeMock.mockReset();
  proposeMock.mockResolvedValue({ actionId: 'a1', status: 'pending_approval' });
});

describe('proposeTopEmailReply', () => {
  it('queues a threaded gmail_draft proposal for the top actionable email', async () => {
    const out = await proposeTopEmailReply('user-1', okBrief([pedro]));
    expect(out.proposed).toBe(true);
    expect(out.to).toBe('pedro@acme.com');
    expect(out.messageId).toBe('m1');

    const [uid, dept, payload] = proposeMock.mock.calls[0];
    expect(uid).toBe('user-1');
    expect(dept).toBe('communications');
    expect(payload.toolName).toBe('gmail_draft');
    expect(payload.params).toMatchObject({
      to: 'pedro@acme.com',
      subject: 'Re: Partnership proposal',
      body: 'Sure, Friday works.',
      replyToMessageId: 'm1',
    });
  });

  it('does not double-prefix an already-Re: subject', async () => {
    await proposeTopEmailReply('user-1', okBrief([{ ...pedro, subject: 'Re: Partnership proposal' }]));
    expect(proposeMock.mock.calls[0][2].params.subject).toBe('Re: Partnership proposal');
  });

  it('de-dupes against a pending proposal targeting the same thread', async () => {
    pendingProposals = [{ proposed_action: JSON.stringify({ toolName: 'gmail_draft', params: { replyToMessageId: 'm1' } }) }];
    const out = await proposeTopEmailReply('user-1', okBrief([pedro]));
    expect(out.proposed).toBe(false);
    expect(out.reason).toBe('already_proposed');
    expect(proposeMock).not.toHaveBeenCalled();
  });

  it('never proposes a reply to the user themselves', async () => {
    const out = await proposeTopEmailReply('user-1', okBrief([{ ...pedro, from: 'me@twin.com' }]));
    expect(out.proposed).toBe(false);
    expect(out.reason).toBe('no_candidate');
    expect(proposeMock).not.toHaveBeenCalled();
  });

  it('skips emails without a draft and falls to the next candidate', async () => {
    const noDraft = { ...pedro, id: 'm0', draft: null };
    const out = await proposeTopEmailReply('user-1', okBrief([noDraft, pedro]));
    expect(out.proposed).toBe(true);
    expect(out.messageId).toBe('m1');
  });

  it('skips noise senders', async () => {
    const out = await proposeTopEmailReply('user-1', okBrief([{ ...pedro, from: 'noreply@news.com' }]));
    expect(out.proposed).toBe(false);
    expect(out.reason).toBe('no_candidate');
  });

  it('returns no_brief for a non-ok brief', async () => {
    const out = await proposeTopEmailReply('user-1', { status: 'no_unread', emails: [], count: 0 });
    expect(out.proposed).toBe(false);
    expect(out.reason).toBe('no_brief');
  });
});
