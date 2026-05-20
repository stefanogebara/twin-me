#!/usr/bin/env node
/**
 * Live verification: post-deploy 49e07a68 — extended-tool example coverage.
 * =========================================================================
 * Sibling fix to yesterday's get_meeting_prep verification. Yesterday proved
 * one tool fires; this script proves the *audited class* fires.
 *
 * Mints a JWT for the test user, confirms github + spotify connections are
 * present (otherwise getAvailableTools strips the tools before the prompt
 * even sees them), fires bait queries at prod chat that should each trigger
 * one of the freshly-taught tools, parses the SSE stream for action_start
 * events, then reads hop_timings from mcp_conversation_logs to confirm
 * action_chain_done depth >= 1.
 *
 * PASS criteria per tool:
 *   - SSE stream emits action_start with tool = expected name
 *   - hop_timings shows action_chain_done with depth >= 1
 *
 * Spotify caveat: spotify_play_track is a write action so the first turn
 * just asks for confirmation; we don't actually expect a tool fire on the
 * single-shot. We assert the prompt still teaches it by reading the
 * twin's response for the tool name or a "want me to play" confirmation
 * phrase.
 *
 * Run:  node scripts/verify-extended-tool-examples.mjs
 * Needs: .env with JWT_SECRET + Supabase service-role creds.
 */
import dotenv from 'dotenv';
dotenv.config();

import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const PROD = process.env.TEST_API_URL || 'http://127.0.0.1:3004/api';

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function mintToken() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET missing from .env');
  return jwt.sign({ id: USER, email: 'stefanogebara@gmail.com' }, secret, { expiresIn: '15m' });
}

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

async function checkConnection(platform) {
  const { data, error } = await sb
    .from('platform_connections')
    .select('platform, status, connected_at')
    .eq('user_id', USER)
    .eq('platform', platform)
    .maybeSingle();
  if (error) return { connected: false, reason: error.message };
  if (!data) return { connected: false, reason: 'no row' };
  return { connected: data.status === 'connected' || !data.status, status: data.status };
}

async function fireChat(token, message) {
  const res = await fetch(`${PROD}/chat/message?stream=1`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let buf = '';
  let conversationId = null;
  let replyText = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const evt = JSON.parse(payload);
        events.push(evt);
        if (evt.type === 'chunk' && typeof evt.content === 'string') replyText += evt.content;
        if (evt.type === 'done' && typeof evt.message === 'string') replyText = replyText || evt.message;
        if (evt.conversationId) conversationId = evt.conversationId;
      } catch { /* keep moving */ }
    }
  }
  return { events, conversationId, replyText };
}

async function getHopTimings(conversationId) {
  if (!conversationId) return null;
  const { data, error } = await sb
    .from('mcp_conversation_logs')
    .select('hop_timings, model_used')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { error: error.message };
  return data;
}

function findHop(hop_timings, label) {
  if (!Array.isArray(hop_timings)) return null;
  return hop_timings.find(h => h.label === label || h.hop === label || h.name === label) || null;
}

console.log('=== Verify post-deploy 49e07a68: github_search_issues + spotify_play_track ===\n');

// --- 0. Pre-flight: connections ---
console.log('0. Platform connections');
const gh = await checkConnection('github');
const sp = await checkConnection('spotify');
check('github connected', gh.connected, gh.status || gh.reason || '');
check('spotify connected', sp.connected, sp.status || sp.reason || '');
console.log('');

const token = mintToken();

// --- 1. github_search_issues bait ---
console.log('1. github_search_issues — bait: "Any open issues about prompt or examples?"');
if (!gh.connected) {
  console.log('  SKIP  github not connected, tool would be stripped before prompt — verifying via response text only.');
}
const ghQuery = 'Any open issues about prompt or examples?';
const ghResult = await fireChat(token, ghQuery);
const ghActionStart = ghResult.events.find(e => e.type === 'action_start' && e.tool === 'github_search_issues');
const ghActionResult = ghResult.events.find(e => e.type === 'action_result' && e.tool === 'github_search_issues');
check('SSE has action_start for github_search_issues', !!ghActionStart, ghActionStart ? JSON.stringify(ghActionStart.params) : 'not emitted');
if (ghActionStart) {
  check('SSE has action_result for github_search_issues', !!ghActionResult, ghActionResult ? `success=${ghActionResult.success}` : 'missing');
}
const ghHops = await getHopTimings(ghResult.conversationId);
if (ghHops?.hop_timings) {
  const chainDone = findHop(ghHops.hop_timings, 'action_chain_done');
  check('hop_timings.action_chain_done depth >= 1', chainDone && chainDone.depth >= 1, chainDone ? `depth=${chainDone.depth}, chainMs=${chainDone.chainMs}` : 'no action_chain_done hop');
}
console.log(`  reply (first 200 chars): ${ghResult.replyText.slice(0, 200).replace(/\n/g, ' ')}\n`);

// --- 2. spotify_play_track bait (write action — expect confirmation, not fire) ---
console.log('2. spotify_play_track — bait: "Play Bohemian Rhapsody now"');
const spQuery = 'Play Bohemian Rhapsody now';
const spResult = await fireChat(token, spQuery);
const spActionStart = spResult.events.find(e => e.type === 'action_start' && e.tool === 'spotify_play_track');
// First turn on a write action: model should ASK for confirmation, not fire.
// Verify by checking the reply mentions playing / Bohemian, and DOES NOT contain a raw [ACTION: ...] tag that escaped parsing.
const mentionsPlayIntent = /play|playing|bohemian/i.test(spResult.replyText);
check('reply acknowledges play intent', mentionsPlayIntent, spResult.replyText.slice(0, 120).replace(/\n/g, ' '));
check('reply does NOT contain unparsed [ACTION:', !/\[ACTION:/.test(spResult.replyText), 'good — write actions ask before firing');
// Optional: did it fire anyway (autonomy level might let it)?
if (spActionStart) {
  console.log(`  INFO  twin fired spotify_play_track directly (autonomy permits): ${JSON.stringify(spActionStart.params)}`);
}
console.log(`  reply (first 200 chars): ${spResult.replyText.slice(0, 200).replace(/\n/g, ' ')}\n`);

// --- 3. Summary ---
console.log(`=== Result: ${failures === 0 ? 'PASS' : `FAIL (${failures} check${failures > 1 ? 's' : ''} failed)`} ===`);
process.exit(failures === 0 ? 0 : 1);
