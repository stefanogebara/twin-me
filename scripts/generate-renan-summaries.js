/**
 * Generate ~10 English fact-summaries from the Renan call transcript and
 * persist them as `fact` rows in user_memories.
 *
 * Why: the verbatim Portuguese turns retrieve fine when the user query mentions
 * Renan or the call directly. But concept-only English queries (e.g.
 * "features I should kill in TwinMe", "Vibe Anything paradigm") fail because
 * (a) PT body doesn't vector-match EN query well, and (b) recency/importance
 * weighting drowns the call out under the music reflection pile. Separate
 * English-language facts give those concept queries something to land on.
 *
 * Idempotent: clears prior facts tagged source='renan_call_2026-04-20_facts'
 * before re-inserting.
 *
 * Usage:
 *   node scripts/generate-renan-summaries.js
 */

import fs from 'node:fs';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from '../api/services/embeddingService.js';
import { complete, TIER_ANALYSIS } from '../api/services/llmGateway.js';

dotenv.config();

const TRANSCRIPT_PATH = 'C:/Users/stefa/Downloads/Impromptu Google Meet Meeting - Apr.md';
const SOURCE_TAG = 'renan_call_2026-04-20_facts';
const STEFANO_USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function clearExisting() {
  const { data, error } = await sb
    .from('user_memories')
    .delete()
    .eq('user_id', STEFANO_USER_ID)
    .eq('memory_type', 'fact')
    .filter('metadata->>source', 'eq', SOURCE_TAG)
    .select('id');
  if (error) throw new Error(`Failed clearing existing facts: ${error.message}`);
  console.log(`Cleared ${(data || []).length} existing fact rows tagged ${SOURCE_TAG}.`);
}

async function generateFacts(transcript) {
  const prompt = `You are extracting durable, English-language takeaways from a 67-minute mentorship call between Renan Hannouche (mentor, founder of GravidadeZero) and Stefano Gebara (founder of TwinMe). The full transcript is in Portuguese. Your job: produce 10-12 concise facts that capture the strategic content of the call so they can be retrieved later by English semantic search.

Rules:
- Each fact MUST be in ENGLISH, present tense, written from Stefano's perspective ("I should...", "Renan told me...", "My UVP is...").
- Each fact MUST be 1-3 sentences, self-contained, no pronoun-only references.
- Capture: the credit-card-wedge framework, the Natura WhatsApp twin demo as a job-to-be-done example, the "Vibe Anything" / single-canvas conversational UI direction, the "fazer menos não mais" / do-less-not-more directive, what features Renan flagged for kill (Soul Signature primary surface, Knowledge Graph, generic onboarding), the chosen Financial-Emotional Twin pivot, the moat (biology + mood + stress + comms + banking), and Renan's investor offer.
- Do NOT quote raw Portuguese. Translate everything to English.
- Output JSON array of strings, no commentary.

Transcript:
${transcript.slice(0, 15000)}

Return ONLY a JSON array like: ["fact 1", "fact 2", ...]`;

  const response = await complete({
    messages: [{ role: 'user', content: prompt }],
    tier: TIER_ANALYSIS,
    maxTokens: 2000,
    temperature: 0.2,
    userId: STEFANO_USER_ID,
    serviceName: 'renan-fact-extract',
  });

  const text = response?.content || '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`LLM did not return JSON array. Raw: ${text.slice(0, 300)}`);
  const facts = JSON.parse(match[0]);
  if (!Array.isArray(facts) || !facts.length) throw new Error('Empty facts array');
  return facts.filter(f => typeof f === 'string' && f.length > 30);
}

async function ingestFact(content, index) {
  const embedding = await generateEmbedding(content);
  // High importance — these are the strategic takeaways. 9 ensures they
  // outrank ambient music reflections in the importance-weighted retrieval.
  const importance = 9;
  const { error } = await sb.from('user_memories').insert({
    user_id: STEFANO_USER_ID,
    memory_type: 'fact',
    content,
    embedding,
    importance_score: importance,
    metadata: {
      source: SOURCE_TAG,
      call_date: '2026-04-20',
      summary_index: index,
      mentor: 'Renan Hannouche',
    },
  });
  if (error) throw new Error(`Insert failed at fact ${index}: ${error.message}`);
}

async function main() {
  if (!fs.existsSync(TRANSCRIPT_PATH)) {
    console.error(`Transcript not found at ${TRANSCRIPT_PATH}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(TRANSCRIPT_PATH, 'utf-8');
  console.log(`Read transcript (${raw.length} chars).`);

  console.log('Asking LLM for English fact-summaries...');
  const facts = await generateFacts(raw);
  console.log(`Got ${facts.length} facts.`);

  await clearExisting();

  for (let i = 0; i < facts.length; i++) {
    await ingestFact(facts[i], i);
    console.log(`  [${i + 1}] ${facts[i].slice(0, 90)}...`);
  }

  console.log(`Done. Inserted ${facts.length} fact rows.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
