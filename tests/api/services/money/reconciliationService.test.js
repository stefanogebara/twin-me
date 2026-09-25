import {beforeEach,describe,it,expect,vi} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('../../../../api/_app/services/database.js',()=>({supabaseAdmin:{rpc}}));
import {getReconciliationStatus,listReconciliationReview,resolveReconciliation} from '../../../../api/_app/services/money/reconciliationService.js';
const U='00000000-0000-4000-8000-000000000001',S='00000000-0000-4000-8000-000000000003',T='00000000-0000-4000-8000-000000000004';
beforeEach(()=>rpc.mockReset());
describe('reconciliation read and explicit review boundary',()=>{
 it.each([{error:{message:'unavailable'}},{data:{}},{data:{state:'clear',revision:1,unresolvedCount:0}}])('cannot report clear from an incomplete capability response',async result=>{
  rpc.mockResolvedValue(result);expect(await getReconciliationStatus(U)).toMatchObject({state:'unavailable',unresolvedCount:null,revision:null});
 });
 it('masks identifier-like merchant labels and emits no raw source data from the review RPC contract',async()=>{
  rpc.mockResolvedValue({data:{revision:1,items:[{id:S,merchant:'card 4242424242424242',candidates:[{id:T,merchant:'ES5321000000000000007516'}]}]}});
  const result=await listReconciliationReview(U);expect(result.items[0].merchant).toBe('card ****4242');expect(result.items[0].candidates[0].merchant).toBe('Account');
 });
 it.each([{revision:1,action:'match'},{revision:1,action:'separate',transactionId:T},{revision:1,action:'match',transactionId:T,extra:true}])('rejects ambiguous or additional review inputs before calling SQL',async body=>{
  await expect(resolveReconciliation(U,S,body)).rejects.toBeTruthy();expect(rpc).not.toHaveBeenCalled();
 });
 it('maps concurrent review into conflict without leaking database text',async()=>{
  rpc.mockResolvedValue({error:{code:'PT409',message:'secret internal SQL'}});
  await expect(resolveReconciliation(U,S,{revision:1,action:'match',transactionId:T})).rejects.toMatchObject({status:409,message:'Payment evidence changed. Refresh this review.'});
 });
 it('passes the explicit owner, revision, and action without accepting owner overrides',async()=>{
  rpc.mockResolvedValue({data:{resolved:true,revision:2,transactionId:T}});
  await resolveReconciliation(U,S,{revision:1,action:'separate'});
  expect(rpc).toHaveBeenCalledWith('resolve_money_reconciliation',{p_user_id:U,p_sighting_id:S,p_revision:1,p_action:'separate',p_transaction_id:null});
 });
});
