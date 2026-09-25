import { describe, it, expect, vi } from 'vitest';
vi.mock('../../../../api/_app/services/database.js', () => ({ supabaseAdmin: {} }));
import { planIngestion } from '../../../../api/_app/services/money/ingestion.js';
const event={source:'email',source_ref:'e1',amount:10,currency:'EUR',direction:'out',merchant_key:'unknown',occurred_at:'2026-09-24T10:00:00Z'};
const candidates=['a','b'].map((id,i)=>({id,amount:-10,currency:'EUR',merchant_key:'cafe',account_id:id,occurred_at:`2026-09-24T1${i}:00:00Z`,backings:[]}));
const snap={revision:0,sightings:[],transactions:candidates};
describe('deferred ambiguous evidence planner',()=>{
 it('persists one observation without choosing either payment or adding spending',()=>{
  const p=planIngestion([event],snap);
  expect(p.creates).toEqual([]); expect(p.updates).toEqual([]);
  expect(p.results[0]).toMatchObject({action:'deferred',transaction:null});
  expect(p.sightings[0].reconciliation).toMatchObject({version:1,state:'deferred',candidate_ids:['a','b']});
  expect(p.links[0].transaction_id).toBeNull();
 });
 it.each([[[]],[candidates.slice(0,1)]])('never resolves prior ambiguity when candidates shrink',transactions=>{
  const p=planIngestion([event],snap); const old={...p.sightings[0],transaction_id:null};
  const again=planIngestion([event],{...snap,sightings:[old],transactions});
  expect(again.results[0]).toMatchObject({action:'deferred',transaction:null,sighting:{id:old.id}});
  expect(again.creates).toEqual([]);
 });
 it('keeps unchanged deferred metadata stable on exact replay',()=>{
  const p=planIngestion([event],snap); const old={...p.sightings[0],transaction_id:null};
  const again=planIngestion([event],{...snap,sightings:[old]});
  expect(again.sightings[0]).toEqual(p.sightings[0]);
 });
 it('keeps the existing stable linked identity ahead of fuzzy ambiguity',()=>{
  const old={...event,id:'s1',transaction_id:'a'};
  const p=planIngestion([event],{...snap,sightings:[old]});
  expect(p.results[0]).toMatchObject({action:'existing',transaction:{id:'a'}});
 });
});

describe('resolved evidence whose payment was deleted',()=>{
 const original={...event,id:'s-deleted',transaction_id:null,raw_text:'original evidence',reconciliation:{version:1,state:'resolved',reason:'ambiguous_weak_match',candidate_ids:['a','b'],resolution:{kind:'user_separate',at:'2026-09-24T11:00:00Z'}}};
 it.each([[[]],[candidates.slice(0,1)],[candidates]])('retains the deleted identity without creating, attaching or rewriting evidence',transactions=>{
  const plan=planIngestion([{...event,raw_text:'new provider text',amount:10.05}],{...snap,transactions,sightings:[original]});
  expect(plan.results).toEqual([{action:'ignored_deleted',transaction:null,sighting:original}]);
  expect(plan.sightings).toEqual([]);expect(plan.creates).toEqual([]);expect(plan.updates).toEqual([]);expect(plan.links).toEqual([]);
 });
 it('still corrects a resolved sighting that remains linked to its payment',()=>{
  const old={...original,transaction_id:'a'};
  const plan=planIngestion([{...event,amount:10.05}],{...snap,sightings:[old]});
  expect(plan.results[0]).toMatchObject({action:'existing',transaction:{id:'a'}});
  expect(plan.sightings[0]).toMatchObject({id:old.id,reconciliation:old.reconciliation,amount:10.05});
 });
});
