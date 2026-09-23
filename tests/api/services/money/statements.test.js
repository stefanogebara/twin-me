/** What a sentence tells the ledger: money coming in, a subscription taken on, a charge ended; en/es/pt. */
import { describe, expect, it } from 'vitest';
import { personStatement, incomeStatement, subscriptionStatement, cancelStatement, amountIn, cadenceIn, dayIn } from '../../../../api/services/money/statements.js';

describe('the parts', () => {
  it('reads an amount with its currency, a cadence and a day of the month', () => {
    expect(amountIn('150 usd is coming from Vercel')).toEqual({ amount: 150, currency: 'USD' });
    expect(amountIn('12,99 EUR a month')).toEqual({ amount: 12.99, currency: 'EUR' });
    expect(amountIn('1.750 euros on the 1st')).toEqual({ amount: 1750, currency: 'EUR' });
    expect(amountIn('$20 a month')).toEqual({ amount: 20, currency: 'USD' });
    expect(cadenceIn('12,99 a month')).toBe('monthly'); expect(cadenceIn('caem todo mes')).toBe('monthly'); expect(cadenceIn('10 euros a la semana')).toBe('weekly');
    expect(dayIn('on the 15th')).toBe(15); expect(dayIn('el dia 5')).toBe(5); expect(dayIn('no dia 1')).toBe(1); expect(dayIn('150 eur')).toBeNull();
  });
});

describe('incomeStatement', () => {
  it('reads a one-off in another currency, a monthly income with its day, in three languages', () => {
    expect(incomeStatement('150 usd is coming from Vercel this month')).toMatchObject({ source: 'Vercel', amount: 150, currency: 'USD', once: true, day: null });
    expect(incomeStatement('My parents send me 1750 on the 1st of every month')).toMatchObject({ source: 'Parents', amount: 1750, currency: 'EUR', day: 1, cadence: 'monthly', once: false });
    expect(incomeStatement('recebo 800 euros do estagio no dia 5')).toMatchObject({ source: 'Estagio', amount: 800, day: 5, irregular: false });
    expect(incomeStatement('my father sends me 100 euros sometimes')).toMatchObject({ amount: 100, irregular: true });
    expect(incomeStatement('My parents send me 1750 on the first of every month.')).toMatchObject({ source: 'Parents', amount: 1750, day: 1 });
    expect(incomeStatement('recebo 800 do estagio todo dia primeiro')).toMatchObject({ amount: 800, day: 1 });
    expect(incomeStatement('mis padres me mandan 500 el quince de cada mes')).toMatchObject({ amount: 500, day: 15 });
    expect(incomeStatement('as vezes recebo 50 euros do meu pai')).toMatchObject({ amount: 50, irregular: true });
    expect(incomeStatement('me llegan 300 euros de mi padre el 10')).toMatchObject({ source: 'Padre', amount: 300, day: 10 });
  });
  it('is nothing for spending, a subscription or a question', () => {
    expect(incomeStatement('I spent 150 on Vercel this month')).toBeNull();
    expect(incomeStatement('I subscribed to Netflix, 12,99 a month')).toBeNull();
    expect(incomeStatement('how much did I get from Vercel?')).toBeNull();
  });
});

describe('subscriptionStatement', () => {
  it('reads a name, an amount, a cadence and a day, in three languages', () => {
    expect(subscriptionStatement('I subscribed to Netflix, 12,99 a month on the 15th')).toMatchObject({ name: 'Netflix', amount: 12.99, cadence: 'monthly', day: 15, currency: 'EUR' });
    expect(subscriptionStatement('180 euros do plano do claude max tambem caem todo mes')).toMatchObject({ name: 'Claude max', amount: 180, cadence: 'monthly', day: null });
    expect(subscriptionStatement('me suscribi a Spotify por 11,99 euros al mes el dia 5')).toMatchObject({ name: 'Spotify', amount: 11.99, cadence: 'monthly', day: 5 });
    expect(subscriptionStatement('I pay $20 a month for ChatGPT plan')).toMatchObject({ currency: 'USD', cadence: 'monthly' });
  });
  it('is nothing without a cadence or an amount, or for a cancellation', () => {
    expect(subscriptionStatement('I subscribed to Netflix')).toBeNull();
    expect(subscriptionStatement('I cancelled Netflix, it was 12,99 a month')).toBeNull();
  });
});

describe('cancelStatement', () => {
  it('reads the charge they ended, in three languages', () => {
    expect(cancelStatement('I cancelled Spotify yesterday')).toEqual({ name: 'Spotify' });
    expect(cancelStatement('cancelei a Netflix')).toEqual({ name: 'Netflix' });
    expect(cancelStatement('me di de baja de Spotify')).toEqual({ name: 'Spotify' });
    expect(cancelStatement('Higgsfield is cancelled')).toEqual({ name: 'Higgsfield' });
    expect(cancelStatement('how much is Spotify?')).toBeNull();
  });
});

describe('who somebody is', () => {
  it('reads a role word and the name, in three languages, and nothing from a question', () => {
    expect(personStatement('The 200 euro transfer to Maria Dolores Tomas Obon is my rent, she is my landlord.')).toEqual({ role: 'landlord', name: 'maria dolores tomas obon' });
    expect(personStatement('Rafaella is my flatmate')).toEqual({ role: 'flatmate', name: 'rafaella' });
    expect(personStatement('Pedro es mi casero')).toEqual({ role: 'landlord', name: 'pedro' });
    expect(personStatement('Ana e minha mae')).toEqual({ role: 'family', name: 'ana' });
    expect(personStatement('how much did I spend on friends?')).toEqual({ role: 'friend', name: null });
    expect(personStatement('150 euros are coming from Vercel this month')).toBeNull();
  });
});
