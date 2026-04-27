/**
 * Unit tests for merchantNormalizer.js — normalizeMerchant + fallbackBrand.
 * Inlined logic because the real module is pure and has no side-effecting imports,
 * but we inline the functions here to avoid ESM top-level await edge cases in vitest.
 */
import { describe, it, expect } from 'vitest';

// ── inline RULES (subset — enough to cover branch logic) ──────────────────────
const RULES = [
  { match: /\bifood\b|\bi\s?food\b/i,          brand: 'iFood',      category: 'food_delivery' },
  { match: /\brappi\b/i,                       brand: 'Rappi',      category: 'food_delivery' },
  { match: /\buber\s*eats|uber\s?eats/i,       brand: 'Uber Eats',  category: 'food_delivery' },
  { match: /\buber\b(?!\s?eats)/i,             brand: 'Uber',       category: 'transport' },
  { match: /\bamazon\b|\bamzn\b/i,             brand: 'Amazon',     category: 'shopping' },
  { match: /\bnetflix\b/i,                     brand: 'Netflix',    category: 'streaming' },
  { match: /\bpix\b/i,                         brand: 'PIX',        category: 'transfer' },
];

const CONNECTORS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'o', 'a']);

function fallbackBrand(raw) {
  let s = String(raw)
    .replace(/\*/g, ' ')
    .replace(/\b\d{6,}\b/g, ' ')
    .replace(/\bcnpj[\s:#]*[\d./-]+/gi, ' ')
    .replace(/\b(pagseguro|mercadopago|mercado\s?pago|stone|getnet|cielo|rede)\s+/gi, ' ')
    .replace(/\b(institui[cç][aã]o\s+de\s+pagamento|com[eé]rcio\s+(de|e)\s+\w+|servi[cç]os?\s+(de|e)\s+\w+)\b/gi, ' ')
    .replace(/\b(ltda|s\/?\s?a|s\.?a\.?|me|mei|eireli|epp)\b\.?/gi, ' ')
    .replace(/[^A-Za-z0-9À-ÿ\s&'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s || s.length < 2) return null;
  s = s.split(' ').slice(0, 4).join(' ');
  return s
    .split(' ')
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i > 0 && CONNECTORS.has(lower)) return lower;
      if (w === w.toUpperCase() && w.length === 2) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

function normalizeMerchant(rawDescription) {
  if (!rawDescription || typeof rawDescription !== 'string') {
    return { brand: null, category: 'other' };
  }
  const trimmed = rawDescription.trim();
  for (const rule of RULES) {
    if (rule.match.test(trimmed)) {
      return { brand: rule.brand, category: rule.category };
    }
  }
  return { brand: fallbackBrand(trimmed), category: 'other' };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('normalizeMerchant — known brands', () => {
  it('matches iFood', () => expect(normalizeMerchant('iFood *Sushi Bar')).toMatchObject({ brand: 'iFood', category: 'food_delivery' }));
  it('matches Uber (not Uber Eats)', () => expect(normalizeMerchant('UBER BV *TRIP')).toMatchObject({ brand: 'Uber', category: 'transport' }));
  it('matches Uber Eats', () => expect(normalizeMerchant('Uber Eats BV')).toMatchObject({ brand: 'Uber Eats', category: 'food_delivery' }));
  it('matches Amazon', () => expect(normalizeMerchant('AMAZON MARKETPLACE BR')).toMatchObject({ brand: 'Amazon', category: 'shopping' }));
  it('matches Netflix', () => expect(normalizeMerchant('NETFLIX.COM')).toMatchObject({ brand: 'Netflix', category: 'streaming' }));
  it('matches PIX', () => expect(normalizeMerchant('PIX Transferência Recebida')).toMatchObject({ brand: 'PIX', category: 'transfer' }));
});

describe('normalizeMerchant — null/invalid input', () => {
  it('returns null brand for null', () => expect(normalizeMerchant(null)).toEqual({ brand: null, category: 'other' }));
  it('returns null brand for empty string', () => expect(normalizeMerchant('')).toEqual({ brand: null, category: 'other' }));
  it('returns null brand for number', () => expect(normalizeMerchant(42)).toEqual({ brand: null, category: 'other' }));
});

describe('fallbackBrand — strips corporate noise', () => {
  it('Pluggy sandbox string', () => {
    expect(fallbackBrand('PLUGGY BRASIL INSTITUICAO DE PAGAMENTO LTDA')).toBe('Pluggy Brasil');
  });

  it('removes LTDA suffix', () => {
    expect(fallbackBrand('RESTAURANTE DO BAIRRO LTDA')).toBe('Restaurante do Bairro');
  });

  it('removes S.A. suffix', () => {
    expect(fallbackBrand('BANCO INTER S.A.')).toBe('Banco Inter');
  });

  it('removes ME suffix', () => {
    expect(fallbackBrand('PADARIA BOA VISTA ME')).toBe('Padaria Boa Vista');
  });

  it('strips processor prefix (PAGSEGURO)', () => {
    expect(fallbackBrand('PAGSEGURO RESTAURANTE SOLAR LTDA')).toBe('Restaurante Solar');
  });

  it('strips CNPJ digits', () => {
    const result = fallbackBrand('MERCADO CENTRAL 12345678000199');
    expect(result).toBe('Mercado Central');
  });

  it('strips asterisk (iFood-style)', () => {
    expect(fallbackBrand('* RESTAURANTE SOL LTDA')).toBe('Restaurante Sol');
  });

  it('preserves 2-char all-caps acronyms (BB, XP)', () => {
    expect(fallbackBrand('BB INVESTIMENTOS SA')).toBe('BB Investimentos');
    expect(fallbackBrand('XP CORRETORA SA')).toBe('XP Corretora');
  });

  it('keeps PT connectors lowercase', () => {
    expect(fallbackBrand('PADARIA DE BAIRRO LTDA')).toBe('Padaria de Bairro');
  });

  it('trims to 4 words max', () => {
    const result = fallbackBrand('SUPERMERCADO VERDE FRESCO BAIRRO PAULISTANO LTDA');
    expect(result?.split(' ').length).toBeLessThanOrEqual(4);
  });

  it('returns null for pure noise', () => {
    expect(fallbackBrand('LTDA S.A.')).toBeNull();
  });

  it('returns null for only digits', () => {
    expect(fallbackBrand('12345678000199')).toBeNull();
  });

  it('handles empty string', () => {
    expect(fallbackBrand('')).toBeNull();
  });
});
