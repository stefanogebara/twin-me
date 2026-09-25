import { execFileSync } from 'node:child_process';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { beforeAll,beforeEach,afterAll,describe,it,expect,vi } from 'vitest';
import {testPool,bootstrapMoney,postgresSupabase} from '../../../helpers/moneyDatabase.js';
const state=vi.hoisted(()=>({db:null}));
vi.mock('../../../../api/_app/services/database.js',()=>({supabaseAdmin:new Proxy({},{get:(_,k)=>state.db[k]})}));
import {reconcile} from '../../../../api/_app/services/money/ledger.js';
import {ingestSighting,ingestSightings} from '../../../../api/_app/services/money/ingestion.js';
import {getReconciliationStatus,listReconciliationReview,resolveReconciliation} from '../../../../api/_app/services/money/reconciliationService.js';
const U='00000000-0000-4000-8000-000000000001',O='00000000-0000-4000-8000-000000000002';
const A='00000000-0000-4000-8000-000000000010',B='00000000-0000-4000-8000-000000000011';
const e={source:'email',source_ref:'email1',amount:10,currency:'EUR',direction:'out',merchant_key:'unknown',occurred_at:'2026-09-24T10:00:00Z',raw_text:'Private evidence'};
let pool;
beforeAll(async()=>{pool=testPool();await bootstrapMoney(pool);state.db=postgresSupabase(pool);await pool.query('INSERT INTO users(id) VALUES($1),($2)',[U,O]);await pool.query("INSERT INTO money_accounts(id,user_id,provider) VALUES($1,$3,'manual'),($2,$3,'manual')",[A,B,U]);});
beforeEach(async()=>{state.db=postgresSupabase(pool);await pool.query('TRUNCATE money_sightings,money_transactions,money_ingestion_revisions,money_score_state CASCADE');});
afterAll(async()=>pool?.end());
async function ambiguous(){
 for(const [account_id,source_ref] of [[A,'b1'],[B,'b2']]) await ingestSighting(U,{...e,source:'bankfeed',source_ref,merchant_key:'cafe',account_id});
 return ingestSighting(U,e);
}
async function count(){return (await pool.query('SELECT count(*)::int n FROM money_transactions')).rows[0].n;}
describe('deferred evidence real PostgreSQL',()=>{
 it('keeps one raw sighting, two payments and stable replay; scores become dirty',async()=>{
  const first=await ambiguous();expect(first.action).toBe('deferred');expect(await count()).toBe(2);
  const status=await getReconciliationStatus(U);expect(status).toMatchObject({state:'pending',unresolvedCount:1,bySource:{email:1}});
  const score=(await pool.query('SELECT revision FROM money_score_state WHERE user_id=$1',[U])).rows[0].revision;
  const again=await ingestSighting(U,e);expect(again.sighting.id).toBe(first.sighting.id);
  expect(await getReconciliationStatus(U)).toMatchObject({revision:status.revision});
  expect((await pool.query('SELECT revision FROM money_score_state WHERE user_id=$1',[U])).rows[0].revision).toBe(score);
  expect((await pool.query('SELECT raw_text FROM money_sightings WHERE id=$1',[first.sighting.id])).rows[0].raw_text).toBe('Private evidence');
 });
 it('does not resolve after one or all candidates disappear',async()=>{
  await ambiguous();await pool.query('DELETE FROM money_transactions WHERE account_id=$1',[A]);
  expect((await ingestSighting(U,e)).action).toBe('deferred');expect(await count()).toBe(1);
  await pool.query('DELETE FROM money_transactions');expect((await ingestSighting(U,e)).action).toBe('deferred');expect(await count()).toBe(0);
 });
 it('lists only safe summaries and explicitly matches atomically',async()=>{
  const first=await ambiguous();const review=await listReconciliationReview(U);
  expect(JSON.stringify(review)).not.toContain('Private evidence');expect(review.items[0].candidates).toHaveLength(2);
  const result=await resolveReconciliation(U,first.sighting.id,{revision:review.revision,action:'match',transactionId:review.items[0].candidates[0].id});
  expect(result.resolved).toBe(true);expect(await count()).toBe(2);expect(await getReconciliationStatus(U)).toMatchObject({state:'clear',unresolvedCount:0});
  expect((await pool.query('SELECT reconciliation FROM money_sightings WHERE id=$1',[first.sighting.id])).rows[0].reconciliation.resolution.kind).toBe('user_match');
  await expect(resolveReconciliation(U,first.sighting.id,{revision:review.revision,action:'separate'})).rejects.toMatchObject({status:409});
 });
 it('creates exactly one separate payment only after explicit review and preserves evidence',async()=>{
  const first=await ambiguous();const review=await listReconciliationReview(U);
  await resolveReconciliation(U,first.sighting.id,{revision:review.revision,action:'separate'});
  expect(await count()).toBe(3);await ingestSighting(U,e);expect(await count()).toBe(3);
  expect(await getReconciliationStatus(U)).toMatchObject({state:'clear'});
 });
 it('rejects other-owner review and stale/incompatible candidates',async()=>{
  const first=await ambiguous();const review=await listReconciliationReview(U);
  expect((await listReconciliationReview(O)).items).toEqual([]);
  await expect(resolveReconciliation(O,first.sighting.id,{revision:0,action:'separate'})).rejects.toBeTruthy();
  await pool.query('UPDATE money_transactions SET amount=-40 WHERE id=$1',[review.items[0].candidates[0].id]);
  await expect(resolveReconciliation(U,first.sighting.id,{revision:review.revision,action:'match',transactionId:review.items[0].candidates[0].id})).rejects.toMatchObject({status:409});
  expect(await getReconciliationStatus(U)).toMatchObject({state:'pending'});
 });
 it('fails status closed when the RPC is unavailable',async()=>{
  state.db={rpc:async()=>({error:{message:'offline'}})};expect(await getReconciliationStatus(U)).toMatchObject({state:'unavailable',unresolvedCount:null,revision:null});
 });
 it('publishes pending completeness atomically in scoring snapshot',async()=>{
  await ambiguous();const {data,error}=await state.db.rpc('prepare_money_scoring',{p_user_id:U,p_today:'2026-09-25',p_cutoff:'2026-09-20'});
  expect(error).toBeNull();expect(data.reconciliation).toMatchObject({state:'pending',unresolvedCount:1});
 });
});

describe('deferred protocol and SQL protections',()=>{
 it('refuses ambiguous writes on an old protocol without creating a third line',async()=>{
  for(const [account_id,source_ref] of [[A,'b1'],[B,'b2']]) await ingestSighting(U,{...e,source:'bankfeed',source_ref,merchant_key:'cafe',account_id});
  const real=state.db;state.db={...real,rpc:async(name,args)=>{const out=await real.rpc(name,args);if(name==='prepare_money_ingestion')delete out.data.protocol;return out;}};
  await expect(ingestSighting(U,e)).rejects.toThrow('review is temporarily unavailable');expect(await count()).toBe(2);
 });
 it('rejects generic clients attaching deferred evidence and rolls the whole plan back',async()=>{
  const first=await ambiguous();const status=await getReconciliationStatus(U);const tx=(await pool.query('SELECT id FROM money_transactions LIMIT 1')).rows[0].id;
  const {reconciliation,...without}=first.sighting;
  const result=await state.db.rpc('commit_money_ingestion',{p_user_id:U,p_revision:status.revision,p_sightings:[without],p_creates:[],p_updates:[],p_links:[{sighting_id:first.sighting.id,transaction_id:tx}]});
  expect(result.error).toBeTruthy();expect(await getReconciliationStatus(U)).toMatchObject({state:'pending',revision:status.revision});
 });
 it('rejects missing/duplicate dispositions and cross-owner candidate metadata',async()=>{
  const first=await ambiguous();const status=await getReconciliationStatus(U);
  for(const links of [[],[{sighting_id:O,transaction_id:null}],[{sighting_id:first.sighting.id,transaction_id:null},{sighting_id:first.sighting.id,transaction_id:null}]]) {
   expect((await state.db.rpc('commit_money_ingestion',{p_user_id:U,p_revision:status.revision,p_sightings:[first.sighting],p_creates:[],p_updates:[],p_links:links})).error).toBeTruthy();
  }
  const bad={...first.sighting,id:'00000000-0000-4000-8000-000000000012',source_ref:'bad',reconciliation:{...first.sighting.reconciliation,candidate_ids:[O]}};
  expect((await state.db.rpc('commit_money_ingestion',{p_user_id:U,p_revision:status.revision,p_sightings:[bad],p_creates:[],p_updates:[],p_links:[{sighting_id:bad.id,transaction_id:null}]})).error).toBeTruthy();
  expect(await getReconciliationStatus(U)).toMatchObject({unresolvedCount:1,revision:status.revision});
 });
 it('does not let a publication race insert predictions while review is pending',async()=>{
  await ambiguous();const status=await getReconciliationStatus(U);
  const result=await state.db.rpc('commit_money_prediction_issue',{p_user_id:U,p_revision:status.revision,p_financial_revision:status.financialRevision,p_rows:[{user_id:U,kind:'day',predicted_for:'2026-09-25',predicted_on:'2026-09-25',value:20,low:10,high:30,predicted_at:'2026-09-25T10:00:00Z',issued_low:10,issued_high:30}]});
  expect(result.error?.code).toBe('PT409');expect((await pool.query('SELECT count(*)::int n FROM money_figure_scores')).rows[0].n).toBe(0);
 });
 it('checks financial revision before issuing, then stores and deduplicates a current figure',async()=>{
  const status=await getReconciliationStatus(U);const args={p_user_id:U,p_revision:status.revision,p_financial_revision:status.financialRevision,p_rows:[{user_id:U,kind:'day',predicted_for:'2026-09-25',predicted_on:'2026-09-25',value:20,low:10,high:30,predicted_at:'2026-09-25T10:00:00Z',issued_low:10,issued_high:30}]};
  expect((await state.db.rpc('commit_money_prediction_issue',{...args,p_financial_revision:99})).error?.code).toBe('PT409');
  expect(await state.db.rpc('commit_money_prediction_issue',args)).toMatchObject({error:null,data:{recorded:1}});
  const updated=await getReconciliationStatus(U);expect(await state.db.rpc('commit_money_prediction_issue',{...args,p_financial_revision:updated.financialRevision})).toMatchObject({error:null,data:{recorded:0}});
 });
 it('keeps malformed metadata and public RPC execution rejected',async()=>{
  await expect(pool.query("INSERT INTO money_sightings(user_id,source,source_ref,amount,direction,merchant_key,occurred_at,reconciliation) VALUES($1,'email','malformed',10,'out','unknown',now(),'{}')",[U])).rejects.toBeTruthy();
  const {rows}=await pool.query("SELECT routine_name,grantee FROM information_schema.routine_privileges WHERE routine_name IN ('money_reconciliation_status','money_reconciliation_review','resolve_money_reconciliation','commit_money_prediction_issue','commit_money_charge_scores') AND grantee IN ('PUBLIC','anon','authenticated')");
  expect(rows).toEqual([]);
 });
 it('preserves resolved history when its transaction is deleted',async()=>{
  const first=await ambiguous();const status=await getReconciliationStatus(U);const done=await resolveReconciliation(U,first.sighting.id,{revision:status.revision,action:'separate'});
  await pool.query('DELETE FROM money_transactions WHERE id=$1',[done.transactionId]);
  expect((await pool.query('SELECT transaction_id,reconciliation FROM money_sightings WHERE id=$1',[first.sighting.id])).rows[0]).toMatchObject({transaction_id:null,reconciliation:{state:'resolved'}});
  expect(await getReconciliationStatus(U)).toMatchObject({state:'clear'});
 });
});

it('restores unresolved and resolved evidence, revisions, and usable RPCs into a fresh local database',async()=>{
 const first=await ambiguous();const second=await ingestSighting(U,{...e,source_ref:'email2'});
 const before=await getReconciliationStatus(U);await resolveReconciliation(U,second.sighting.id,{revision:before.revision,action:'separate'});
 const expected=await getReconciliationStatus(U);
 const dir=mkdtempSync(path.join(tmpdir(),'money-deferred-restore-'));const dump=path.join(dir,'fixture.dump');
 const dbName=`twinme_money_test_deferred_restore_${process.pid}`;const url=new URL(process.env.MONEY_TEST_DATABASE_URL);url.pathname=`/${dbName}`;
 let restored;
 try {
  execFileSync('bash',['scripts/money/backup-rehearsal.sh','dump',process.env.MONEY_TEST_DATABASE_URL,dump],{stdio:'pipe',timeout:120000});
  execFileSync('bash',['scripts/money/backup-rehearsal.sh','restore',dump,process.env.MONEY_TEST_DATABASE_URL,dbName],{stdio:'pipe',timeout:120000});
  const fingerprints=execFileSync('bash',['scripts/money/backup-rehearsal.sh','verify',process.env.MONEY_TEST_DATABASE_URL,url.toString()],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000});
  for(const table of ['money_accounts','money_sightings','money_transactions','money_facts','money_figure_scores']) expect(fingerprints).toMatch(new RegExp(`^${table} md5 ([a-f0-9]{32}|empty)$`,'m'));
  restored=new pg.Pool({connectionString:url.toString()});state.db=postgresSupabase(restored);
  expect(await getReconciliationStatus(U)).toMatchObject({state:'pending',unresolvedCount:1,revision:expected.revision,financialRevision:expected.financialRevision});
  expect((await ingestSighting(U,e)).sighting.id).toBe(first.sighting.id);
  expect((await restored.query('SELECT count(*)::int n FROM money_transactions')).rows[0].n).toBe(3);
  expect((await restored.query('SELECT reconciliation,transaction_id FROM money_sightings WHERE id=$1',[second.sighting.id])).rows[0]).toMatchObject({reconciliation:{state:'resolved',resolution:{kind:'user_separate'}},transaction_id:expect.any(String)});
  const review=await listReconciliationReview(U);await resolveReconciliation(U,first.sighting.id,{revision:review.revision,action:'match',transactionId:review.items[0].candidates[0].id});
  expect(await getReconciliationStatus(U)).toMatchObject({state:'clear'});
 } finally {
  state.db=postgresSupabase(pool);await restored?.end();await pool.query(`DROP DATABASE IF EXISTS "${dbName}"`);rmSync(dir,{recursive:true,force:true});
 }
},150000);

it('allows exactly one resolution when two devices review the same observation concurrently',async()=>{
 const first=await ambiguous();const review=await listReconciliationReview(U);
 const done=await Promise.allSettled([
  resolveReconciliation(U,first.sighting.id,{revision:review.revision,action:'separate'}),
  resolveReconciliation(U,first.sighting.id,{revision:review.revision,action:'match',transactionId:review.items[0].candidates[0].id}),
 ]);
 expect(done.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(done.find(r=>r.status==='rejected').reason.status).toBe(409);
 expect(await getReconciliationStatus(U)).toMatchObject({state:'clear'});expect(await count()).toBeLessThanOrEqual(3);
});
it('deleting unresolved evidence dirties financial completeness, but legacy orphans are not ambiguity',async()=>{
 const first=await ambiguous();const before=await getReconciliationStatus(U);
 await pool.query('DELETE FROM money_sightings WHERE id=$1',[first.sighting.id]);
 expect(await getReconciliationStatus(U)).toMatchObject({state:'clear',financialRevision:before.financialRevision+1});
 await pool.query("INSERT INTO money_sightings(user_id,source,source_ref,amount,direction,merchant_key,occurred_at) VALUES($1,'email','old-orphan',10,'out','unknown',now())",[U]);
 expect(await getReconciliationStatus(U)).toMatchObject({state:'clear',unresolvedCount:0});
});

it.each(['bankfeed','statement'])('promotes explicitly matched %s evidence exactly like normal reconciliation, preserving phone time and user fields',async(source)=>{
 const first=await ingestSighting(U,{...e,source:'phone',source_ref:'phone-cafe',merchant_key:'cafe',occurred_at:'2026-09-22T10:03:00Z'});
 await ingestSighting(U,{...e,source:'phone',source_ref:'phone-taxi',merchant_key:'taxi',occurred_at:'2026-09-22T10:10:00Z'});
 await pool.query("UPDATE money_transactions SET merchant_name='My cafe',category='food',verdict='worth_it',is_recurring=true WHERE id=$1",[first.transaction.id]);
 const incoming={...e,source,source_ref:'settled',account_id:A,amount:10.05,card_last4:'1234',merchant_raw:'Bank card payment',occurred_at:'2026-09-24T10:00:00Z',raw_json:{status:'BOOK'}};
 const deferred=await ingestSighting(U,incoming);expect(deferred.action).toBe('deferred');
 const review=await listReconciliationReview(U);await resolveReconciliation(U,deferred.sighting.id,{revision:review.revision,action:'match',transactionId:first.transaction.id});
 const stored=(await pool.query('SELECT * FROM money_transactions WHERE id=$1',[first.transaction.id])).rows[0];
 expect(stored).toMatchObject({account_id:A,primary_sighting_id:deferred.sighting.id,amount:'-10.05',card_last4:'1234',merchant_name:'My cafe',category:'food',verdict:'worth_it',is_recurring:true});
 expect(stored.posted_at.toISOString()).toBe('2026-09-24T10:00:00.000Z');expect(stored.occurred_at.toISOString()).toBe('2026-09-22T10:03:00.000Z');
});

it('keeps explicit review promotion in parity with the existing source-priority reconciler',async()=>{
 const cases=[['phone',null,'bankfeed','BOOK'],['phone',null,'bankfeed','PDNG'],['email',null,'statement',null],['bankfeed','BOOK','phone',null],['bankfeed','BOOK','bankfeed','PDNG'],['bankfeed','PDNG','bankfeed','BOOK'],['statement',null,'email',null],['gmail',null,'upload',null]];
 for(const [currentSource,currentStatus,incomingSource,incomingStatus] of cases){
  const ref=cases.findIndex(c=>c[0]===currentSource&&c[1]===currentStatus&&c[2]===incomingSource&&c[3]===incomingStatus);
  const base={...e,source:currentSource,source_ref:`parity-${ref}`,merchant_key:`cafe-${ref}`,merchant_raw:'Existing cafe',amount:20+ref,account_id:currentSource==='statement'?A:null,raw_json:currentStatus?{status:currentStatus}:null};
  const created=await ingestSighting(U,base);
  const t=(await pool.query('SELECT * FROM money_transactions WHERE id=$1',[created.transaction.id])).rows[0];
  const s={...e,id:'00000000-0000-4000-8000-000000000099',user_id:U,source:incomingSource,source_ref:`incoming-${ref}`,amount:20+ref+.05,merchant_key:`cafe-${ref} annex`,merchant_raw:'New cafe',account_id:A,card_last4:'1234',raw_json:incomingStatus?{status:incomingStatus}:null};
  const expected=reconcile(s,[],null,{existing:{...t,primary_source:currentSource,primary_status:currentStatus}}).transaction;
  const actual=(await pool.query('SELECT money_review_promotion(jsonb_populate_record(NULL::money_sightings,$1::jsonb),jsonb_populate_record(NULL::money_transactions,$2::jsonb)) patch',[JSON.stringify(s),JSON.stringify(t)])).rows[0].patch;
  const canonical=p=>Object.fromEntries(Object.entries(p).map(([key,value])=>[key,key.endsWith('_at')&&value?new Date(value).toISOString():value]));
  expect(canonical(actual),`${currentSource}/${currentStatus} -> ${incomingSource}/${incomingStatus}`).toEqual(canonical(expected));
 }
});

it.each([false,true])('does not resurrect a deleted reviewed payment on provider retry (other candidates removed: %s)',async(removeOthers)=>{
 const first=await ambiguous();const status=await getReconciliationStatus(U);
 const resolved=await resolveReconciliation(U,first.sighting.id,{revision:status.revision,action:'separate'});
 const original=(await pool.query('SELECT * FROM money_sightings WHERE id=$1',[first.sighting.id])).rows[0];
 await pool.query('DELETE FROM money_transactions WHERE id=$1',[resolved.transactionId]);
 if(removeOthers)await pool.query('DELETE FROM money_transactions');
 const before=await getReconciliationStatus(U);const n=await count();
 const result=await ingestSighting(U,{...e,raw_text:'changed provider evidence',amount:10.05});
 expect(result).toMatchObject({action:'ignored_deleted',transaction:null});expect(await count()).toBe(n);
 const retained=(await pool.query('SELECT * FROM money_sightings WHERE id=$1',[first.sighting.id])).rows[0];
 expect(retained).toEqual({...original,transaction_id:null});
 expect(await getReconciliationStatus(U)).toMatchObject({revision:before.revision,financialRevision:before.financialRevision,state:'clear'});
});
it('rejects legacy RPC and direct SQL attempts to relink a resolved orphan',async()=>{
 const first=await ambiguous();const review=await listReconciliationReview(U);
 const done=await resolveReconciliation(U,first.sighting.id,{revision:review.revision,action:'separate'});
 await pool.query('DELETE FROM money_transactions WHERE id=$1',[done.transactionId]);
 const old=(await pool.query('SELECT * FROM money_sightings WHERE id=$1',[first.sighting.id])).rows[0];
 const status=await getReconciliationStatus(U);const target=review.items[0].candidates[0].id;
 const result=await state.db.rpc('commit_money_ingestion',{p_user_id:U,p_revision:status.revision,p_sightings:[old],p_creates:[],p_updates:[],p_links:[{sighting_id:old.id,transaction_id:target}]});
 expect(result.error).toBeTruthy();
 await expect(pool.query('UPDATE money_sightings SET transaction_id=$1 WHERE id=$2',[target,old.id])).rejects.toBeTruthy();
 expect((await pool.query('SELECT transaction_id FROM money_sightings WHERE id=$1',[old.id])).rows[0].transaction_id).toBeNull();
});
it('keeps normal provider corrections on a resolved linked bank sighting and its other backing',async()=>{
 const phone=await ingestSighting(U,{...e,source:'phone',source_ref:'p1',merchant_key:'cafe'});
 await ingestSighting(U,{...e,source:'phone',source_ref:'p2',merchant_key:'taxi'});
 const bank={...e,source:'bankfeed',source_ref:'b1',account_id:A,raw_json:{status:'BOOK'}};
 const deferred=await ingestSighting(U,bank);const status=await getReconciliationStatus(U);
 await resolveReconciliation(U,deferred.sighting.id,{revision:status.revision,action:'match',transactionId:phone.transaction.id});
 const replay=await ingestSighting(U,{...bank,amount:12.5,merchant_raw:'Updated bank name',merchant_key:'updated bank name'});
 expect(replay).toMatchObject({action:'existing',transaction:{id:phone.transaction.id,amount:-12.5}});
 const links=(await pool.query('SELECT source,transaction_id FROM money_sightings WHERE transaction_id=$1 ORDER BY source',[phone.transaction.id])).rows;
 expect(links.map(x=>x.source)).toEqual(['bankfeed','phone']);expect(await count()).toBe(2);
});

it('ignores only the owned deleted identity while committing unrelated rows and other owners normally',async()=>{
 const first=await ambiguous();const status=await getReconciliationStatus(U);
 const resolved=await resolveReconciliation(U,first.sighting.id,{revision:status.revision,action:'separate'});
 await pool.query('DELETE FROM money_transactions WHERE id=$1',[resolved.transactionId]);
 const result=await ingestSightings(U,[e,{...e,source_ref:'another-event',amount:42,merchant_key:'new shop'}]);
 expect(result).toMatchObject({seen:2,created:1,attached:0,deferred:0,ignored_deleted:1});
 const other=await ingestSighting(O,e);expect(other.action).toBe('create');
 expect((await pool.query('SELECT user_id,transaction_id FROM money_sightings WHERE source_ref=$1 ORDER BY user_id',[e.source_ref])).rows).toEqual([
  {user_id:U,transaction_id:null},{user_id:O,transaction_id:other.transaction.id},
 ]);
 expect((await pool.query('SELECT count(*)::int n FROM money_transactions WHERE user_id=$1',[U])).rows[0].n).toBe(3);
});
