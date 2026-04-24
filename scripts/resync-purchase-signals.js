#!/usr/bin/env node
/**
 * Force a fresh extraction of the platforms the purchase-bot depends on.
 * Runs on demand — NOT a cron. Call when a test user's data looks stale.
 *
 * Usage: node scripts/resync-purchase-signals.js [userId]
 * Default userId: Stefano
 */
import 'dotenv/config';
import extractionOrchestrator from '../api/services/extractionOrchestrator.js';

const STEFANO = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const PLATFORMS = ['spotify', 'google_calendar'];

async function main() {
  const userId = process.argv[2] || STEFANO;
  console.log(`Force-resyncing for ${userId}...\n`);

  for (const platform of PLATFORMS) {
    const t0 = Date.now();
    console.log(`[${platform}] starting...`);
    try {
      const result = await extractionOrchestrator.extractPlatform(userId, platform);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const summary = result?.success
        ? `OK (${result.observations?.length ?? result.observationCount ?? '?'} observations)`
        : `FAIL: ${result?.error || 'unknown'}`;
      console.log(`[${platform}] ${summary} — ${elapsed}s`);
    } catch (err) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[${platform}] THREW: ${err.message} — ${elapsed}s`);
    }
  }

  console.log('\nDone. Re-run: node scripts/probe-purchase-context.js');
}

main().catch(err => { console.error(err); process.exit(1); });
