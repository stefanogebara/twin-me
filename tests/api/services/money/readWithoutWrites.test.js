/**
 * A read never writes inside its own completeness check (audit C3, 2026-09-26).
 *
 * Opening Today refreshed the standing charges: it upserted money_recurring and flipped
 * money_transactions.is_recurring while #592's completeness check was open. The row trigger on
 * money_transactions moves the financial revision the check compares, so a read after a bank
 * pull that brought a standing charge invalidated itself and Today, the forecast and the chat
 * said guidance was unavailable. The database here keeps that trigger's one rule (a change to a
 * financial table moves the revision) and records every write, so a read that writes fails here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ ledger: [], rows: {}, single: {}, ops: [], rpcs: [], financialRevision: 7 }));
/* dirty_money_scores (20260918000200) is on these four tables. */
const DIRTY = new Set(['money_transactions', 'money_facts', 'money_accounts', 'money_figure_scores']);
vi.mock('../../../../api/_app/services/database.js', () => {
  const chain = (table) => {
    let op = 'select';
    const q = new Proxy({}, {
      get: (_t, key) => {
        if (key === 'then') return (resolve, reject) => Promise.resolve({ data: op === 'select' ? (db.rows[table] || []) : null, error: null, count: 0 }).then(resolve, reject);
        if (key === 'maybeSingle' || key === 'single') return () => Promise.resolve({ data: op === 'select' ? (db.single[table] ?? null) : null, error: null });
        return (...args) => {
          if (['insert', 'upsert', 'update', 'delete'].includes(key)) {
            op = key; db.ops.push({ table, op: key, args });
            if (DIRTY.has(table)) db.financialRevision += 1;
          }
          return q;
        };
      },
    });
    return q;
  };
  const page = ({ p_since, p_currency, p_limit }) => db.ledger
    .filter((t) => (!p_since || Date.parse(t.occurred_at) >= Date.parse(p_since)) && (!p_currency || t.currency === p_currency))
    .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at) || (a.id < b.id ? 1 : -1))
    .slice(0, p_limit);
  return {
    supabaseAdmin: {
      from: (table) => chain(table),
      rpc: (name, args = {}) => {
        db.rpcs.push({ name, args });
        if (name === 'money_reconciliation_status') return Promise.resolve({ data: { state: 'clear', unresolvedCount: 0, bySource: {}, revision: 3, financialRevision: db.financialRevision }, error: null });
        if (name === 'money_ledger_page') return Promise.resolve({ data: page(args), error: null });
        if (name === 'prepare_money_scoring') return Promise.resolve({ data: { figures: [], dirty: false, revision: 0, reconciliation: { state: 'clear', unresolvedCount: 0, revision: 3, financialRevision: 0 } }, error: null });
        if (name === 'reserve_money_feed_read') return Promise.resolve({ data: { allowed: true, access_id: 'access-1' }, error: null });
        return Promise.resolve({ data: null, error: null });
      },
    },
  };
});
vi.mock('../../../../api/_app/services/money/betaCapabilities.js', () => ({ capabilitiesFor: async () => ({ bank: true, capture: true }) }));
vi.mock('../../../../api/_app/services/llmGateway.js', () => ({ complete: vi.fn(), stream: vi.fn(), TIER_CHAT: 'chat', TIER_EXTRACTION: 'extraction' }));
const feed = vi.hoisted(() => ({ ingest: vi.fn(), fetch: vi.fn() }));
vi.mock('../../../../api/_app/services/money/ingestion.js', async (original) => ({ ...(await original()), ingestSightings: (...a) => feed.ingest(...a) }));
vi.mock('../../../../api/_app/services/money/feeds/enableBanking.js', async (original) => ({ ...(await original()), fetchTransactions: (...a) => feed.fetch(...a) }));

import { readPage } from '../../../../api/_app/services/money/pageRead.js';
import { gather } from '../../../../api/_app/services/money/chat.js';
import { forecast } from '../../../../api/_app/services/money/forecastService.js';
import { recurringSeries, refreshRecurring, pullBankFeed, setVerdict, answerQuestion, deleteFact } from '../../../../api/_app/services/money/store.js';

const owner = '00000000-0000-4000-8000-000000000001';
const now = new Date('2026-09-10T10:00:00Z');
const row = (id, at, amount, key, name, extra = {}) => ({ id, user_id: owner, occurred_at: at, posted_at: at, amount, currency: 'EUR', merchant_key: key, merchant_raw: name, channel: 'card', verdict: null, is_recurring: false, ...extra });
/* A standing charge the bank has just completed: its third month, never flagged, never stored. */
const spotify = ['2026-06-20', '2026-07-20', '2026-08-20'].map((d, i) => row(`s${i}`, `${d}T09:00:00Z`, -11.99, 'spotify', 'Spotify'));
const coffees = [1, 3, 5, 8, 9].map((d) => row(`c${d}`, `2026-09-0${d}T08:30:00Z`, -4.5, 'cafe', 'Cafe'));
const persistence = () => db.ops.filter((o) => o.table === 'money_recurring' || o.table === 'money_transactions');

beforeEach(() => {
  db.ledger = [...spotify, ...coffees];
  db.rows = { money_facts: [{ id: 'f1', user_id: owner, kind: 'inbox_address', subject: '', value: 'r-abc@in.twinme.me', answered_at: '2026-09-01T00:00:00Z' }] };
  db.single = {}; db.ops = []; db.rpcs = []; db.financialRevision = 7;
  feed.ingest.mockReset(); feed.fetch.mockReset();
});

describe('the reads compute the standing charges and write nothing', () => {
  it('the page shows the new series, keeps its completeness check clear and writes no series and no flag', async () => {
    const { data, failed } = await readPage(owner, { view: 'today', now });
    expect(persistence()).toEqual([]);
    expect(db.financialRevision).toBe(7);
    expect(data.reconciliation.state).toBe('clear');
    expect(failed).not.toContain('recurring');
    expect(data.recurring.map((s) => [s.merchant_key, s.merchant_name, s.cadence, s.typical_amount, s.next_expected])).toEqual([['spotify', 'Spotify', 'monthly', 11.99, '2026-09-20']]);
    /* The month counts the charge still to come from the same rows, not from a stored copy. */
    expect(data.forecast.withheld).toBe(false);
    expect(data.forecast.committed_items.map((c) => [c.merchant_key, c.next_expected])).toEqual([['spotify', '2026-09-20']]);
    expect(data.forecast.committed).toBeCloseTo(11.99, 2);
  });

  it('the chat reads the same series inside its own check and writes nothing', async () => {
    const ctx = await gather(owner, now);
    expect(persistence()).toEqual([]);
    expect(ctx.reconciliation.state).toBe('clear');
    expect(ctx.recurring.map((s) => s.merchant_key)).toEqual(['spotify']);
    expect(ctx.forecast.committed_items.map((c) => c.merchant_key)).toEqual(['spotify']);
  });

  it('alone (GET /recurring, the sheet) it opens its own check, reads and writes nothing', async () => {
    const series = await recurringSeries(owner, now);
    expect(series.map((s) => [s.merchant_key, s.charges.length, s.total_paid])).toEqual([['spotify', 3, 35.97]]);
    expect(persistence()).toEqual([]);
    expect(db.rpcs.filter((r) => r.name === 'money_reconciliation_status')).toHaveLength(2);
  });

  it('the forecast alone reads the 400 days the series need and never the stored copy', async () => {
    const cast = await forecast(owner, now);
    expect(cast.committed_items.map((c) => c.merchant_key)).toEqual(['spotify']);
    const ledger = db.rpcs.filter((r) => r.name === 'money_ledger_page');
    expect(ledger).toHaveLength(1);
    expect(Math.round((now.getTime() - Date.parse(ledger[0].args.p_since)) / 86400000)).toBe(400);
    /* The fields the stored row has, not the ids it stands on. */
    expect(cast.committed_items[0]).not.toHaveProperty('transaction_ids');
  });

  it('refuses to write inside a read that holds the check open', async () => {
    await expect(refreshRecurring(owner, now, { reconciliationRead: { owner, initial: { state: 'clear', revision: 3, financialRevision: 7 } } })).rejects.toThrow(/reconciliation window/);
    expect(persistence()).toEqual([]);
  });
});

describe('the series is stored where the evidence changes', () => {
  const account = { id: 'a1', provider: 'enablebanking', provider_account_id: 'p1', name: 'Main', currency: 'EUR', last_pulled_at: '2026-09-09T00:00:00Z', session_id: 's1', created_at: '2026-06-01T00:00:00Z' };
  const bankRow = { transaction_amount: { amount: '11.99', currency: 'EUR' }, credit_debit_indicator: 'DBIT', status: 'BOOK', booking_date: '2026-08-20', value_date: '2026-08-20', entry_reference: 'e1', remittance_information: ['Spotify'] };
  const stored = () => db.ops.filter((o) => o.table === 'money_recurring' && o.op === 'upsert');
  const flagged = () => db.ops.filter((o) => o.table === 'money_transactions' && o.op === 'update' && o.args[0]?.is_recurring === true);

  it('a bank read that created lines stores the series and flags its rows before it returns', async () => {
    db.rows.money_accounts = [account];
    feed.fetch.mockResolvedValue({ rows: [bankRow], continuationKey: null });
    feed.ingest.mockResolvedValue({ seen: 1, created: 1, attached: 0, deferred: 0, ignored_deleted: 0 });
    const summary = await pullBankFeed(owner, { deadline: Date.now() + 30000 });
    expect(summary).toEqual([expect.objectContaining({ created: 1, complete: true })]);
    expect(stored()).toHaveLength(1);
    expect(stored()[0].args[0].map((s) => s.merchant_key)).toEqual(['spotify']);
    expect(flagged()).toHaveLength(1);
  });

  it('so does one that only attached evidence to lines already held', async () => {
    db.rows.money_accounts = [account];
    feed.fetch.mockResolvedValue({ rows: [bankRow], continuationKey: null });
    feed.ingest.mockResolvedValue({ seen: 1, created: 0, attached: 1, deferred: 0, ignored_deleted: 0 });
    await pullBankFeed(owner, { deadline: Date.now() + 30000 });
    expect(stored()).toHaveLength(1);
  });

  it('a read that changed no line leaves the series alone', async () => {
    db.rows.money_accounts = [account];
    feed.fetch.mockResolvedValue({ rows: [bankRow], continuationKey: null });
    feed.ingest.mockResolvedValue({ seen: 1, created: 0, attached: 0, deferred: 0, ignored_deleted: 0 });
    await pullBankFeed(owner, { deadline: Date.now() + 30000 });
    expect(db.ops.filter((o) => o.table === 'money_recurring')).toEqual([]);
  });

  it('a verdict stores the series again', async () => {
    await setVerdict(owner, 's2', 'not_me');
    expect(db.ops[0]).toMatchObject({ table: 'money_transactions', op: 'update', args: [{ verdict: 'not_me' }] });
    expect(stored()).toHaveLength(1);
  });

  it('a charge said to be cancelled leaves the stored series and its flags', async () => {
    db.ledger = db.ledger.map((t) => (t.merchant_key === 'spotify' ? { ...t, is_recurring: true } : t));
    db.rows.money_recurring = [{ merchant_key: 'spotify' }];
    /* As the upsert leaves it: the fact is read back by the refresh that follows. */
    db.rows.money_facts = [...db.rows.money_facts, { id: 'f2', user_id: owner, kind: 'merchant_kind', subject: 'spotify', value: 'cancelled', answered_at: '2026-09-10T09:00:00Z' }];
    await answerQuestion(owner, { questionId: null, kind: 'merchant_kind', subject: 'spotify', subjectLabel: 'Spotify', value: 'cancelled' });
    expect(db.ops.filter((o) => o.table === 'money_recurring' && o.op === 'delete')).toHaveLength(1);
    expect(db.ops.filter((o) => o.table === 'money_transactions' && o.op === 'update' && o.args[0]?.is_recurring === false)).toHaveLength(1);
  });

  it('forgetting that it was cancelled stores the series again', async () => {
    db.single.money_facts = { id: 'f2', user_id: owner, kind: 'merchant_kind', subject: 'spotify', value: 'cancelled', question_id: null };
    expect(await deleteFact(owner, 'f2')).toEqual({ deleted: true });
    expect(stored()).toHaveLength(1);
  });

  it('any other answer or forgotten fact leaves the series alone', async () => {
    await answerQuestion(owner, { questionId: null, kind: 'note', subject: 'n', subjectLabel: null, value: 'paid back' });
    db.single.money_facts = { id: 'f3', user_id: owner, kind: 'note', subject: 'n', value: 'paid back', question_id: null };
    await deleteFact(owner, 'f3');
    expect(db.ops.filter((o) => o.table === 'money_recurring')).toEqual([]);
  });
});
