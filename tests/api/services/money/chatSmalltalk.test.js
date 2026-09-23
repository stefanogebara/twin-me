/** A greeting, a thanks or an ok never reaches the model: one line of the ledger's own, in the person's language. */
import { describe, expect, it } from 'vitest';
import { smalltalkReply, shortCircuit, assemble } from '../../../../api/_app/services/money/chat.js';

describe('smalltalk', () => {
  it('answers greetings, thanks and ok in three languages, with no numbers', () => {
    expect(smalltalkReply('hi', 'en')).toMatch(/^Hi\. Ask me about your money/);
    expect(smalltalkReply('Olá!', 'pt-BR')).toMatch(/^Oi\. Pergunte/);
    expect(smalltalkReply('hola', 'es')).toMatch(/^Hola\. Preg/);
    expect(smalltalkReply('thanks!', 'en')).toBe('You are welcome.');
    expect(smalltalkReply('obrigado', 'pt-BR')).toBe('De nada.');
    expect(smalltalkReply('ok', 'es')).toBe('Vale.');
    for (const line of [smalltalkReply('hi', 'en'), smalltalkReply('gracias', 'es')]) expect(line).not.toMatch(/\d/);
  });
  it('leaves anything with a question or a claim in it to the rest', () => {
    for (const m of ['hi, how much did I spend?', 'ok but why', 'thanks, and last month?', 'food?', 'who is my father?']) expect(smalltalkReply(m, 'en')).toBeNull();
    /* "Who are you?" is about the ledger, not the money: answered by computation since 2026-09-23 (the benchmark's ed-who-are-you). */
    expect(smalltalkReply('who are you?', 'en')).toMatch(/^TwinMe, your own ledger/);
  });
  it('is the first thing the short circuit tries', () => {
    const ctx = assemble({ transactions: [], now: new Date('2026-09-19T08:00:00Z'), language: 'pt-BR' });
    expect(shortCircuit('oi', ctx)).toMatchObject({ text: expect.stringMatching(/^Oi\./), figures: [], actions: [] });
  });
});
