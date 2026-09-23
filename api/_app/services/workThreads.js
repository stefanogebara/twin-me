/**
 * Work Threads — the parallel projects you move between (2026-06-17)
 * ==================================================================
 * The sixth first-party revelation, and the second built on the DESKTOP
 * window-mirroring stream. Focus Shape read the RHYTHM of attention (how long,
 * how scattered); this reads the CONTENT of it — the window TITLES we capture
 * across every app, which name what the person is actually doing.
 *
 * Its angle is the thing only window-mirroring can see: not one theme (the
 * browser-only curiosity signature already names that), but the SEVERAL distinct
 * projects you run in parallel, flipping between browser tabs, Slack, email,
 * spreadsheets and tools. The titles span apps the extension can't reach.
 *
 * Pure tested corpus core; a TIER_ANALYSIS pass synthesizes the threads AND acts
 * as a privacy gate (skip job-hunting, health, money, relationships, named
 * people; reply NONE if there's no clear multi-project picture). Privacy: the
 * user's own activity, reflected only to them. We store the distilled line, not
 * the raw titles.
 */
import { supabaseAdmin } from './database.js';
import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { createLogger } from './logger.js';

const log = createLogger('WorkThreads');

export const WINDOW_DAYS = 28;
const MAX_ROWS = 4000;
const MIN_DISTINCT_TITLES = 12; // need a real spread of activity to find threads
const TOP_N = 30;               // dwell-ranked titles fed to the synthesizer

// Trailing " - <App>" tag the OS/app appends to the window title. Stripping it
// leaves the real subject ("Luiz (DM) - Inner AI - Slack" -> "Luiz (DM) - Inner
// AI"). Only the final app token is removed; site names inside the title
// ("... | HubSpot", "... - Claude") are content and kept.
const APP_SUFFIX = /\s[-–|]\s(brave|google chrome|chrome|firefox|microsoft edge|edge|safari|opera|arc|slack|microsoft outlook|outlook|discord|telegram)\s*$/i;

// Bare app/UI shells that name no activity (en + pt). Exact-match only, so
// "Settings | Twin Me" survives while a lone "settings" is dropped.
const GENERIC = new Set([
  'new tab', 'google', 'whatsapp', 'google meet', 'login', 'sign in', 'signin',
  'gmail', 'inbox', 'caixa de entrada', 'gerenciador de tarefas', 'task manager',
  'untitled', 'home', 'settings', 'configurações', 'configuracoes', 'outlook',
]);

// ── PURE core ────────────────────────────────────────────────────────────────
/**
 * Distill raw desktop window titles into a clean, dwell-ranked corpus.
 * @param {Array<{title:string, dwellSec:number}>} rawClips
 * @returns {{titles:string[], distinct:number}|null}
 */
export function buildTitleCorpus(rawClips, { topN = TOP_N, minDistinct = MIN_DISTINCT_TITLES } = {}) {
  const agg = new Map(); // normalized title -> { title, dwell }
  for (const c of rawClips || []) {
    let t = String(c?.title || '').trim().replace(/^\(\d+\)\s*/, ''); // drop "(141) " unread counts
    t = t.replace(APP_SUFFIX, '').trim();
    if (t.length < 6) continue;
    const norm = t.toLowerCase();
    if (GENERIC.has(norm)) continue;
    const dwell = Number(c?.dwellSec) > 0 ? Number(c.dwellSec) : 0;
    const cur = agg.get(norm) || { title: t, dwell: 0 };
    cur.dwell += dwell;
    agg.set(norm, cur);
  }
  if (agg.size < minDistinct) return null;
  const titles = [...agg.values()]
    .sort((a, b) => b.dwell - a.dwell)
    .slice(0, topN)
    .map((x) => x.title);
  return { titles, distinct: agg.size };
}

/** PURE. The synthesis prompt — also the sensitivity gate. */
export function buildThreadsPrompt(corpus) {
  const list = corpus.titles.map((t) => `- ${t}`).join('\n');
  return [
    'Below are the window titles a person has had open across ALL their desktop apps over the past month — browser tabs, Slack, email, spreadsheets, docs, tools. Each line is something they were actively looking at.',
    'In ONE or TWO sentences, name the 2 to 4 main PROJECTS or worlds they are moving between in parallel — the separate threads their work and attention are split across. Be concrete: name the actual projects/products. Capture that these run at the same time (the parallel, cross-app nature), not just a single theme.',
    'Write in second person ("you"), present tense, no preamble, no quotes, no emoji.',
    'Name ONLY things they are actively building or working on (products, ventures, client or creative work). Do NOT mention job, fellowship, or grant applications, career moves, or personal admin, and leave out anything private (health, money, relationships, messages with named individuals) — even if it appears in the titles. If there is no clear multi-project picture, reply with exactly: NONE.',
    '',
    `WINDOW TITLES:\n${list}`,
  ].join('\n');
}

// ── gather (I/O, first-party DB: desktop window-mirroring clips) ──────────────
export async function gatherDesktopTitles(userId) {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('user_memories')
    .select('metadata')
    .eq('user_id', userId)
    .eq('memory_type', 'observation')
    .eq('metadata->>source', 'desktop_clip')
    .gte('created_at', since)
    .limit(MAX_ROWS);
  if (error) {
    log.warn('desktop titles fetch failed', { userId, error: error.message });
    return [];
  }
  const clips = [];
  for (const row of data || []) {
    const m = row.metadata || {};
    const title = typeof m.window === 'string' ? m.window.trim() : '';
    if (!title) continue;
    const start = Number(m.started_at);
    const end = Number(m.ended_at);
    const dwellSec = Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 1000 : 0;
    clips.push({ title, dwellSec });
  }
  return clips;
}

/** Returns a revelation object for the pull surface, or null. */
export async function computeWorkThreadsRevelation(userId) {
  const clips = await gatherDesktopTitles(userId);
  const corpus = buildTitleCorpus(clips);
  if (!corpus) {
    log.info('insufficient desktop titles for work threads', { userId });
    return null;
  }
  const r = await complete({
    tier: TIER_ANALYSIS,
    messages: [{ role: 'user', content: buildThreadsPrompt(corpus) }],
    maxTokens: 160,
    temperature: 0.5,
    userId,
    serviceName: 'revelations-work-threads',
  });
  const body = (r.content || '').trim().replace(/^["']|["']$/g, '');
  if (!body || /^none\.?$/i.test(body)) return null;
  return { kind: 'work_threads', title: "The threads you're weaving", body, source: 'desktop' };
}
