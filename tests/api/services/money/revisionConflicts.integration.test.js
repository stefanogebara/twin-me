/** PostgREST 14 repeats SQLSTATE 40001 internally with identical arguments. This bounded
 * transport model uses real PostgreSQL errors: six attempts are a test stop, NOT an app
 * retry policy. PT409 must reach the application on the first database invocation. */
import fs from 'node:fs/promises';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { testPool, bootstrapMoney, postgresSupabase } from '../../../helpers/moneyDatabase.js';
const owner='00000000-0000-4000-8000-000000000071';
let pool;let db;
beforeAll(async()=>{pool=testPool();await bootstrapMoney(pool);db=postgresSupabase(pool);await pool.query('INSERT INTO users(id) VALUES($1)',[owner]);await pool.query('INSERT INTO money_ingestion_revisions(user_id) VALUES($1)',[owner]);await pool.query('INSERT INTO money_score_state(user_id) VALUES($1)',[owner]);});
afterAll(async()=>pool?.end());
async function postgrest14(name,args){
 for(let attempts=1;attempts<=6;attempts++){
  const response=await db.rpc(name,args);
  if(response.error?.code!=='40001')return {...response,attempts,delivered:true};
 }
 return {attempts:6,delivered:false};
}
describe('Money business conflicts reach the client without PostgREST serialization retries',()=>{
 it.each([
  ['commit_money_scoring',{p_user_id:owner,p_revision:-1,p_cutoff:'2026-09-20',p_changes:[],p_now:'2026-09-25T12:00:00Z'}],
  ['commit_money_ingestion',{p_user_id:owner,p_revision:-1,p_sightings:[],p_creates:[],p_updates:[],p_links:[]}],
  ['commit_money_prediction_issue',{p_user_id:owner,p_revision:-1,p_financial_revision:0,p_rows:[]}],
  ['commit_money_charge_scores',{p_user_id:owner,p_revision:-1,p_financial_revision:0,p_changes:[]}],
  ['resolve_money_reconciliation',{p_user_id:owner,p_revision:-1,p_sighting_id:owner,p_action:'separate',p_transaction_id:null}],
 ])('%s returns a single explicit HTTP conflict',async(name,args)=>{
  const result=await postgrest14(name,args);
  expect(result).toMatchObject({attempts:1,delivered:true,error:{code:'PT409'}});
 });
 it('leaves no business serialization exceptions in any live Money RPC definition',async()=>{
  const {rows}=await pool.query("SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE '%money%' AND p.prosrc LIKE '%40001%'");
  expect(rows).toEqual([]);
 });
});

it('the narrow migration fixes legacy definitions idempotently without changing security or grants', async () => {
 const snapshot = async () => (await pool.query("SELECT p.proname,p.prosecdef,p.proacl::text acl,p.proconfig,p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('commit_money_ingestion','commit_money_scoring') ORDER BY p.proname")).rows;
 const before=await snapshot();
 const old=(await pool.query("SELECT pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('commit_money_ingestion','commit_money_scoring')")).rows;
 for(const {definition} of old)await pool.query(definition.replaceAll("'PT409'","'40001'"));
 const migration=await fs.readFile('database/migrations/20260925132839_money_revision_conflicts.sql','utf8');
 await pool.query(migration);await pool.query(migration);
 expect(await snapshot()).toEqual(before);
 const bad=(await pool.query("SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE '%money%' AND p.prosrc LIKE '%40001%'")).rows;
 expect(bad).toEqual([]);
});
