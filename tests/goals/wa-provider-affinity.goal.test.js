/**
 * GOAL: WhatsApp messages leave from the number the user actually writes to.
 * ===========================================================================
 * Shipped: provider-affinity fix (2026-07-13), after a live incident where a
 * cron delivery left from a different provider/number than the user's twin
 * thread and their yes/skip reply went into the void — while a 3-week streak
 * of Kapso 422s ("outside the 24-hour window") stayed invisible because
 * delivered=true is set when ANY channel succeeds.
 *
 * The invariant a user would feel break:
 *   1. Inbound provenance maps to the right send provider (deriveWaProvider) —
 *      the pipeline records this as preferences.wa_provider and every reply
 *      and cron delivery routes by it.
 *   2. The 24h-window rejection stays classifiable (isServiceWindowError) so
 *      channel failures are attributed, never silently masked.
 */
process.env.SUPABASE_URL ||= 'https://goals-stub.supabase.co';
process.env.SUPABASE_ANON_KEY ||= 'goals-stub-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'goals-stub-service-role-key';

import { describe, it, expect } from 'vitest';

const { deriveWaProvider, isServiceWindowError } = await import(
  '../../api/services/whatsappService.js'
);

describe('goal: WA provider affinity', () => {
  it('maps every webhook route family to its send provider', () => {
    expect(deriveWaProvider('kapso_v2')).toBe('kapso');
    expect(deriveWaProvider('meta_native')).toBe('kapso');
    expect(deriveWaProvider('zapi_text')).toBe('zapi');
    expect(deriveWaProvider('evolution_text')).toBe('evolution');
  });

  it('unknown provenance never invents a provider (falls back to default chain)', () => {
    expect(deriveWaProvider('telegram')).toBe(null);
    expect(deriveWaProvider(undefined)).toBe(null);
    expect(deriveWaProvider('')).toBe(null);
  });

  it('the 24h service-window rejection stays classifiable', () => {
    expect(isServiceWindowError('Cannot send non-template messages outside the 24-hour window.')).toBe(true);
    expect(isServiceWindowError('Authentication Error')).toBe(false);
  });
});
