/**
 * One-shot ingest: Renan Hannouche mentorship call (2026-04-20).
 *
 * Splits the transcript by speaker turn and persists each turn as an
 * `observation` row in `user_memories` for the stefano user, embedded for
 * vector retrieval. Strategic statements from Renan get higher importance so
 * the memory stream surfaces them on retrieval.
 *
 * Idempotent: deletes any prior rows tagged with the same source marker
 * before re-inserting. Run again safely.
 *
 * Usage:
 *   node scripts/ingest-renan-transcript.js
 */

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from '../api/services/embeddingService.js';

dotenv.config();

const TRANSCRIPT_PATH = 'C:/Users/stefa/Downloads/Impromptu Google Meet Meeting - Apr.md';
const SOURCE_TAG = 'renan_call_2026-04-20';
const STEFANO_USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Speaker-turn pattern: e.g. `8:32 - Stefano Gebara` followed by lines of body.
const TURN_RE = /^(\d{1,3}:\d{2})\s+-\s+(.+?)$/;

function parseTranscript(raw) {
  const lines = raw.split(/\r?\n/);
  const turns = [];
  let current = null;

  for (const line of lines) {
    const m = line.match(TURN_RE);
    if (m) {
      if (current) turns.push(current);
      current = { timestamp: m[1], speaker: m[2].trim(), bodyLines: [] };
    } else if (current) {
      const trimmed = line.trim();
      // Skip Fathom's auto-injected ACTION ITEM / WATCH meta-lines — they're
      // about the call, not part of what was said.
      if (trimmed.startsWith('ACTION ITEM:') || trimmed.startsWith('WATCH:')) continue;
      if (trimmed) current.bodyLines.push(trimmed);
    }
  }
  if (current) turns.push(current);

  return turns
    .map(t => ({ ...t, body: t.bodyLines.join(' ').trim() }))
    .filter(t => t.body.length > 0);
}

// Heuristic importance: Renan's longer + framework-y statements get 8-9.
// Stefano's reactions get 5-6. Short single-word turns ("ok", "claro") get 3.
function scoreImportance(turn) {
  const isRenan = /Renan/i.test(turn.speaker);
  const len = turn.body.length;
  if (len < 40) return 3;
  if (isRenan && len > 400) return 9;
  if (isRenan && len > 200) return 8;
  if (isRenan) return 7;
  if (len > 200) return 6;
  return 5;
}

async function clearExisting() {
  const { error, count } = await sb
    .from('user_memories')
    .delete({ count: 'exact' })
    .eq('user_id', STEFANO_USER_ID)
    .eq('memory_type', 'observation')
    .filter('metadata->>source', 'eq', SOURCE_TAG);
  if (error) throw new Error(`Failed clearing existing rows: ${error.message}`);
  console.log(`Cleared ${count ?? 0} existing rows tagged ${SOURCE_TAG}.`);
}

async function ingestTurn(turn, index) {
  const importance = scoreImportance(turn);
  const content = `[${turn.timestamp}] ${turn.speaker}: ${turn.body}`;
  const embedding = await generateEmbedding(content);

  const { error } = await sb.from('user_memories').insert({
    user_id: STEFANO_USER_ID,
    memory_type: 'observation',
    content,
    embedding,
    importance_score: importance,
    metadata: {
      source: SOURCE_TAG,
      speaker: turn.speaker,
      timestamp: turn.timestamp,
      turn_index: index,
      call_date: '2026-04-20',
      call_topic: 'value_proposition_mentorship',
    },
  });

  if (error) throw new Error(`Insert failed at turn ${index}: ${error.message}`);
  return importance;
}

async function main() {
  if (!fs.existsSync(TRANSCRIPT_PATH)) {
    console.error(`Transcript not found at ${TRANSCRIPT_PATH}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(TRANSCRIPT_PATH, 'utf-8');
  const turns = parseTranscript(raw);
  console.log(`Parsed ${turns.length} turns.`);

  await clearExisting();

  const importanceCounts = {};
  let inserted = 0;

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    try {
      const imp = await ingestTurn(turn, i);
      importanceCounts[imp] = (importanceCounts[imp] || 0) + 1;
      inserted++;
      if (inserted % 20 === 0) console.log(`  ${inserted}/${turns.length}…`);
    } catch (err) {
      console.error(`  turn ${i} (${turn.timestamp} ${turn.speaker}): ${err.message}`);
    }
  }

  console.log(`Done. Inserted ${inserted}/${turns.length} turns.`);
  console.log('Importance distribution:', importanceCounts);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
