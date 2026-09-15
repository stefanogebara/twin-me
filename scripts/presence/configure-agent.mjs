#!/usr/bin/env node
/**
 * Presence: the ElevenLabs agent's configuration, set from the repo.
 *
 * The agent that answers her calls lives in the ElevenLabs dashboard, where a
 * ten-minute default call length and an eager turn policy were never visible
 * to a code review. This script reads the agent and shows the values that
 * matter for an older, slower speaker; with --apply it sets them:
 *
 *   max call length            2400 s   (default 600 cuts every call at ten minutes)
 *   turn timeout               8 s      (how long it waits in silence before speaking; default 7)
 *   turn eagerness             patient  (does not jump into her pauses)
 *   language                   pt-br    (ASR and TTS in Brazilian Portuguese)
 *   client overrides           prompt, first message, language, voice id
 *                                       (the brief is compiled per call by the server)
 *   signed sessions required   yes      (the browser starts with a token the server fetched)
 *
 * Usage:
 *   node scripts/presence/configure-agent.mjs            # read and show
 *   node scripts/presence/configure-agent.mjs --apply    # set the values above
 *
 * Needs ELEVENLABS_API_KEY and ELEVENLABS_PRESENCE_AGENT_ID in .env.
 * API: GET/PATCH https://api.elevenlabs.io/v1/convai/agents/{agent_id}
 * (plan 2026-09-15-presence-forward, Phase 0 task 6).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WANTED = {
  maxDurationSeconds: 2400,
  turnTimeout: 8,
  turnEagerness: 'patient',
  language: 'pt-br',
  enableAuth: true,
};

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
const apiKey = process.env.ELEVENLABS_API_KEY;
const agentId = process.env.ELEVENLABS_PRESENCE_AGENT_ID;
if (!apiKey || !agentId) {
  console.error('ELEVENLABS_API_KEY and ELEVENLABS_PRESENCE_AGENT_ID are required (in .env or the environment).');
  process.exit(2);
}
const apply = process.argv.includes('--apply');
const url = `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`;
const headers = { 'xi-api-key': apiKey, 'Content-Type': 'application/json' };

const res = await fetch(url, { headers });
if (!res.ok) {
  console.error(`GET agent failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const agent = await res.json();
const cc = agent.conversation_config || {};
const overrides = agent.platform_settings?.overrides?.conversation_config_override || {};

const current = {
  maxDurationSeconds: cc.conversation?.max_duration_seconds,
  turnTimeout: cc.turn?.turn_timeout,
  turnEagerness: cc.turn?.turn_eagerness,
  language: cc.agent?.language,
  enableAuth: agent.platform_settings?.auth?.enable_auth,
  overridePrompt: overrides.agent?.prompt?.prompt,
  overrideFirstMessage: overrides.agent?.first_message,
  overrideLanguage: overrides.agent?.language,
  overrideVoiceId: overrides.tts?.voice_id,
};

console.log(`Agent ${agent.name || agentId}`);
console.log('  setting                  current      wanted');
const row = (label, cur, want) => console.log(`  ${label.padEnd(24)} ${String(cur).padEnd(12)} ${String(want)}${String(cur) === String(want) ? '' : '   <- differs'}`);
row('max call length (s)', current.maxDurationSeconds, WANTED.maxDurationSeconds);
row('turn timeout (s)', current.turnTimeout, WANTED.turnTimeout);
row('turn eagerness', current.turnEagerness, WANTED.turnEagerness);
row('language', current.language, WANTED.language);
row('signed sessions', current.enableAuth, WANTED.enableAuth);
row('override: prompt', current.overridePrompt, true);
row('override: first message', current.overrideFirstMessage, true);
row('override: language', current.overrideLanguage, true);
row('override: voice id', current.overrideVoiceId, true);

if (!apply) {
  console.log('\nRun again with --apply to set the wanted values.');
  process.exit(0);
}

const patch = {
  conversation_config: {
    conversation: { max_duration_seconds: WANTED.maxDurationSeconds },
    turn: { turn_timeout: WANTED.turnTimeout, turn_eagerness: WANTED.turnEagerness },
    agent: { language: WANTED.language },
  },
  platform_settings: {
    auth: { enable_auth: WANTED.enableAuth },
    overrides: {
      conversation_config_override: {
        agent: { prompt: { prompt: true }, first_message: true, language: true },
        tts: { voice_id: true },
      },
    },
  },
};

const patched = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(patch) });
if (!patched.ok) {
  console.error(`PATCH agent failed: ${patched.status} ${await patched.text()}`);
  process.exit(1);
}
const after = await patched.json();
console.log('\nApplied. Now:');
console.log(`  max call length (s)      ${after.conversation_config?.conversation?.max_duration_seconds}`);
console.log(`  turn timeout (s)         ${after.conversation_config?.turn?.turn_timeout}`);
console.log(`  turn eagerness           ${after.conversation_config?.turn?.turn_eagerness}`);
console.log(`  language                 ${after.conversation_config?.agent?.language}`);
console.log(`  signed sessions          ${after.platform_settings?.auth?.enable_auth}`);
