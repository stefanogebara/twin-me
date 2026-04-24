#!/usr/bin/env node
/**
 * Smoke-test buildPurchaseContext against Stefano's real user_id.
 * Run: node scripts/test-purchase-context.js
 *
 * Prints the snapshot to stdout. No side effects. Deleted after Phase ships
 * or promoted to a route if we want an admin probe endpoint.
 */
import 'dotenv/config';
import { buildPurchaseContext } from '../api/services/purchaseContextBuilder.js';

const STEFANO = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

async function main() {
  const userId = process.argv[2] || STEFANO;
  console.log(`Building purchase context for ${userId}...\n`);

  const ctx = await buildPurchaseContext(userId);

  console.log(JSON.stringify(ctx, null, 2));
  console.log('\n---');
  console.log(`Biology:  ${ctx.biology.available ? `recovery ${ctx.biology.recovery_score}, HRV ${ctx.biology.hrv_ms}ms (${ctx.biology.age_hours}h old${ctx.biology.stale ? ', STALE' : ''})` : `unavailable (${ctx.biology.reason})`}`);
  console.log(`Music:    ${ctx.music.available ? `${ctx.music.track_count} tracks in last ${ctx.music.window_hours}h (sync ${ctx.music.age_hours}h old${ctx.music.stale ? ', STALE' : ''})` : `unavailable (${ctx.music.reason})`}`);
  console.log(`Schedule: ${ctx.schedule.available ? `${ctx.schedule.past_count} past + ${ctx.schedule.upcoming_count} upcoming in window` : `unavailable (${ctx.schedule.reason})`}`);
  console.log(`Latency:  ${ctx.elapsed_ms}ms`);
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
