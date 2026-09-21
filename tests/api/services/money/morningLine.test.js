import { describe, it, expect, vi } from 'vitest';
vi.mock('../../../../api/services/money/allowance.js', () => ({ safeToSpend: vi.fn(), chargesSoon: vi.fn() }));
import { safeToSpend, chargesSoon } from '../../../../api/services/money/allowance.js';
import { money } from '../../../../api/services/money/currency.js';
import { morningLine, clean } from '../../../../api/services/money/morningLine.js';

const now = new Date('2026-09-22T06:30:00Z');
const base = { forecast: {}, segments: [], facts: [], recurring: [], returns: [], language: 'es' };

describe('the morning line', () => {
  it('is nothing when today\'s number cannot be said', () => {
    safeToSpend.mockReturnValue({ amount: null });
    expect(morningLine(base, now)).toBe(null);
  });
  it('puts a charge today before a charge tomorrow before a return', () => {
    safeToSpend.mockReturnValue({ amount: 14.6, over: false });
    chargesSoon.mockReturnValue([{ name: 'Higgsfield', amount: 9, when: 'tomorrow' }, { name: 'Spotify', amount: 11.99, when: 'today' }]);
    const line = morningLine({ ...base, returns: [{ merchant: 'Zara', amount: 49.95, until: '2026-09-23', days_left: 1 }] }, now);
    expect(line.due).toBe('charge_today');
    expect(line.language).toBe('es');
    expect(line.variables[0]).toBe(money(14.6));
    expect(line.variables[1]).toBe(`Spotify, ${money(11.99)}, sale hoy.`);
  });
  it('falls to the return window when no charge is near', () => {
    safeToSpend.mockReturnValue({ amount: 14.6, over: false });
    chargesSoon.mockReturnValue([]);
    const line = morningLine({ ...base, language: 'en', returns: [{ merchant: 'Zara', amount: 49.95, until: '2026-09-23', days_left: 1 }, { merchant: 'Far', amount: 5, until: '2026-09-30', days_left: 8 }] }, now);
    expect(line.due).toBe('return');
    expect(line.variables[1]).toBe('The return window for Zara closes tomorrow.');
  });
  it('never sends an empty second variable', () => {
    safeToSpend.mockReturnValue({ amount: 0, over: true });
    chargesSoon.mockReturnValue([]);
    const line = morningLine({ ...base, language: 'pt-BR' }, now);
    expect(line.due).toBe('none');
    expect(line.language).toBe('pt_BR');
    expect(line.variables).toEqual(['nada', 'Nada vence hoje nem amanhã.']);
  });
  it('speaks English to a language it does not know', () => {
    safeToSpend.mockReturnValue({ amount: 3, over: false });
    chargesSoon.mockReturnValue([]);
    expect(morningLine({ ...base, language: null }, now).language).toBe('en');
  });
  it('keeps a merchant name inside what a template variable allows', () => {
    expect(clean('A\n\tB     C')).toBe('A B C');
    expect(clean('x'.repeat(200)).length).toBeLessThanOrEqual(60);
  });
});
