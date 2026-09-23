import { createHash } from 'node:crypto';
import { z } from 'zod';
import { supabaseAdmin } from '../database.js';

/** Old Android treats every <500 response as delivered. Persist unknown-time evidence
 * before acknowledging it, but never invent a payment timestamp or ledger amount. */
export async function holdUndatedCapture(userId, body) {
  z.string().uuid().parse(userId);
  const evidence = Object.fromEntries(['text', 'merchant', 'amount', 'card', 'direction', 'source', 'eventId']
    .filter((key) => body[key] !== undefined)
    .map((key) => [key, String(body[key]).slice(0, key === 'text' ? 2000 : 200)]));
  const sourceRef = `undated-capture:${createHash('sha256').update(JSON.stringify(evidence)).digest('hex')}`;
  const { error } = await supabaseAdmin.from('money_notices').upsert({
    user_id: userId, source_ref: sourceRef, kind: 'capture_needs_update',
    evidence: { ...evidence, reason: 'Original payment time was not supplied; replay and multiplicity are unknown.' },
  }, { onConflict: 'user_id,source_ref' });
  if (error) throw new Error('Could not preserve legacy capture');
}
