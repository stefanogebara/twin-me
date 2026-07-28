/**
 * Temporal spine — a constant-sized timeline of the user's life.
 *
 * WHY THIS EXISTS
 * Retrieval selects its candidate pool by vector distance alone, so a memory
 * that is recent but not semantically near the question is unreachable. Phase 2
 * measured it: asked "what has this person been doing this week?", the system
 * returned 30 conversations, none younger than 49 days, while 889 platform
 * observations from the last 7 days sat unretrieved. Re-weighting recency
 * changed the freshness score by exactly zero, because weights only reorder a
 * pool that never contained anything recent.
 *
 * The spine sidesteps similarity entirely: it is selected by TIME. Whatever the
 * question, the twin sees today at full detail, last week compressed, last year
 * as a line — the shape from Victor Taelin's OptMem
 * (github.com/VictorTaelin/OptMem): "nothing is ever deleted, memory context is
 * constant-sized, details fade with age".
 *
 * ADAPTATION: TIME-ADDRESSED, NOT POSITION-ADDRESSED
 * OptMem numbers blocks by log position (#0-1, #2-3, ...), which is sound only
 * because its log is strictly append-only. Ours is not: the forgetting cron
 * archives rows, supersession retires them, and the Phase 0 backfill deleted
 * 4,626 in one pass. Any of those renumbers every position-addressed block and
 * invalidates the whole tree.
 *
 * So blocks are ALIGNED POWER-OF-2 DAY RANGES in absolute day-index space
 * (days since the Unix epoch). Block (size=8, start=2467816) denotes the same
 * eight calendar days forever, no matter what happens to the rows inside it.
 * Only the affected node needs rebuilding, never the addressing.
 *
 * The cover is still OptMem's: a block splits while `size > alpha * age`, and
 * alpha is binary-searched so the tiling fits the line budget. That invariant is
 * what makes the context Θ(log T) — the formal justification is the exponential
 * histogram result (Datar et al. 2002), where bucket size growing with age gives
 * logarithmic space at bounded relative error.
 *
 * Plan: .claude/plans/2026-07-27-optmem-brain/README.md (Phase 3)
 */

const DAY_MS = 86_400_000;

/**
 * Lines in the rendered spine. 16 blocks spans a decade at day-level detail for
 * the present (2^16 days is ~180 years), so this is not a horizon limit — it is
 * purely how much prompt the timeline is allowed to occupy.
 */
const DEFAULT_SPINE_BUDGET = 16;

/**
 * Days at the newest end that are always kept at day resolution, so "today" and
 * the last couple of days can never be blurred into a coarser block.
 */
const FINE_WINDOW_DAYS = 3;

/** Absolute day number since the Unix epoch (UTC). */
function dayIndex(ts) {
  const ms = ts instanceof Date ? ts.getTime()
    : typeof ts === 'number' ? ts
    : new Date(ts).getTime();
  return Math.floor(ms / DAY_MS);
}

/** Start-of-day timestamp for a day index. */
function dayIndexToMs(day) {
  return day * DAY_MS;
}

function nextPow2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Tile [oldestDay, nowDay] with aligned power-of-2 day blocks under the
 * invariant `size <= alpha * age`, where age is measured from the block's start
 * to now. Small alpha means fine granularity and many blocks.
 */
function tile(nowDay, oldestDay, alpha) {
  const span = nowDay - oldestDay + 1;
  let rootSize = nextPow2(Math.max(1, span));
  // Align the root so every descendant is aligned too. Aligning can pull the
  // root's start back far enough that it no longer reaches nowDay, so grow it
  // until the whole range is genuinely covered.
  let rootStart = Math.floor(oldestDay / rootSize) * rootSize;
  while (rootStart + rootSize <= nowDay) {
    rootSize *= 2;
    rootStart = Math.floor(oldestDay / rootSize) * rootSize;
  }

  const out = [];
  const stack = [[rootStart, rootStart + rootSize]];

  while (stack.length) {
    const [a, b] = stack.pop();
    const size = b - a;

    // Drop blocks entirely outside the range of interest.
    if (b <= oldestDay || a > nowDay) continue;

    const age = Math.max(1, nowDay - a + 1);
    if (size > 1 && size > alpha * age) {
      const mid = a + size / 2;
      stack.push([a, mid], [mid, b]);
    } else {
      out.push({ start: a, end: b, size });
    }
  }

  out.sort((x, y) => x.start - y.start);
  return out;
}

/**
 * The telescoping cover: recent days at day resolution, older stretches merged
 * into progressively larger blocks, the whole thing capped at `budget` lines.
 *
 * @param {number} nowDay - current day index
 * @param {number} oldestDay - day index of the oldest memory
 * @param {number} [budget] - maximum number of blocks
 * @returns {Array<{start:number,end:number,size:number}>} oldest first
 */
function coverBlocks(nowDay, oldestDay, budget = DEFAULT_SPINE_BUDGET) {
  if (!Number.isFinite(nowDay) || !Number.isFinite(oldestDay)) return [];
  if (oldestDay > nowDay) return [];
  if (budget < 1) return [];

  // Reserve day-resolution blocks for the most recent days.
  //
  // Pure OptMem does not do this, and it costs us the property we most need.
  // Its invariant is size <= alpha * age, and alpha has to grow to fit a longer
  // history into a fixed budget — so with years of history the newest block
  // becomes 2, 4, 8 days wide and "today" dissolves into "the last week". For a
  // twin whose failure mode is asserting stale things as current, the recent
  // window is exactly what must not blur. So the newest FINE_WINDOW_DAYS are
  // always their own day blocks and the past telescopes into what is left.
  const fineDays = Math.max(0, Math.min(FINE_WINDOW_DAYS, budget - 1));
  const fine = [];
  for (let d = nowDay - fineDays + 1; d <= nowDay; d++) {
    if (d >= oldestDay) fine.push({ start: d, end: d + 1, size: 1 });
  }

  const coarseEnd = nowDay - fine.length;      // last day covered by the tiling
  if (coarseEnd < oldestDay) return fine;      // history shorter than the window

  const coarseBudget = budget - fine.length;
  if (coarseBudget < 1) return fine;

  // Binary search alpha. Large alpha => coarse => few blocks.
  let lo = 0, hi = 1;
  while (tile(coarseEnd, oldestDay, hi).length > coarseBudget && hi < 1e9) hi *= 2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (tile(coarseEnd, oldestDay, mid).length > coarseBudget) lo = mid;
    else hi = mid;
  }

  let blocks = tile(coarseEnd, oldestDay, hi);

  // The tiling is aligned, so its final block can overrun into the fine window.
  // Drop anything that starts inside it; the day blocks describe that span.
  const fineStart = fine.length ? fine[0].start : Infinity;
  blocks = blocks.filter(b => b.start < fineStart);

  // Spend any leftover budget refining the newest splittable block, so the
  // present is described as finely as the budget allows.
  while (blocks.length + fine.length < budget) {
    let idx = -1;
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (blocks[i].size > 1) { idx = i; break; }
    }
    if (idx === -1) break;
    const { start, end, size } = blocks[idx];
    const mid = start + size / 2;
    const halves = [
      { start, end: mid, size: size / 2 },
      { start: mid, end, size: size / 2 },
    ].filter(b => b.start < fineStart);
    blocks.splice(idx, 1, ...halves);
  }

  return [...blocks, ...fine];
}


/**
 * Human-readable period for a block, written for the model rather than for a UI:
 * it must make the age unmistakable so a summary can never read as present tense.
 */
function blockLabel(block, nowDay) {
  const { start, end, size } = block;
  const endAge = nowDay - end + 1;   // days since the block's newest edge

  if (size === 1) {
    if (start === nowDay) return 'today';
    if (start === nowDay - 1) return 'yesterday';
    const age = nowDay - start;
    return `${age} days ago`;
  }

  const span = describeSpan(size);
  const ago = endAge <= 0 ? 'ending today' : `ending ${describeSpan(Math.max(1, endAge))} ago`;
  return `${span}, ${ago}`;
}

function describeSpan(days) {
  if (days < 14) return `${days} day${days === 1 ? '' : 's'}`;
  if (days < 60) {
    const w = Math.round(days / 7);
    return `${w} week${w === 1 ? '' : 's'}`;
  }
  if (days < 730) {
    const m = Math.round(days / 30);
    return `${m} month${m === 1 ? '' : 's'}`;
  }
  const y = Math.round(days / 365);
  return `${y} year${y === 1 ? '' : 's'}`;
}

export {
  DAY_MS,
  DEFAULT_SPINE_BUDGET,
  dayIndex,
  dayIndexToMs,
  coverBlocks,
  blockLabel,
};

// ─── Node building (the merge tree) ──────────────────────────────────────────

/**
 * Max characters in any node summary. Matches OptMem's ENTRY_CHARS: one line per
 * block is what keeps the whole spine constant-sized, so this bound is
 * load-bearing rather than cosmetic.
 */
const NODE_SUMMARY_CHARS = 280;

/** Newline, kept as a constant so prompt strings stay single-line and readable. */
const BR = String.fromCharCode(10);

/** Memory types that describe what actually happened, in spine order. */
const SPINE_MEMORY_TYPES = ['platform_data', 'observation', 'conversation', 'fact'];

/**
 * Normalise an LLM line to one clean sentence within the character bound.
 * Cuts at a word boundary — a summary sliced mid-word ("focused buildi") lands
 * straight in the system prompt and reads as corrupted context.
 */
function clampSummary(raw) {
  const one = (raw || '').trim().replace(/\s+/g, ' ');
  if (one.length <= NODE_SUMMARY_CHARS) return one;
  const cut = one.slice(0, NODE_SUMMARY_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > NODE_SUMMARY_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:\s]+$/, '');
}

/** Cheap fingerprint of a node's inputs, so a stale node can be detected. */
function sourceDigest(parts) {
  let h = 0;
  const s = parts.join('\u0000');
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return `${s.length}:${h}`;
}

/**
 * Build (or rebuild) the day-leaf digest for one day.
 *
 * Reflections are deliberately excluded from leaves: they are already
 * cross-temporal syntheses, so folding them into "what happened on this day"
 * both double-counts them and smuggles undated conclusions into a dated slot.
 *
 * @returns {Promise<Object|null>} the node row, or null when the day is empty
 */
async function buildLeafNode(userId, day, deps) {
  const { supabase, complete, tier } = deps;
  const from = new Date(dayIndexToMs(day)).toISOString();
  const to = new Date(dayIndexToMs(day + 1)).toISOString();

  const { data: rows, error } = await supabase
    .from('user_memories')
    .select('id, content, memory_type, importance_score')
    .eq('user_id', userId)
    .in('memory_type', SPINE_MEMORY_TYPES)
    .is('superseded_by', null)
    .gte('created_at', from)
    .lt('created_at', to)
    .order('importance_score', { ascending: false })
    .limit(60);

  if (error || !rows?.length) return null;

  const digest = sourceDigest(rows.map(r => r.id));
  const existing = await getNode(userId, 1, day, deps);
  if (existing && existing.source_digest === digest) return { ...existing, cached: true };

  const lines = rows.map(r => `- ${r.content.slice(0, 200)}`).join('\n');
  const prompt =
    `Summarise this single day of someone's life in ONE line of at most ${NODE_SUMMARY_CHARS} characters.\n` +
    `Write it as a past-tense record of that day. Keep what has lasting effect, drop what does not.\n` +
    `Do NOT quote counters or totals that change constantly (unread counts, follower counts, streaks) — ` +
    `they are wrong by tomorrow. Prefer what happened over what was measured.\n` +
    `Invent nothing. No preamble, output the line only.\n\n${lines}`;

  const result = await complete({
    tier,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    maxTokens: 150,
    userId,
    purpose: 'timeline_leaf',
  });

  const summary = clampSummary(result?.content);
  if (!summary) return null;

  return upsertNode(userId, 1, day, summary, rows.length, digest, deps);
}

/**
 * Merge two child nodes into their parent, exactly as OptMem's nap does. The
 * parent summarises the two halves' summaries, never the raw memories — that
 * recursion is what keeps merge cost constant per node regardless of how much
 * history sits underneath it.
 *
 * @returns {Promise<Object|null>} the parent node, or null if no children exist
 */
async function buildMergeNode(userId, size, start, deps) {
  const { complete, tier } = deps;
  const half = size / 2;
  const left = await getNode(userId, half, start, deps);
  const right = await getNode(userId, half, start + half, deps);
  const children = [left, right].filter(Boolean);
  if (!children.length) return null;

  // A block with only one populated half needs no LLM call — the child summary
  // already says everything the parent would. Skipping it matters: sparse
  // history would otherwise pay for a merge per empty level.
  if (children.length === 1) {
    const only = children[0];
    const digest = sourceDigest([only.source_digest ?? only.summary]);
    const existing = await getNode(userId, size, start, deps);
    if (existing && existing.source_digest === digest) return { ...existing, cached: true };
    return upsertNode(userId, size, start, only.summary, only.memory_count, digest, deps);
  }

  const digest = sourceDigest(children.map(c => c.source_digest ?? c.summary));
  const existing = await getNode(userId, size, start, deps);
  if (existing && existing.source_digest === digest) return { ...existing, cached: true };

  const prompt =
    `Compress these two consecutive periods of someone's life into ONE line of at most ` +
    `${NODE_SUMMARY_CHARS} characters.\n` +
    `Keep what has lasting effect, drop what does not. Invent nothing.\n` +
    `Do NOT quote counters or totals that change constantly.\n` +
    `No preamble, output the line only.\n\n` +
    `Earlier half: ${left.summary}\nLater half: ${right.summary}`;

  const result = await complete({
    tier,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    maxTokens: 150,
    userId,
    purpose: 'timeline_merge',
  });

  const summary = clampSummary(result?.content);
  if (!summary) return null;

  const count = (left.memory_count ?? 0) + (right.memory_count ?? 0);
  return upsertNode(userId, size, start, summary, count, digest, deps);
}

/**
 * Build a node directly from its time range, without needing its subtree.
 *
 * OptMem cannot do this: its blocks are log positions, so the only way to a
 * parent is by merging its two children, and a cold start therefore costs one
 * LLM call per leaf all the way down. Ours are DAY RANGES, so any block can be
 * summarised straight from the memories inside it with a single call.
 *
 * That is the difference between ~16 calls and several thousand when building a
 * spine over years of existing history. The recursive merge path is still the
 * one used day to day, because once the tree is warm merging two summaries is
 * cheaper and compounds the compression; this is the cold-start escape hatch.
 */
async function buildDirectNode(userId, size, start, deps) {
  const { supabase, complete, tier } = deps;
  const from = new Date(dayIndexToMs(start)).toISOString();
  const to = new Date(dayIndexToMs(start + size)).toISOString();

  const { data: rows } = await supabase
    .from('user_memories')
    .select('id, content')
    .eq('user_id', userId)
    .in('memory_type', SPINE_MEMORY_TYPES)
    .is('superseded_by', null)
    .gte('created_at', from)
    .lt('created_at', to)
    .order('importance_score', { ascending: false })
    .limit(40);

  if (!rows?.length) return null;

  const digest = sourceDigest(rows.map(r => r.id));
  const existing = await getNode(userId, size, start, deps);
  if (existing && existing.source_digest === digest) return { ...existing, cached: true };

  const span = describeSpan(size);
  const lines = rows.map(r => `- ${r.content.slice(0, 160)}`).join(BR);
  const prompt =
    `Summarise this ${span} period of someone's life in ONE line of at most ${NODE_SUMMARY_CHARS} characters.` + BR +
    `Write it as a past-tense record of that period. Keep what had lasting effect, drop what did not.` + BR +
    `Do NOT quote counters or totals that change constantly — they are meaningless for a past period.` + BR +
    `Invent nothing. No preamble, output the line only.` + BR + BR + lines;

  const result = await complete({
    tier, messages: [{ role: 'user', content: prompt }],
    temperature: 0.3, maxTokens: 150, userId, purpose: 'timeline_direct',
  });

  const summary = clampSummary(result?.content);
  if (!summary) return null;
  return upsertNode(userId, size, start, summary, rows.length, digest, deps);
}

async function getNode(userId, size, start, { supabase }) {
  const { data } = await supabase
    .from('memory_timeline_nodes')
    .select('id, block_size, block_start, summary, memory_count, source_digest, built_at')
    .eq('user_id', userId).eq('block_size', size).eq('block_start', start)
    .maybeSingle();
  return data || null;
}

async function upsertNode(userId, size, start, summary, count, digest, { supabase }) {
  const { data, error } = await supabase
    .from('memory_timeline_nodes')
    .upsert({
      user_id: userId, block_size: size, block_start: start,
      summary, memory_count: count, source_digest: digest,
      built_at: new Date().toISOString(),
    }, { onConflict: 'user_id,block_size,block_start' })
    .select('id, block_size, block_start, summary, memory_count, source_digest')
    .single();
  if (error) return null;
  return data;
}

export {
  NODE_SUMMARY_CHARS,
  SPINE_MEMORY_TYPES,
  sourceDigest,
  buildLeafNode,
  buildMergeNode,
  getNode,
};

// ─── Spine assembly ──────────────────────────────────────────────────────────

/**
 * Build whatever the current cover needs, cheapest first, capped per call.
 *
 * Cost discipline (the Vercel rules): a binary tree over n leaves has n-1
 * internal nodes, so once the tree is warm a new day costs ~1 leaf + ~1 merge
 * amortised. `maxNodes` bounds the cold-start burst, and callers chain this off
 * existing ingestion rather than adding a cron.
 *
 * Missing nodes are not an error — the spine renders whatever exists and simply
 * omits blocks it has no summary for, so a half-built tree is still useful.
 *
 * @returns {Promise<{built:number, skipped:number}>}
 */
async function buildPendingNodes(userId, deps, {
  budget = DEFAULT_SPINE_BUDGET,
  maxNodes = 4,
  now = Date.now(),
  minRebuildAgeMs = 6 * 3600_000,
} = {}) {
  const { supabase } = deps;
  const nowDay = dayIndex(now);

  const { data: oldestRow } = await supabase
    .from('user_memories')
    .select('created_at')
    .eq('user_id', userId)
    .in('memory_type', SPINE_MEMORY_TYPES)
    .is('superseded_by', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!oldestRow) return { built: 0, skipped: 0 };

  const blocks = coverBlocks(nowDay, dayIndex(oldestRow.created_at), budget);
  let built = 0, skipped = 0;

  // Leaves first, newest first: the recent window is what the twin gets wrong,
  // so if the budget runs out mid-build the freshest days are already covered.
  const leaves = blocks.filter(b => b.size === 1).sort((a, b) => b.start - a.start);
  for (const b of leaves) {
    if (built >= maxNodes) return { built, skipped: skipped + 1 };

    // Today's leaf is incomplete until the day ends, so its digest changes on
    // every ingestion cycle and it would rebuild every run. At a */15 cron that
    // is ~96 LLM calls per user per day for a summary nobody reads more than a
    // few times. Rebuild it at most every minRebuildAgeMs; past days are settled
    // and only rebuild if their contents actually changed.
    if (b.start === nowDay) {
      const existing = await getNode(userId, 1, b.start, deps);
      if (existing?.built_at && now - new Date(existing.built_at).getTime() < minRebuildAgeMs) continue;
    }

    const node = await buildLeafNode(userId, b.start, deps);
    if (node && !node.cached) built++;
  }

  // Then coarse blocks, smallest size first.
  const merges = blocks.filter(b => b.size > 1).sort((a, b) => a.size - b.size);
  for (const b of merges) {
    if (built >= maxNodes) return { built, skipped: skipped + 1 };
    if (await getNode(userId, b.size, b.start, deps)) continue;

    // Prefer the merge when both halves already exist — it is the cheaper input
    // and compounds the compression. Otherwise summarise the range directly
    // rather than recursing down to leaves, which for a multi-year block would
    // mean thousands of calls.
    const half = b.size / 2;
    const [l, r] = await Promise.all([
      getNode(userId, half, b.start, deps),
      getNode(userId, half, b.start + half, deps),
    ]);
    const node = (l && r)
      ? await buildMergeNode(userId, b.size, b.start, deps)
      : await buildDirectNode(userId, b.size, b.start, deps);
    if (node && !node.cached) built++; else if (!node) skipped++;
  }

  return { built, skipped };
}

/** Depth-first build of a block's descendants, then the block itself. */
async function ensureSubtree(userId, size, start, deps, exhausted, tick) {
  if (exhausted()) return false;
  const existing = await getNode(userId, size, start, deps);
  if (existing) return true;

  if (size === 1) {
    const leaf = await buildLeafNode(userId, start, deps);
    if (leaf) tick();
    return Boolean(leaf);
  }

  const half = size / 2;
  await ensureSubtree(userId, half, start, deps, exhausted, tick);
  await ensureSubtree(userId, half, start + half, deps, exhausted, tick);
  if (exhausted()) return false;

  const node = await buildMergeNode(userId, size, start, deps);
  if (node) tick();
  return Boolean(node);
}

/**
 * Render the spine: one dated line per block, oldest first.
 *
 * Every line carries its period explicitly. That is the entire defence against
 * the original bug — a summary of March cannot read as present tense when the
 * line it sits on says "5 months ago".
 *
 * @returns {Promise<{text:string, blocks:number, covered:number}>}
 */
async function renderSpine(userId, deps, { budget = DEFAULT_SPINE_BUDGET, now = Date.now() } = {}) {
  const { supabase } = deps;
  const nowDay = dayIndex(now);

  const { data: oldestRow } = await supabase
    .from('user_memories')
    .select('created_at')
    .eq('user_id', userId)
    .in('memory_type', SPINE_MEMORY_TYPES)
    .is('superseded_by', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!oldestRow) return { text: '', blocks: 0, covered: 0 };

  const blocks = coverBlocks(nowDay, dayIndex(oldestRow.created_at), budget);
  if (!blocks.length) return { text: '', blocks: 0, covered: 0 };

  const { data: nodes } = await supabase
    .from('memory_timeline_nodes')
    .select('block_size, block_start, summary')
    .eq('user_id', userId)
    .in('block_size', [...new Set(blocks.map(b => b.size))]);

  const byKey = new Map((nodes || []).map(n => [`${n.block_size}:${n.block_start}`, n.summary]));

  const lines = [];
  for (const b of blocks) {
    const summary = byKey.get(`${b.size}:${b.start}`);
    if (!summary) continue;   // not built yet — omit rather than fabricate
    lines.push(`- [${blockLabel(b, nowDay)}] ${summary}`);
  }

  if (!lines.length) return { text: '', blocks: blocks.length, covered: 0 };

  const text =
    '=== MY TIMELINE (oldest first; each line states when it happened — never treat an older line as current) ===\n' +
    lines.join('\n');

  return { text, blocks: blocks.length, covered: lines.length };
}

export { buildPendingNodes, renderSpine, buildDirectNode };
