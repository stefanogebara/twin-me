/**
 * TwinMe Fidelity Eval — flag-vs-baseline A/B against measured ground truth
 * =========================================================================
 * Phase 3 of product-truth-review 2026-08-09: fidelity is the eval harness.
 * A candidate context feature ships only if it moves measured twin_accuracy.
 *
 * Method:
 *   1. Load the user's latest fidelity wave (their REAL battery answers —
 *      the ground truth). Read-only: this script never writes a wave.
 *   2. For each config, have the twin answer the battery N times through the
 *      PRODUCTION answering function (answerBatteryAsTwin), so the eval
 *      measures exactly what shipping would ship. `baseline` is production
 *      grounding as-is; each candidate config returns the extra context
 *      block its feature would inject (see CONFIGS below).
 *   3. Score each trial against the wave's user_answers with the PRODUCTION
 *      scoring function (scoreAnswers). Report mean/min/max per config and
 *      per-item flips.
 *
 * LLM calls run at the battery's production temperature (0.3), so trials
 * vary; N >= 3 recommended. Results append to fidelity-results.tsv.
 *
 * Usage:
 *   node twin-research/fidelity-eval.js [--user-id UUID] [--trials N] [--configs baseline,candidate]
 *
 * ── Verdict log ─────────────────────────────────────────────────────────────
 * 2026-08-11 spine vs baseline, wave 1, 5 trials/arm, cache-busted:
 *   baseline mean 0.8375 (n=4, one trial failed to parse)
 *   spine    mean 0.8025 (n=5, incl. one 0.4875 outlier and one half-battery)
 *   -> NO detectable effect. VERDICT (founder call, 2026-08-11): DELETED —
 *      per the ship-only-if-it-moves-the-score rule. The spine stack
 *      (memoryTimelineService, its ingestion build, prompt injection, the
 *      'spine' config that used to live in CONFIGS below) is one revert away
 *      if a temporal-item battery (v2) later shows measurable value.
 *      memory_timeline_nodes table data retained.
 *
 * 2026-08-11 BATTERY_VERSION 2 shipped (5 temporal-recall items, `temporal:
 * true`) — the harness now reports a temporal-subset section so temporal
 * features can be adjudicated fairly. Validation run, baseline only,
 * 5 trials against the v1 wave: mean 0.8467 min 0.8250 max 0.8750 on the
 * 20 shared items (consistent with prior runs; temporal items carry no
 * truth in a v1 wave and the script warns accordingly).
 *   -> VERDICT: temporal adjudication PENDING a fresh v2 wave. The spine
 *      re-trial the 2026-08-11 entry asked for is now gated on:
 *      (1) the user takes a v2 wave at /fidelity (only source of temporal
 *          ground truth — never synthesize user_answers),
 *      (2) revert a8b3314e to restore renderSpine + a 'spine' config here,
 *      (3) rerun baseline,spine and let the temporal subset decide.
 *
 * 2026-08-11 THE V2 RE-TRIAL (real v2 wave 1, 5 trials/arm, parser fix
 * 8e5128c5 in, spine restored from a8b3314e^ for the eval only):
 *   overall  : baseline 0.4740 (0.4600-0.4800)  spine 0.5038 (0.4900-0.5192)
 *              delta +0.0298 — small but the ranges DO NOT OVERLAP (5v5).
 *   temporal : baseline 0.0000 (0/5 items, every trial)  spine 0.1000.
 *   -> Two findings, bigger than the spine question:
 *      1. CONFIRMED, and worse than suspected: the twin is completely
 *         blind to the last two weeks. Baseline scored ZERO on all 5
 *         temporal items in all 5 trials. The v1 battery could never see
 *         this; v2 sees it instantly.
 *      2. The spine as-built is directionally right but too weak: first
 *         measurable positive effect of any context flag (+0.03 overall,
 *         non-overlapping), yet 5/16 block coverage lifts temporal recall
 *         only 0 -> 0.1. It knows time passed; it does not know WHAT
 *         happened.
 *   Note: shared-20-item accuracy vs THIS wave is ~0.59 (was 0.825 vs the
 *   Aug 3 wave) — the user's own answers moved between waves; v2 wave 2
 *   will put a self-consistency ceiling under this.
 *   -> VERDICT: the temporal-recall failure is real and measured; the
 *      spine (or a stronger recent-platform-data injection) now has a
 *      quantified target: beat baseline's 0.0000 temporal subset.
 *      Resurrection/redesign is a founder call; the eval is ready either
 *      way.
 *
 * 2026-08-11 THREE-ARM TRIAL — baseline vs spine vs digest (recent-
 * platform-data block, api/services/recentPlatformDigest.js; same v2
 * wave, 5 trials/arm, zero parse failures):
 *   overall  : baseline 0.4780 (0.46-0.49)  spine 0.4840 (0.47-0.50)
 *              digest 0.5260 (0.52-0.54) — digest's range clears both.
 *   temporal : baseline 0.0000  spine 0.0000  digest 0.2000 —
 *              digest nails recent_listening in EVERY trial (the 426
 *              Spotify events read as "familiar favorites on repeat").
 *   -> Spine's earlier +0.03 did NOT replicate (temporal back to zero);
 *      the non-overlap in the previous run was noise. Deletion stands.
 *   -> DIGEST WINS: +0.048 overall vs baseline with non-overlapping
 *      ranges, first-ever temporal-subset lift, one DB query, ~2.8k
 *      chars. Remaining temporal misses are interpretation gaps (41
 *      calendar events rendered as "bursts" not "packed"; GitHub reading
 *      as one project where the user feels scatter) — digest v2 material.
 *      Per the ship-only-if-it-moves-the-score rule, the digest is the
 *      first candidate that has EARNED production injection.
 *      -> 2026-08-12 THIS RESULT DID NOT REPLICATE. See the entry below
 *         before citing the +0.048 / 0.2000 numbers anywhere.
 *      -> SHIPPED 2026-08-12: injected into chat grounding
 *         (twinContextBuilder 'recentDigest' leg -> prompt builder block,
 *         clamped at 3k chars) and into answerBatteryAsTwin's own
 *         grounding — so eval baselines now INCLUDE the digest and the
 *         'digest' config was removed (it would double-inject).
 *
 * 2026-08-12 NON-REPLICATION — the digest's temporal win was a property of
 * one day's data, not of the code. Re-measured against the SAME v2 wave,
 * 5 trials/arm:
 *   shipped digest v1 (unchanged code)  overall 0.4613  temporal 0.0000
 *   digest v2 (spread lines, fewer items) overall 0.4700 temporal 0.0000
 *   digest v2b (spread lines, v1 items)   overall 0.4720 temporal 0.0000
 * Yesterday the same v1 code scored 0.5260 / 0.2000. Nothing about the
 * digest changed overnight — the user's platform data did. The single
 * temporal item the digest ever won (recent_listening) flipped because the
 * freshest Spotify rows now read "Discovered new artist: Brent Faiyaz",
 * so the twin answers "Hunting new music" against a truth of "Familiar
 * favorites on repeat".
 *
 * METHOD LESSON (the expensive one): 5 trials at temperature 0.3 measure
 * LLM sampling noise, which is nearly zero here — all five trials often
 * return an identical score. They do NOT measure the variance that
 * actually matters, which is DAY-TO-DAY DRIFT IN THE UNDERLYING DATA. Two
 * arms run back-to-back are comparable; an arm compared to yesterday's
 * number is not. The spine was killed and the digest was shipped on
 * single-day n=5 deltas, and BOTH have now failed to replicate. Any future
 * candidate must be measured against a same-session control arm, and a
 * claimed win should survive at least two separate days.
 *
 * [-> 2026-08-13: ALL THREE EXAMPLES IN THE PARAGRAPH BELOW WERE CHECKED
 *  AGAINST THE PLATFORM APIs AND ALL THREE ARE WRONG. IN EVERY CASE THE LOG
 *  WAS WRONG, NOT THE USER, SO THE CONCLUSION DOES NOT HOLD. The paragraph is
 *  kept verbatim as the record of what was believed; see the correction that
 *  follows it. Do not cite this paragraph.]
 *
 * WHY THE TEMPORAL ITEMS MAY BE PARTLY UNWINNABLE: for several of them the
 * platform data genuinely disagrees with the user's self-report — they call
 * a calendar "packed — commitments most days" that logs 33 events across 8
 * of 15 days; they report "many small scattered things" while GitHub shows
 * concentrated work in one repo; they report "entertainment and unwinding"
 * against 8 YouTube events tagged sports/society. Better grounding cannot
 * close a gap between felt experience and logged behavior. Before investing
 * further in retrieval, it is worth deciding whether these items measure
 * twin fidelity or measure that gap — a twin that answered from the logs
 * would be "wrong" on this battery while being more factually accurate.
 *
 * 2026-08-13 CORRECTION — all three clauses checked against their platform
 * APIs for user 167c27b5. All three are wrong, each in a different way.
 *
 * ── (1) CALENDAR ──
 * The calendar clause was measured wrong, and the conclusion drawn from it
 * ("the ingested evidence genuinely understates the calendar") is false.
 * "33 events across 8 of 15 days" counted MEMORY ROWS, not events. Measured
 * against the Google Calendar API directly, the 14 days ending 2026-08-12:
 *
 *   Google, all 6 calendars       16 events on  9 distinct days
 *   Google, owned calendars only  14 events on  9 distinct days
 *   user_memories platform_data   33 rows; 2026-08-05 is the ONLY event-day
 *                                 with no calendar memory at all
 *
 * Ingestion captured 8 of the 9 event-days. Coverage was never the problem
 * and the arms were not answering from thin evidence. The one missing day is
 * cron starvation, not filtering: MAX_USERS_PER_RUN=3 round-robin in
 * observationIngestion.js left this user unserviced for ~27h, and because the
 * fetcher only ever looked at "today", a skipped day was lost permanently.
 *
 * The self-report gap is real but smaller than claimed. The user answered
 * "12 days or more"; their own calendar says 9. So "4 to 7" was a near miss
 * and "3 or fewer" was genuinely low — the item was gradeable, not unwinnable.
 *
 * What was actually broken is the CONTENT of the rows, not their count. Three
 * bugs in observationFetchers/calendar.js, all fixed 2026-08-13:
 *
 *   (a) today's events were fetched with `timeMin: now`, so a run late in the
 *       day saw only the remainder of it. On 2026-08-04 (3 events) and
 *       2026-08-11 (1 event) the stream recorded "Calendar schedule today: no
 *       meetings or events — completely open day for time management". The
 *       log did not merely under-cover the calendar, it contradicted it, and
 *       those rows are indistinguishable from genuinely empty days.
 *   (b) 0 of 33 rows carried a date or weekday — every one said "today". A
 *       "how many days" question is unanswerable from undated strings no
 *       matter how good retrieval gets. This is the direct cause of the miss.
 *   (c) times and the day boundary were rendered in the SERVER's zone (UTC on
 *       Vercel), so a 07:45 America/Sao_Paulo appointment is stored as
 *       "10:45 AM" and the user's day ends at 21:00 local.
 *
 * ── (2) GITHUB ──
 * "GitHub shows concentrated work in one repo" is false. The events API for
 * login stefanogebara returned 291 events across ELEVEN repos:
 *
 *    93  twin-me            36  cockpit-vendas      3  midia-paga
 *    63  restaurant-ai-mcp  31  squad-checkout      2  racha
 *    55  roca                4  affaan-m/ECC        2  brandbook-builder
 *                                                   1  pauta-ai
 *                                                   1  squad-partner-hub
 *
 * The top repo is 32% of activity and five repos have 30+ events each.
 * Independently, /user/repos shows 8 distinct repos with pushed_at inside the
 * 15-day window. That IS "many small scattered things" — the user's
 * self-report was accurate and the log's characterisation was the error. Our
 * own ingested rows never supported the claim either: they name branches
 * created in brandbook-builder, squad-checkout AND twin-me.
 *
 * Caveats on those numbers: the events API caps at 300 and only reached back
 * to 2026-08-04, so this covers ~9 of the 15 days (which understates spread,
 * not overstates it), and the per-repo COMMIT tally could not be read from
 * the event payloads — event counts only.
 *
 * ── (3) YOUTUBE ──
 * "8 YouTube events tagged sports/society" rests on three broken links.
 *
 *   (i)   There is NO watch data at all. activities?mine=true returns 0 items
 *         and 0 of type "watch" — Google removed watch history from the Data
 *         API in 2016, so the "watch activity" branch in
 *         observationFetchers/youtube.js is a dead path. A self-report about
 *         WATCHING was being scored against something that is not watching.
 *   (ii)  The tags come from the LIKED-VIDEOS list, which is a lifetime
 *         archive, not recent behaviour: video publish dates run 2014-2025 and
 *         cluster in 2016-2021. The API returns no like timestamps, so the
 *         "Recently liked ..." observation label is an assumption the data
 *         does not support.
 *   (iii) topicCategories are Wikipedia SUBJECT tags, not mode-of-consumption.
 *         "Cortes do Casimito" — a Brazilian comedy reaction channel — tags as
 *         "Association football, Sport". A football-reaction comedy clip IS
 *         entertainment and unwinding. The two descriptions were never in
 *         conflict.
 *
 * The full 46-video tally also leans the user's way, not the log's: Lifestyle
 * 11, Music 7, Pop music 6, Sport 6, Association football 5, Electronic music
 * 5, Action game 5, Video game culture 5, Knowledge 4, Technology 4, Society
 * 2. The ingested "Knowledge (4), Sport (3), Technology (2)" row is computed
 * from only the top 15 (the fetcher's maxResults). Subscriptions corroborate
 * the user: CazéTV, Cortes do Casimito, Neymar Jr, Ibai, IShowSpeed, Sidemen.
 *
 * ── METHOD LESSON ──
 * "The platform data disagrees with the user" is a claim about the PLATFORM,
 * so it must be checked against the platform's API, never against our own
 * ingested rows. Every one of the three clauses failed at that step: calendar
 * counted memory rows as events, GitHub read a claim our own rows already
 * contradicted, YouTube scored a watching self-report against a lifetime like
 * list via a dead endpoint. Each conflated a bug in our writer with a gap in
 * the user's self-knowledge, and pointed the next round of work at retrieval
 * when the defect was upstream of it.
 *
 * Corollary for the battery: before calling a temporal item "unwinnable",
 * verify the ground truth against the source API. On this evidence the items
 * were gradeable and the twin was answering from a corrupted log.
 *
 * DEDUP-DEFEAT BUG FAMILY — found while checking the above, FIXED 2026-08-13.
 * A single changing digit made the same fact land repeatedly, and some of it
 * was false. On 2026-08-02 the stream held three mutually contradictory rows:
 * "Current GitHub contribution streak: 22 consecutive days", "Committed code
 * on 2 days in the last 30 days" and "Committed code on 1 day in the last 30
 * days".
 *
 * Cause: snapshotMetrics.js already had the machinery — a registry of
 * {rx, like} templates that classifies a rolling aggregate and refreshes the
 * prior row IN PLACE instead of inserting another. These GitHub and YouTube
 * aggregates were simply never registered, so the digit-sensitive content hash
 * read every recomputation as a brand-new fact. One entry that WAS registered,
 * "Committed code on N days", used `\d+ days` and so could not classify the
 * singular "1 day" the fetcher emits when the count is one — which is exactly
 * how that contradiction got in.
 *
 * Measured over this user's 151 GitHub+YouTube platform_data rows from the
 * same 15 days, the added entries retire 75 of them — half the stream was one
 * fact repeated:
 *
 *   27x  Your GitHub language distribution: JavaScript (53%/54%/55%/56%)...
 *   21x  GitHub rhythm: ... peak day is Monday (1196 / 1202 / 1208 / 1215)
 *   15x  Current GitHub contribution streak: 18 / 19 / 21 / 22 / 23 days
 *    7x  Most active on GitHub on Tuesdays / Thursdays / Sundays / Fridays
 *    4x  Subscribed to 131 YouTube channels, including: ... (list reordered)
 *
 * Note the 4th group: those rows do not merely repeat, they contradict each
 * other and the "peak day is Monday" row above them. And these were not
 * low-value rows sitting harmlessly in the tail — several carried
 * LLM-assigned importance 6-7, i.e. a stale self-contradictory aggregate was
 * outranking real events in retrieval. Registering them clamps the whole class
 * to SNAPSHOT_METRIC_SCORE (4), below the Tier 2 archival ceiling.
 *
 * Still open, not a dedup bug: "Working on 17 public, 13 private GitHub repos,
 * primarily focused on data science / ML" — the same sentence reports
 * JavaScript 53% / TypeScript 43%, so the projectType classifier looks wrong.
 * Also "Opened PR in twin-me: """ stores an empty PR title.
 *
 * DO NOT re-cite the calendar temporal items from waves before 2026-08-13 —
 * their ground truth was contaminated by (a). Re-measure once dated
 * observations have accumulated for a full 14 days.
 *
 * WHAT REMAINS TRUE ABOUT THE DIGEST: it verifiably puts real recent events
 * into the prompt — a live chat turn cited Brent Faiyaz, the branch created
 * yesterday, Kayaking + a Duathlon, and today's 5:30 PM meeting, all traced
 * back to digest lines. That capability is real and was absent before. It
 * is simply NOT supported by a replicated fidelity gain, so it should be
 * described as "the twin can now cite recent activity", never as "+0.048".
 *
 * 2026-08-11 (earlier same day) baseline,spine re-trial: INVALID, ignore its TSV rows
 * (baseline 0.8593 n=5 / spine 0.6462 n=3). The user's v2 wave never stored
 * (zero new twin_fidelity_checks rows — ground truth was still the v1 wave,
 * so temporal items had no truth), and DeepSeek returned malformed JSON in
 * 4 of 10 trials (likert "III", "—0.9", "&quot;"), leaving the spine arm
 * n=3 with a 13-item 0.2885 outlier. Rerun after (a) a v2 wave actually
 * lands and (b) the parseTwinAnswers hardening merges.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { appendFileSync, existsSync, writeFileSync } from 'fs';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const { supabaseAdmin } = await import('../api/services/database.js');
const { answerBatteryAsTwin, scoreAnswers } = await import('../api/services/fidelityBatteryService.js');
const { FIDELITY_BATTERY, BATTERY_VERSION } = await import('../api/config/fidelityBattery.js');
const { getTwinSummary } = await import('../api/services/twinSummaryService.js');

// ─── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const DEFAULT_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d'; // stefanogebara@gmail.com
const userId = argValue('--user-id', process.env.TEST_TWIN_USER_ID || DEFAULT_USER);
const trials = Math.max(1, parseInt(argValue('--trials', '3'), 10));
const configNames = argValue('--configs', 'baseline').split(',').map(s => s.trim());

// ─── Configs: name -> async () => extraContext|null ─────────────────────────
// Add a config per candidate feature: return the context block the feature
// would inject into the twin's grounding, or throw if its inputs are absent.
// 'spine' needs api/services/memoryTimelineService.js — deleted in a8b3314e,
// restorable for a re-trial via:
//   git show a8b3314e^:api/services/memoryTimelineService.js > api/services/memoryTimelineService.js
// (lazy import below keeps baseline-only runs working without it).
const CONFIGS = {
  baseline: async () => null,
  spine: async () => {
    // memoryTimelineService was deleted with the spine (a8b3314e), so this
    // arm cannot run from a clean checkout by design — restore the module
    // first. Kept as the worked example of a candidate arm.
    const { renderSpine } = await import('../api/services/memoryTimelineService.js').catch(() => {
      throw new Error(
        'The spine arm needs the deleted memoryTimelineService. Restore it with:\n' +
        '  git show a8b3314e^:api/services/memoryTimelineService.js > api/services/memoryTimelineService.js\n' +
        '(delete it again afterwards — the spine failed the eval twice and stays out of production.)'
      );
    });
    const { data: prof } = await supabaseAdmin
      .from('users').select('timezone').eq('id', userId).maybeSingle();
    const spine = await renderSpine(userId, {
      supabase: supabaseAdmin,
      timeZone: prof?.timezone || undefined,
    });
    if (!spine.text) {
      throw new Error(
        `Spine rendered empty (blocks=${spine.blocks}, covered=${spine.covered}). ` +
        'Build timeline nodes first (buildPendingNodes) or the A arm equals the B arm.'
      );
    }
    console.log(`  spine: ${spine.covered}/${spine.blocks} blocks covered, ${spine.text.length} chars`);
    return spine.text;
  },
  // NOTE: the recent-platform digest is no longer an arm — it won the
  // 2026-08-11 three-arm trial and SHIPPED into production grounding
  // (answerBatteryAsTwin fetches it itself now), so 'baseline' includes
  // it. A digest arm here would double-inject. Future candidates compete
  // against the digest-included baseline.
};

// ─── Ground truth ────────────────────────────────────────────────────────────
// Latest wave regardless of battery_version (order by recency, not wave —
// wave numbering restarts per version), but report the version: a wave
// older than BATTERY_VERSION carries no ground truth for items added since.
const { data: wave, error } = await supabaseAdmin
  .from('twin_fidelity_checks')
  .select('wave, battery_version, user_answers, twin_accuracy, created_at')
  .eq('user_id', userId)
  .not('user_answers', 'is', null)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (error || !wave) {
  console.error('No fidelity wave with user_answers for this user — take the battery at /fidelity first.');
  process.exit(1);
}
console.log(`Ground truth: v${wave.battery_version} wave ${wave.wave} (${wave.created_at}), stored twin_accuracy=${wave.twin_accuracy}`);
const TEMPORAL_ITEMS = FIDELITY_BATTERY.filter(i => i.temporal);
const temporalTruthCount = TEMPORAL_ITEMS.filter(i => wave.user_answers[i.id] !== undefined).length;
if (wave.battery_version < BATTERY_VERSION) {
  console.warn(
    `WARNING: ground truth is a v${wave.battery_version} wave but the battery is v${BATTERY_VERSION} — ` +
    `${temporalTruthCount}/${TEMPORAL_ITEMS.length} temporal items have user truth. ` +
    'Temporal accuracy cannot be adjudicated until a fresh wave is taken at /fidelity.'
  );
}
console.log(`Configs: ${configNames.join(', ')} · trials per config: ${trials}\n`);

// Pre-warm the twin summary ONCE so every trial in every arm grounds on the
// same cached summary — run 1 showed a stale summary regenerating mid-run,
// giving one arm fresher grounding than the other (confound).
await getTwinSummary(userId);

// ─── Run ─────────────────────────────────────────────────────────────────────
const results = {}; // name -> { scores: number[], answersPerTrial: object[] }

for (const name of configNames) {
  if (!CONFIGS[name]) {
    console.error(`Unknown config "${name}" — known: ${Object.keys(CONFIGS).join(', ')}`);
    process.exit(1);
  }
  console.log(`── config: ${name} ──`);
  const extraContext = await CONFIGS[name]();
  const scores = [];
  const answersPerTrial = [];

  for (let t = 1; t <= trials; t++) {
    const started = Date.now();
    const result = await answerBatteryAsTwin(userId, { extraContext, skipLlmCache: true });
    if (!result?.answers) {
      console.log(`  trial ${t}: FAILED (no usable answers)`);
      continue;
    }
    const { overall, itemsScored } = scoreAnswers(FIDELITY_BATTERY, result.answers, wave.user_answers);
    scores.push(overall);
    answersPerTrial.push(result.answers);
    console.log(`  trial ${t}: accuracy=${overall?.toFixed(4)} (items=${itemsScored}, ${((Date.now() - started) / 1000).toFixed(1)}s)`);
  }
  results[name] = { scores, answersPerTrial };
}

// ─── Report ──────────────────────────────────────────────────────────────────
const stats = (xs) => {
  if (!xs.length) return { mean: null, min: null, max: null };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return { mean, min: Math.min(...xs), max: Math.max(...xs) };
};

console.log('\n=== RESULTS ===');
const summary = {};
for (const name of configNames) {
  const s = stats(results[name].scores);
  summary[name] = s;
  console.log(
    `${name.padEnd(10)} mean=${s.mean?.toFixed(4) ?? 'n/a'}  min=${s.min?.toFixed(4) ?? '-'}  max=${s.max?.toFixed(4) ?? '-'}  (n=${results[name].scores.length})`
  );
}

/** Most frequent answer to an item across trials, or undefined when absent. */
const modal = (answersList, itemId) => {
  const counts = {};
  for (const ans of answersList) {
    if (ans[itemId] === undefined) continue;
    const v = String(ans[itemId]);
    counts[v] = (counts[v] || 0) + 1;
  }
  return Object.entries(counts).sort((x, y) => y[1] - x[1])[0]?.[0];
};

// ─── Temporal subset (battery v2) ───────────────────────────────────────────
// The reason v2 exists: temporal features (the spine) can only surface on
// the last-two-weeks items. Report subset accuracy when the wave carries
// truth for them, and per-item modal answers regardless — arm-to-arm flips
// here show whether the candidate context changes temporal answers at all.
if (TEMPORAL_ITEMS.length > 0) {
  console.log('\n=== TEMPORAL SUBSET (last-two-weeks items) ===');
  for (const name of configNames) {
    const subsetScores = results[name].answersPerTrial
      .map(ans => scoreAnswers(TEMPORAL_ITEMS, ans, wave.user_answers).overall)
      .filter(v => v !== null);
    const s = stats(subsetScores);
    console.log(`${name.padEnd(10)} mean=${s.mean?.toFixed(4) ?? 'n/a (no truth)'}  (n=${subsetScores.length})`);
  }
  console.log('\nPer-item modal answers:');
  for (const item of TEMPORAL_ITEMS) {
    const truth = wave.user_answers[item.id] !== undefined
      ? String(wave.user_answers[item.id])
      : `— (no truth: v${wave.battery_version} wave)`;
    console.log(`  ${item.id}`);
    for (const name of configNames) {
      console.log(`    ${name.padEnd(10)} ${modal(results[name].answersPerTrial, item.id) ?? '—'}`);
    }
    console.log(`    ${'truth'.padEnd(10)} ${truth}`);
  }
}

if (configNames.length === 2 && summary[configNames[0]].mean != null && summary[configNames[1]].mean != null) {
  const [a, b] = configNames;
  const delta = summary[b].mean - summary[a].mean;
  console.log(`\ndelta (${b} - ${a}): ${delta >= 0 ? '+' : ''}${delta.toFixed(4)}`);

  // Per-item flips: items where the modal answer differs between configs.
  const flips = [];
  for (const item of FIDELITY_BATTERY) {
    const va = modal(results[a].answersPerTrial, item.id);
    const vb = modal(results[b].answersPerTrial, item.id);
    if (va !== undefined && vb !== undefined && va !== vb) {
      const truth = wave.user_answers[item.id] !== undefined ? String(wave.user_answers[item.id]) : '—';
      flips.push(`  ${item.id}: ${va} -> ${vb} (truth: ${truth})`);
    }
  }
  if (flips.length) {
    console.log(`\nModal-answer flips (${flips.length}):`);
    console.log(flips.join('\n'));
  } else {
    console.log('\nNo modal-answer flips between configs.');
  }
}

// ─── Persist ────────────────────────────────────────────────────────────────
const TSV = join(__dirname, 'fidelity-results.tsv');
if (!existsSync(TSV)) {
  writeFileSync(TSV, 'timestamp\tuser_id\tbattery_version\twave\tconfig\ttrials\tmean\tmin\tmax\tscores\n');
}
for (const name of configNames) {
  const s = summary[name];
  appendFileSync(
    TSV,
    [
      new Date().toISOString(), userId, wave.battery_version, wave.wave, name,
      results[name].scores.length,
      s.mean?.toFixed(4) ?? '', s.min?.toFixed(4) ?? '', s.max?.toFixed(4) ?? '',
      results[name].scores.map(x => x.toFixed(4)).join(','),
    ].join('\t') + '\n'
  );
}
console.log(`\nAppended to ${TSV}`);
process.exit(0);
