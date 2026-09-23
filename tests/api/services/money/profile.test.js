import { describe, it, expect } from 'vitest';
import { profileFrom, countryOfIban, DEFAULT_COUNTRY } from '../../../../api/_app/services/money/profile.js';

describe('where a person is, read from their data', () => {
  it('reads the country from the IBANs and the currency from the accounts, and says where each came from', () => {
    const p = profileFrom({ user: { timezone: null, preferred_language: 'en' }, accounts: [{ iban_mask: 'ES91 **** 1234', currency: 'EUR' }, { iban_mask: 'ES21 **** 9876', currency: 'EUR' }] });
    expect(p).toMatchObject({ country: 'ES', countryName: 'Spain', currency: 'EUR', timezone: 'Europe/Madrid', language: 'en', placesLanguage: 'es' });
    expect(p.source).toEqual({ country: 'accounts', currency: 'accounts', timezone: 'country', language: 'user' });
  });
  it('a friend in the United States gets their own country, currency, zone and lookup language', () => {
    const p = profileFrom({ user: { timezone: 'America/Chicago', preferred_language: null }, accounts: [{ iban: 'US12 3456', currency: 'usd' }] });
    expect(p).toMatchObject({ country: 'US', countryName: 'the United States', currency: 'USD', timezone: 'America/Chicago', language: null, placesLanguage: 'en' });
    expect(p.source.timezone).toBe('user');
  });
  it('a statement account with no IBAN leaves the country to the deployment, said as a default', () => {
    const p = profileFrom({ user: null, accounts: [{ iban_mask: null, currency: 'EUR' }] });
    expect(p.country).toBe(DEFAULT_COUNTRY);
    expect(p.source.country).toBe('default');
    expect(p.source.currency).toBe('accounts');
  });
  it('nobody connected yet: every value is the deployment fallback', () => {
    const p = profileFrom();
    expect(p.source).toMatchObject({ country: 'default', currency: 'default', language: 'none' });
    expect(p.timezone).toBeTruthy();
  });
  it('the majority decides when accounts disagree', () => {
    const p = profileFrom({ accounts: [{ iban_mask: 'PT50', currency: 'EUR' }, { iban_mask: 'ES91', currency: 'EUR' }, { iban_mask: 'ES21', currency: 'EUR' }] });
    expect(p.country).toBe('ES');
  });
  it('countryOfIban reads two letters or nothing', () => {
    expect(countryOfIban('es91 0049')).toBe('ES');
    expect(countryOfIban('**** 1234')).toBeNull();
    expect(countryOfIban(null)).toBeNull();
  });
});
