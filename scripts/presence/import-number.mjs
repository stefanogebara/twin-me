#!/usr/bin/env node
/**
 * Presence: import the Twilio number into ElevenLabs and hand it to the agent.
 *
 * ElevenLabs places and answers her calls through its native Twilio
 * integration, so the repo holds no Twilio SDK: the number is imported once
 * with the Twilio credentials, assigned to the Presence agent (inbound calls
 * reach it), and its id goes into ELEVENLABS_PRESENCE_PHONE_NUMBER_ID for the
 * hourly cron (outbound calls).
 *
 * Usage:
 *   node scripts/presence/import-number.mjs
 *
 * Needs in .env: ELEVENLABS_API_KEY, ELEVENLABS_PRESENCE_AGENT_ID,
 * TWILIO_ACCOUNT_SID (AC...), TWILIO_AUTH_TOKEN, PRESENCE_PHONE_NUMBER (E.164).
 * A US number can call Brazilian mobiles ($0.0663/min); a +55 number needs a
 * CNPJ and a Brazilian address at Twilio.
 * API: POST /v1/convai/phone-numbers, PATCH /v1/convai/phone-numbers/{id}
 * (plan 2026-09-15-presence-forward, Phase 1 task 10).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv() {
  try {
    const text = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    for (const line of text.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* no .env: rely on the environment */
  }
}

loadEnv();
const required = ['ELEVENLABS_API_KEY', 'ELEVENLABS_PRESENCE_AGENT_ID', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'PRESENCE_PHONE_NUMBER'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing: ${missing.join(', ')} (in .env or the environment).`);
  process.exit(2);
}
if (!/^\+[1-9][0-9]{7,14}$/.test(process.env.PRESENCE_PHONE_NUMBER)) {
  console.error('PRESENCE_PHONE_NUMBER must be E.164, e.g. +15550001111');
  process.exit(2);
}

const headers = { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' };
const base = 'https://api.elevenlabs.io/v1/convai/phone-numbers';

const created = await fetch(base, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    phone_number: process.env.PRESENCE_PHONE_NUMBER,
    label: 'Presence',
    provider: 'twilio',
    sid: process.env.TWILIO_ACCOUNT_SID,
    token: process.env.TWILIO_AUTH_TOKEN,
  }),
});
if (!created.ok) {
  console.error(`Import failed: ${created.status} ${await created.text()}`);
  process.exit(1);
}
const { phone_number_id: phoneNumberId } = await created.json();
console.log(`Imported ${process.env.PRESENCE_PHONE_NUMBER} as ${phoneNumberId}`);

const assigned = await fetch(`${base}/${encodeURIComponent(phoneNumberId)}`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({ agent_id: process.env.ELEVENLABS_PRESENCE_AGENT_ID }),
});
if (!assigned.ok) {
  console.error(`Assign failed: ${assigned.status} ${await assigned.text()}`);
  process.exit(1);
}
const result = await assigned.json();
console.log(`Assigned to agent ${result.assigned_agent?.agent_name || process.env.ELEVENLABS_PRESENCE_AGENT_ID}`);
console.log(`\nSet ELEVENLABS_PRESENCE_PHONE_NUMBER_ID=${phoneNumberId} in .env and on Vercel.`);
