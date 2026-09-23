/**
 * The distress tripwire (Phase 2, T8): words from HER turns that make a call
 * urgent whatever the model decided. Pure, no LLM: the model can miss a fall
 * said in passing; this cannot.
 */
import { describe, it, expect } from 'vitest';
import { distressTripwire } from '../../api/_app/services/presenceTripwire.js';

const turns = (...lines) => lines.map(([role, content]) => ({ role, content }));

describe('distressTripwire', () => {
  it('fires on a fall, strong pain, breathlessness or a cry for help in her own words', () => {
    expect(distressTripwire(turns(['user', 'ontem eu caí no banheiro, mas tô bem']))).toEqual({ hit: true, phrase: 'caí' });
    expect(distressTripwire(turns(['user', 'tô com uma dor forte no peito desde cedo']))).toMatchObject({ hit: true, phrase: 'dor forte' });
    expect(distressTripwire(turns(['user', 'não consigo respirar direito à noite']))).toMatchObject({ hit: true });
    expect(distressTripwire(turns(['user', 'me ajuda, eu não sei o que fazer']))).toMatchObject({ hit: true });
  });

  it('ignores the same words when the presence said them', () => {
    expect(distressTripwire(turns(['agent', 'Você caiu? Está com dor forte?'], ['user', 'não, tudo bem, só cansada']))).toEqual({ hit: false, phrase: null });
  });

  it('does not fire on ordinary talk', () => {
    expect(distressTripwire(turns(['user', 'fiz um bolo e caiu a energia, mas deu certo']))).toEqual({ hit: false, phrase: null });
    expect(distressTripwire(turns(['user', 'a novela de ontem foi de doer, ri muito']))).toEqual({ hit: false, phrase: null });
    expect(distressTripwire([])).toEqual({ hit: false, phrase: null });
  });
});
