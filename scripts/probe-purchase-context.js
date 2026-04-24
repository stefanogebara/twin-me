#!/usr/bin/env node
/**
 * End-to-end smoke test of the WhatsApp pre-purchase flow.
 * Run: node scripts/probe-purchase-context.js ["message"] [userId]
 *
 * Default message: "vou comprar um iFood de R$60"
 * Default userId: Stefano
 *
 * Does NOT send WhatsApp. Just proves context + LLM round-trip work.
 */
import 'dotenv/config';
import { buildPurchaseContext } from '../api/services/purchaseContextBuilder.js';
import { generatePurchaseReflection } from '../api/services/purchaseReflection.js';

const STEFANO = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const DEFAULT_MSG = 'vou comprar um iFood de R$60';

async function main() {
  const message = process.argv[2] || DEFAULT_MSG;
  const userId = process.argv[3] || STEFANO;

  console.log(`User:    ${userId}`);
  console.log(`Message: "${message}"\n`);

  console.log('Building context...');
  const ctx = await buildPurchaseContext(userId);
  console.log(`  Moment:   ${ctx.moment.day_of_week} ${ctx.moment.band} (${ctx.moment.hour}h, ${ctx.moment.is_weekend ? 'weekend' : 'weekday'}, tz ${ctx.moment.timezone})`);
  console.log(`  Music:    ${ctx.music.available ? `${ctx.music.track_count} tracks in window${ctx.music.stale ? ` (SYNC ${ctx.music.age_hours}h STALE)` : ''}${ctx.music.avg_popularity != null ? `, avg pop ${ctx.music.avg_popularity}/100` : ''}` : `unavailable`}`);
  console.log(`  Schedule: ${ctx.schedule.available ? `${ctx.schedule.past_count} past + ${ctx.schedule.upcoming_count} upcoming` : 'unavailable'}`);
  console.log(`  Latency:  ${ctx.elapsed_ms}ms`);

  console.log('\nGenerating reflection...');
  const refl = await generatePurchaseReflection(ctx, message);
  console.log(`  Lang:     ${refl.lang}`);
  console.log(`  Model:    ${refl.model}`);
  console.log(`  Tokens:   ${refl.usage?.total_tokens || '?'}`);
  console.log(`  Cost:     $${(refl.cost || 0).toFixed(5)}`);
  console.log(`  Latency:  ${refl.elapsed_ms}ms`);

  console.log('\n=========== REFLECTION ===========');
  console.log(refl.text);
  console.log('==================================\n');
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
