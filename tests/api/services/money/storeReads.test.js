/**
 * The read budget is the bank's rule on one consent, and one account's dead consent must not
 * stop the other bank: the two planners the store uses, tested pure.
 */
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../../../api/services/database.js', () => ({ supabaseAdmin: { from: () => ({}) }, serverDb: {} }));
vi.mock('../../../../api/services/logger.js', () => ({ createLogger: () => ({ warn() {}, info() {}, error() {}, debug() {} }) }));
const { planReads, newestConsent, categoryOfPayment, FEED_BUDGET } = await import('../../../../api/services/money/store.js');

const at = (h) => `2026-09-14T${String(h).padStart(2, '0')}:00:00Z`;
const acc = (id, session, last) => ({ id, session_id: session, last_pulled_at: last, iban_mask: `ES** ${id}` });

describe('planReads', () => {
  it('shares four reads among the accounts of one consent, longest unread first', () => {
    const accounts = [acc('a1', 's1', at(1)), acc('a2', 's1', at(2)), acc('a3', 's1', at(3))];
    /* Three reads of the consent already today: one left, and it goes to the account read longest ago. */
    const accesses = [{ at: at(0), account_id: 'a1' }, { at: at(0), account_id: 'a2' }, { at: at(0), account_id: 'a3' }];
    const plan = planReads(accounts, accesses);
    expect(plan.budgets.get('s1')).toMatchObject({ used: 3, left: 1 });
    expect(plan.pull.map((a) => a.id)).toEqual(['a1']);
    expect(plan.skipped.map((a) => a.id)).toEqual(['a2', 'a3']);
  });
  it('gives a second bank its own four', () => {
    const accounts = [acc('a1', 'santander', at(1)), acc('r1', 'revolut', at(1))];
    const accesses = Array.from({ length: FEED_BUDGET }, (_, i) => ({ at: at(i), account_id: 'a1' }));
    const plan = planReads(accounts, accesses);
    expect(plan.budgets.get('santander').left).toBe(0);
    expect(plan.budgets.get('revolut').left).toBe(4);
    expect(plan.pull.map((a) => a.id)).toEqual(['r1']);
  });
  it('counts a read with no account against every consent, and treats a row without a session as its own', () => {
    const accounts = [acc('a1', 's1', null), { id: 'legacy', session_id: null, last_pulled_at: null }];
    const plan = planReads(accounts, [{ at: at(0), account_id: null }, { at: at(1), account_id: null }]);
    expect(plan.budgets.get('s1').used).toBe(2);
    expect(plan.budgets.get('legacy').used).toBe(2);
    expect(plan.pull).toHaveLength(2);
  });
});

describe('newestConsent', () => {
  it('lets a reconnect take effect: the row whose consent runs longest speaks for the account', () => {
    const old = { id: 'o', iban_mask: 'ES** 7516', consent_expires_at: '2027-03-07T00:00:00Z', last_pulled_at: '2026-09-14T10:00:00Z', created_at: '2026-09-08T00:00:00Z' };
    const fresh = { id: 'n', iban_mask: 'ES** 7516', consent_expires_at: '2027-03-13T00:00:00Z', last_pulled_at: null, created_at: '2026-09-14T12:00:00Z' };
    expect(newestConsent([old, fresh]).map((r) => r.id)).toEqual(['n']);
    expect(newestConsent([fresh, old]).map((r) => r.id)).toEqual(['n']);
    const other = { id: 'r', iban_mask: 'LT** 1234', consent_expires_at: '2027-03-01T00:00:00Z', created_at: '2026-09-14T13:00:00Z' };
    expect(newestConsent([old, fresh, other]).map((r) => r.id).sort()).toEqual(['n', 'r']);
  });
});

describe('categoryOfPayment', () => {
  it('names a transfer to the landlord as rent, and leaves every other transfer a transfer', () => {
    expect(categoryOfPayment(null, 'transfer', 'landlord')).toBe('rent');
    expect(categoryOfPayment(null, 'bizum', 'landlord')).toBe('rent');
    expect(categoryOfPayment(null, 'transfer', 'friend')).toBe('transfers');
    expect(categoryOfPayment(null, 'card', 'landlord')).toBeNull();
    expect(categoryOfPayment({ category: 'groceries' }, 'card', null)).toBe('groceries');
    expect(categoryOfPayment({ category: 'groceries', category_override: 'home' }, 'card', null)).toBe('home');
  });
});
