import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { testPool, bootstrapMoney, postgresSupabase } from '../../../helpers/moneyDatabase.js';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../../../api/services/database.js', () => ({ supabaseAdmin: new Proxy({}, { get: (_, key) => state.db[key] }), serverDb: {} }));
vi.mock('../../../../api/services/money/twinBridge.js', () => ({ tellTwin: vi.fn(), tellTwinFacts: vi.fn(), tellTwinPatterns: vi.fn(), tellTwinTurn: vi.fn() }));
import { ingestSighting, ingestSightings, saveBankAccounts } from '../../../../api/services/money/store.js';

const USER = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const phone = { source: 'phone', source_ref: 'event-1', amount: 5, currency: 'EUR', direction: 'out', merchant_key: 'cafe', merchant_raw: 'Cafe', occurred_at: '2026-09-11T19:00:00Z' };
const bank = (overrides = {}) => ({ ...phone, source: 'bankfeed', source_ref: 'bank-1', raw_json: { status: 'BOOK', entry_reference: 'bank-1' }, ...overrides });
import { transactionPage, listTransactions } from '../../../../api/services/money/transactionRepository.js';
import { createStatementAccount, statementAccounts, ownedStatementAccount, checkStatementEvidence } from '../../../../api/services/money/statements/accounts.js';
import { toSightings } from '../../../../api/services/money/statements/importer.js';
import { holdUndatedCapture } from '../../../../api/services/money/legacyCapture.js';
let pool;
beforeAll(async () => {
  pool = testPool();
  await bootstrapMoney(pool);
  state.db = postgresSupabase(pool);
  await pool.query('INSERT INTO users(id) VALUES ($1),($2)', [USER, OTHER]);
  await pool.query("INSERT INTO money_accounts(id,user_id,provider) VALUES ($1,$2,'enablebanking'),($3,$4,'enablebanking')", [ACCOUNT,USER,ACCOUNT2,OTHER]);
});
beforeEach(async () => { state.db = postgresSupabase(pool); await pool.query('TRUNCATE money_sightings, money_transactions, money_feed_accesses, money_feed_leases, money_sync_jobs, money_notices CASCADE'); });
afterAll(async () => { await pool?.end(); });
const ACCOUNT = '00000000-0000-4000-8000-000000000010';
const ACCOUNT2 = '00000000-0000-4000-8000-000000000011';
const rows = async () => (await pool.query('SELECT * FROM money_transactions ORDER BY created_at,id')).rows;

describe('Money persisted invariants', () => {
  it('preserves old undated captures outside the ledger and isolates their retries by owner', async () => {
    const body={text:'Compra 5,00 EUR en Cafe'};
    await holdUndatedCapture(USER, body); await holdUndatedCapture(USER, body); await holdUndatedCapture(OTHER, body);
    const held=(await pool.query("SELECT user_id,amount,due_at,evidence FROM money_notices WHERE kind='capture_needs_update'")).rows;
    expect(held).toHaveLength(2);
    expect(new Set(held.map((x)=>x.user_id))).toEqual(new Set([USER,OTHER]));
    expect(held.every(x=>x.amount===null && x.due_at===null && x.evidence.text===body.text)).toBe(true);
    expect(await rows()).toHaveLength(0);
  });
  it('keeps account creation idempotent and never resolves another owner’s account', async () => {
    const a = await createStatementAccount(USER, { name: 'Everyday' });
    const again = await createStatementAccount(USER, { name: ' everyday ' });
    const other = await createStatementAccount(OTHER, { name: 'Everyday' });
    expect(again.id).toBe(a.id);
    expect(other.id).not.toBe(a.id);
    expect(a).toMatchObject({ provider: 'statement', currency: 'EUR' });
    expect(a).not.toHaveProperty('session_id');
    expect((await statementAccounts(USER)).map((x) => x.id)).not.toContain(other.id);
    await expect(ownedStatementAccount(USER, other.id)).rejects.toMatchObject({ status: 404 });
    await expect(ownedStatementAccount(USER, null)).rejects.toMatchObject({ status: 400 });
  });
  it('imports identical statements for two accounts independently and replays each once', async () => {
    const a = await createStatementAccount(USER, { name: 'Statement A' });
    const b = await createStatementAccount(USER, { name: 'Statement B' });
    const file = [['Fecha', 'Concepto', 'Importe'], ['17/09/2026', 'Cafe', '-5,00']];
    for (const account of [a, b, a, b]) {
      const { sightings } = toSightings(file, { accountId: account.id });
      await checkStatementEvidence(USER, account, sightings);
      await ingestSightings(USER, sightings);
    }
    expect(await rows()).toHaveLength(2);
    expect(new Set((await rows()).map((r) => r.account_id))).toEqual(new Set([a.id, b.id]));
  });
  it('refuses currency mismatches and old unassigned imports without adding a payment', async () => {
    const account = await createStatementAccount(USER, { name: 'Historical' });
    const file = [['Fecha', 'Concepto', 'Importe'], ['17/09/2026', 'Cafe', '-5,00']];
    const { sightings } = toSightings(file, { accountId: account.id });
    await expect(checkStatementEvidence(USER, account, [{ ...sightings[0], currency: 'USD' }])).rejects.toMatchObject({ status: 422 });
    await pool.query("INSERT INTO money_sightings (user_id,source,source_ref,amount,currency,direction,occurred_at) VALUES ($1,'statement',$2,5,'EUR','out','2026-09-17')", [USER, sightings[0].legacy_refs[0]]);
    await expect(checkStatementEvidence(USER, account, sightings)).rejects.toMatchObject({ status: 409 });
    expect(await rows()).toHaveLength(0);
  });
  it('refuses statement evidence without an account before writing anything', async () => {
    await expect(ingestSighting(USER, { ...phone, source: 'statement' })).rejects.toThrow(/account/i);
    expect(await rows()).toHaveLength(0);
  });
  it('keeps two same-price purchases from the same source distinct', async () => {
    await ingestSighting(USER, phone);
    await ingestSighting(USER, { ...phone, source_ref: 'event-2', occurred_at: '2026-09-11T20:00:00Z' });
    expect(await rows()).toHaveLength(2);
  });
  it('matches a Friday notification to Monday settlement', async () => {
    await ingestSighting(USER, phone);
    await ingestSightings(USER, [bank({ occurred_at: '2026-09-14T12:00:00Z' })]);
    expect(await rows()).toHaveLength(1);
  });
  it('settles pending bank evidence instead of counting it again', async () => {
    await ingestSightings(USER, [bank({ source_ref: 'pending-1', raw_json: { status: 'PDNG' } })]);
    await ingestSightings(USER, [bank()]);
    const saved = await rows();
    expect(saved).toHaveLength(1);
    expect(saved[0].posted_at).not.toBeNull();
  });
  it('keeps the bank amount when a later phone alert is rounded differently', async () => {
    await ingestSightings(USER, [bank({ amount: 100 })]);
    await ingestSighting(USER, { ...phone, amount: 100.5 });
    const saved = await rows();
    expect(saved).toHaveLength(1);
    expect(Number(saved[0].amount)).toBe(-100);
  });
  it('replays one event concurrently without creating extra payments', async () => {
    // Force every caller to plan from the SAME snapshot, instead of relying on timing.
    const rpc = state.db.rpc;
    let arrived = 0; let release;
    const barrier = new Promise((resolve) => { release = resolve; });
    state.db.rpc = async (name, args) => {
      const result = await rpc(name, args);
      if (name === 'prepare_money_ingestion' && arrived < 5) {
        arrived++;
        if (arrived === 5) release();
        await barrier;
      }
      return result;
    };
    await Promise.all(Array.from({ length: 5 }, () => ingestSighting(USER, phone)));
    expect(await rows()).toHaveLength(1);
    expect((await pool.query('SELECT count(*) FROM money_sightings')).rows[0].count).toBe('1');
  });
  it('never reconciles one user against another user', async () => {
    await ingestSighting(USER, phone);
    await ingestSighting(OTHER, phone);
    const saved = await rows();
    expect(saved).toHaveLength(2);
    expect(new Set(saved.map((r) => r.user_id)).size).toBe(2);
  });
  it('uses two database calls for a hundred payments and preserves every link', async () => {
    const rpc = vi.fn(state.db.rpc); state.db.rpc = rpc;
    const result = await ingestSightings(USER, Array.from({ length: 100 }, (_, i) => bank({ source_ref: `bank-${i}` })));
    expect(result.created).toBe(100);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect((await pool.query('SELECT count(*) FROM money_sightings WHERE transaction_id IS NOT NULL')).rows[0].count).toBe('100');
  });
  it('updates a replayed bank reference without losing the manual verdict', async () => {
    const first = await ingestSighting(USER, bank());
    await pool.query("UPDATE money_transactions SET verdict='worth_it',category='food' WHERE id=$1", [first.transaction.id]);
    await ingestSighting(USER, bank({ amount: 6, occurred_at: '2026-09-12T12:00:00Z' }));
    const saved = await rows();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ amount: '-6.00', verdict: 'worth_it', category: 'food' });
  });
  it('never matches currencies, card suffixes or different known accounts', async () => {
    await ingestSighting(USER, phone);
    await ingestSighting(USER, bank({ currency: 'USD' }));
    expect(await rows()).toHaveLength(2);
    await expect(ingestSighting(USER, bank({ source_ref: 'foreign-account', account_id: ACCOUNT2 }))).rejects.toThrow('ownership');
    expect(await rows()).toHaveLength(2);
  });
  it('handles a delayed pending response after the booked response', async () => {
    await ingestSightings(USER, [bank()]);
    await ingestSightings(USER, [bank({ source_ref: 'pending', amount: 5.01, raw_json: { status: 'PDNG' } })]);
    const saved = await rows();
    expect(saved).toHaveLength(1);
    expect(saved[0].amount).toBe('-5.00');
    expect(saved[0].posted_at).not.toBeNull();
  });
  it('keeps two pending coffees and two settlements as exactly two payments', async () => {
    await ingestSightings(USER, [1,2].map((i) => bank({ source_ref: `pending-${i}`, raw_json: { status: 'PDNG' } })));
    await ingestSightings(USER, [1,2].map((i) => bank({ source_ref: `booked-${i}` })));
    expect(await rows()).toHaveLength(2);
    expect((await rows()).every((t) => t.posted_at)).toBe(true);
  });
  it('rolls back the payment when evidence linking fails', async () => {
    await pool.query(`CREATE OR REPLACE FUNCTION fail_money_link() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.transaction_id IS NOT NULL THEN RAISE EXCEPTION 'injected link failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER money_link_failure BEFORE UPDATE ON money_sightings FOR EACH ROW EXECUTE FUNCTION fail_money_link();`);
    try {
      await expect(ingestSightings(USER, [phone])).rejects.toThrow();
      expect(await rows()).toHaveLength(0);
      expect((await pool.query('SELECT count(*) FROM money_sightings')).rows[0].count).toBe('0');
    } finally { await pool.query('DROP TRIGGER money_link_failure ON money_sightings'); }
  });
});

describe('Money cache access', () => {
  it('exposes ingestion RPCs only to the backend role', async () => {
    const r = await pool.query(`SELECT has_function_privilege('anon','prepare_money_ingestion(uuid,jsonb)','EXECUTE') AS anon,
      has_function_privilege('authenticated','commit_money_ingestion(uuid,bigint,jsonb,jsonb,jsonb,jsonb)','EXECUTE') AS authenticated,
      has_function_privilege('service_role','commit_money_ingestion(uuid,bigint,jsonb,jsonb,jsonb,jsonb)','EXECUTE') AS service`);
    expect(r.rows[0]).toEqual({ anon: false, authenticated: false, service: true });
  });
  it('denies public mutation while keeping service access', async () => {
    const result = await pool.query(`SELECT has_table_privilege('anon','money_places','INSERT') AS anon_insert,
      has_table_privilege('authenticated','money_places','UPDATE') AS authenticated_update,
      has_table_privilege('service_role','money_places','INSERT') AS service_insert`);
    expect(result.rows[0]).toEqual({ anon_insert: false, authenticated_update: false, service_insert: true });
  });
});


describe('complete ledger reads and bank coordination', () => {
  it('reads more than 1,000 rows without truncation, skips no timestamp ties, and isolates users', async () => {
    await pool.query(`INSERT INTO money_transactions(user_id,occurred_at,amount,merchant_key,currency)
      SELECT $1,'2026-09-11T12:00:00Z',-1,'cafe','EUR' FROM generate_series(1,1005)`,[USER]);
    const all = await listTransactions(USER);
    expect(all).toHaveLength(1005);
    expect(new Set(all.map((t) => t.id)).size).toBe(1005);
    expect(await listTransactions(OTHER)).toEqual([]);
    await expect(listTransactions(USER,{limit:1000})).rejects.toThrow('larger');
    await expect(transactionPage(USER,{cursor:'bad'})).rejects.toThrow();
  });
  it('reconnects a stable provider account without replacing its local id', async () => {
    const session = {sessionId:'s1',validUntil:'2027-01-01T00:00:00Z',accounts:[{uid:'new-uid-1',identificationHash:'stable-account-hash',currency:'EUR',name:'Test account'}]};
    const first = await saveBankAccounts(USER,session);
    const again = await saveBankAccounts(USER,{...session,sessionId:'s2',accounts:[{...session.accounts[0],uid:'new-uid-2'}]});
    expect(again[0].id).toBe(first[0].id);
    expect(again[0].session_id).toBe('s2');
  });
  it('reserves an unattended read once even when callers race', async () => {
    const calls = await Promise.all(Array.from({length:5},()=>state.db.rpc('reserve_money_feed_read',{p_user_id:USER,p_account_id:ACCOUNT,p_attended:false})));
    expect(calls.filter((r)=>r.data.allowed)).toHaveLength(1);
    expect((await pool.query('SELECT count(*) FROM money_feed_accesses')).rows[0].count).toBe('1');
    await pool.query('UPDATE money_feed_leases SET lease_until=NULL');
    await pool.query(`INSERT INTO money_feed_accesses(user_id,account_id,attended,outcome) SELECT $1,$2,false,'error' FROM generate_series(1,3)`,[USER,ACCOUNT]);
    const fifth = await state.db.rpc('reserve_money_feed_read',{p_user_id:USER,p_account_id:ACCOUNT,p_attended:false});
    expect(fifth.data).toMatchObject({allowed:false,reason:'feed_budget_spent'});
  });
  it('claims each due owner once across overlapping cron invocations', async () => {
    const batches = await Promise.all([state.db.rpc('claim_money_sync_jobs',{p_limit:3}),state.db.rpc('claim_money_sync_jobs',{p_limit:3})]);
    const owners = batches.flatMap((r)=>r.data);
    expect(new Set(owners).size).toBe(owners.length);
    expect(owners).toContain(USER);
  });
});
