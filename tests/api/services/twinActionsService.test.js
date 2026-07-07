/**
 * Tests for twinActionsService — the M1 action-inbox logic.
 *
 * The decision→patch mapping + validation are pure; the list/resolve flows run
 * against an injected fake `db`, so no real Supabase. Ownership + idempotency
 * (pending-only) are enforced in the default SQL query and asserted via the
 * arguments passed to the port.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { resolveActionPatch, listPendingActions, resolveAction } =
  await import('../../../api/services/twinActionsService.js');

const TS = '2026-07-06T00:00:00.000Z';

describe('resolveActionPatch', () => {
  it('maps send → status sent', () => {
    expect(resolveActionPatch({ decision: 'send' }, TS))
      .toEqual({ ok: true, patch: { status: 'sent', resolved_at: TS } });
  });

  it('maps edit → status edited with trimmed final_text', () => {
    expect(resolveActionPatch({ decision: 'edit', finalText: '  See you Tue.  ' }, TS))
      .toEqual({ ok: true, patch: { status: 'edited', final_text: 'See you Tue.', resolved_at: TS } });
  });

  it('rejects an edit with no usable final text', () => {
    expect(resolveActionPatch({ decision: 'edit', finalText: '   ' }, TS)).toEqual({ ok: false, error: 'missing_final_text' });
    expect(resolveActionPatch({ decision: 'edit' }, TS)).toEqual({ ok: false, error: 'missing_final_text' });
  });

  it('maps reject → status rejected, keeping a trimmed reason', () => {
    expect(resolveActionPatch({ decision: 'reject', reason: '  too formal  ' }, TS))
      .toEqual({ ok: true, patch: { status: 'rejected', reject_reason: 'too formal', resolved_at: TS } });
  });

  it('rejects with a null reason when none given', () => {
    expect(resolveActionPatch({ decision: 'reject' }, TS))
      .toEqual({ ok: true, patch: { status: 'rejected', reject_reason: null, resolved_at: TS } });
  });

  it('caps a very long reject reason at 500 chars', () => {
    const r = resolveActionPatch({ decision: 'reject', reason: 'x'.repeat(900) }, TS);
    expect(r.patch.reject_reason).toHaveLength(500);
  });

  it('refuses an unknown decision', () => {
    expect(resolveActionPatch({ decision: 'nuke' }, TS)).toEqual({ ok: false, error: 'invalid_decision' });
    expect(resolveActionPatch({}, TS)).toEqual({ ok: false, error: 'invalid_decision' });
  });
});

const fakeDeps = (over = {}) => ({
  now: () => TS,
  limit: 50,
  db: {
    listPending: vi.fn(async () => [{ id: 'a1', status: 'pending', draft_text: 'hi' }]),
    updateAction: vi.fn(async () => ({ id: 'a1', status: 'sent', resolved_at: TS })),
  },
  ...over,
});

describe('listPendingActions', () => {
  it('returns the pending rows for a user', async () => {
    const deps = fakeDeps();
    const rows = await listPendingActions('user-1', deps);
    expect(rows).toEqual([{ id: 'a1', status: 'pending', draft_text: 'hi' }]);
    expect(deps.db.listPending).toHaveBeenCalledWith('user-1', 50);
  });

  it('returns [] without a userId and never hits the db', async () => {
    const deps = fakeDeps();
    expect(await listPendingActions(undefined, deps)).toEqual([]);
    expect(deps.db.listPending).not.toHaveBeenCalled();
  });

  it('degrades to [] when the db throws (the inbox never 500s)', async () => {
    const deps = fakeDeps({ db: { listPending: vi.fn(async () => { throw new Error('down'); }), updateAction: vi.fn() } });
    expect(await listPendingActions('user-1', deps)).toEqual([]);
  });
});

describe('resolveAction', () => {
  it('sends: updates the row scoped to owner + built patch', async () => {
    const deps = fakeDeps();
    const r = await resolveAction({ userId: 'user-1', actionId: 'a1', decision: 'send' }, deps);
    expect(r).toEqual({ ok: true, action: { id: 'a1', status: 'sent', resolved_at: TS } });
    expect(deps.db.updateAction).toHaveBeenCalledWith('user-1', 'a1', { status: 'sent', resolved_at: TS });
  });

  it('edits: passes the trimmed final_text patch', async () => {
    const deps = fakeDeps();
    await resolveAction({ userId: 'user-1', actionId: 'a1', decision: 'edit', finalText: 'Tue works' }, deps);
    expect(deps.db.updateAction).toHaveBeenCalledWith('user-1', 'a1',
      { status: 'edited', final_text: 'Tue works', resolved_at: TS });
  });

  it('returns not_found when the row is missing / already resolved / not owned', async () => {
    const deps = fakeDeps({ db: { updateAction: vi.fn(async () => null), listPending: vi.fn() } });
    const r = await resolveAction({ userId: 'user-1', actionId: 'ghost', decision: 'send' }, deps);
    expect(r).toEqual({ ok: false, error: 'not_found' });
  });

  it('validates before touching the db', async () => {
    const deps = fakeDeps();
    expect(await resolveAction({ userId: 'user-1', actionId: 'a1', decision: 'bogus' }, deps))
      .toEqual({ ok: false, error: 'invalid_decision' });
    expect(await resolveAction({ decision: 'send' }, deps)).toEqual({ ok: false, error: 'missing_input' });
    expect(deps.db.updateAction).not.toHaveBeenCalled();
  });

  it('surfaces update_failed when the db throws', async () => {
    const deps = fakeDeps({ db: { updateAction: vi.fn(async () => { throw new Error('boom'); }), listPending: vi.fn() } });
    const r = await resolveAction({ userId: 'user-1', actionId: 'a1', decision: 'send' }, deps);
    expect(r).toEqual({ ok: false, error: 'update_failed' });
  });
});
