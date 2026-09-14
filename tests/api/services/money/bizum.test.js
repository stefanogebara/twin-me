/**
 * The Bizum ledger: a dinner paid on one card and settled by Bizums is one thing with a
 * state, not five unrelated lines.
 */
import { describe, it, expect } from 'vitest';
import {
  personMovements, splitFacts, splitProgress, splitShareOf, reimbursementIds, detectSplits, splitQuestions,
  splitFindings, balances, describeBetweenPeople, shortName, SPLIT_KIND, SPLIT_OPEN, NOT_SPLIT,
} from '../../../../api/services/money/bizum.js';

const NOW = new Date('2026-09-14T20:00:00Z'); // Monday
const tx = (id, occurred_at, amount, merchant_raw, channel = 'card') => ({ id, occurred_at, amount, merchant_raw, merchant_key: merchant_raw.toLowerCase(), channel });
/* Thursday dinner, 62,40 on the card, then three Bizums of 15,60 by Sunday: split four ways,
   three of three shares paid. */
const dinner = tx('d1', '2026-09-10T21:30:00Z', -62.4, 'La Tasca');
const backs = [
  tx('b1', '2026-09-10T23:10:00Z', 15.6, 'Ana Lopez', 'bizum'),
  tx('b2', '2026-09-11T09:00:00Z', 15.6, 'Luis Perez', 'bizum'),
  tx('b3', '2026-09-13T12:00:00Z', 15.5, 'Marta Ruiz', 'bizum'),
];
const noise = [tx('n1', '2026-09-11T10:00:00Z', -9.9, 'Cabify'), tx('n2', '2026-09-12T10:00:00Z', 100, 'Mauad Gebara', 'transfer'), tx('n3', '2026-09-12T11:00:00Z', -1.7, 'Renfe')];
const ledger = [dinner, ...backs, ...noise];

describe('personMovements', () => {
  it('keeps Bizum and transfers with a direction, and nothing else', () => {
    const m = personMovements(ledger);
    expect(m.map((x) => [x.id, x.direction])).toEqual([['b1', 'in'], ['b2', 'in'], ['b3', 'in'], ['n2', 'in']]);
  });
  it('shortens a bank-printed name to what a person would say', () => {
    expect(shortName('MARIA DOLORES TOMAS OBON')).toBe('Maria D.');
    expect(shortName('ana')).toBe('Ana');
    expect(shortName('')).toBe('someone');
  });
});

describe('a confirmed split', () => {
  const facts = [{ kind: SPLIT_KIND, subject: 'd1', value: '4' }, { kind: SPLIT_KIND, subject: 'x', value: 'not split' }];
  it('reads the fact, and refuses a nonsense number of ways', () => {
    expect([...splitFacts(facts)]).toEqual([['d1', 4]]);
    expect(splitFacts([{ kind: SPLIT_KIND, subject: 'd1', value: '1' }]).size).toBe(0);
  });
  it('counts the shares back, one per person, and what is still open', () => {
    const s = splitProgress(dinner, 4, ledger, { now: NOW });
    expect(s).toMatchObject({ ways: 4, share: 15.6, expected: 3, paid: 3, open: 0, settled: true });
    expect(s.repayment_ids).toEqual(['b1', 'b2', 'b3']);
    const two = splitProgress(dinner, 4, [dinner, backs[0], backs[1], backs[0]], { now: NOW });
    expect(two).toMatchObject({ paid: 2, open: 15.6, settled: false });
  });
  it('gives the person their share of the payment, and marks the Bizums back as settlements', () => {
    expect(splitShareOf(facts)(dinner)).toBe(0.25);
    expect(splitShareOf(facts)(noise[0])).toBeNull();
    expect([...reimbursementIds(facts, ledger, { now: NOW })]).toEqual(['b1', 'b2', 'b3']);
  });
});

describe('the ledger\'s own guess', () => {
  it('sees the dinner behind three equal Bizums and asks, with the receipts', () => {
    const [c] = detectSplits(ledger, [], { now: NOW });
    expect(c).toMatchObject({ ways: 4, confidence: 0.95 });
    expect(c.payment.id).toBe('d1');
    expect(c.repayments.map((m) => m.id)).toEqual(['b1', 'b2', 'b3']);
    const [q] = splitQuestions([c], { now: NOW });
    expect(q).toMatchObject({ id: 'split:d1', kind: SPLIT_KIND, subject: 'd1', suggested: '4', weight: 62.4 });
    expect(q.ask).toBe('You paid 62,40\u00a0\u20ac at La Tasca Thursday, and Ana L., Luis P. and Marta R. sent you 15,60\u00a0\u20ac each. Was that split?');
    expect(q.input).toBe(`choice:2,3,4,5,6,7,8,${NOT_SPLIT}`);
    expect(q.receipts.map((r) => r.id)).toEqual(['d1', 'b1', 'b2']);
  });
  it('stays quiet on one Bizum back, a small payment, a refusal, or a split already known', () => {
    expect(detectSplits([dinner, backs[0]], [], { now: NOW })).toEqual([]);
    expect(detectSplits([tx('s', '2026-09-10T21:30:00Z', -8, 'Cafe'), tx('s1', '2026-09-10T22:00:00Z', 4, 'Ana', 'bizum'), tx('s2', '2026-09-10T22:30:00Z', 4, 'Luis', 'bizum')], [], { now: NOW })).toEqual([]);
    expect(detectSplits(ledger, [{ kind: SPLIT_KIND, subject: 'd1', value: NOT_SPLIT }], { now: NOW })).toEqual([]);
    expect(detectSplits(ledger, [{ kind: SPLIT_KIND, subject: 'd1', value: '4' }], { now: NOW })).toEqual([]);
  });
});

describe('what it says', () => {
  it('names who has paid and what is open, and nothing once it is settled', () => {
    const facts = [{ kind: SPLIT_KIND, subject: 'd1', value: '4' }];
    const [f] = splitFindings(facts, [dinner, backs[0], backs[1], ...noise], { now: NOW });
    expect(f.kind).toBe(SPLIT_OPEN);
    expect(f.sentence).toBe('La Tasca Thursday, 62,40\u00a0\u20ac split 4 ways: Ana L. and Luis P. have paid, 15,60\u00a0\u20ac still open.');
    expect(f.numbers).toMatchObject({ ways: 4, share: 15.6, paid: 2, expected: 3, open: 15.6 });
    /* Declared five ways when the Bizums back are quarter shares: they are not that split's shares. */
    expect(splitFindings([{ kind: SPLIT_KIND, subject: 'd1', value: '5' }], ledger, { now: NOW })[0].numbers.paid).toBe(0);
    expect(splitFindings([{ kind: SPLIT_KIND, subject: 'd1', value: '4' }], ledger, { now: NOW })).toEqual([]);
  });
  it('sums what stands between the person and each name, settlements apart from income', () => {
    const facts = [{ kind: SPLIT_KIND, subject: 'd1', value: '4' }, { kind: 'person', subject: 'mauad gebara', value: 'family' }];
    const rows = balances(ledger, facts, { now: NOW });
    expect(rows[0]).toMatchObject({ name: 'Mauad G.', role: 'family', received: 100, settlements: 0, sent: 0, net: 100 });
    expect(rows.find((r) => r.name === 'Ana L.')).toMatchObject({ received: 0, settlements: 15.6, net: 15.6 });
    expect(describeBetweenPeople(rows)[0]).toBe('Mauad G. (family): sent you 100,00\u00a0\u20ac in 90 days.');
  });
});
