import { beforeEach, describe, expect, it, vi } from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('../../../../api/_app/services/database.js',()=>({supabaseAdmin:{rpc}}));
import { ingestSighting } from '../../../../api/_app/services/money/ingestion.js';
const owner='00000000-0000-4000-8000-000000000071';
const input={source:'email',source_ref:'one',amount:10,currency:'EUR',direction:'out',merchant_key:'cafe',occurred_at:'2026-09-25T10:00:00Z'};
beforeEach(()=>rpc.mockReset());
describe('application-level optimistic retries',()=>{
 it('re-reads evidence after HTTP conflict and commits only the new plan',async()=>{
  let reads=0;
  rpc.mockImplementation(async(name)=>name==='prepare_money_ingestion'?{data:{protocol:2,revision:++reads,sightings:[],transactions:[]}}:reads===1?{error:{code:'PT409'}}:{data:{revision:3}});
  expect(await ingestSighting(owner,input)).toMatchObject({action:'create'});
  expect(rpc.mock.calls.map(([n])=>n)).toEqual(['prepare_money_ingestion','commit_money_ingestion','prepare_money_ingestion','commit_money_ingestion']);
  expect(rpc.mock.calls[3][1].p_revision).toBe(2);
 });
 it('stops after five re-plans rather than retrying indefinitely',async()=>{
  rpc.mockImplementation(async(name)=>name==='prepare_money_ingestion'?{data:{protocol:2,revision:1,sightings:[],transactions:[]}}:{error:{code:'PT409'}});
  await expect(ingestSighting(owner,input)).rejects.toThrow('Payments are being updated');
  expect(rpc).toHaveBeenCalledTimes(10);
 });
 it('does not retry an unrelated validation failure',async()=>{
  rpc.mockImplementation(async(name)=>name==='prepare_money_ingestion'?{data:{protocol:2,revision:1,sightings:[],transactions:[]}}:{error:{code:'23514',message:'invalid'}});
  await expect(ingestSighting(owner,input)).rejects.toThrow('rolled back');expect(rpc).toHaveBeenCalledTimes(2);
 });
});
