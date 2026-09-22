/**
 * The judge only fills a hole, and only when it is sure.
 *
 * Measured on a real ledger (2026-09-22): against the 46 card merchants the places provider
 * had already placed, every answer agreed 52% of the time, but answers at 80% or more agreed
 * 16 of 17 and answers at 100% agreed 6 of 6. The floor is what makes this safe.
 */
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../../../api/services/logger.js', () => ({ createLogger: () => ({ warn() {}, info() {}, error() {}, debug() {} }) }));

const { placeQuestion, acceptedCategory, judgePlace, shouldJudge, ACCEPT_AT, JUDGE_CATEGORIES, JUDGE_URL } = await import('../../../../api/services/money/judge.js');

const answer = (choice, p) => ({ kind: { type: 'choice', choice, probabilities: { [choice]: p } } });
const ok = (body) => vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));

describe('the question', () => {
  it('carries what the ledger knows, not only the truncated line', () => {
    const q = placeQuestion({ name: 'Empresa Municip', city: 'Madrid', amounts: [-4.5, -4.5, -4.5, -4.5] });
    expect(q.state.name_on_the_bank_line).toBe('Empresa Municip');
    expect(q.state.payments_seen).toBe(4);
    expect(q.state.typical_amount_eur).toBe(4.5);
    expect(q.state.city).toBe('Madrid');
    expect(Object.keys(q.questions.kind.criteria)).toEqual([...JUDGE_CATEGORIES]);
  });

  it('is nothing at all without a name', () => {
    expect(placeQuestion({ name: '' })).toBe(null);
    expect(placeQuestion({})).toBe(null);
  });
});

describe('what an answer earns', () => {
  it('takes a confident answer', () => {
    expect(acceptedCategory(answer('groceries', 1))).toEqual({ category: 'groceries', confidence: 1 });
    expect(acceptedCategory(answer('transport', 0.8))).toEqual({ category: 'transport', confidence: 0.8 });
  });

  it('drops anything under the floor, where it measured 52% right', () => {
    expect(acceptedCategory(answer('coffee', 0.61))).toBe(null);
    expect(acceptedCategory(answer('groceries', ACCEPT_AT - 0.01))).toBe(null);
  });

  it('never takes "other": a shrug would fill the hole and stop the merchant being asked about again', () => {
    expect(acceptedCategory(answer('other', 1))).toBe(null);
  });

  it('refuses a category the product does not have', () => {
    expect(acceptedCategory(answer('crypto', 1))).toBe(null);
    expect(acceptedCategory(null)).toBe(null);
    expect(acceptedCategory({})).toBe(null);
  });
});

describe('asking', () => {
  it('asks the decisions endpoint with the key, and returns what it earns', async () => {
    const fetchImpl = ok({ answers: answer('groceries', 1) });
    const got = await judgePlace({ name: 'Lidl Mad Mercad', amounts: [-1.68] }, { fetchImpl, apiKey: 'k' });
    expect(got).toEqual({ category: 'groceries', confidence: 1 });
    expect(fetchImpl.mock.calls[0][0]).toBe(JUDGE_URL);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer k');
  });

  it('says nothing rather than throwing when the judge cannot be reached', async () => {
    const dead = vi.fn(async () => { throw new Error('network'); });
    expect(await judgePlace({ name: 'X', amounts: [-1] }, { fetchImpl: dead, apiKey: 'k' })).toBe(null);
    const refused = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }));
    expect(await judgePlace({ name: 'X', amounts: [-1] }, { fetchImpl: refused, apiKey: 'k' })).toBe(null);
  });

  it('does not ask at all without a key or without a name', async () => {
    const fetchImpl = ok({ answers: answer('groceries', 1) });
    expect(await judgePlace({ name: 'X' }, { fetchImpl, apiKey: '' })).toBe(null);
    expect(await judgePlace({ name: '' }, { fetchImpl, apiKey: 'k' })).toBe(null);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('whether to ask at all', () => {
  it('asks only about a merchant nothing has placed', () => {
    expect(shouldJudge({ category: null, hasOwnWord: false })).toBe(true);
    expect(shouldJudge({ category: 'groceries', hasOwnWord: false })).toBe(false);
  });

  it('never asks about a merchant the person has a word on: their word is not for checking', () => {
    expect(shouldJudge({ category: null, hasOwnWord: true })).toBe(false);
    expect(shouldJudge({ category: 'groceries', hasOwnWord: true })).toBe(false);
  });

  it('asks when told nothing', () => {
    expect(shouldJudge()).toBe(true);
  });
});
