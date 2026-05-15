#!/usr/bin/env node
/* eslint-disable */
//
// inspect-chat-traces — pretty-print the most recent chat-turn hop_timings
// ladders from mcp_conversation_logs. Built on the audit-2026-05-13 trace
// infrastructure (PR1 hop logs + 80f8da39 persistence + memory leg + circuit
// breaker instrumentation). Used to diagnose slow-tail latency without
// scraping Vercel logs.
//
// Usage:
//   node scripts/inspect-chat-traces.cjs [--limit=N] [--minMs=N] [--trace=ID]
//
//   --limit=N        How many turns to show (default 5)
//   --minMs=N        Only show turns where total elapsed >= N ms (default 0)
//   --trace=ID       Show only the turn with this exact 8-char trace ID
//   --since=DURATION '24h' | '6h' | '30m' (default '24h')

require('dotenv').config({ path: 'C:/Users/stefa/twin-ai-learn/.env' });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// --- args ---
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  }),
);
const LIMIT = parseInt(args.limit || '5', 10);
const MIN_MS = parseInt(args.minMs || '0', 10);
const TRACE = args.trace || null;
const SINCE = args.since || '24h';

function parseSince(s) {
  const m = String(s).match(/^(\d+)([hm])$/);
  if (!m) return 24 * 60 * 60 * 1000;
  const n = parseInt(m[1], 10);
  return n * (m[2] === 'h' ? 60 * 60 * 1000 : 60 * 1000);
}

function fmtMs(ms) {
  if (ms == null) return '   ?  ms';
  return String(ms).padStart(6) + 'ms';
}

function bottleneck(timings) {
  if (!Array.isArray(timings) || timings.length < 2) return null;
  let worst = null;
  for (let i = 1; i < timings.length; i++) {
    const delta = (timings[i].elapsedMs || 0) - (timings[i - 1].elapsedMs || 0);
    if (!worst || delta > worst.delta) {
      worst = { from: timings[i - 1].hop, to: timings[i].hop, delta };
    }
  }
  return worst;
}

function renderTrace(row) {
  const total = (row.hop_timings?.slice(-1)[0] || {}).elapsedMs;
  console.log(`\n=== ${row.trace_id || '(no trace)'}  ${row.created_at}  total=${total}ms ===`);
  console.log(`Prompt: "${(row.user_message || '').slice(0, 60).replace(/\n/g, ' ')}${(row.user_message || '').length > 60 ? '…' : ''}"`);
  console.log(`coldStartMs=${row.cold_start_ms} memoryCount=${row.memory_count}`);
  console.log('');

  let prev = 0;
  for (const h of row.hop_timings || []) {
    const delta = (h.elapsedMs || 0) - prev;
    const extras = Object.entries(h)
      .filter(([k]) => !['hop', 'elapsedMs'].includes(k))
      .slice(0, 5)
      .map(([k, v]) => {
        const val = typeof v === 'object' ? JSON.stringify(v).slice(0, 40) : String(v).slice(0, 40);
        return `${k}=${val}`;
      })
      .join(' ');
    console.log(`  ${fmtMs(h.elapsedMs)}  +${String(delta).padStart(5)}ms  ${h.hop.padEnd(28)} ${extras}`);
    prev = h.elapsedMs;
  }

  // Pull the context_fetch_done hop's per-leg breakdown if present.
  const ctx = (row.hop_timings || []).find((h) => h.hop === 'context_fetch_done');
  if (ctx) {
    const memLegs = Object.entries(ctx)
      .filter(([k]) => k.startsWith('memLeg_'))
      .sort((a, b) => (b[1] || 0) - (a[1] || 0));
    if (memLegs.length) {
      console.log('\n  Memory sub-legs (slowest first):');
      for (const [k, v] of memLegs) {
        console.log(`    ${k.replace('memLeg_', '').padEnd(20)} ${fmtMs(v)}`);
      }
    }
    if (ctx._fanoutMs != null || ctx._postProcessingMs != null) {
      console.log(`\n  Context-fetch split: fanout=${ctx._fanoutMs}ms  post=${ctx._postProcessingMs}ms  breakerTripped=${ctx._circuitBreakerTripped}`);
    }
  }

  // LLM TTFT split if present
  const llm = (row.hop_timings || []).find((h) => h.hop === 'llm_first_call_done');
  if (llm?.ttftMs != null) {
    const genMs = (llm.totalLlmMs ?? llm.llmMs) - llm.ttftMs;
    console.log(`\n  LLM split: ttft=${llm.ttftMs}ms  generation=${genMs}ms  chars=${llm.replyChars}`);
  }

  const bn = bottleneck(row.hop_timings);
  if (bn) {
    console.log(`\n  ► Bottleneck: ${bn.from} → ${bn.to} = ${bn.delta}ms`);
  }
}

(async () => {
  let query = sb
    .from('mcp_conversation_logs')
    .select('trace_id, user_message, hop_timings, cold_start_ms, memory_count, created_at')
    .not('hop_timings', 'is', null)
    .order('created_at', { ascending: false })
    .limit(LIMIT);

  if (TRACE) {
    query = sb
      .from('mcp_conversation_logs')
      .select('trace_id, user_message, hop_timings, cold_start_ms, memory_count, created_at')
      .eq('trace_id', TRACE)
      .limit(1);
  } else {
    const sinceIso = new Date(Date.now() - parseSince(SINCE)).toISOString();
    query = query.gte('created_at', sinceIso);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Query error:', error.message);
    process.exit(1);
  }
  if (!data?.length) {
    console.log('No matching trace rows.');
    process.exit(0);
  }

  const filtered = data.filter((r) => {
    const total = (r.hop_timings?.slice(-1)[0] || {}).elapsedMs || 0;
    return total >= MIN_MS;
  });

  console.log(`Found ${filtered.length} trace(s)${MIN_MS ? ` >=${MIN_MS}ms` : ''}.`);
  for (const row of filtered) renderTrace(row);

  // Summary stats
  if (filtered.length > 1) {
    const totals = filtered
      .map((r) => (r.hop_timings?.slice(-1)[0] || {}).elapsedMs)
      .filter((v) => v != null)
      .sort((a, b) => a - b);
    const ctxMs = filtered
      .map((r) => {
        const ctx = (r.hop_timings || []).find((h) => h.hop === 'context_fetch_done');
        const start = (r.hop_timings || []).find((h) => h.hop === 'context_fetch_start');
        return ctx && start ? ctx.elapsedMs - start.elapsedMs : null;
      })
      .filter((v) => v != null)
      .sort((a, b) => a - b);
    const llmMs = filtered
      .map((r) => (r.hop_timings || []).find((h) => h.hop === 'llm_first_call_done')?.llmMs)
      .filter((v) => v != null)
      .sort((a, b) => a - b);

    const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
    console.log(`\n=== Summary (n=${filtered.length}) ===`);
    if (totals.length) console.log(`  total       p50=${pct(totals, 0.5)}ms  p95=${pct(totals, 0.95)}ms  max=${totals[totals.length - 1]}ms`);
    if (ctxMs.length) console.log(`  context     p50=${pct(ctxMs, 0.5)}ms  p95=${pct(ctxMs, 0.95)}ms  max=${ctxMs[ctxMs.length - 1]}ms`);
    if (llmMs.length) console.log(`  llm_first   p50=${pct(llmMs, 0.5)}ms  p95=${pct(llmMs, 0.95)}ms  max=${llmMs[llmMs.length - 1]}ms`);
  }
})();
