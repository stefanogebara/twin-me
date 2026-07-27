/**
 * Retire stale platform snapshots that were written before the Phase 0 fixes.
 *
 * The twin kept asserting months-old readings as current ("40,000 unread
 * emails"). The write-path fixes stop NEW snapshots accumulating, but they do
 * nothing about the rows already in the table, which have to be swept here.
 *
 * Scale when this was written: 4,653 of 17,330 platform_data rows (27%) were
 * snapshot readings, collapsing to just 27 distinct (user, metric) pairs —
 * "Reads 8% of incoming email (...)" alone had 1,386 copies. The absolute
 * templates are still being emitted daily, so the value changed every cycle and
 * the digit-sensitive content hash never matched; every reading inserted a new
 * row and none of the older ones was ever retired.
 *
 * Four steps, in order:
 *   1. DEMOTE   every snapshot-metric platform_data row to importance 4, which
 *               is the ceiling Tier 2 archival filters on. They were pinned at
 *               the platform_data floor of 6 and so were unreachable.
 *   2. ARCHIVE  superseded readings of the same metric — keep only the newest
 *               per (user, metric shape). Rows are moved to user_memories_archive
 *               exactly as the Tier 2 cron does, never hard-deleted.
 *   3. REPORT   reflections that launder a stale count into prose. These are
 *               listed, and demoted below the Tier 6 archival ceiling only with
 *               --demote-reflections, because the classification is a heuristic
 *               over free text rather than a template match.
 *   4. INVALIDATE derived state (wiki pages, twin summaries) so the copies baked
 *               into them recompile from the cleaned evidence. Both are caches
 *               with rebuild paths; the wiki additionally suppresses the twin
 *               summary while present, so a stale page would otherwise survive
 *               everything above.
 *
 * Safe to re-run: every step is idempotent and skips rows already handled.
 *
 * Usage:
 *   node scripts/backfill-stale-snapshot-memories.js                 # dry run
 *   node scripts/backfill-stale-snapshot-memories.js --write         # apply
 *   node scripts/backfill-stale-snapshot-memories.js --write --demote-reflections
 *   node scripts/backfill-stale-snapshot-memories.js --user <uuid>   # scope to one user
 *
 * Background: .claude/plans/2026-07-27-optmem-brain/README.md (Phase 0.6)
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { isSnapshotMetric, stripDigitsForDedup, SNAPSHOT_METRIC_SCORE } from '../api/services/snapshotMetrics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// .env.production is the convention for backfills here, but plain .env is what
// dev keeps current; both point at the same project.
const envPath = ['../.env.production', '../.env']
  .map(p => path.resolve(__dirname, p))
  .find(p => fs.existsSync(p));
dotenv.config({ path: envPath });

const DRY_RUN = !process.argv.includes('--write');
const DEMOTE_REFLECTIONS = process.argv.includes('--demote-reflections');
const userFlagIndex = process.argv.indexOf('--user');
const ONLY_USER = userFlagIndex !== -1 ? process.argv[userFlagIndex + 1] : null;

const PAGE_SIZE = 1000;

const INBOX_VOCAB = /\b(unread|inbox|mailbox|emails?)\b/i;

/** Numbers with thousand separators, or bare runs of 4+ digits. */
const FIGURE = /\b(\d{1,3}(?:[,.]\d{3})+|\d{4,})\b/g;

/**
 * True when the text quotes a large inbox figure — i.e. launders a snapshot
 * reading into prose that will still be asserted months later.
 *
 * Naively matching "any 4+ digit number near email words" flags every dated
 * summary, because a calendar year is four digits: "My email behavior on
 * 2026-06-05" is a correctly-dated observation, not a stale count. Years are
 * excluded, the figure must be >= 1000, and the inbox vocabulary has to sit
 * near THAT figure rather than anywhere in the document.
 */
function quotesStaleInboxCount(text) {
  if (!text) return false;
  const s = String(text);
  FIGURE.lastIndex = 0;
  let m;
  while ((m = FIGURE.exec(s)) !== null) {
    const raw = m[1];
    if (/^(19|20)\d{2}$/.test(raw)) continue;            // calendar year
    const value = Number(raw.replace(/[,.]/g, ''));
    if (!Number.isFinite(value) || value < 1000) continue;
    const near = s.slice(Math.max(0, m.index - 60), m.index + raw.length + 60);
    if (INBOX_VOCAB.test(near)) return true;
  }
  return false;
}

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function fail(msg) {
  console.error(`\nERROR: ${msg}`);
  process.exit(1);
}

/** Page through a table so the sweep is not silently capped at 1000 rows. */
async function fetchAll(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) fail(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

function ageDays(ts) {
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000);
}

async function main() {
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    fail('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  }

  console.log(`env:  ${envPath}`);
  console.log(`mode: ${DRY_RUN ? 'DRY RUN — no writes (pass --write to apply)' : 'WRITE'}`);
  if (ONLY_USER) console.log(`user: ${ONLY_USER}`);
  console.log('');

  // ── Step 1: find and demote snapshot-metric observations ──────────────────
  const platformRows = await fetchAll(() => {
    let q = sb.from('user_memories')
      .select('id, user_id, content, importance_score, retrieval_count, created_at')
      .eq('memory_type', 'platform_data')
      .order('created_at', { ascending: false });
    if (ONLY_USER) q = q.eq('user_id', ONLY_USER);
    return q;
  });

  const snapshots = platformRows.filter(r => isSnapshotMetric(r.content));
  console.log(`Scanned ${platformRows.length} platform_data rows, ${snapshots.length} are snapshot metrics.\n`);

  if (snapshots.length === 0) {
    console.log('Nothing to sweep. (Snapshot templates may already have been retired upstream.)');
  } else {
    const byShape = new Map();
    for (const r of snapshots) {
      const key = `${r.user_id}::${stripDigitsForDedup(r.content)}`;
      if (!byShape.has(key)) byShape.set(key, []);
      byShape.get(key).push(r);
    }

    console.log(`Distinct (user, metric) groups: ${byShape.size}`);
    console.log('Sample of what will be swept:');
    for (const [, group] of [...byShape.entries()].slice(0, 8)) {
      const newest = group[0];
      console.log(`  ${String(group.length).padStart(4)}x  imp=${newest.importance_score}  ` +
        `newest ${ageDays(newest.created_at)}d old  |  ${newest.content.slice(0, 72)}`);
    }
    console.log('');

    const toDemote = snapshots.filter(r => r.importance_score > SNAPSHOT_METRIC_SCORE);
    const toArchive = [...byShape.values()].flatMap(g => g.slice(1)); // keep newest per group

    console.log(`Step 1 DEMOTE  : ${toDemote.length} rows -> importance ${SNAPSHOT_METRIC_SCORE}`);
    console.log(`Step 2 ARCHIVE : ${toArchive.length} superseded readings (newest of each metric kept)`);

    if (!DRY_RUN) {
      // Archive first: those rows do not need demoting once they are gone.
      const archiveIds = new Set(toArchive.map(r => r.id));
      if (toArchive.length) {
        const ids = [...archiveIds];
        let done = 0;
        for (let i = 0; i < ids.length; i += 200) {
          const batch = ids.slice(i, i + 200);
          // Mirror the Tier 2 cron's column list exactly — user_memories_archive
          // has no retrieval_count/confidence/decay_rate, so select('*') here
          // would make the insert fail.
          const { data: full, error: selErr } = await sb.from('user_memories')
            .select('id, user_id, content, memory_type, metadata, importance_score, created_at, last_accessed_at')
            .in('id', batch);
          if (selErr) fail(`archive fetch failed: ${selErr.message}`);
          if (!full?.length) continue;

          const { error: insErr } = await sb.from('user_memories_archive').insert(
            full.map(r => ({
              ...r,
              archived_at: new Date().toISOString(),
              archive_reason: 'phase0_stale_snapshot_superseded',
            })));
          if (insErr) fail(`archive insert failed: ${insErr.message}`);

          const { error: delErr } = await sb.from('user_memories')
            .delete().in('id', full.map(r => r.id));
          if (delErr) fail(`archive delete failed: ${delErr.message}`);

          done += full.length;
          process.stdout.write(`\r  archived ${done}/${ids.length}`);
        }
        console.log('');
      }

      const demoteIds = toDemote.filter(r => !archiveIds.has(r.id)).map(r => r.id);
      for (let i = 0; i < demoteIds.length; i += 200) {
        const batch = demoteIds.slice(i, i + 200);
        const { error } = await sb.from('user_memories')
          .update({ importance_score: SNAPSHOT_METRIC_SCORE })
          .in('id', batch);
        if (error) fail(`demote failed: ${error.message}`);
        process.stdout.write(`\r  demoted ${Math.min(i + 200, demoteIds.length)}/${demoteIds.length}`);
      }
      if (demoteIds.length) console.log('');
    }
  }

  // ── Step 3: reflections that launder a stale count into prose ─────────────
  const reflections = await fetchAll(() => {
    let q = sb.from('user_memories')
      .select('id, user_id, content, importance_score, created_at')
      .eq('memory_type', 'reflection')
      .order('created_at', { ascending: false });
    if (ONLY_USER) q = q.eq('user_id', ONLY_USER);
    return q;
  });

  const laundered = reflections.filter(r =>
    quotesStaleInboxCount(r.content));

  console.log(`\nStep 3 REFLECTIONS: ${laundered.length} of ${reflections.length} quote a large inbox figure.`);
  for (const r of laundered.slice(0, 10)) {
    console.log(`  imp=${r.importance_score} ${ageDays(r.created_at)}d  |  ${r.content.slice(0, 96).replace(/\s+/g, ' ')}`);
  }
  if (laundered.length > 10) console.log(`  ... and ${laundered.length - 10} more`);

  if (laundered.length && !DEMOTE_REFLECTIONS) {
    console.log('  (listed only — pass --demote-reflections to drop these to importance 7,');
    console.log('   below the Tier 6 archival ceiling of 8. Review the list above first.)');
  }
  if (laundered.length && DEMOTE_REFLECTIONS && !DRY_RUN) {
    const ids = laundered.filter(r => r.importance_score >= 8).map(r => r.id);
    for (let i = 0; i < ids.length; i += 200) {
      const batch = ids.slice(i, i + 200);
      const { error } = await sb.from('user_memories').update({ importance_score: 7 }).in('id', batch);
      if (error) fail(`reflection demote failed: ${error.message}`);
    }
    console.log(`  demoted ${ids.length} reflections to importance 7`);
  }

  // ── Step 4: invalidate derived state so it rebuilds from cleaned evidence ──
  const wikiRows = await fetchAll(() => {
    let q = sb.from('user_wiki_pages').select('id, user_id, domain, content_md');
    if (ONLY_USER) q = q.eq('user_id', ONLY_USER);
    return q;
  });
  const staleWiki = wikiRows.filter(p =>
    quotesStaleInboxCount(p.content_md));

  const summaryRows = await fetchAll(() => {
    let q = sb.from('twin_summaries').select('user_id');
    if (ONLY_USER) q = q.eq('user_id', ONLY_USER);
    return q;
  });

  console.log(`\nStep 4 DERIVED STATE:`);
  console.log(`  wiki pages quoting a stale figure : ${staleWiki.length} of ${wikiRows.length}`);
  console.log(`  twin summaries to invalidate      : ${summaryRows.length}`);
  console.log('  (both are caches with rebuild paths — the wiki also suppresses the twin');
  console.log('   summary while present, so a stale page survives every step above)');

  if (!DRY_RUN) {
    if (staleWiki.length) {
      const { error } = await sb.from('user_wiki_pages').delete().in('id', staleWiki.map(p => p.id));
      if (error) fail(`wiki delete failed: ${error.message}`);
      console.log(`  deleted ${staleWiki.length} wiki pages (recompile on next ingestion cycle)`);
    }
    const summaryUsers = [...new Set(summaryRows.map(r => r.user_id))];
    if (summaryUsers.length) {
      const { error } = await sb.from('twin_summaries').delete().in('user_id', summaryUsers);
      if (error) fail(`twin_summaries delete failed: ${error.message}`);
      console.log(`  cleared ${summaryUsers.length} twin summaries (regenerate within 4h TTL)`);
    }
  }

  console.log(`\n${DRY_RUN ? 'DRY RUN complete — nothing was written.' : 'Backfill complete.'}`);
  if (DRY_RUN) console.log('Re-run with --write to apply.');
}

main().catch(err => fail(err.stack || err.message));
