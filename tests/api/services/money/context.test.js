/**
 * The question layer earns its place by asking only what the ledger cannot answer, and by
 * treating an answer as a claim to be checked rather than a fact to be believed. Both are
 * held here. The fixtures are the real shapes from a live Santander ledger: one name that
 * sent 100 EUR six times and once 1750, one 49,25 EUR transfer to a person, and merchant
 * names the bank truncated past recognition.
 */
import { describe, it, expect } from 'vitest';
import {
  OPENING_QUESTIONS, PERSON_ROLES, openingQuestions, ledgerQuestions, checkCommitment, describeContext,
} from '../../../../api/services/money/context.js';

const plain = (s) => String(s).replace(/ /g, ' ');
const NOW = new Date('2026-09-08T10:00:00Z');

let seq = 0;
function tx(date, amount, merchant, channel = 'card') {
  seq += 1;
  return {
    id: `t${seq}`, occurred_at: `${date}T12:00:00Z`, amount,
    merchant_raw: merchant, merchant_key: merchant.toLowerCase(), channel,
  };
}

describe('the opening questions', () => {
  it('every one says what it buys, because a question that cannot is a survey', () => {
    for (const q of OPENING_QUESTIONS) {
      expect(q.ask.endsWith('?')).toBe(true);
      expect(q.why.length).toBeGreaterThan(10);
      expect(q.changes.length).toBeGreaterThan(3);
      expect(q.ask).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    }
  });

  it('asks for a district and never an address, and says so', () => {
    const home = OPENING_QUESTIONS.find((q) => q.id === 'home_area');
    expect(home.help).toContain('never asks where your phone is');
    expect(home.ask).not.toMatch(/address|street|postcode/i);
  });

  it('stops asking what it has already been told', () => {
    const asked = openingQuestions([{ kind: 'home_area', value: 'Chamberi' }, { kind: 'income', subject: 'family' }]);
    expect(asked.map((q) => q.kind)).not.toContain('home_area');
    expect(asked.map((q) => q.kind)).not.toContain('income');
    expect(asked.map((q) => q.kind)).toContain('goal');
  });

  it('does not ask about rent up front: a fixed cost that big announces itself in the ledger', () => {
    expect(OPENING_QUESTIONS.map((q) => q.kind)).not.toContain('commitment');
  });
});

describe('rent raised by the ledger', () => {
  const rent = [
    tx('2026-06-01', -650, 'Inmobiliaria Sol', 'transfer'),
    tx('2026-07-01', -650, 'Inmobiliaria Sol', 'transfer'),
    tx('2026-08-02', -650, 'Inmobiliaria Sol', 'transfer'),
  ];

  it('asks once about a big charge that lands on the same day every month, with the payments attached', () => {
    const qs = ledgerQuestions({ transactions: rent, now: NOW });
    const q = qs.find((x) => x.id === 'rent:inmobiliaria sol');
    expect(q).toBeDefined();
    expect(q.kind).toBe('commitment');
    expect(plain(q.ask)).toBe('Inmobiliaria Sol takes about 650,00 € around the 1st, 3 months running. Is this your rent?');
    expect(q.input).toBe('choice:rent,another fixed cost,not fixed');
    expect(q.receipts).toHaveLength(3);
    expect(q.amount).toBe(650);
    expect(q.day).toBe(1);
  });

  it('stays quiet below the floor, when the day wanders, or once it is a known commitment', () => {
    const small = rent.map((t) => ({ ...t, amount: -120 }));
    expect(ledgerQuestions({ transactions: small, now: NOW }).some((q) => q.id.startsWith('rent:'))).toBe(false);
    const wandering = [tx('2026-06-01', -650, 'Casa', 'transfer'), tx('2026-07-19', -650, 'Casa', 'transfer')];
    expect(ledgerQuestions({ transactions: wandering, now: NOW }).some((q) => q.id.startsWith('rent:'))).toBe(false);
    const facts = [{ kind: 'commitment', subject: 'inmobiliaria sol', amount: 650 }];
    expect(ledgerQuestions({ transactions: rent, facts, now: NOW }).some((q) => q.id.startsWith('rent:'))).toBe(false);
  });
});

describe('questions the ledger raises', () => {
  const incoming = [
    tx('2026-06-25', 100, 'Mauad Gebara Christian', 'transfer'),
    tx('2026-07-10', 100, 'Mauad Gebara Christian', 'transfer'),
    tx('2026-07-23', 100, 'Mauad Gebara Christian', 'transfer'),
    tx('2026-08-26', 1750, 'Mauad Gebara Christian', 'transfer'),
    tx('2026-08-30', 50, 'Isi Yaffe Bitton', 'transfer'),
  ];

  it('asks about the biggest unexplained money first, and shows the transfers behind it', () => {
    const qs = ledgerQuestions({ transactions: incoming, now: NOW });
    const first = qs[0];
    expect(first.kind).toBe('person');
    expect(plain(first.ask)).toBe('Mauad Gebara Christian has sent you 2050,00 € across 4 transfers. Who is that?');
    expect(first.changes).toBe('whether this counts as income');
    expect(first.receipts).toHaveLength(3);
    expect(first.input).toContain('family');
    /* 2.050 EUR outranks 50 EUR: patience is finite and the biggest gap deserves it. */
    expect(plain(qs[1].ask)).toContain('Isi Yaffe Bitton');
  });

  it('lets a coffee-sized transfer pass without a question', () => {
    const small = [tx('2026-09-02', 14, 'Santiago Isaias Gutierrez Cevallos', 'bizum')];
    expect(ledgerQuestions({ transactions: small, now: NOW })).toEqual([]);
  });

  it('never asks twice about a person already named', () => {
    const facts = [{ kind: 'person', subject: 'mauad gebara christian', value: 'family' }];
    const qs = ledgerQuestions({ transactions: incoming, facts, now: NOW });
    expect(qs.map((q) => q.subject)).not.toContain('mauad gebara christian');
  });

  it('asks who was paid, but not over small settling-up', () => {
    const out = [tx('2026-09-04', -49.25, 'Rafaella Van Der Graaff', 'transfer'), tx('2026-09-06', -4, 'Frederico Garcia Pugliese', 'bizum')];
    const qs = ledgerQuestions({ transactions: out, now: NOW });
    expect(plain(qs[0].ask)).toBe('You sent Rafaella Van Der Graaff 49,25 € once. Who is that?');
    expect(qs.map((q) => q.subject)).not.toContain('frederico garcia pugliese');
  });

  it('asks what a place is only once it keeps coming back', () => {
    const twice = [tx('2026-09-01', -6, 'Empresa Municip'), tx('2026-09-02', -6, 'Empresa Municip')];
    expect(ledgerQuestions({ transactions: twice, now: NOW }).map((q) => q.kind)).not.toContain('merchant_kind');

    const thrice = [...twice, tx('2026-09-04', -4.5, 'Empresa Municip')];
    const q = ledgerQuestions({ transactions: thrice, now: NOW }).find((x) => x.kind === 'merchant_kind');
    expect(plain(q.ask)).toBe('What kind of place is Empresa Municip? You have paid there 3 times, 16,50 € in all.');
    expect(q.changes).toBe('where your month went');
  });

  it('never asks about a place the data already named', () => {
    const rows = [tx('2026-09-01', -6, 'Simply Alcala'), tx('2026-09-02', -6, 'Simply Alcala'), tx('2026-09-03', -6, 'Simply Alcala')];
    const qs = ledgerQuestions({ transactions: rows, placeOf: () => 'groceries', now: NOW });
    expect(qs.map((q) => q.kind)).not.toContain('merchant_kind');
  });

  it('asks whether a monthly charge that stopped was cancelled', () => {
    const rows = [
      tx('2026-04-04', -11.99, 'Netflix'), tx('2026-05-04', -11.99, 'Netflix'), tx('2026-06-04', -11.99, 'Netflix'),
    ];
    const q = ledgerQuestions({ transactions: rows, now: NOW }).find((x) => x.id.startsWith('stopped:'));
    expect(plain(q.ask)).toContain('came every 31 days and has not for 95');
    expect(q.input).toContain('cancelled');
  });

  it('says nothing at all about a ledger with nothing unexplained', () => {
    const rows = [tx('2026-09-01', -6, 'Simply Alcala'), tx('2026-09-02', -12, 'Simply Alcala')];
    expect(ledgerQuestions({ transactions: rows, placeOf: () => 'groceries', now: NOW })).toEqual([]);
  });

  it('holds to the limit it was given', () => {
    const many = Array.from({ length: 12 }, (_, i) => tx('2026-08-10', 300 + i, `Person ${i}`, 'transfer'));
    expect(ledgerQuestions({ transactions: many, now: NOW, limit: 3 })).toHaveLength(3);
  });
});

describe('a stated commitment against what actually happened', () => {
  const rent = { kind: 'commitment', subject: 'rent', amount: 500, day: 1 };

  it('confirms a claim the ledger can see', () => {
    const rows = [tx('2026-08-01', -500, 'Landlord', 'transfer'), tx('2026-07-02', -500, 'Landlord', 'transfer')];
    const r = checkCommitment(rent, rows, NOW);
    expect(r.status).toBe('confirmed');
    expect(r.seen.length).toBeGreaterThan(0);
  });

  it('says so when the money leaves on another day', () => {
    const rows = [tx('2026-08-20', -500, 'Landlord', 'transfer'), tx('2026-07-20', -495, 'Landlord', 'transfer')];
    const r = checkCommitment(rent, rows, NOW);
    expect(r.status).toBe('different');
    expect(plain(r.note)).toBe('Something of about 500,00 € does leave, but not near the 1st.');
  });

  it('says so when nothing of that size leaves at all, rather than believing the number', () => {
    const rows = [tx('2026-08-01', -12, 'Coffee')];
    const r = checkCommitment(rent, rows, NOW);
    expect(r.status).toBe('unseen');
    expect(plain(r.note)).toContain('paid from somewhere else');
  });
});

describe('what the twin is told about the person', () => {
  it('marks their words as claims, so a typed number is never read as an observed one', () => {
    const facts = [
      { kind: 'home_area', value: 'Chamberi' },
      { kind: 'study_place', value: 'IE Business School' },
      { kind: 'commitment', subject: 'rent', amount: 500, day: 1 },
      { kind: 'income', subject: 'family', amount: 100, day: 25 },
      { kind: 'person', subject: 'mauad gebara christian', subject_label: 'Mauad', value: 'family' },
      { kind: 'goal', value: 'save' },
    ];
    const block = describeContext(facts);
    expect(block).toContain('their words, not readings');
    expect(block).toContain('Lives in Chamberi.');
    expect(block).toContain('Studies at IE Business School.');
    expect(plain(block)).toContain('rent 500,00 € on the 1st');
    expect(plain(block)).toContain('Says this comes in: family 100,00 €');
    /* The 1st, not the 1th: a system that cannot spell a date is not trusted with a number. */
    expect(block).not.toContain('1th');
    expect(block).not.toContain('25th around');
    expect(block).toContain('Mauad is family');
    expect(block).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });

  it('says nothing when it has been told nothing', () => {
    expect(describeContext([])).toBe('');
  });
});

describe('the vocabulary', () => {
  it('keeps the roles a person can hold on a statement', () => {
    expect(PERSON_ROLES).toContain('flatmate');
    expect(PERSON_ROLES).toContain('family');
    expect(PERSON_ROLES).toContain('landlord');
  });
});
