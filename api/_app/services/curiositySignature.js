/**
 * Curiosity Signature — what your attention keeps circling (2026-06-16)
 * ====================================================================
 * The second first-party insight, and the one that answers "can we see what
 * the user is actually DOING?" — yes. The browser extension captures, per page,
 * the topics, the page title, and (separately) the user's search queries. Those
 * searches are the sharpest intent signal we have: not which site, but what
 * question they keep asking.
 *
 * This reads a month of that content from our own DB, distills it to a clean
 * corpus (pure, tested), and asks the analysis model to name the one genuine
 * thread the person's effort and curiosity circle. The Editor then voices it.
 *
 * Privacy: this is the user's own activity, reflected only back to them. The
 * prompt is instructed to skip anything sensitive (health, money, relationships)
 * and to synthesize a theme, not echo raw queries. We never store raw page
 * content — only the distilled insight.
 */
import { supabaseAdmin } from './database.js';
import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { editInsights } from './insightEditor.js';
import { vectorToString } from './embeddingService.js';
import { createLogger } from './logger.js';

const log = createLogger('CuriositySignature');

export const WINDOW_DAYS = 28;
const MAX_PAGE_ROWS = 2000;
const MAX_SEARCH_ROWS = 500;

// Generic web/UI noise that says nothing about the person (en + pt).
const TOPIC_STOPWORDS = new Set([
  'search', 'results', 'resultados', 'https', 'http', 'content', 'page', 'pages',
  'home', 'login', 'signin', 'sign', 'account', 'settings', 'menu', 'click',
  'clique', 'criar', 'editar', 'novo', 'nova', 'tab', 'untitled', 'loading',
  'www', 'com', 'the', 'and', 'for', 'você', 'voce', 'para', 'dos', 'das',
  'que', 'mais', 'todos', 'message', 'messages', 'mensagem', 'unread', 'today',
  'yesterday', 'overview', 'dashboard', 'welcome', 'error', 'undefined',
]);

const GENERIC_TITLE = /^(new tab|untitled|whatsapp|instagram|facebook|login|sign in|google|gmail|youtube)$/i;

// ── PURE core ────────────────────────────────────────────────────────────────
/**
 * Distill raw browsing content into a clean, ranked corpus for synthesis.
 * @param {string[]} rawSearches search query strings
 * @param {Array<{title:string, topics:string[]}>} rawPages
 * @returns {{searches:Array<{q,c}>, topics:Array<{t,c}>, titles:string[]}|null}
 */
export function buildThemeCorpus(rawSearches = [], rawPages = [], {
  searchN = 12, topicN = 15, titleN = 12,
} = {}) {
  // searches — frequency-ranked
  const sCount = new Map();
  for (const q of rawSearches || []) {
    const k = String(q || '').trim().toLowerCase();
    if (k.length < 3) continue;
    sCount.set(k, (sCount.get(k) || 0) + 1);
  }
  const searches = [...sCount.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, searchN).map(([q, c]) => ({ q, c }));

  // topics — drop noise, require recurrence (>=2)
  const tCount = new Map();
  for (const p of rawPages || []) {
    for (const raw of p?.topics || []) {
      const t = String(raw || '').trim().toLowerCase();
      if (t.length <= 3 || TOPIC_STOPWORDS.has(t) || /^\d+$/.test(t)) continue;
      tCount.set(t, (tCount.get(t) || 0) + 1);
    }
  }
  const topics = [...tCount.entries()]
    .filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, topicN).map(([t, c]) => ({ t, c }));

  // titles — dedup, strip "(137) " unread counts, drop generic shells
  const seen = new Set();
  const titles = [];
  for (const p of rawPages || []) {
    const cleaned = String(p?.title || '').trim().replace(/^\(\d+\)\s*/, '');
    if (cleaned.length < 6) continue;
    const norm = cleaned.toLowerCase();
    if (GENERIC_TITLE.test(norm) || seen.has(norm)) continue;
    seen.add(norm);
    titles.push(cleaned);
    if (titles.length >= titleN) break;
  }

  // gate: need a real thread to pull on
  if (searches.length < 3 && topics.length < 6) return null;
  return { searches, topics, titles };
}

/** PURE. Assemble the synthesis prompt from a corpus. */
export function buildThemePrompt(corpus) {
  const s = corpus.searches.map((x) => `- ${x.q}${x.c > 1 ? ` (x${x.c})` : ''}`).join('\n') || '(none)';
  const t = corpus.topics.map((x) => x.t).join(', ') || '(none)';
  const ti = corpus.titles.map((x) => `- ${x}`).join('\n') || '(none)';
  return [
    "Below is a month of one person's web activity — their searches, the recurring topics of pages they read, and page titles. In ONE sentence, name the genuine thread their effort and curiosity keep circling. Be concrete and specific — name the actual project or subject, not a vague abstraction. Write in second person (\"you\"), present tense, no preamble, no quotes, no emoji.",
    'If it is too scattered to have a real thread, reply with exactly: NONE.',
    'Skip anything sensitive (health, money troubles, relationships, anything private) — focus on what they are building, learning, or chasing.',
    '',
    `SEARCHES:\n${s}`,
    '',
    `PAGE TOPICS: ${t}`,
    '',
    `PAGE TITLES:\n${ti}`,
  ].join('\n');
}

// ── gather (I/O, first-party DB — no external API) ───────────────────────────
export async function gatherWebContent(userId) {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();
  const [searchRes, pageRes] = await Promise.all([
    supabaseAdmin.from('user_platform_data').select('raw_data')
      .eq('user_id', userId).eq('platform', 'web').eq('data_type', 'extension_search_query')
      .gte('extracted_at', since).limit(MAX_SEARCH_ROWS),
    supabaseAdmin.from('user_platform_data').select('raw_data')
      .eq('user_id', userId).eq('platform', 'web').eq('data_type', 'extension_page_visit')
      .gte('extracted_at', since).limit(MAX_PAGE_ROWS),
  ]);
  if (searchRes.error) log.warn('search fetch failed', { error: searchRes.error.message });
  if (pageRes.error) log.warn('page fetch failed', { error: pageRes.error.message });
  const rawSearches = (searchRes.data || []).map((r) => r.raw_data?.searchQuery).filter(Boolean);
  const rawPages = (pageRes.data || []).map((r) => ({
    title: r.raw_data?.title || '',
    topics: r.raw_data?.metadata?.topics || [],
  }));
  return { rawSearches, rawPages };
}

// ── orchestrator ─────────────────────────────────────────────────────────────
export async function generateCuriositySignatureInsight(userId, { logOnly = false } = {}) {
  const { rawSearches, rawPages } = await gatherWebContent(userId);
  const corpus = buildThemeCorpus(rawSearches, rawPages);
  if (!corpus) {
    log.info('insufficient web content for curiosity signature', { userId });
    return null;
  }

  const result = await complete({
    tier: TIER_ANALYSIS,
    messages: [{ role: 'user', content: buildThemePrompt(corpus) }],
    maxTokens: 140,
    temperature: 0.5,
    userId,
    serviceName: 'curiositySignature',
  });
  const candidate = (result.content || '').trim().replace(/^["']|["']$/g, '');
  log.info('curiosity signature candidate', { userId, candidate });
  if (!candidate || /^none\.?$/i.test(candidate)) return null;
  if (logOnly) return null;

  const chosen = await editInsights(userId, [{ insight: candidate, urgency: 'low', category: 'trend' }]);
  if (!chosen) return null;

  const insertData = {
    user_id: userId,
    insight: chosen.insight,
    urgency: chosen.urgency,
    category: chosen.category || 'trend',
    surfaced_at: new Date().toISOString(),
    sources: ['web'],
  };
  if (chosen.embedding) insertData.embedding = vectorToString(chosen.embedding);
  const { error } = await supabaseAdmin.from('proactive_insights').insert(insertData);
  if (error) { log.warn('failed to store curiosity signature insight', { userId, error: error.message }); return null; }
  log.info('curiosity signature insight stored', { userId });
  return chosen;
}
