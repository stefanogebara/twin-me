/**
 * Portrait service
 * ================
 * Shapes the memory stream into the Portrait (spec: .claude/plans/2026-09-03-portrait):
 * readings with receipts, five signature lines, today's question, the sources.
 *
 * Two halves. The pure half (plainEvent, buildPortrait) takes rows and returns the
 * PortraitData the front end renders; it is what the tests cover. The loading half
 * (loadPortrait, setVerdict, answerQuestion) talks to Supabase and the memory stream.
 *
 * Language rule: evidence cards speak the person's language, never the platform's.
 * plainEvent is the translation layer, one table per source. Calendar shows aggregates
 * and never a title; Gmail shows counts and rhythms and never a name.
 */

import { supabaseAdmin } from './database.js';
import { addMemory } from './memoryStreamService.js';
import { createLogger } from './logger.js';

const log = createLogger('PortraitService');

export const DOMAINS = ['motivation', 'personality', 'cultural', 'social', 'lifestyle'];

/** Expert persona -> signature domain. Unknown experts read as personality. */
export const DOMAIN_OF_EXPERT = {
  personality_psychologist: 'personality',
  lifestyle_analyst: 'lifestyle',
  health_behaviorist: 'lifestyle',
  cultural_identity: 'cultural',
  music_psychologist: 'cultural',
  media_sociologist: 'cultural',
  social_dynamics: 'social',
  motivation_analyst: 'motivation',
  productivity_analyst: 'motivation',
  code_architect: 'motivation',
};

export const SOURCE_LABEL = {
  github: 'GitHub', spotify: 'Spotify', google_gmail: 'Gmail', whoop: 'Whoop',
  google_calendar: 'Calendar', youtube: 'YouTube', discord: 'Discord', outlook: 'Outlook',
};

const SOURCE_KINDS = {
  github: 'finished work, and the hours you do it',
  spotify: 'plays, repeats, new artists',
  google_gmail: 'sender counts, send times, never a name',
  whoop: 'sleep, recovery, workouts',
  google_calendar: 'events per day, time of day, never a title',
  youtube: 'subscriptions, topics',
  discord: 'where you talk, how much',
  outlook: 'send times, never a name',
};

const NEW_DAYS = 7;
const MAX_EVIDENCE = 5;
const MIN_EVIDENCE = 2;
const MAX_READINGS = 40;

/** A reading addressed to the person, not about them. Older readings say "This person" or "They". */
export function isSecondPerson(text) {
  return /^\s*(you|your)\b/i.test(String(text || ''));
}

function sourceOf(memory) {
  return memory?.metadata?.platform || memory?.metadata?.source || 'unknown';
}

function day(iso) {
  return typeof iso === 'string' ? iso.slice(0, 10) : '';
}

function minute(iso) {
  if (typeof iso !== 'string') return '';
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : day(iso);
}

/** Session words a person would use, from Whoop's strain labels. */
function sessionWord(label) {
  const l = (label || '').toLowerCase();
  if (l.includes('recovery') || l.includes('light')) return 'an easy session';
  if (l.includes('moderate')) return 'a moderate session';
  if (l.includes('hard') || l.includes('strenuous') || l.includes('all out')) return 'a hard session';
  return 'a session';
}

const TRANSLATIONS = {
  spotify: [
    [/^Listened to '(.+)' by (.+?) at .+$/, (m) => `${m[1]}, ${m[2]}`],
    [/^Currently playing '(.+)' by (.+)$/, (m) => `${m[1]}, ${m[2]}, playing now`],
    [/^Discovered new artist: (.+)$/, (m) => `A new artist: ${m[1]}`],
  ],
  github: [
    [/^Opened PR #\d+ in (\S+)/, (m) => `Started a change to ${m[1]}`],
    [/^Merged PR #\d+ in (\S+)/, (m) => `Finished a change to ${m[1]}`],
    [/^Closed PR #\d+ in (\S+)/, (m) => `Set aside a change to ${m[1]}`],
    [/^Pushed (\d+) commits? to (\S+)/, (m) => `Worked on ${m[2]}`],
  ],
  whoop: [
    [/^Slept ([\d.]+) hours \((.+?)\)/, (m) => `Slept ${m[1]} hours, ${m[2].replace('-', ' ')}`],
    [/^Recovery score: (\d+)% \((.+?)\)/, (m) => `Recovery ${m[1]}%, ${m[2]}`],
    [/^Whoop recovery trending (up|down) \((\d+)% → (\d+)%\)/, (m) => `Recovery ${m[1] === 'up' ? 'climbing' : 'dropping'}, ${m[2]}% to ${m[3]}%`],
    [/^Latest Whoop workout: (.+?) — strain [\d.]+\/21 \((.+?)\)/, (m) => `${m[1]}, ${sessionWord(m[2])}`],
    [/^Sleep details: .*?(\d+) disturbances, consistency (\d+)%/, (m) => {
      const woke = Number(m[1]); const cons = Number(m[2]);
      const night = woke >= 12 ? `A restless night, woke ${woke} times` : `Woke ${woke} times`;
      return cons < 40 ? `${night}, bedtime far from usual` : night;
    }],
  ],
  google_calendar: [
    [/^Calendar schedule for (\w+) [\d-]+: (\d+) events? \(.*\) — (\w+)-(loaded|focused) scheduling/, (m) => `${m[1]}: ${m[2]} event${m[2] === '1' ? '' : 's'}, ${m[3]} ${m[4] === 'loaded' ? 'heavy' : 'focused'}`],
    [/^Has a meeting '.+' from (.+?) to (.+?) on (\w+)/, (m) => `An appointment ${m[3]} at ${m[1]}`],
  ],
  google_gmail: [
    [/^Inbox grew by (\d+) unread emails? in the last (.+?);/, (m) => `${m[1]} new emails in ${m[2]}, most from one sender`],
    [/^Your email mix this week: (.+?) —/, (m) => {
      const mix = m[1].replace(/\bdev\b/g, 'work');
      return /^work 100%$/.test(mix) ? 'Every email this week was about work' : `Email mix this week: ${mix}`;
    }],
    [/^Most frequent email senders this week: \S+ \((\d+)\)/, (m) => `Most mail this week came from one sender, ${m[1]} emails`],
    [/^Receives email from (\d+) distinct senders/, (m) => `${m[1]} different people wrote to you this month`],
    [/^Sending rhythm: emails almost exclusively on weekdays/, () => 'You send email almost only on weekdays'],
  ],
  youtube: [
    [/^YouTube subscription topics: (.+)$/, (m) => `What you follow: ${m[1]}`],
    [/^Subscribed to (\d+) YouTube channels, including: (.+)$/, (m) => `${m[1]} channels, including ${m[2]}`],
    [/^YouTube subscription tenure: average (\d+) months/, (m) => `You have followed your channels for ${m[1]} months on average`],
  ],
};

/**
 * One evidence card from a raw memory: source, minute, plain event.
 * Unknown shapes fall back to the raw text with platform punctuation softened.
 */
export function plainEvent(memory) {
  const source = sourceOf(memory);
  const content = String(memory?.content || '').trim();
  for (const [re, render] of TRANSLATIONS[source] || []) {
    const m = content.match(re);
    if (m) return { source, at: minute(memory.created_at), event: render(m) };
  }
  return { source, at: minute(memory.created_at), event: content.replace(/\s+—\s+/g, ', ') };
}

function firstSentence(markdown) {
  const text = String(markdown || '')
    .replace(/^#.*$/gm, '')
    .replace(/\[\[[^\]]*\]\]/g, '')
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const m = text.match(/^[^.!?]+[.!?]/);
  return m ? m[0].trim() : text.slice(0, 160);
}

function daysBetween(a, b) {
  return Math.floor((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/**
 * Pure: rows in, PortraitData out.
 * @param {object} p
 * @param {string} p.owner            first name
 * @param {object[]} p.reflections    user_memories rows, memory_type reflection
 * @param {Map|object} p.eventsById   raw platform_data/observation rows by id
 * @param {object[]} p.connections    platform_connections rows
 * @param {object[]} p.wikiPages      user_wiki_pages rows (domain, content_md)
 * @param {Date} p.now
 */
export function buildPortrait({ owner, reflections = [], eventsById = new Map(), connections = [], wikiPages = [], now = new Date() }) {
  const getEvent = (id) => (eventsById instanceof Map ? eventsById.get(id) : eventsById[id]);

  const readings = [];
  for (const r of reflections) {
    const ids = Array.isArray(r.metadata?.observation_ids) ? r.metadata.observation_ids : [];
    const events = ids.map(getEvent).filter(Boolean)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, MAX_EVIDENCE);
    if (events.length < MIN_EVIDENCE) continue;
    const supportedAt = events.reduce((max, e) => (e.created_at > max ? e.created_at : max), events[0].created_at);
    readings.push({
      id: r.id,
      domain: DOMAIN_OF_EXPERT[r.metadata?.expert] || 'personality',
      text: r.content,
      sourceReflection: r.id,
      evidence: events.map(plainEvent),
      writtenAt: day(r.created_at),
      supportedAt: day(supportedAt),
      verdict: r.metadata?.verdict ?? null,
      verdictNote: r.metadata?.verdict_note || undefined,
    });
  }

  // Second-person readings first, then the rest, newest first within each; the page shows a bounded ledger.
  readings.sort((x, y) => (Number(isSecondPerson(y.text)) - Number(isSecondPerson(x.text))) || (y.writtenAt < x.writtenAt ? -1 : y.writtenAt > x.writtenAt ? 1 : 0));
  readings.splice(MAX_READINGS);

  const byDomain = (d) => readings.filter((x) => x.domain === d && x.verdict !== 'wrong');
  const signature = DOMAINS.map((domain) => {
    const own = byDomain(domain);
    const page = wikiPages.find((p) => p.domain === domain);
    const line = page ? firstSentence(page.content_md) : (own[0]?.text || '');
    return { domain, line, from: own.map((x) => x.id) };
  }).filter((s) => s.line);

  const fresh = readings.filter((x) => daysBetween(x.writtenAt, now.toISOString()) <= NEW_DAYS && !x.verdict);
  const thinnest = [...fresh].sort((a, b) => a.evidence.length - b.evidence.length)[0] || null;
  const question = thinnest
    ? {
        fromReadings: [thinnest.id],
        evidenceLine: `${SOURCE_LABEL[thinnest.evidence[0].source] || thinnest.evidence[0].source}, ${thinnest.evidence[0].at}: ${thinnest.evidence[0].event}.`,
        question: `Does this sound like you? ${thinnest.text}`,
        answers: ['Yes, that is me', 'Not really'],
        yourAnswer: null,
      }
    : null;

  const sources = connections
    .filter((c) => c.status === 'connected')
    .map((c) => ({
      platform: c.platform,
      label: SOURCE_LABEL[c.platform] || c.platform,
      read: `${c.content_volume ?? 0} items`,
      since: day(c.connected_at),
      kinds: SOURCE_KINDS[c.platform] || 'activity',
    }));

  return { owner, sources, question, signature, readings, ask: [] };
}

// ------------------------------------------------------------------
// Loading half
// ------------------------------------------------------------------

/**
 * Receipts survive forgetting. The weekly cron archives raw events after 30 days
 * (user_memories -> user_memories_archive), so a reading's evidence is resolved from
 * the hot table first and the archive for whatever is missing. Both carry the same
 * columns; the archive row is marked so the card can say it is older.
 */
export async function loadEvents(ids) {
  const eventsById = new Map();
  if (!ids.length) return eventsById;
  const { data: hot } = await supabaseAdmin.from('user_memories')
    .select('id, content, metadata, memory_type, created_at').in('id', ids);
  for (const e of hot || []) eventsById.set(e.id, e);
  const missing = ids.filter((id) => !eventsById.has(id));
  if (missing.length) {
    const { data: archived } = await supabaseAdmin.from('user_memories_archive')
      .select('id, content, metadata, memory_type, created_at, archive_reason').in('id', missing);
    // What the person deleted stays deleted: only the cron's own archiving is read back.
    for (const e of archived || []) {
      if (e.archive_reason === 'person_deleted_source') continue;
      eventsById.set(e.id, { ...e, archived: true });
    }
  }
  return eventsById;
}

export async function loadPortrait(userId, now = new Date()) {
  const [{ data: user }, { data: reflections }, { data: connections }, { data: wikiPages }] = await Promise.all([
    supabaseAdmin.from('users').select('first_name').eq('id', userId).single(),
    supabaseAdmin.from('user_memories').select('id, content, metadata, created_at')
      .eq('user_id', userId).eq('memory_type', 'reflection')
      .not('metadata->observation_ids', 'is', null)
      .order('created_at', { ascending: false }).limit(80),
    supabaseAdmin.from('platform_connections').select('platform, status, content_volume, connected_at').eq('user_id', userId),
    supabaseAdmin.from('user_wiki_pages').select('domain, content_md').eq('user_id', userId),
  ]);

  const ids = [...new Set((reflections || []).flatMap((r) => r.metadata?.observation_ids || []))];
  const eventsById = await loadEvents(ids);

  return buildPortrait({
    owner: user?.first_name || 'Your',
    reflections: reflections || [],
    eventsById,
    connections: connections || [],
    wikiPages: wikiPages || [],
    now,
  });
}

const VERDICTS = new Set(['true', 'partly', 'wrong']);

/** Writes the verdict onto the reading; a note becomes the heaviest memory of the day. */
export async function setVerdict(userId, readingId, verdict, note) {
  if (verdict !== null && !VERDICTS.has(verdict)) throw new Error('invalid verdict');
  const { data: row, error } = await supabaseAdmin.from('user_memories')
    .select('id, content, metadata').eq('id', readingId).eq('user_id', userId).eq('memory_type', 'reflection').single();
  if (error || !row) throw new Error('reading not found');
  const metadata = { ...(row.metadata || {}), verdict, verdict_note: note || null, verdict_at: new Date().toISOString() };
  const { error: updateError } = await supabaseAdmin.from('user_memories').update({ metadata }).eq('id', readingId).eq('user_id', userId);
  if (updateError) throw updateError;
  if (note && note.trim()) {
    await addMemory(userId, `In your words, about "${row.content}": ${note.trim()}`, 'fact',
      { source: 'you', reading_id: readingId, verdict }, { skipImportance: true, importanceScore: 10 });
  }
  log.info('Verdict set', { userId, readingId, verdict });
  return { id: readingId, verdict, verdictNote: note || undefined };
}

/** Today's answer: a fact in the person's words and a verdict on the reading it was about. */
export async function answerQuestion(userId, readingIds, answer) {
  const text = String(answer || '').trim();
  if (!text) throw new Error('empty answer');
  const positive = /^yes/i.test(text);
  const readingId = Array.isArray(readingIds) ? readingIds[0] : null;
  if (readingId) await setVerdict(userId, readingId, positive ? 'true' : (/^not really/i.test(text) ? 'wrong' : 'partly'), positive ? null : text);
  await addMemory(userId, `You said: ${text}`, 'fact', { source: 'you', reading_ids: readingIds || [] }, { skipImportance: true, importanceScore: 10 });
  return { answered: true };
}

// ------------------------------------------------------------------
// Sources: delete everything from one platform
// ------------------------------------------------------------------

const DELETE_BATCH = 500;
const DELETE_MAX_BATCHES = 40;

/** Pure: which readings leaned on any of the deleted events. */
export function readingsTouchedBy(reflections, deletedIds) {
  const gone = new Set(deletedIds);
  return (reflections || []).filter((r) => (r.metadata?.observation_ids || []).some((id) => gone.has(id)));
}

/**
 * Archives every raw event from one platform (so the person can still audit what was
 * read) and deletes it from the hot table, then marks the readings that leaned on those
 * events with evidence_deleted_at. The Portrait shows them as fading with that reason;
 * nothing else is deleted by the system.
 */
export async function deleteSource(userId, platform) {
  if (!/^[a-z_]+$/.test(platform)) throw new Error('invalid platform');
  let deleted = 0;
  const deletedIds = [];
  for (let batch = 0; batch < DELETE_MAX_BATCHES; batch++) {
    const { data: rows, error } = await supabaseAdmin.from('user_memories')
      .select('id, user_id, content, memory_type, metadata, importance_score, created_at, last_accessed_at')
      .eq('user_id', userId)
      .in('memory_type', ['platform_data', 'observation'])
      .or(`metadata->>platform.eq.${platform},metadata->>source.eq.${platform}`)
      .limit(DELETE_BATCH);
    if (error) throw error;
    if (!rows || rows.length === 0) break;
    const { error: insertErr } = await supabaseAdmin.from('user_memories_archive')
      .insert(rows.map((r) => ({ ...r, archived_at: new Date().toISOString(), archive_reason: 'person_deleted_source' })));
    if (insertErr) throw insertErr;
    const ids = rows.map((r) => r.id);
    const { error: delErr } = await supabaseAdmin.from('user_memories').delete().in('id', ids);
    if (delErr) throw delErr;
    deleted += ids.length;
    deletedIds.push(...ids);
    if (rows.length < DELETE_BATCH) break;
  }

  const { data: reflections } = await supabaseAdmin.from('user_memories')
    .select('id, metadata').eq('user_id', userId).eq('memory_type', 'reflection')
    .not('metadata->observation_ids', 'is', null).limit(500);
  const touched = readingsTouchedBy(reflections, deletedIds);
  const stamp = new Date().toISOString();
  for (const r of touched) {
    await supabaseAdmin.from('user_memories')
      .update({ metadata: { ...(r.metadata || {}), evidence_deleted_at: stamp, evidence_deleted_source: platform } })
      .eq('id', r.id).eq('user_id', userId);
  }
  log.info('Source deleted by the person', { userId, platform, deleted, readingsTouched: touched.length });
  return { platform, deleted, readingsTouched: touched.length };
}
