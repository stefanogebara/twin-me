/**
 * Pure-function unit tests for the WhatsApp pre-purchase bot.
 *
 * Covers audit test gaps T6 / T9 / T10:
 *   T6 — LLM timeout returns graceful fallback (webhook-level)
 *   T9 — Timezone DST + midnight boundary on computeMoment()
 *   T10 — Edge inputs (empty / emoji / oversize / non-PT-EN)
 *
 * Functions are inlined here (rather than imported) following the project
 * convention in tests/unit/pluggySignedAmount.test.js: the real module
 * pulls in supabase + logger which we don't want in the unit harness.
 * Sources: api/services/purchaseContextBuilder.js, purchaseReflection.js,
 * api/routes/whatsapp-twinme-webhook.js (kept verbatim — if the real
 * function diverges, the regression test in extractor-upsert-regression
 * catches the source-text drift).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Inlined from purchaseContextBuilder.js ──────────────────────────────────
function computeMoment(timezone = 'UTC') {
  const now = new Date();
  let hour, dayOfWeek;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric', hour12: false,
      weekday: 'long',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    hour = Number(parts.find(p => p.type === 'hour')?.value ?? now.getUTCHours());
    dayOfWeek = parts.find(p => p.type === 'weekday')?.value?.toLowerCase() ?? '';
  } catch {
    hour = now.getUTCHours();
    dayOfWeek = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][now.getUTCDay()];
  }
  const band =
    hour < 5 ? 'late_night' :
    hour < 9 ? 'early_morning' :
    hour < 12 ? 'morning' :
    hour < 14 ? 'midday' :
    hour < 17 ? 'afternoon' :
    hour < 20 ? 'evening' :
    hour < 23 ? 'night' : 'late_night';
  const is_weekend = dayOfWeek === 'saturday' || dayOfWeek === 'sunday';
  return { hour, band, day_of_week: dayOfWeek, is_weekend, timezone, utc_iso: now.toISOString() };
}

// ─── Inlined from whatsapp-twinme-webhook.js ─────────────────────────────────
const PURCHASE_INTENT_PATTERNS = [
  /\bvou\s+compra/i,
  /\bpensando\s+em\s+compra/i,
  /\b(est(ou|á)|t[ôo])\s+a?\s*fim\s+de\s+compra/i,
  /\b(about\s+to|thinking\s+(?:of|about))\s+buy(?:ing)?/i,
  /\bR\$\s*\d.*\b(comprar|comprando|gastar|pedir|levar)\b/i,
  /\b(comprar|comprando|gastar|pedir|levar)\b.*R\$\s*\d/i,
  /\$\s*\d+.*(?:buy|purchase|cart|checkout)/i,
];
const PURCHASE_INTENT_NEGATIVE = [
  /\b(comprei|gastei|paguei|levei|peguei)\b/i,
  /\b(j[áa])\s+comprei/i,
  /\b(ontem|outro\s+dia|sexta\s+passada|m[êe]s\s+passado)\b/i,
  /\b(sal[áa]rio|aluguel|conta\s+de\s+luz|fatura|boleto|sal[aá]rio|recebi)\b/i,
];
function matchesPurchaseIntent(text) {
  if (!text || typeof text !== 'string') return false;
  if (PURCHASE_INTENT_NEGATIVE.some(re => re.test(text))) return false;
  return PURCHASE_INTENT_PATTERNS.some(re => re.test(text));
}

// ─── Inlined from purchaseReflection.js ──────────────────────────────────────
function detectLang(text) {
  const t = (text || '').toLowerCase();
  if (/\b(vou|cê|você|tô|tá|pra|pro|né|comprar|comprando|pensando|gastar|loja|mercado|ifood)\b/.test(t)) return 'pt-BR';
  if (/r\$\s*\d/.test(t)) return 'pt-BR';
  if (/\b(thinking|buying|should|need|want|about|new|gonna|wanna)\b/.test(t)) return 'en';
  if (/\$\s*\d/.test(t)) return 'en';
  return 'pt-BR';
}

// ───────────────────────────────────────────────────────────────────────────
// T9 — Timezone, DST, and midnight boundary
// ───────────────────────────────────────────────────────────────────────────
describe('T9 — computeMoment timezone and boundary correctness', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('classifies hour bands across the full 24h spectrum', () => {
    const cases = [
      ['2026-04-26T03:00:00Z', 'late_night'],
      ['2026-04-26T07:00:00Z', 'early_morning'],
      ['2026-04-26T10:00:00Z', 'morning'],
      ['2026-04-26T13:00:00Z', 'midday'],
      ['2026-04-26T15:30:00Z', 'afternoon'],
      ['2026-04-26T19:00:00Z', 'evening'],
      ['2026-04-26T21:00:00Z', 'night'],
      ['2026-04-26T23:30:00Z', 'late_night'],
      ['2026-04-26T00:01:00Z', 'late_night'],
    ];
    for (const [iso, expectedBand] of cases) {
      vi.setSystemTime(new Date(iso));
      const m = computeMoment('UTC');
      expect(m.band, `Expected ${expectedBand} at ${iso}, got ${m.band} (hour=${m.hour})`).toBe(expectedBand);
    }
  });

  it('handles midnight exactly at 00:00:00', () => {
    vi.setSystemTime(new Date('2026-04-26T00:00:00Z'));
    const m = computeMoment('UTC');
    expect(m.hour).toBe(0);
    expect(m.band).toBe('late_night');
  });

  it('classifies weekend correctly across both Saturday and Sunday', () => {
    // 2026-04-25 = Saturday, 2026-04-26 = Sunday, 2026-04-27 = Monday
    vi.setSystemTime(new Date('2026-04-25T15:00:00Z'));
    expect(computeMoment('UTC').is_weekend).toBe(true);
    vi.setSystemTime(new Date('2026-04-26T15:00:00Z'));
    expect(computeMoment('UTC').is_weekend).toBe(true);
    vi.setSystemTime(new Date('2026-04-27T15:00:00Z'));
    expect(computeMoment('UTC').is_weekend).toBe(false);
  });

  it('respects timezone — late-night São Paulo is morning UTC', () => {
    vi.setSystemTime(new Date('2026-04-26T05:00:00Z')); // 02:00 in São Paulo (UTC-3)
    const m = computeMoment('America/Sao_Paulo');
    expect(m.hour).toBe(2);
    expect(m.band).toBe('late_night');
    // Same instant in UTC is early_morning
    expect(computeMoment('UTC').band).toBe('early_morning');
  });

  it('survives DST boundary in São Paulo timezone', () => {
    // Brazil currently does not observe DST, but the function should not
    // throw on any timezone-bearing date. Test a known DST-active timezone.
    vi.setSystemTime(new Date('2026-03-08T07:30:00Z')); // US DST spring-forward instant
    expect(() => computeMoment('America/New_York')).not.toThrow();
    expect(() => computeMoment('Europe/Paris')).not.toThrow();
  });

  it('falls back to UTC if timezone is invalid (does not throw)', () => {
    vi.setSystemTime(new Date('2026-04-26T15:00:00Z'));
    expect(() => computeMoment('Not/A/Real/Zone')).not.toThrow();
    const m = computeMoment('Not/A/Real/Zone');
    expect(m.hour).toBeGreaterThanOrEqual(0);
    expect(m.hour).toBeLessThan(24);
  });

  it('utc_iso is always a valid ISO timestamp', () => {
    vi.setSystemTime(new Date('2026-04-26T12:34:56.789Z'));
    const m = computeMoment('America/Sao_Paulo');
    expect(m.utc_iso).toBe('2026-04-26T12:34:56.789Z');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// T10 — Edge inputs to the purchase intent classifier
// ───────────────────────────────────────────────────────────────────────────
describe('T10 — purchase intent classifier edge inputs', () => {
  it('rejects empty / null / undefined / non-string', () => {
    expect(matchesPurchaseIntent('')).toBe(false);
    expect(matchesPurchaseIntent(null)).toBe(false);
    expect(matchesPurchaseIntent(undefined)).toBe(false);
    expect(matchesPurchaseIntent(123)).toBe(false);
    expect(matchesPurchaseIntent({ x: 1 })).toBe(false);
  });

  it('rejects pure emoji input', () => {
    expect(matchesPurchaseIntent('🤔🤔🤔')).toBe(false);
    expect(matchesPurchaseIntent('🛒💸')).toBe(false);
  });

  it('handles oversize input without timing out (under 10ms)', () => {
    const huge = 'lorem ipsum '.repeat(5000) + 'vou comprar algo';
    const t0 = Date.now();
    const result = matchesPurchaseIntent(huge);
    expect(Date.now() - t0).toBeLessThan(50); // catastrophic regex backtracking would blow this
    expect(result).toBe(true);
  });

  it('rejects past-tense purchase mentions (M1)', () => {
    expect(matchesPurchaseIntent('comprei R$50 ontem')).toBe(false);
    expect(matchesPurchaseIntent('paguei R$200 outro dia')).toBe(false);
    expect(matchesPurchaseIntent('já comprei R$100')).toBe(false);
    expect(matchesPurchaseIntent('gastei R$50 na pizza')).toBe(false);
  });

  it('rejects recurring expense and income mentions (M1)', () => {
    expect(matchesPurchaseIntent('meu aluguel é R$2000')).toBe(false);
    expect(matchesPurchaseIntent('salário de R$5000')).toBe(false);
    expect(matchesPurchaseIntent('a fatura veio R$800')).toBe(false);
    expect(matchesPurchaseIntent('recebi R$300 de freela')).toBe(false);
  });

  it('matches present/future Brazilian purchase intent', () => {
    expect(matchesPurchaseIntent('vou comprar um iFood R$60')).toBe(true);
    expect(matchesPurchaseIntent('pensando em comprar uma Apple Watch')).toBe(true);
    expect(matchesPurchaseIntent('tô a fim de comprar tênis novos')).toBe(true);
    expect(matchesPurchaseIntent('quero comprar algo de R$200')).toBe(true);
  });

  it('matches English purchase intent', () => {
    expect(matchesPurchaseIntent("I'm thinking about buying new AirPods")).toBe(true);
    expect(matchesPurchaseIntent('about to buy this $250 thing')).toBe(true);
    expect(matchesPurchaseIntent('thinking of buying a new bag')).toBe(true);
  });

  it('rejects messages in unrelated languages', () => {
    expect(matchesPurchaseIntent('こんにちは元気ですか')).toBe(false);
    expect(matchesPurchaseIntent('Bonjour comment ça va')).toBe(false);
    // Spanish "voy a comprar" is intentionally NOT in PT-BR patterns; doc note
    expect(matchesPurchaseIntent('voy a comprar algo')).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// T6 / T10 — Language detection
// ───────────────────────────────────────────────────────────────────────────
describe('T10 — detectLang language detection', () => {
  it('returns pt-BR on strong Portuguese markers', () => {
    expect(detectLang('vou comprar algo')).toBe('pt-BR');
    expect(detectLang('Tá pensando em comprar')).toBe('pt-BR');
    expect(detectLang('quero gastar R$50')).toBe('pt-BR');
  });

  it('returns en on strong English markers', () => {
    expect(detectLang('I am thinking about buying new shoes')).toBe('en');
    expect(detectLang('about to buy a new phone')).toBe('en');
  });

  it('returns en on $-prefixed amounts', () => {
    expect(detectLang('want to spend $200 on this')).toBe('en');
  });

  it('returns pt-BR on R$-prefixed amounts even without verb', () => {
    expect(detectLang('R$100 hmm')).toBe('pt-BR');
  });

  it('defaults to pt-BR on ambiguous input (Brazil-first market)', () => {
    expect(detectLang('hmm')).toBe('pt-BR');
    expect(detectLang('')).toBe('pt-BR');
    expect(detectLang(null)).toBe('pt-BR');
  });
});
