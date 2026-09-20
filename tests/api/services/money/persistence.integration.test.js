import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { testPool, bootstrapMoney, postgresSupabase } from '../../../helpers/moneyDatabase.js';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../../../api/services/database.js', () => ({ supabaseAdmin: new Proxy({}, { get: (_, key) => state.db[key] }), serverDb: {} }));
vi.mock('../../../../api/services/money/twinBridge.js', () => ({ tellTwin: vi.fn(), tellTwinFacts: vi.fn(), tellTwinPatterns: vi.fn(), tellTwinTurn: vi.fn() }));
import { ingestSighting, ingestSightings, saveBankAccounts, setVerdict, refreshRecurring } from '../../../../api/services/money/store.js';

const USER = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const phone = { source: 'phone', source_ref: 'event-1', amount: 5, currency: 'EUR', direction: 'out', merchant_key: 'cafe', merchant_raw: 'Cafe', occurred_at: '2026-09-11T19:00:00Z' };
const bank = (overrides = {}) => ({ ...phone, source: 'bankfeed', source_ref: 'bank-1', raw_json: { status: 'BOOK', entry_reference: 'bank-1' }, ...overrides });
import { labelCard, accountsWithCards } from '../../../../api/services/money/instruments.js';
import { transactionPage, listTransactions } from '../../../../api/services/money/transactionRepository.js';
import { createStatementAccount, statementAccounts, ownedStatementAccount, checkStatementEvidence } from '../../../../api/services/money/statements/accounts.js';
import { toSighting, distinctPending } from '../../../../api/services/money/feeds/enableBanking.js';
import { toSightings } from '../../../../api/services/money/statements/importer.js';
import { holdUndatedCapture } from '../../../../api/services/money/legacyCapture.js';
import { seenBy } from '../../../../api/services/money/seen.js';
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
  /* The anon key ships in the browser bundle. Supabase grants it every new public table by
     default, so it held full DML on money_transactions with row level security as the only
     barrier. No client reads these tables with it, so it is revoked, and a new money table
     must not inherit the default either (2026-09-19, audit S3). */
  it('restores the ledger from its own dump, row for row (the backup rehearsal, M0-4)', async () => {
    /* A ledger to prove: two payments seen, one settled by the bank. */
    await ingestSighting(USER, phone);
    await ingestSighting(USER, bank({ source_ref: 'bank-x', amount: 7, merchant_key: 'shop' }));
    expect((await rows()).length).toBeGreaterThan(0);
    /* dump -> a fresh database on the same server -> verify -> drop. Ubuntu's runner and the
       laptop both have Postgres 16 client tools; a missing pg_dump fails here, never skips. */
    const out = execFileSync('bash', ['scripts/money/backup-rehearsal.sh', 'rehearse', process.env.MONEY_TEST_DATABASE_URL], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
    expect(out).toMatch(/^money_transactions \d+$/m);
    expect(out).toMatch(/^money_transactions md5 [0-9a-f]{32}$/m);
  }, 150000);

  it('says which sources saw a payment once the bank and the phone agree', async () => {
    await ingestSighting(USER, phone);
    await ingestSighting(USER, bank());
    const [row] = await rows();
    expect((await seenBy(USER))[row.id]).toEqual(['bankfeed', 'phone']);
    expect(await seenBy(OTHER)).toEqual({});
  });

  it('gives the public key no privilege on any money table', async () => {
    const { rows } = await pool.query(`
      SELECT table_name, string_agg(privilege_type, ',') AS privs
      FROM information_schema.role_table_grants
      WHERE grantee = 'anon' AND table_schema = 'public' AND table_name LIKE 'money\\_%' ESCAPE '\\'
      GROUP BY table_name`);
    expect(rows).toEqual([]);
    /* And what its policies still allow authenticated: select_own stays. */
    const { rows: auth } = await pool.query(`SELECT count(*)::int AS n FROM information_schema.role_table_grants WHERE grantee='authenticated' AND table_name='money_transactions' AND privilege_type='SELECT'`);
    expect(auth[0].n).toBe(1);
  });

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
  /* Every bank session mints a new provider id for the same account. A fingerprint (the IBAN,
     hashed) holds it together, but rows opened before that column existed have none, so a
     reconnect opened a second row for one account: Stefano's ES53 **** 7516 was held twice,
     one row with the balance and the payments since the 6th, the other with the 88 before it
     and no balance. The mask and the currency identify a row that has nothing stronger, and
     the save gives it a fingerprint so it is never needed twice (2026-09-18). */
  it('reopens one account under a new provider id when only the mask identifies it', async () => {
    await pool.query('DELETE FROM money_accounts WHERE user_id=$1 AND iban_mask=$2', [USER, 'ES53 **** 7516']);
    const shape = { sessionId: 's1', validUntil: '2027-03-07T00:00:00Z', bankName: 'Santander' };
    await saveBankAccounts(USER, { ...shape, accounts: [{ uid: 'p-1', name: 'CHAP-CHAP', currency: 'EUR', iban: 'ES5300000000000000007516' }] });
    /* The column did not exist when this row was opened. */
    await pool.query('UPDATE money_accounts SET account_fingerprint=NULL WHERE user_id=$1 AND provider_account_id=$2', [USER, 'p-1']);
    await saveBankAccounts(USER, { ...shape, sessionId: 's2', accounts: [{ uid: 'p-2', name: 'CHAP-CHAP', currency: 'EUR', iban: 'ES5300000000000000007516' }] });
    const held = (await pool.query('SELECT * FROM money_accounts WHERE user_id=$1 AND iban_mask=$2', [USER, 'ES53 **** 7516'])).rows;
    expect(held).toHaveLength(1);
    expect(held[0].provider_account_id).toBe('p-2');
    expect(held[0].account_fingerprint).not.toBeNull();
  });
  it('never joins two accounts that only look alike', async () => {
    await pool.query('DELETE FROM money_accounts WHERE user_id=$1 AND iban_mask=$2', [USER, 'ES53 **** 7516']);
    const shape = { sessionId: 's1', validUntil: '2027-03-07T00:00:00Z', bankName: 'Santander' };
    await saveBankAccounts(USER, { ...shape, accounts: [
      { uid: 'p-1', name: 'One', currency: 'EUR', iban: 'ES5300000000000000007516' },
      { uid: 'p-2', name: 'Two', currency: 'USD', iban: 'ES5300000000000000007516' },
    ] });
    const held = (await pool.query('SELECT id FROM money_accounts WHERE user_id=$1 AND iban_mask=$2', [USER, 'ES53 **** 7516'])).rows;
    expect(held).toHaveLength(2);
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
  /* The key is what matching, the repeating charges and the categories read, and it was the
     one ingestion-owned field the commit never applied: a line took the bank's better name
     and kept the key it was created with, so "Internet En Mpass" sat beside the phone's
     "MPASS" for ever and the month counted one payment twice (2026-09-18). */
  it('takes the key with the name when the bank names a payment better', async () => {
    await ingestSighting(USER, phone);
    await ingestSightings(USER, [bank({ merchant_key: 'cafe centrale', merchant_raw: 'Cafe Centrale' })]);
    const saved = await rows();
    expect(saved).toHaveLength(1);
    expect(saved[0].merchant_raw).toBe('Cafe Centrale');
    expect(saved[0].merchant_key).toBe('cafe centrale');
  });
  it('never lets a later phone alert take the key from the bank name', async () => {
    await ingestSightings(USER, [bank({ merchant_key: 'cafe centrale', merchant_raw: 'Cafe Centrale' })]);
    await ingestSighting(USER, { ...phone, source_ref: 'event-2' });
    const saved = await rows();
    expect(saved).toHaveLength(1);
    expect(saved[0].merchant_key).toBe('cafe centrale');
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
  it('keeps rejected evidence reviewable but removes it and dissolved series from calculations, with undo', async () => {
    const now = new Date();
    const dates = [3, 33, 63].map((days) => new Date(now.getTime() - days * 86400000).toISOString());
    for (const at of dates) await pool.query("INSERT INTO money_transactions(user_id,occurred_at,amount,merchant_key,currency,channel) VALUES ($1,$2,-10,'music','EUR','card')", [USER, at]);
    expect(await refreshRecurring(USER)).toHaveLength(1);
    const id = (await rows())[0].id;
    await setVerdict(USER, id, 'not_me');
    expect(await listTransactions(USER)).toHaveLength(2);
    expect((await transactionPage(USER)).data).toHaveLength(3);
    expect(await listTransactions(USER, { includeRejected: true })).toHaveLength(3);
    expect((await pool.query('SELECT * FROM money_recurring WHERE user_id=$1', [USER])).rows).toHaveLength(0);
    expect((await rows()).every((row) => row.is_recurring === false)).toBe(true);
    await setVerdict(USER, id, null);
    expect(await listTransactions(USER)).toHaveLength(3);
    expect((await pool.query('SELECT * FROM money_recurring WHERE user_id=$1', [USER])).rows).toHaveLength(1);
  });
  it('persists card labels only for an observed suffix on an owned account', async () => {
    await pool.query("INSERT INTO money_transactions(user_id,account_id,occurred_at,amount,merchant_key,currency,channel,card_last4) VALUES ($1,$2,now(),-10,'cafe','EUR','card','1234')", [USER, ACCOUNT]);
    await expect(labelCard(OTHER, ACCOUNT, '1234', 'credit')).rejects.toMatchObject({ status: 404 });
    await expect(labelCard(USER, ACCOUNT, '9999', 'credit')).rejects.toMatchObject({ status: 404 });
    await expect(labelCard(USER, ACCOUNT, '1234', 'prepaid')).rejects.toMatchObject({ status: 400 });
    await labelCard(USER, ACCOUNT, '1234', 'debit');
    const accounts = await accountsWithCards(USER, [{ id: ACCOUNT }]);
    expect(accounts[0].cards).toEqual([{ last4: '1234', type: 'debit', source: 'user' }]);
    expect((await pool.query("SELECT * FROM money_facts WHERE kind='card_type' AND user_id=$1", [OTHER])).rows).toHaveLength(0);
  });
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


describe('provider identity lifecycle through real persistence', () => {
  const row = { transaction_amount: {amount:'5',currency:'EUR'}, credit_debit_indicator:'DBIT', value_date:'2026-09-11', remittance_information:['Cafe'] };
  const read = (rows) => ingestSightings(USER, distinctPending(rows.map((r) => toSighting(r, ACCOUNT))));
  it('keeps two purchases through pending, fallback and stable references, including separate pages', async () => {
    await read([{...row,status:'PDNG'},{...row,status:'PDNG'}]);
    await read([row,row]);
    expect(await rows()).toHaveLength(2);
    await read([{...row,entry_reference:'one'}]);
    await read([{...row,entry_reference:'two'}]);
    expect(await rows()).toHaveLength(2);
    await read([{...row,entry_reference:'two'},{...row,entry_reference:'one'}]);
    expect(await rows()).toHaveLength(2);
    expect((await rows()).reduce((sum,t)=>sum+Number(t.amount),0)).toBe(-10);
  });
  it('preserves one renamed payment and its user correction on repeated sync', async () => {
    await read([{...row,status:'PDNG'}]);
    const id=(await rows())[0].id;
    await pool.query("UPDATE money_transactions SET verdict='worth_it' WHERE id=$1",[id]);
    await read([row]);
    await read([{...row,entry_reference:'settled'}]);
    await read([{...row,entry_reference:'settled'}]);
    expect(await rows()).toHaveLength(1);
    expect((await rows())[0]).toMatchObject({id,verdict:'worth_it',amount:'-5.00'});
  });
});

import { currentFigureScores } from '../../../../api/services/money/figureScoreStore.js';
import { recordPredictions } from '../../../../api/services/money/predictions.js';
import { calibrate } from '../../../../api/services/money/calibration.js';
const SCORE_USER='00000000-0000-4000-8000-000000000070';
const SCORE_ACCOUNT='00000000-0000-4000-8000-000000000071';
const SCORE_NOW=new Date('2026-09-18T12:00:00Z');
const readScores=()=>currentFigureScores(SCORE_USER,{now:SCORE_NOW});
async function figure(date='2026-09-13', extra={}) {
  const {data,error}=await state.db.from('money_figure_scores').insert({user_id:SCORE_USER,kind:'day_total',predicted_for:date,predicted_on:'2026-09-10',value:20,low:10,high:30,issued_low:5,issued_high:35,...extra}).select().single();
  if(error)throw error; return data;
}
async function payment(amount=-51.5, date='2026-09-13T12:00:00Z') {
  return (await pool.query("INSERT INTO money_transactions(user_id,account_id,amount,currency,occurred_at,merchant_key,channel,posted_at) VALUES ($1,$2,$3,'EUR',$4,'shop','card',$4) RETURNING *",[SCORE_USER,SCORE_ACCOUNT,amount,date])).rows[0];
}

describe('settled outcomes follow financial revisions',()=>{
  beforeEach(async()=>{
    await pool.query('INSERT INTO users(id) VALUES ($1) ON CONFLICT DO NOTHING',[SCORE_USER]);
    await pool.query('DELETE FROM money_figure_scores WHERE user_id=$1',[SCORE_USER]);
    await pool.query('DELETE FROM money_facts WHERE user_id=$1',[SCORE_USER]);
    await pool.query('DELETE FROM money_accounts WHERE user_id=$1',[SCORE_USER]);
    await pool.query("INSERT INTO money_accounts(id,user_id,provider,currency,last_pulled_at) VALUES ($1,$2,'enablebanking','EUR',$3)",[SCORE_ACCOUNT,SCORE_USER,SCORE_NOW]);
  });
  it('rescores late settlement and deletion without rewriting issued predictions, and replays the band',async()=>{
    const original=await figure(); const tx=await payment();
    const first=await readScores();expect(first.figures[0].actual).toBe(51.5);
    const before=calibrate(first.figures).widen;
    await pool.query('UPDATE money_transactions SET amount=-125.08 WHERE id=$1',[tx.id]);
    const corrected=await readScores();expect(Number(corrected.figures[0].actual)).toBe(125.08);
    expect(calibrate(corrected.figures).widen).toBeGreaterThan(before);
    expect(corrected.figures[0]).toMatchObject({value:20,low:10,high:30,issued_low:5,issued_high:35});
    expect(Date.parse(corrected.figures[0].predicted_at)).toBe(new Date(original.predicted_at).getTime());
    const audit=await pool.query('SELECT before_score,after_score FROM money_score_changes WHERE figure_id=$1 ORDER BY id',[original.id]);
    expect(Number(audit.rows[1].before_score.actual)).toBe(51.5);
    expect(Number(audit.rows[1].after_score.actual)).toBe(125.08);
    const unchanged=await readScores();expect(unchanged.changed).toBe(0);
    expect((await pool.query('SELECT count(*) FROM money_score_changes WHERE figure_id=$1',[original.id])).rows[0].count).toBe('2');
    await pool.query('DELETE FROM money_transactions WHERE id=$1',[tx.id]);
    expect(Number((await readScores()).figures[0].actual)).toBe(0);
  });
  it('repairs scores written by an older job without trusting the cached revision',async()=>{
    const f=await figure();await payment();await readScores();
    await pool.query('UPDATE money_figure_scores SET actual=999 WHERE id=$1',[f.id]);
    expect(Number((await readScores()).figures[0].actual)).toBe(51.5);
  });
  it('moves spending out of the old day and into the corrected day',async()=>{
    await figure('2026-09-12');await figure('2026-09-13');const tx=await payment();await readScores();
    await pool.query("UPDATE money_transactions SET occurred_at='2026-09-12T12:00:00Z' WHERE id=$1",[tx.id]);
    const {figures}=await readScores();expect(figures.map(f=>Number(f.actual))).toEqual([51.5,0]);
  });
  it('revises outcomes on correction, undo, recurring reclassification and fact deletion',async()=>{
    await figure();const tx=await payment();await readScores();
    await pool.query("UPDATE money_transactions SET verdict='not_me' WHERE id=$1",[tx.id]);
    expect(Number((await readScores()).figures[0].actual)).toBe(0);
    await pool.query('UPDATE money_transactions SET verdict=NULL,is_recurring=true WHERE id=$1',[tx.id]);
    expect(Number((await readScores()).figures[0].actual)).toBe(0);
    await pool.query("UPDATE money_transactions SET is_recurring=false,channel='transfer' WHERE id=$1",[tx.id]);
    await pool.query("INSERT INTO money_facts(user_id,kind,subject,value) VALUES ($1,'person','shop','friend')",[SCORE_USER]);
    expect(Number((await readScores()).figures[0].actual)).toBe(0);
    await pool.query('DELETE FROM money_facts WHERE user_id=$1',[SCORE_USER]);
    expect(Number((await readScores()).figures[0].actual)).toBe(51.5);
  });
  it('withdraws an old premature score instead of letting it keep training',async()=>{
    await figure('2026-09-17',{actual:90,error:70,hit:false,scored_at:'2026-09-18T01:00:00Z'});
    const {figures}=await readScores();expect(figures[0]).toMatchObject({actual:null,error:null,hit:null,scored_at:null});
  });
  it('does not score unknown statement coverage or a partial bank read as zero',async()=>{
    await figure();await payment();
    await pool.query("UPDATE money_accounts SET sync_checkpoint='{}'::jsonb WHERE id=$1",[SCORE_ACCOUNT]);
    expect((await readScores()).figures[0].actual).toBeNull();
    await pool.query("UPDATE money_accounts SET sync_checkpoint=NULL,last_pulled_at='2026-09-17T12:00:00Z' WHERE id=$1",[SCORE_ACCOUNT]);
    expect((await readScores()).figures[0].actual).toBeNull();
    await pool.query("UPDATE money_accounts SET provider='statement',last_pulled_at=$2 WHERE id=$1",[SCORE_ACCOUNT,SCORE_NOW]);
    expect((await readScores()).figures[0].actual).toBeNull();
  });
  it('retries a correction arriving between snapshot and commit',async()=>{
    await figure();const tx=await payment();const rpc=state.db.rpc;let raced=false;
    state.db.rpc=async(name,args)=>{
      const result=await rpc(name,args);
      if(name==='prepare_money_scoring'&&!raced){raced=true;await pool.query('UPDATE money_transactions SET amount=-125.08 WHERE id=$1',[tx.id]);}
      return result;
    };
    expect(Number((await readScores()).figures[0].actual)).toBe(125.08);
    expect((await pool.query('SELECT count(*) FROM money_score_changes WHERE user_id=$1',[SCORE_USER])).rows[0].count).toBe('1');
  });
  it('commits concurrent scoring reads only once',async()=>{
    const f=await figure();await payment();const rpc=state.db.rpc;
    let prepared=0,release;const barrier=new Promise(resolve=>{release=resolve;});
    state.db.rpc=async(name,args)=>{
      const result=await rpc(name,args);
      if(name==='prepare_money_scoring'&&prepared<2){prepared++;if(prepared===2)release();await barrier;}
      return result;
    };
    const responses=await Promise.all([readScores(),readScores()]);
    expect(responses.map(r=>Number(r.figures[0].actual))).toEqual([51.5,51.5]);
    expect((await pool.query('SELECT count(*) FROM money_score_changes WHERE figure_id=$1',[f.id])).rows[0].count).toBe('1');
  });
  it('leaves failed rebuilds dirty and retries atomically on the next read',async()=>{
    const f=await figure();await payment();
    await pool.query(`CREATE FUNCTION fail_score_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected score failure'; END $$;
      CREATE TRIGGER score_failure BEFORE INSERT ON money_score_changes FOR EACH ROW EXECUTE FUNCTION fail_score_audit();`);
    try {
      await expect(readScores()).rejects.toThrow('injected score failure');
      expect((await pool.query('SELECT actual FROM money_figure_scores WHERE id=$1',[f.id])).rows[0].actual).toBeNull();
      const state=(await pool.query('SELECT revision,scored_revision FROM money_score_state WHERE user_id=$1',[SCORE_USER])).rows[0];
      expect(state.revision).not.toBe(state.scored_revision);
    }finally{await pool.query('DROP TRIGGER score_failure ON money_score_changes');}
    expect(Number((await readScores()).figures[0].actual)).toBe(51.5);
  });
  it('keeps the issued interval and first prediction immutable on recording retries',async()=>{
    const args={cast:{band_calibration:{widen:10}},day:{predicted_for:'2026-09-19',value:20,low:10,high:30},now:SCORE_NOW};
    await recordPredictions(SCORE_USER,args);
    await recordPredictions(SCORE_USER,{...args,day:{...args.day,value:999},cast:{band_calibration:{widen:50}}});
    const r=(await pool.query('SELECT value,low,high,issued_low,issued_high FROM money_figure_scores WHERE user_id=$1',[SCORE_USER])).rows[0];
    expect(Object.fromEntries(Object.entries(r).map(([k,v])=>[k,Number(v)]))).toEqual({value:20,low:10,high:30,issued_low:0,issued_high:40});
  });
  it('rejects cross-user scoring and denies public access to revisions and audit',async()=>{
    const f=await figure();const own=await state.db.rpc('prepare_money_scoring',{p_user_id:OTHER,p_today:'2026-09-18',p_cutoff:'2026-09-13'});
    const bad=await state.db.rpc('commit_money_scoring',{p_user_id:OTHER,p_revision:own.data.revision,p_cutoff:'2026-09-13',p_changes:[{id:f.id,actual:1,error:0,hit:true,scored_at:SCORE_NOW.toISOString()}],p_now:SCORE_NOW.toISOString()});
    expect(bad.error?.message).toMatch(/ownership/);
    const result=(await pool.query("SELECT has_table_privilege('anon','money_score_changes','SELECT') AS audit, has_function_privilege('authenticated','commit_money_scoring(uuid,bigint,date,jsonb,timestamptz)','EXECUTE') AS commit")).rows[0];
    expect(result).toEqual({audit:false,commit:false});
  });
});
