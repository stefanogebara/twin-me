#!/usr/bin/env node
/**
 * Presence: import her calling number into ElevenLabs and hand it to the agent.
 *
 * ElevenLabs places and answers her calls, so the repo holds no telephony SDK:
 * the number is imported once, assigned to the Presence agent (inbound calls
 * reach it), and its id goes into ELEVENLABS_PRESENCE_PHONE_NUMBER_ID for the
 * hourly cron (outbound calls).
 *
 * Two providers:
 *   sip_trunk (default) — any Brazilian number an individual with a CPF can buy
 *     (Zadarma, Directcall, Vono, Telnyx). Needs the trunk's SIP host and the
 *     digest username and password. ElevenLabs does not do SIP REGISTER: the
 *     host must accept a digest-challenged INVITE. Inbound is set at the
 *     provider by forwarding the number to
 *     sip:<PRESENCE_PHONE_NUMBER>@sip.rtc.elevenlabs.io:5060;transport=tcp
 *     (with the leading +, since the number is imported with it).
 *   twilio — Twilio's native integration. Twilio's Brazilian numbers are sold
 *     to companies with a CNPJ only.
 *
 * Usage:
 *   node scripts/presence/import-number.mjs
 *
 * Needs in .env: ELEVENLABS_API_KEY, ELEVENLABS_PRESENCE_AGENT_ID,
 * PRESENCE_PHONE_NUMBER (E.164), and then either
 *   PRESENCE_SIP_ADDRESS, PRESENCE_SIP_USERNAME, PRESENCE_SIP_PASSWORD
 *   (optional PRESENCE_SIP_TRANSPORT, default tcp)
 * or, with ELEVENLABS_PRESENCE_PHONE_PROVIDER=twilio,
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN.
 * API: POST /v1/convai/phone-numbers, PATCH /v1/convai/phone-numbers/{id}
 * (plan 2026-09-15-presence-forward, Phase 1).
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
const provider = process.env.ELEVENLABS_PRESENCE_PHONE_PROVIDER === 'twilio' ? 'twilio' : 'sip_trunk';
const required = ['ELEVENLABS_API_KEY', 'ELEVENLABS_PRESENCE_AGENT_ID', 'PRESENCE_PHONE_NUMBER'].concat(
  provider === 'twilio'
    ? ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']
    : ['PRESENCE_SIP_ADDRESS', 'PRESENCE_SIP_USERNAME', 'PRESENCE_SIP_PASSWORD'],
);
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing for provider ${provider}: ${missing.join(', ')} (in .env or the environment).`);
  process.exit(2);
}
if (!/^\+[1-9][0-9]{7,14}$/.test(process.env.PRESENCE_PHONE_NUMBER)) {
  console.error('PRESENCE_PHONE_NUMBER must be E.164, e.g. +551133334444');
  process.exit(2);
}

const headers = { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' };
const base = 'https://api.elevenlabs.io/v1/convai/phone-numbers';

// PCMA (A-law) is the Brazilian norm; PCMU and G722 are offered as fallbacks.
const sipBody = {
  provider: 'sip_trunk',
  outbound_trunk_config: {
    address: process.env.PRESENCE_SIP_ADDRESS.replace(/^sip:/, ''),
    transport: process.env.PRESENCE_SIP_TRANSPORT || 'tcp',
    media_encryption: process.env.PRESENCE_SIP_MEDIA_ENCRYPTION || 'disabled',
    credentials: { username: process.env.PRESENCE_SIP_USERNAME, password: process.env.PRESENCE_SIP_PASSWORD },
    enabled_codecs: ['PCMA/8000', 'PCMU/8000', 'G722/8000'],
  },
  inbound_trunk_config: {
    media_encryption: process.env.PRESENCE_SIP_MEDIA_ENCRYPTION || 'disabled',
    credentials: { username: process.env.PRESENCE_SIP_USERNAME, password: process.env.PRESENCE_SIP_PASSWORD },
  },
};
const twilioBody = { provider: 'twilio', sid: process.env.TWILIO_ACCOUNT_SID, token: process.env.TWILIO_AUTH_TOKEN };

const created = await fetch(base, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    phone_number: process.env.PRESENCE_PHONE_NUMBER,
    label: 'Presence',
    ...(provider === 'twilio' ? twilioBody : sipBody),
  }),
});
if (!created.ok) {
  console.error(`Import failed: ${created.status} ${await created.text()}`);
  process.exit(1);
}
const { phone_number_id: phoneNumberId } = await created.json();
console.log(`Imported ${process.env.PRESENCE_PHONE_NUMBER} (${provider}) as ${phoneNumberId}`);

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
if (provider === 'sip_trunk') {
  console.log(
    'At the provider, forward the number to:\n' +
    `  sip:${process.env.PRESENCE_PHONE_NUMBER}@sip.rtc.elevenlabs.io:5060;transport=tcp\n` +
    'so her own calls to it reach the agent.',
  );
}
