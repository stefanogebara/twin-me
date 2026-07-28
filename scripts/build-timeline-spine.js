/**
 * Build the temporal spine for a user (Phase 3).
 *
 * The spine is the fix for what Phase 2 measured: retrieval picks candidates by
 * vector distance alone, so recent-but-not-semantically-near memories are
 * unreachable — "what have I been doing this week?" returned 30 conversations,
 * none younger than 49 days, while 889 platform rows from the last 7 days sat
 * unretrieved. The spine is selected by TIME instead, so the recent window is
 * always in context regardless of what was asked.
 *
 * In production the tree is kept warm incrementally off observation ingestion
 * (~1 leaf + ~1 merge per user per day, amortised — a binary tree over n leaves
 * has n-1 internal nodes). This script is for cold-starting an existing user,
 * where the whole tree has to be built at once.
 *
 * Nodes are a cache: user_memories stays the source of truth, so --rebuild
 * discards and recomputes without data loss.
 *
 * Usage:
 *   node --env-file=.env scripts/build-timeline-spine.js --user <uuid>
 *   node --env-file=.env scripts/build-timeline-spine.js --user <uuid> --rebuild
 *   node --env-file=.env scripts/build-timeline-spine.js --user <uuid> --max 40
 */

import { createClient } from '@supabase/supabase-js';
import { complete, TIER_ANALYSIS } from '../api/services/llmGateway.js';
import { buildPendingNodes, renderSpine } from '../api/services/memoryTimelineService.js';

const argv = process.argv;
const arg = (flag, fallback = null) => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const USER = arg('--user', '167c27b5-a40b-49fb-8d00-deb1b1c57f4d');
const MAX_NODES = Number(arg('--max', '40'));
const REBUILD = argv.includes('--rebuild');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let deps = { supabase, complete, tier: TIER_ANALYSIS };

async function main() {
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
    process.exit(1);
  }
  const { data: prof } = await supabase.from('users').select('timezone').eq('id', USER).maybeSingle();
  deps = { ...deps, timeZone: prof?.timezone || undefined };
  console.log(`user:    ${USER}`);
  console.log(`tz:      ${deps.timeZone || 'UTC (none stored)'}`);
  console.log(`max:     ${MAX_NODES} nodes this run`);

  if (REBUILD) {
    const { error } = await supabase.from('memory_timeline_nodes').delete().eq('user_id', USER);
    if (error) { console.error('rebuild delete failed:', error.message); process.exit(1); }
    console.log('rebuild: cleared existing nodes');
  }

  // buildPendingNodes caps each call so a cold start cannot become an unbounded
  // burst of LLM calls; loop until it stops making progress.
  let total = 0;
  const started = Date.now();
  for (let round = 1; total < MAX_NODES; round++) {
    const remaining = MAX_NODES - total;
    const { built, skipped } = await buildPendingNodes(USER, deps, {
      maxNodes: Math.min(8, remaining),
    });
    total += built;
    console.log(`  round ${String(round).padStart(2)}: built ${built}, skipped ${skipped} (total ${total})`);
    if (built === 0) break;   // nothing left to do
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const spine = await renderSpine(USER, deps);
  console.log(`\nbuilt ${total} nodes in ${elapsed}s`);
  console.log(`spine: ${spine.covered}/${spine.blocks} blocks populated\n`);
  console.log(spine.text || '(empty)');
}

main().catch(err => { console.error(err.stack || err.message); process.exit(1); });
