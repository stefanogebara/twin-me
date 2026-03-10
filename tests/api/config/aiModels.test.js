import { describe, it, expect } from 'vitest';
import {
  TIER_CHAT,
  TIER_ANALYSIS,
  TIER_EXTRACTION,
  OPENROUTER_MODELS,
  MODEL_PRICING,
  CACHE_TTL_BY_TIER,
} from '../../../api/config/aiModels.js';

describe('Tier constants', () => {
  it('are unique strings', () => {
    const tiers = [TIER_CHAT, TIER_ANALYSIS, TIER_EXTRACTION];
    expect(new Set(tiers).size).toBe(3);
    tiers.forEach(t => expect(typeof t).toBe('string'));
  });
});

describe('OPENROUTER_MODELS', () => {
  it('has an entry for each tier', () => {
    expect(OPENROUTER_MODELS[TIER_CHAT]).toBeDefined();
    expect(OPENROUTER_MODELS[TIER_ANALYSIS]).toBeDefined();
    expect(OPENROUTER_MODELS[TIER_EXTRACTION]).toBeDefined();
  });

  it('all required model ids are non-empty strings (finetuned may be null)', () => {
    const requiredTiers = [TIER_CHAT, TIER_ANALYSIS, TIER_EXTRACTION];
    requiredTiers.forEach(tier => {
      const model = OPENROUTER_MODELS[tier];
      expect(typeof model).toBe('string');
      expect(model.length).toBeGreaterThan(0);
    });
  });

  it('chat tier uses claude sonnet', () => {
    expect(OPENROUTER_MODELS[TIER_CHAT]).toContain('claude');
  });
});

describe('MODEL_PRICING', () => {
  it('has a default fallback', () => {
    expect(MODEL_PRICING.default).toBeDefined();
    expect(MODEL_PRICING.default.input).toBeGreaterThan(0);
    expect(MODEL_PRICING.default.output).toBeGreaterThan(0);
  });

  it('all entries have input, output, cachedInput', () => {
    for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
      expect(pricing.input, `${model}.input`).toBeGreaterThan(0);
      expect(pricing.output, `${model}.output`).toBeGreaterThan(0);
      expect(pricing.cachedInput, `${model}.cachedInput`).toBeGreaterThanOrEqual(0);
    }
  });

  it('cachedInput is cheaper than regular input', () => {
    for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
      expect(pricing.cachedInput, `${model} cachedInput <= input`).toBeLessThanOrEqual(pricing.input);
    }
  });
});

describe('CACHE_TTL_BY_TIER', () => {
  it('chat tier is never cached (TTL=0)', () => {
    expect(CACHE_TTL_BY_TIER[TIER_CHAT]).toBe(0);
  });

  it('analysis and extraction have positive TTLs', () => {
    expect(CACHE_TTL_BY_TIER[TIER_ANALYSIS]).toBeGreaterThan(0);
    expect(CACHE_TTL_BY_TIER[TIER_EXTRACTION]).toBeGreaterThan(0);
  });

  it('extraction TTL >= analysis TTL', () => {
    expect(CACHE_TTL_BY_TIER[TIER_EXTRACTION]).toBeGreaterThanOrEqual(
      CACHE_TTL_BY_TIER[TIER_ANALYSIS]
    );
  });
});
