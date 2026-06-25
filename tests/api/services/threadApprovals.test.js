/**
 * Thread approvals — the /inbox page's replacement (one-interface, 2026-06-12).
 * Pins the deterministic rail: protocol classification, offer-one-at-a-time,
 * and resolution through the SAME approve/reject paths the inbox buttons used.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// supabaseAdmin stub: programmable per-table results + update capture.
let awaitingRows;   // result for the awaiting-proposal lookup
let offerRows;      // result for the unoffered-proposal lookup
const updates = [];
function makeBuilder() {
  const state = { isUpdate: false };
  const builder = {};
  for (const m of ['select', 'eq', 'is', 'not', 'gte', 'gt', 'order']) {
    builder[m] = () => builder;
  }
  builder.update = (payload) => { state.isUpdate = true; updates.push(payload); return builder; };
  builder.limit = () => {
    // Heuristic: awaiting lookup filters wa_delivered_at NOT null (uses .not);
    // the offer lookup filters wa_delivered_at IS null. We track which via flag.
    return Promise.resolve({ data: builder._rows, error: null });
  };
  builder.then = (resolve, reject) => {
    // update chains resolve here (no .limit on updates)
    return Promise.resolve({ data: null, error: null }).then(resolve, reject);
  };
  return builder;
}
vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: () => {
      const b = makeBuilder();
      // First query in each function decides which fixture it gets via marker
      b.not = () => { b._rows = awaitingRows; return b; };
      b.is = (col, val) => {
        if (col === 'wa_delivered_at' && val === null) b._rows = offerRows;
        return b;
      };
      return b;
    },
  },
  serverDb: {},
}));

const executeMock = vi.fn();
const recordMock = vi.fn();
vi.mock('../../../api/services/autonomyService.js', () => ({
  executeApprovedAction: (...a) => executeMock(...a),
  recordActionResponse: (...a) => recordMock(...a),
}));

const { classifyProtocolReply, resolveProtocolReply, offerNextProposal } = await import(
  '../../../api/services/threadApprovals.js'
);

describe('classifyProtocolReply', () => {
  it('recognizes short approvals in en + pt', () => {
    for (const t of ['yes', 'Sim', 'ok', 'do it', 'faz', 'pode', 'confirmo', 'YES!']) {
      expect(classifyProtocolReply(t), t).toBe('approve');
    }
  });
  it('recognizes short rejections in en + pt', () => {
    for (const t of ['no', 'skip', 'nao', 'não', 'pula', 'depois', 'later.']) {
      expect(classifyProtocolReply(t), t).toBe('reject');
    }
  });
  it('long or conversational messages are NOT protocol replies', () => {
    expect(classifyProtocolReply('yes, and can you also check my calendar?')).toBe(null);
    expect(classifyProtocolReply('skip the gym today, I am tired')).toBe(null);
    expect(classifyProtocolReply('what do you know about me?')).toBe(null);
    expect(classifyProtocolReply('')).toBe(null);
  });
});

describe('resolveProtocolReply', () => {
  beforeEach(() => {
    executeMock.mockReset().mockResolvedValue({ success: true });
    recordMock.mockReset().mockResolvedValue({});
    awaitingRows = [{ id: 'p1', context_summary: 'draft a reply to Maria', wa_delivered_at: new Date().toISOString() }];
    offerRows = [];
  });

  it('approve executes through the same path as the inbox Approve button', async () => {
    const reply = await resolveProtocolReply('u1', 'approve');
    expect(executeMock).toHaveBeenCalledWith('u1', 'p1');
    expect(reply).toMatch(/Done/);
  });

  it('reject records rejection with thread provenance', async () => {
    const reply = await resolveProtocolReply('u1', 'reject');
    expect(recordMock).toHaveBeenCalledWith('u1', 'p1', 'rejected', expect.objectContaining({ via: 'whatsapp_thread' }));
    expect(reply).toMatch(/Skipped/);
  });

  it('returns null when nothing is awaiting (falls through to chat)', async () => {
    awaitingRows = [];
    const reply = await resolveProtocolReply('u1', 'approve');
    expect(reply).toBe(null);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('failed execution reports back instead of pretending', async () => {
    executeMock.mockResolvedValue({ success: false, error: 'gmail token expired' });
    const reply = await resolveProtocolReply('u1', 'approve');
    expect(reply).toMatch(/didn't go through/);
  });
});

describe('offerNextProposal', () => {
  beforeEach(() => {
    awaitingRows = [];
    offerRows = [{ id: 'p2', context_summary: 'schedule your dentist follow-up', created_at: new Date().toISOString() }];
    updates.length = 0;
  });

  it('offers the oldest unoffered proposal with the yes/skip protocol line', async () => {
    const offer = await offerNextProposal('u1');
    expect(offer).toMatch(/schedule your dentist follow-up/);
    expect(offer).toMatch(/"yes".*"skip"/);
    // marked as delivered so it is never re-offered
    expect(updates.some((u) => u.wa_delivered_at)).toBe(true);
  });

  it('stays quiet while another offer is awaiting a reply', async () => {
    awaitingRows = [{ id: 'p1', context_summary: 'x', wa_delivered_at: new Date().toISOString() }];
    const offer = await offerNextProposal('u1');
    expect(offer).toBe(null);
  });

  it('stays quiet when there is nothing to offer', async () => {
    offerRows = [];
    const offer = await offerNextProposal('u1');
    expect(offer).toBe(null);
  });
});
