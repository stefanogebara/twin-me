vi.mock('../../../../api/_app/services/money/reconciliationService.js', () => ({ getReconciliationStatus: async () => ({ state: 'clear', unresolvedCount: 0, revision: 1 }) }));
/**
 * Money in, money out, the difference and who paid, answered from the month page's own figures
 * (inflow.js), with no model. On production "How much came in this month, and how much went
 * out?" became "The ledger cannot answer that from what it has" after 21.8 s of writing, and
 * "Who paid me this month?" named a salary line as a person and counted a payment dated the
 * 30th on the 26th (2026-09-26).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../api/_app/services/llmGateway.js', () => ({ complete: vi.fn(), stream: vi.fn(), TIER_CHAT: 'chat' }));
vi.mock('../../../../api/_app/services/logger.js', () => ({ createLogger: () => ({ warn() {}, info() {}, error() {} }) }));
vi.mock('../../../../api/_app/services/money/store.js', async (importOriginal) => {
  const { categoryOfPayment } = await importOriginal();
  return { categoryOfPayment };
});

const { assemble, shortCircuit, plainSums } = await import('../../../../api/_app/services/money/chat.js');

const now = new Date('2026-09-26T10:00:00Z');
const tx = (id, key, raw, iso, amount, extra = {}) => ({ id, merchant_key: key, merchant_raw: raw, occurred_at: iso, amount, currency: 'EUR', channel: 'card', ...extra });
const ledger = [
  tx('pay', 'nomina septiembre universidad', 'NOMINA SEPTIEMBRE UNIVERSIDAD', '2026-09-25T08:00:00Z', 1200, { channel: 'transfer' }),
  tx('ana', 'maria lopez', 'Maria Lopez', '2026-09-20T19:00:00Z', 15.15, { channel: 'bizum' }),
  /* dated after today: the month page does not count it yet, and neither does the answer */
  tx('later', 'maria lopez', 'Maria Lopez', '2026-09-30T09:00:00Z', 50, { channel: 'bizum' }),
  tx('soon', 'gym', 'Gym', '2026-09-29T09:00:00Z', -40),
  tx('rent', 'landlord sl', 'Landlord SL', '2026-09-02T09:00:00Z', -600, { channel: 'transfer' }),
  tx('lidl', 'lidl', 'Lidl', '2026-09-05T18:00:00Z', -45.5),
  tx('aug-pay', 'nomina agosto universidad', 'NOMINA AGOSTO UNIVERSIDAD', '2026-08-25T08:00:00Z', 1200, { channel: 'transfer' }),
  tx('aug-lidl', 'lidl', 'Lidl', '2026-08-10T18:00:00Z', -30),
];
/* The month segments still count the payment dated the 30th among what came in. */
const segments = [
  { month: '2026-09-01', spent: 645.5, received: 1265.15, lines: 6, biggest: { id: 'rent', merchant: 'Landlord SL', amount: 600 }, days_covered: 26 },
  { month: '2026-08-01', spent: 30, received: 1200, lines: 2, biggest: { id: 'aug-lidl', merchant: 'Lidl', amount: 30 }, days_covered: 31 },
];
const ctxOf = (language = 'en') => assemble({ transactions: ledger, segments, now, language });
const answer = (message, language) => shortCircuit(message, ctxOf(language));

describe('money in and out, computed', () => {
  it('says what came in, what went out and the difference, what has happened so far', () => {
    const r = answer('How much came in this month, and how much went out?');
    expect(r.text).toBe('This month 1215,15 \u20ac came in and 645,50 \u20ac went out, so 569,65 \u20ac more came in than went out.');
    expect(r.figures).toEqual([]);
    expect(r.receipts.map((x) => x.id)).toEqual(['pay', 'ana']);
  });

  it('names who paid by the name the bank uses, a salary as the salary it is, never a person', () => {
    const r = answer('Who paid me this month?');
    expect(r.text).toBe('This month 1215,15 \u20ac came in. From 2 payers, largest first: NOMINA SEPTIEMBRE UNIVERSIDAD 1200,00 \u20ac; Maria Lopez 15,15 \u20ac.');
    expect(r.text).not.toMatch(/Nomina S\./);
    expect(r.text).not.toMatch(/50,00|1265,15/);
  });

  it('answers one side when one side is asked', () => {
    expect(answer('How much came in this month?').text).toBe('This month 1215,15 \u20ac came in.');
    expect(answer('How much went out this month?').text).toBe('This month 645,50 \u20ac went out, every payment and transfer that left, spending or not.');
  });

  it('in Spanish and in Portuguese, whatever the account says', () => {
    expect(answer('\u00bfCu\u00e1nto me ha entrado este mes y cu\u00e1nto ha salido?').text).toBe('Este mes entraron 1215,15 \u20ac y salieron 645,50 \u20ac: entr\u00f3 569,65 \u20ac m\u00e1s de lo que sali\u00f3.');
    expect(answer('\u00bfQui\u00e9n me ha pagado este mes?').text).toBe('Este mes entraron 1215,15 \u20ac. De 2 pagadores, de mayor a menor: NOMINA SEPTIEMBRE UNIVERSIDAD 1200,00 \u20ac; Maria Lopez 15,15 \u20ac.');
    expect(answer('Quanto entrou este m\u00eas e quanto saiu?').text).toBe('Este m\u00eas entraram 1215,15 \u20ac e sa\u00edram 645,50 \u20ac: entrou 569,65 \u20ac a mais do que saiu.');
    expect(answer('Quem me pagou este m\u00eas?', 'pt-BR').text).toBe('Este m\u00eas entraram 1215,15 \u20ac. De 2 pagadores, do maior para o menor: NOMINA SEPTIEMBRE UNIVERSIDAD 1200,00 \u20ac; Maria Lopez 15,15 \u20ac.');
  });

  it('leaves another month, the month ahead, one payer and a statement to the other answers', async () => {
    const { flowAnswer } = await import('../../../../api/_app/services/money/flowAnswer.js');
    for (const m of ['How much came in last month?', 'How much will come in next month?', 'How much has Maria sent me this month?', 'How much came in yesterday?', 'my salary came in today', 'How much did I spend at Lidl this month?']) {
      expect(flowAnswer(m, ctxOf())).toBe(null);
    }
  });

  it('says nothing came in rather than a zero', () => {
    const quiet = assemble({ transactions: ledger.filter((t) => Number(t.amount) < 0), segments, now, language: 'en' });
    expect(shortCircuit('Who paid me this month?', quiet).text).toBe('Nothing has come in yet this month.');
    expect(shortCircuit('How much came in and how much went out this month?', quiet).text).toBe('Nothing has come in yet this month; 645,50 \u20ac went out.');
  });

  it('"am I spending more than I receive" takes what came in from the same figures', () => {
    expect(plainSums('Am I spending more than I receive this month?', ctxOf()).text).toBe('This month: 645,50 \u20ac spent, 1215,15 \u20ac came in.');
  });
});
