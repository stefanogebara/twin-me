import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('../../../../api/services/money/feeds/enableBanking.js', () => ({ isConfigured: () => false }));
import { moneyCapabilities } from '../../../../api/services/money/betaCapabilities.js';

afterEach(() => { delete process.env.MONEY_WHATSAPP_USER_IDS; });

describe('the WhatsApp capability', () => {
  it('is on only for the people listed', () => {
    process.env.MONEY_WHATSAPP_USER_IDS = 'u1,u2';
    expect(moneyCapabilities('u1').whatsapp).toBe(true);
    expect(moneyCapabilities('u3').whatsapp).toBe(false);
  });
  it('is off when nobody is listed', () => {
    expect(moneyCapabilities('u1').whatsapp).toBe(false);
  });
});
