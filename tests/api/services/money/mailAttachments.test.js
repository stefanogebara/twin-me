import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../api/_app/services/database.js', () => ({ supabaseAdmin: {} }));
vi.mock('../../../../api/_app/services/money/store.js', () => ({ ingestSightings: vi.fn(), refreshRecurring: vi.fn(), refreshReadings: vi.fn(), listFacts: vi.fn(), answerQuestion: vi.fn(), ingestSighting: vi.fn() }));
vi.mock('../../../../api/_app/services/money/statements/accounts.js', () => ({ statementAccounts: vi.fn(), checkStatementEvidence: vi.fn() }));

const { statementFromMail } = await import('../../../../api/_app/services/money/mailAttachments.js');

const CSV = Buffer.from('Fecha,Concepto,Importe\n17/09/2026,METRO DE MADRID,"-12,20"\n17/09/2026,CINES YELMO,"-9,50"\n18/09/2026,MARIA GARCIA,"25,00"\n');
const one = { id: '11111111-1111-4111-8111-111111111111', name: 'Santander', currency: 'EUR' };
const two = { id: '22222222-2222-4222-8222-222222222222', name: 'Revolut', currency: 'EUR' };
const fakes = (accounts) => {
  const seen = { ingested: null, held: null, evidence: null, refreshed: 0 };
  const deps = {
    statementAccounts: async () => accounts,
    checkStatementEvidence: async (userId, account, sightings) => { seen.evidence = [account.id, sightings.length]; },
    ingestSightings: async (userId, sightings) => { seen.ingested = sightings; return { created: sightings.length }; },
    saveHeldStatement: async (userId, held, origin) => { seen.held = { ...held, origin }; return { id: 'n1' }; },
    afterLedgerChange: async () => { seen.refreshed += 1; },
  };
  return { deps, seen };
};

describe('statementFromMail', () => {
  it('imports into the one account, with the evidence check and the refresh the page does', async () => {
    const { deps, seen } = fakes([one]);
    const out = await statementFromMail('u1', CSV, 'movimientos.csv', { emailId: 'e1', attachmentId: 'a1' }, deps);
    expect(out).toEqual({ kind: 'statement', read: 3, created: 3 });
    expect(seen.ingested.every((s) => s.account_id === one.id)).toBe(true);
    expect(seen.evidence).toEqual([one.id, 3]);
    expect(seen.refreshed).toBe(1);
    expect(seen.held).toBeNull();
  });
  it('holds the statement when there are two accounts to choose from, and when there is none', async () => {
    for (const accounts of [[one, two], []]) {
      const { deps, seen } = fakes(accounts);
      const out = await statementFromMail('u1', CSV, 'movimientos.csv', { emailId: 'e1', attachmentId: 'a1' }, deps);
      expect(out).toEqual({ kind: 'held', rows: 3 });
      expect(seen.held).toEqual({ filename: 'movimientos.csv', rows: 3, accounts: accounts.length, origin: { emailId: 'e1', attachmentId: 'a1' } });
      expect(seen.ingested).toBeNull();
    }
  });
  it('is nothing when no row reads as a payment', async () => {
    const { deps, seen } = fakes([one]);
    expect(await statementFromMail('u1', Buffer.from('hello\nworld\n'), 'notes.csv', { emailId: 'e1' }, deps)).toEqual({ kind: 'nothing' });
    expect(seen.ingested).toBeNull();
  });
  it('leaves an account in another currency out of the count', async () => {
    const { deps, seen } = fakes([one, { ...two, currency: 'USD' }]);
    const out = await statementFromMail('u1', CSV, 'movimientos.csv', { emailId: 'e1', attachmentId: 'a1' }, deps);
    expect(out.kind).toBe('statement');
    expect(seen.ingested[0].account_id).toBe(one.id);
  });
});
