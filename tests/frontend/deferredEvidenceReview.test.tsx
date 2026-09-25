// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ reconciliationReview: vi.fn(), resolveEvidence: vi.fn() }));
vi.mock('../../src/services/api/moneyAPI', async original => ({ ...await original<Record<string, unknown>>(), moneyAPI: api }));
vi.mock('../../src/lib/i18n', () => ({ useT: () => (s: string) => s, useLocale: () => 'en-GB' }));
import DeferredEvidenceReview from '../../src/pages/money/DeferredEvidenceReview';
let root: ReturnType<typeof createRoot>;
const host = document.createElement('div');
const item = { id:'e1', source:'email', merchant:null, amount:-10, currency:'EUR', occurred_at:'2026-09-25T10:00:00Z', candidates:[{id:'t1',merchant:'Cafe',amount:-10,currency:'EUR',occurred_at:'2026-09-25T09:00:00Z',accountLabel:'Current account'}] };
const click = async (text: string) => { const b = [...host.querySelectorAll('button')].find(b => b.textContent === text); expect(b).toBeTruthy(); await act(async () => b!.click()); };
afterEach(async () => { if(root) await act(async () => root.unmount()); vi.resetAllMocks(); });
async function render() { api.reconciliationReview.mockResolvedValue({revision:7,items:[item],remaining:0,nextOffset:null}); root=createRoot(host); await act(async () => root.render(<DeferredEvidenceReview onResolved={vi.fn()} />)); }
it('requires a selected option and a separate explicit confirmation before changing a payment', async () => {
 await render(); expect(api.resolveEvidence).not.toHaveBeenCalled();
 const option=host.querySelector<HTMLInputElement>('input[value="t1"]')!;
 await act(async()=>option.click()); expect(api.resolveEvidence).not.toHaveBeenCalled();
 api.resolveEvidence.mockResolvedValue({}); api.reconciliationReview.mockResolvedValue({revision:8,items:[],remaining:0,nextOffset:null});
 await click('Confirm choice'); expect(api.resolveEvidence).toHaveBeenCalledWith('e1',{revision:7,action:'match',transactionId:'t1'});
 expect(host.textContent).toContain('No payment observations need review.');
});
it('requires explicit separate-payment selection and does not silently retry a failed edit', async () => {
 await render(); await act(async()=>host.querySelector<HTMLInputElement>('input[value="separate"]')!.click());
 api.resolveEvidence.mockRejectedValue(new Error('Conflict')); await click('Confirm choice');
 expect(api.resolveEvidence).toHaveBeenCalledTimes(1); expect(host.textContent).toContain('Your choice was not confirmed. Reload the choices before trying again.');
 expect(host.querySelector<HTMLInputElement>('input:checked')).toBeNull();
});
it('shows a read error without claiming there is nothing to review', async () => {
 api.reconciliationReview.mockRejectedValue(new Error('offline')); root=createRoot(host); await act(async()=>root.render(<DeferredEvidenceReview onResolved={vi.fn()} />));
 expect(host.textContent).toContain('Payment observations could not be read.'); expect(host.textContent).not.toContain('No payment observations need review.');
});
it('pages observations without carrying a choice or changing any payments', async () => {
 api.reconciliationReview.mockResolvedValueOnce({revision:7,items:[item],remaining:1,nextOffset:20});
 root=createRoot(host); await act(async()=>root.render(<DeferredEvidenceReview onResolved={vi.fn()} />));
 await act(async()=>host.querySelector<HTMLInputElement>('input[value="t1"]')!.click());
 api.reconciliationReview.mockResolvedValueOnce({revision:7,items:[{...item,id:'e2',merchant:'Second observation'}],remaining:0,nextOffset:null});
 await click('Next observation');
 expect(api.reconciliationReview).toHaveBeenLastCalledWith(20);
 expect(host.textContent).toContain('Second observation');
 expect(host.querySelector('input:checked')).toBeNull();
 expect([...host.querySelectorAll('button')].find(b=>b.textContent==='Confirm choice')?.disabled).toBe(true);
 expect(api.resolveEvidence).not.toHaveBeenCalled();
 api.reconciliationReview.mockResolvedValueOnce({revision:7,items:[item],remaining:1,nextOffset:20});
 await click('Previous observation'); expect(api.reconciliationReview).toHaveBeenLastCalledWith(0);
});
