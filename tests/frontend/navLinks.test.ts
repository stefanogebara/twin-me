/** Four pages, Ask, and the account apart. */
import { describe, expect, it } from 'vitest';
import { MONEY_NAV } from '../../src/pages/money/navLinks';

describe('MONEY_NAV', () => {
  it('keeps Today, Month, Plan, You and Ask together and sets the account apart, current where you stand', () => {
    const links = MONEY_NAV('account');
    expect(links.map((l) => l.label)).toEqual(['Today', 'Month', 'Plan', 'You', 'Ask', 'Account']);
    expect(links.filter((l) => l.apart).map((l) => l.to)).toEqual(['/money/account']);
    expect(links.find((l) => l.current)?.to).toBe('/money/account');
  });
});
