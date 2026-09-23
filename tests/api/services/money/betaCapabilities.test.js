import { describe, it, expect } from 'vitest';
import { bankCapability, unrestricted } from '../../../../api/services/money/betaCapabilities.js';

const me = '00000000-4000-4000-8000-000000000001';
describe('the bank, per person, from facts', () => {
  it('is closed without the aggregator, open when the person is already linked or listed, closed and named while restricted, open to a served country once unrestricted', () => {
    expect(bankCapability({ userId: me, configured: false, open: true })).toEqual({ bank: false, why: 'unconfigured' });
    expect(bankCapability({ userId: me, configured: true, open: false, accounts: [{ provider: 'statement' }, { provider: 'enablebanking' }] })).toEqual({ bank: true, why: 'linked' });
    expect(bankCapability({ userId: me, configured: true, open: false, list: ` ${me} ` })).toEqual({ bank: true, why: 'listed' });
    expect(bankCapability({ userId: me, configured: true, open: false, list: '' })).toEqual({ bank: false, why: 'restricted' });
    expect(bankCapability({ userId: me, configured: true, open: true, list: '', country: 'US', countries: ['ES', 'PT'] })).toEqual({ bank: false, why: 'country' });
    expect(bankCapability({ userId: me, configured: true, open: true, list: '', country: 'PT', countries: ['ES', 'PT'] })).toEqual({ bank: true, why: 'open' });
    expect(bankCapability({ userId: me, configured: true, open: true, list: '', country: 'US', countries: null })).toEqual({ bank: true, why: 'open' });
    expect(bankCapability({ userId: null, configured: true, open: true, list: '' })).toEqual({ bank: true, why: 'open' });
  });
  it('reads the unrestricted flag as a word', () => {
    expect(unrestricted('true')).toBe(true); expect(unrestricted('YES')).toBe(true); expect(unrestricted('')).toBe(false); expect(unrestricted(undefined)).toBe(false); expect(unrestricted('false')).toBe(false);
  });
});
