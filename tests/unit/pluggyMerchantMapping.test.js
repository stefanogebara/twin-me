/**
 * Integration-unit tests for the mapMerchant logic in pluggyIngestion.js.
 *
 * Verifies that the Pluggy transaction shape (merchant.name, businessName,
 * description fallback) feeds correctly into normalizeMerchant and produces
 * the right (merchant_raw, brand, category) tuple.
 *
 * Inline pattern (no DB, no Pluggy API needed) — same approach as
 * pluggySignedAmount.test.js. Guards against regressions in the field
 * priority chain and the fallback brand logic.
 */
import { describe, it, expect } from 'vitest';
import { normalizeMerchant } from '../../api/services/transactions/merchantNormalizer.js';

// ── inline mapMerchant (mirrors pluggyIngestion.js) ───────────────────────────
function mapMerchant(pluggyTx) {
  const merchantRaw =
    pluggyTx.merchant?.name ||
    pluggyTx.merchant?.businessName ||
    pluggyTx.description ||
    'unknown';
  const { brand, category } = normalizeMerchant(merchantRaw);
  return { merchantRaw, brand, category };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('mapMerchant — field priority', () => {
  it('prefers merchant.name over businessName and description', () => {
    const r = mapMerchant({
      merchant: { name: 'iFood *Sushi', businessName: 'IFOOD CORP LTDA' },
      description: 'CREDIT CARD CHARGE',
    });
    expect(r.merchantRaw).toBe('iFood *Sushi');
    expect(r.brand).toBe('iFood');
    expect(r.category).toBe('food_delivery');
  });

  it('falls back to merchant.businessName when name absent', () => {
    const r = mapMerchant({
      merchant: { businessName: 'AMAZON PAYMENTS LTDA' },
      description: 'COMPRA ONLINE',
    });
    expect(r.merchantRaw).toBe('AMAZON PAYMENTS LTDA');
    expect(r.brand).toBe('Amazon');
    expect(r.category).toBe('shopping');
  });

  it('falls back to description when merchant object absent', () => {
    const r = mapMerchant({ description: 'Spotify Premium BR' });
    expect(r.merchantRaw).toBe('Spotify Premium BR');
    expect(r.brand).toBe('Spotify');
    expect(r.category).toBe('streaming');
  });

  it('uses "unknown" literal when all fields absent', () => {
    const r = mapMerchant({});
    expect(r.merchantRaw).toBe('unknown');
    expect(r.brand).toBe('Unknown'); // fallbackBrand title-cases it — no noise to strip
    expect(r.category).toBe('other');
  });
});

describe('mapMerchant — fallback brand (unrecognized merchants)', () => {
  it('Pluggy sandbox tx gets a clean fallback brand', () => {
    const r = mapMerchant({
      merchant: { name: 'PLUGGY BRASIL INSTITUICAO DE PAGAMENTO LTDA' },
      description: 'DEBITO EM CONTA',
    });
    expect(r.merchantRaw).toBe('PLUGGY BRASIL INSTITUICAO DE PAGAMENTO LTDA');
    expect(r.brand).toBe('Pluggy Brasil');
    expect(r.category).toBe('other');
  });

  it('strips LTDA + title-cases unknown restaurant', () => {
    const { brand, category } = mapMerchant({
      description: 'RESTAURANTE SOLAR DO BAIRRO LTDA',
    });
    expect(brand).toBe('Restaurante Solar do Bairro');
    expect(category).toBe('other');
  });

  it('strips payment processor prefix (PAGSEGURO)', () => {
    const { brand } = mapMerchant({ description: 'PAGSEGURO BARBEARIA VINTAGE LTDA' });
    expect(brand).toBe('Barbearia Vintage');
  });

  it('strips CNPJ digit blobs', () => {
    const { brand } = mapMerchant({ description: 'MERCADO CENTRAL 12345678000199' });
    expect(brand).toBe('Mercado Central');
  });
});

describe('mapMerchant — known RULES still win', () => {
  it('Uber always resolves via RULES not fallback', () => {
    const r = mapMerchant({ merchant: { name: 'Uber BV *TRIP HELP.UBER.COM' } });
    expect(r.brand).toBe('Uber');
    expect(r.category).toBe('transport');
  });

  it('Netflix description resolves via RULES', () => {
    const r = mapMerchant({ description: 'NETFLIX.COM 31499' });
    expect(r.brand).toBe('Netflix');
    expect(r.category).toBe('streaming');
  });

  it('PIX transfer category preserved', () => {
    const r = mapMerchant({ description: 'PIX Recebido João Silva' });
    expect(r.brand).toBe('PIX');
    expect(r.category).toBe('transfer');
  });
});
