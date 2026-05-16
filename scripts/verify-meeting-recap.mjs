#!/usr/bin/env node
/**
 * End-to-end verification: the post-meeting recap path.
 * =====================================================
 * Proves the full Phase-3 agentic action works against the REAL backend:
 *
 *   1. Seed a meeting_briefings row WITH a debrief for the test user
 *      (direct Supabase insert — the debrief is normally produced by the
 *      cron-meeting-debrief job).
 *   2. POST /api/meeting-briefings/:id/recap with a minted JWT — the same
 *      call the "Recap por e-mail" button on /meetings makes.
 *   3. Assert the response carries a real drafted subject + body. If Gmail
 *      is connected the draft is also saved (draftId + gmailUrl); if not,
 *      the endpoint still returns the text with a note — both are valid.
 *   4. Clean up the seeded row no matter what.
 *
 * This exercises: ownership check → generateRecapEmail (LLM) → draftEmail
 * → response shaping. The mocked comprehensive spec covers the UI; this
 * covers the live server path the spec can't reach.
 *
 * Run:  node scripts/verify-meeting-recap.mjs
 * Needs: backend on :3004, .env with JWT_SECRET + Supabase creds.
 */
import dotenv from 'dotenv';
dotenv.config();

import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../api/services/database.js';

const USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3004/api';
const EVENT_ID = `verify-recap-${Date.now()}`;

function mintToken() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET missing from .env');
  return jwt.sign({ id: USER, email: 'stefanogebara@gmail.com' }, secret, { expiresIn: '15m' });
}

const briefingJson = {
  headline: 'Retro da sprint — alinhamento sobre o gargalo de revisão',
  attendees: [],
  companyContext: null,
  talkingPoints: ['O que travou a entrega', 'Como reduzir o tempo de revisão'],
  watchOuts: [],
  myContext: 'Você facilitou a retro.',
  debrief: {
    summary: 'A equipe concluiu que o gargalo da sprint foi o tempo de revisão de código.',
    likelyCovered: ['Velocidade da sprint', 'Gargalo de revisão de PRs'],
    probableActionItems: [
      { owner: 'me', task: 'Propor pair-review nas PRs grandes' },
      { owner: 'Paula', task: 'Revisar o backlog de bugs antes da próxima sprint' },
    ],
    followUpsRecommended: ['Marcar um follow-up em duas semanas para medir o impacto'],
    relationshipNotes: [{ person: 'Paula', note: 'Sinalizou estar sobrecarregada esta sprint.' }],
    generatedAt: new Date().toISOString(),
  },
  _meta: {
    summary: 'Retro da sprint',
    startTime: new Date(Date.now() - 5 * 3600_000).toISOString(),
    endTime: new Date(Date.now() - 4 * 3600_000).toISOString(),
    location: null,
    hangoutLink: null,
    meetingUrl: null,
    // One external attendee so the recap has a recipient to address.
    attendees: [
      { email: 'paula@example.com', name: 'Paula Reis', responseStatus: 'accepted', organizer: false },
    ],
  },
};

let seededId = null;
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

console.log('=== Verify meeting recap path ===\n');

try {
  // 1. Seed
  const { data: seeded, error: seedErr } = await supabaseAdmin
    .from('meeting_briefings')
    .insert({
      user_id: USER,
      event_id: EVENT_ID,
      event_etag: 'verify-etag',
      headline: briefingJson.headline,
      briefing_json: briefingJson,
      generated_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (seedErr) throw new Error(`seed failed: ${seedErr.message}`);
  seededId = seeded.id;
  console.log(`1. Seeded briefing ${seededId} (event ${EVENT_ID})\n`);

  // 2. Call the recap endpoint
  const token = mintToken();
  console.log('2. POST /meeting-briefings/:id/recap ...');
  const res = await fetch(`${API}/meeting-briefings/${seededId}/recap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({}),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`   HTTP ${res.status}\n`);

  // 3. Assert
  console.log('3. Assertions:');
  check('HTTP 200', res.status === 200, `got ${res.status}`);
  check('success: true', body.success === true);
  check('subject is a non-empty string', typeof body.subject === 'string' && body.subject.length > 3,
    body.subject ? `"${body.subject}"` : 'missing');
  check('body is a substantial string', typeof body.body === 'string' && body.body.length > 40,
    typeof body.body === 'string' ? `${body.body.length} chars` : 'missing');
  check('recipient resolved to the external attendee', body.to === 'paula@example.com',
    body.to || 'null');
  // Gmail draft is best-effort — draftId present OR a note explaining why not.
  check('draft saved OR note explains why not',
    !!body.draftId || !!body.note,
    body.draftId ? `draftId ${body.draftId}` : (body.note || 'neither'));

  if (typeof body.body === 'string') {
    console.log('\n   --- drafted recap ---');
    console.log(`   Subject: ${body.subject}`);
    console.log('   ' + body.body.split('\n').join('\n   '));
    console.log('   ---------------------');
  }
} catch (err) {
  console.error('\nFATAL:', err.message);
  failures++;
} finally {
  // 4. Cleanup
  if (seededId) {
    const { error: delErr } = await supabaseAdmin
      .from('meeting_briefings')
      .delete()
      .eq('id', seededId);
    console.log(`\n4. Cleanup: ${delErr ? `FAILED — ${delErr.message}` : `removed ${seededId}`}`);
  }
}

console.log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} ===`);
process.exit(failures === 0 ? 0 : 1);
