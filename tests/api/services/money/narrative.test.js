/**
 * The shapes here are the ones a real Santander España feed produced (read 2026-09-08).
 * Names of people and reference codes are invented; the sentence structure is not.
 */
import { describe, it, expect } from 'vitest';
import { parseNarrative, channelFrom, cardFrom, prettyMerchant, cityFrom } from '../../../../api/services/money/narrative.js';

describe('parseNarrative', () => {
  it('reads a mobile-wallet payment as a shop on a card', () => {
    expect(parseNarrative('PAGO MOVIL EN EL CORTE INGLES, MADRID ES, TARJ. :*741245')).toEqual({
      merchant: 'El Corte Ingles', channel: 'card', cardLast4: '1245', isRefund: false,
    });
    expect(parseNarrative('PAGO MOVIL EN RENFE CERCANIAS, MADRID ES, TARJ. :*741245').merchant).toBe('Renfe Cercanias');
  });

  it('reads a card purchase and drops the reference the bank glues on', () => {
    expect(parseNarrative('COMPRA Cabify ES 2636eRmHs0tq, Madrid, TARJETA 5489010523741245 , COMISION 0,00')).toEqual({
      merchant: 'Cabify', channel: 'card', cardLast4: '1245', isRefund: false,
    });
    expect(parseNarrative('COMPRA PLAYTOMIC.IO 8C575A28, MADRID, TARJETA 5489010523741245 , COMISION 0,00').merchant).toBe('Playtomic.io');
    expect(parseNarrative('COMPRA Spotify P4675EFF52, Stockholm, TARJETA 5489010523741245 , COMISION 0,00').merchant).toBe('Spotify');
    expect(parseNarrative('COMPRA 31AUG MRRYNFLV, Barcelona, TARJETA 5489010523741245 , COMISION 0,00').merchant).toBe('Mrrynflv');
  });

  it('cuts a reference off a domain and a letter the bank truncated', () => {
    expect(parseNarrative('COMPRA BOLT.EU/O/2609041118, Tallinn, TARJETA 5489010523741245 , COMISION 0,00').merchant).toBe('Bolt.eu');
    expect(parseNarrative('COMPRA AB Servicios Selecta E, Madrid, TARJETA 5489010523741245 , COMISION 0,00').merchant).toBe('AB Servicios Selecta');
    /* IE is Ireland's country code and also the name of a Madrid business school. */
    expect(parseNarrative('PAGO MOVIL EN TORRE IE, VIEJAS ES, TARJ. :*741245').merchant).toBe('Torre IE');
  });

  it('keeps the merchant, not the aggregator, when one prints its own name', () => {
    expect(parseNarrative('COMPRA SQ *SHAKE SHACK, Boston, TARJETA 5489010523741245 , COMISION 0,00').merchant).toBe('Shake Shack');
    /* FACEBK is Facebook's card descriptor, and nobody says "Facebk". */
    expect(parseNarrative('COMPRA FACEBK *Q42J82JD24, DUBLIN 2, TARJETA 5489010523741245 , COMISION 0,00').merchant).toBe('Facebook');
  });

  it('marks a refund and still names the shop', () => {
    const r = parseNarrative('DEVOLUCION COMPRA EN ARBITRADE MADRID 3, GETAFE, TARJETA 5489010523741245 , COMISION 0,00');
    expect(r).toMatchObject({ merchant: 'Arbitrade Madrid', channel: 'card', isRefund: true });
  });

  it('names the person on a Bizum, both directions', () => {
    expect(parseNarrative('BIZUM A FAVOR DE JUANA PEREZ MARTIN CONCEPTO: Sin concepto')).toEqual({
      merchant: 'Juana Perez Martin', channel: 'bizum', cardLast4: null, isRefund: false,
    });
    expect(parseNarrative('BIZUM DE LUIS ALBERTO SOLER CONCEPTO Sin concepto').merchant).toBe('Luis Alberto Soler');
  });

  it('names the person on a transfer and ignores the trailing note', () => {
    expect(parseNarrative('TRANSFERENCIA INMEDIATA A FAVOR DE Marta Ruiz Vidal').merchant).toBe('Marta Ruiz Vidal');
    expect(parseNarrative('TRANSFERENCIA INMEDIATA DE Ana Gil Soto, CONCEPTO Sent from Revolut')).toMatchObject({ merchant: 'Ana Gil Soto', channel: 'transfer' });
    expect(parseNarrative('TRANSFERENCIA DE PEDRO NAVARRO LOPEZ, .').merchant).toBe('Pedro Navarro Lopez');
  });

  it('drops a legal form from the end of a company name', () => {
    expect(parseNarrative('COMPRA HIGGSFIELD INC., SAN FRANCISCO, TARJETA 5489010523741245 , COMISION 0,00').merchant).toBe('Higgsfield');
    expect(parseNarrative('COMPRA VERCEL INC., COVINA, TARJETA 5489010523741245 , COMISION 0,00').merchant).toBe('Vercel');
  });

  it('gives the bank charging its own account a readable name', () => {
    expect(parseNarrative('LIQUIDACION DEL CONTRATO 0018909 300')).toMatchObject({ merchant: 'Account settlement', channel: 'fee' });
    expect(parseNarrative('')).toMatchObject({ merchant: null });
  });
});

describe('channelFrom', () => {
  it('tells the ways money leaves an account apart', () => {
    expect(channelFrom('PAGO MOVIL EN ABADA, MADRID ES')).toBe('card');
    expect(channelFrom('BIZUM A FAVOR DE X')).toBe('bizum');
    expect(channelFrom('RECIBO DE ENDESA')).toBe('direct_debit');
    expect(channelFrom('REINTEGRO CAJERO 4321')).toBe('cash');
    expect(channelFrom('TRANSFERENCIA INMEDIATA DE X')).toBe('transfer');
    expect(channelFrom('LIQUIDACION DEL CONTRATO 1')).toBe('fee');
  });
});

describe('cardFrom', () => {
  it('keeps four digits from either way the card is printed', () => {
    expect(cardFrom('TARJ. :*741245')).toBe('1245');
    expect(cardFrom('TARJETA 5489010523741245 , COMISION 0,00')).toBe('1245');
    expect(cardFrom('BIZUM A FAVOR DE X')).toBe(null);
  });
});

describe('prettyMerchant', () => {
  it('keeps an acronym in capitals and reads a domain as a name', () => {
    expect(prettyMerchant('TORRE IE')).toBe('Torre IE');
    expect(prettyMerchant('VERCEL.COM')).toBe('Vercel.com');
    expect(prettyMerchant('ELEVENLABS.IO')).toBe('Elevenlabs.io');
    expect(prettyMerchant('MERCADONA MADRID')).toBe('Mercadona Madrid');
    expect(prettyMerchant('')).toBe(null);
  });
});

describe('cityFrom', () => {
  it('reads the town out of a card purchase, country code and all', () => {
    expect(cityFrom('PAGO MOVIL EN EL CORTE INGLES, MADRID ES, TARJ. :*741245')).toBe('Madrid');
    expect(cityFrom('COMPRA Cabify ES 2636eRmHs0tq, Madrid, TARJETA 5489010523741245 , COMISION 0,00')).toBe('Madrid');
    expect(cityFrom('PAGO MOVIL EN EXPVILLANUEVA, ALCOBENDAS ES, TARJ. :*741245')).toBe('Alcobendas');
    /* The bank truncates the town and glues the country to it. */
    expect(cityFrom('PAGO MOVIL EN SIMPLY ALCALA, PARQUE RETIROES, TARJ. :*741245')).toBe('Parque Retiro');
    expect(cityFrom('COMPRA FACEBK *Q42J82JD24, DUBLIN 2, TARJETA 5489010523741245 , COMISION 0,00')).toBe('Dublin');
    /* Some merchants print a legal form where the town would be. */
    expect(cityFrom('COMPRA VERCEL, INC., COVINA, TARJETA 5489010523741245 , COMISION 0,00')).toBe('Covina');
  });

  it('names no place where the bank named a person', () => {
    expect(cityFrom('BIZUM A FAVOR DE JUANA PEREZ MARTIN CONCEPTO: Sin concepto')).toBe(null);
    expect(cityFrom('TRANSFERENCIA INMEDIATA A FAVOR DE Marta Ruiz Vidal')).toBe(null);
    expect(cityFrom('LIQUIDACION DEL CONTRATO 0018909 300')).toBe(null);
    expect(cityFrom('')).toBe(null);
  });
});
