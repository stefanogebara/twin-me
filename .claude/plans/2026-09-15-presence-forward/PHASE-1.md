# Presence Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Her phone rings at the agreed hour; the family gets one WhatsApp message after each call and can reply into her next one; urgent calls reach the family at once; her assent is spoken on the first call; the transcript arrives by webhook, never from the browser.

**Architecture:** ElevenLabs places the outbound call through its native Twilio integration (`POST /v1/convai/twilio/outbound-call`), so the repo holds no Twilio SDK: one number is imported into ElevenLabs once and its `phone_number_id` is an env var. An hourly cron (`/api/cron/presence-calls`) dials the presences due in their own timezone; the brief is compiled at dial time and sent as overrides with `presence_id` as a dynamic variable. Inbound calls to the same number reach the agent, which asks our conversation-initiation webhook for the brief by caller id. The post-call webhook (HMAC `t=,v0=`) stores the conversation, summarizes it (moved into `presenceSummarizer.js`), stamps her spoken assent on a first call, and relays to the family over WhatsApp through the existing Kapso path (`sendWhatsAppTemplate` first, plain text inside the 24-hour window). A reply to that WhatsApp message (Meta `context.id`) becomes a note for her next call.

**Tech Stack:** Express 5, Supabase, vitest + supertest, ElevenLabs Agents API, Kapso (Meta Cloud API), `messaging_channels` + OTP for the family's number, PostHog.

**Spec:** `.claude/plans/2026-09-15-presence-forward/README.md` sections 6, 7, 8, 10; Phase 0 in `PHASE-0.md`.

## Global Constraints

- Branch `presence/ship` (PR #374). Commit with explicit paths; push at the end.
- Every fix test-first (vitest). Route tests mock `presenceStore` at the boundary as in `tests/api/routes/presenceCall.test.js`; store tests record query chains as in `tests/unit/presenceStore.test.js`; webhook tests sign raw bodies as in `tests/api/routes/whatsappKapsoCapture.smoke.test.js`.
- Vercel cost rules: the cron is hourly (`0 * * * *`) and returns early with one query when nothing is due; no LLM call before that check. `maxDuration` 60 s.
- `PRESENCE_CALLS_ENABLED=true` gates dialing (like `PRESENCE_VOICE_CLONE_ENABLED`); off by default.
- Family copy in Brazilian Portuguese, sentence case, no emojis. WhatsApp template parameters carry no newlines.
- `presenceStore.js` stays the only Presence file that talks to Supabase; the messaging_channels read for the family's number goes there too.
- The web channel (`/call/:token`, `/complete`) stays for tablet mode; the webhook and `/complete` must not store one conversation twice (`provider_conversation_id`).
- Baselines hold: routesWithDirectFrom 113, eslintErrors 73, tscErrors 110.
- Members and the companion role move to Phase 2 (nothing here needs them).

---

### Task 1: Schema

**Files:** Create `database/migrations/20260916_presence_calls.sql`.

```sql
ALTER TABLE presences
  ADD COLUMN IF NOT EXISTS elder_phone TEXT CHECK (elder_phone IS NULL OR elder_phone ~ '^\+[1-9][0-9]{7,14}$'),
  ADD COLUMN IF NOT EXISTS call_hour SMALLINT NOT NULL DEFAULT 10 CHECK (call_hour BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS call_days SMALLINT[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  ADD COLUMN IF NOT EXISTS call_timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

CREATE TABLE IF NOT EXISTS presence_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_id UUID NOT NULL REFERENCES presences(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL,
  attempt SMALLINT NOT NULL DEFAULT 1 CHECK (attempt BETWEEN 1 AND 3),
  status TEXT NOT NULL DEFAULT 'dialing'
    CHECK (status IN ('dialing', 'answered', 'no_answer', 'busy', 'failed', 'completed')),
  direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound', 'inbound')),
  provider_conversation_id TEXT,
  call_sid TEXT,
  failure_reason TEXT,
  conversation_id UUID REFERENCES presence_conversations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_presence_calls_presence_day ON presence_calls(presence_id, scheduled_for DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_presence_calls_provider ON presence_calls(provider_conversation_id) WHERE provider_conversation_id IS NOT NULL;
ALTER TABLE presence_calls ENABLE ROW LEVEL SECURITY;
-- service_role_all policy as the other presence tables.

CREATE UNIQUE INDEX IF NOT EXISTS idx_presence_conversations_provider_unique
  ON presence_conversations(provider_conversation_id) WHERE provider_conversation_id IS NOT NULL;
ALTER TABLE presence_conversations ADD COLUMN IF NOT EXISTS digest_message_id TEXT;
ALTER TABLE presence_conversations DROP CONSTRAINT IF EXISTS presence_conversations_source_check;
ALTER TABLE presence_conversations ADD CONSTRAINT presence_conversations_source_check CHECK (source IN ('web_call', 'phone', 'agent'));
```
Drop the non-unique `idx_presence_conversations_provider` from 20260915 in favour of the unique one. Header records NOT applied until the session applies it.

- [ ] Write, commit with Task 2.

### Task 2: The store

**Files:** Modify `api/services/presenceStore.js`; test `tests/unit/presenceStore.test.js`.

New functions (query shapes pinned by tests):
- `listCallablePresences()`: `presences` select `id, owner_user_id, cared_for_name, caller_name, tone, elder_phone, call_hour, call_days, call_timezone, elder_assent_at` where `status = 'active'` and `elder_phone` not null.
- `listCallsSince(presenceIds, sinceIso)`: `presence_calls` select `presence_id, status, attempt, scheduled_for` where `presence_id in (...)` and `scheduled_for >= since`.
- `createCall(row)`: insert, select `id`, single.
- `updateCallByConversation(providerConversationId, patch)`: update where `provider_conversation_id = ...`.
- `findConversationByProviderId(id)`: `presence_conversations` select `id` maybeSingle.
- `findPresenceByElderPhone(phone)`: `presences` select `*` where `elder_phone = phone` and `status = 'active'` maybeSingle.
- `findPresenceByIdForCall(id)`: select `*` where id and status active maybeSingle (the webhook's lookup by dynamic variable).
- `setConversationDigest(conversationId, messageId)`: update `digest_message_id`.
- `findConversationByDigestMessageId(messageId)`: select `id, presence_id` maybeSingle.
- `getOwnerWhatsApp(userId)`: `messaging_channels` select `channel_id, preferences` where `user_id` and `channel = 'whatsapp'` and `is_enabled = true` maybeSingle.
- `getPresencesOwnedBy(userId)`: `presences` select `id, cared_for_name` where owner and status active.
- `updatePresence` already takes a whitelisted patch; `PATCHABLE_FIELDS` in the route gains `elder_phone, call_hour, call_days, call_timezone`.

- [ ] Tests for each shape (RED), implement (GREEN), commit: "presence: the schedule, the calls, and the family's number, in the store".

### Task 3: Who is due (pure)

**Files:** Create `api/services/presenceCallScheduling.js`; test `tests/unit/presenceCallScheduling.test.js`.

```js
/** The local hour and weekday of `now` in the presence's timezone. */
export function localClock(now, timeZone) -> { hour, weekday, dayKey: 'YYYY-MM-DD' }
/** True when this presence should be dialed at `now`: its hour, one of its days, no call today yet, or one no-answer today at an earlier hour (second attempt). */
export function isDue(presence, callsToday, now) -> { due: boolean, attempt: 1|2, reason }
```
Tests: 10:00 São Paulo on a Tuesday with call_hour 10 → due attempt 1; 11:00 with a `no_answer` at 10:00 → due attempt 2; 12:00 with two attempts → not due; a `completed` today → not due; a day not in call_days → not due; DST-safe via `Intl.DateTimeFormat` with `timeZone`.

- [ ] RED, GREEN, commit.

### Task 4: Outbound dial in voiceService

**Files:** Modify `api/services/voiceService.js`; test `tests/api/services/voiceService.test.js`.

`startOutboundCall({ agentId, phoneNumberId, toNumber, overrides, dynamicVariables })` → `POST /v1/convai/twilio/outbound-call` with body `{ agent_id, agent_phone_number_id, to_number, conversation_initiation_client_data: { conversation_config_override: overrides, dynamic_variables }, telephony_call_config: { ringing_timeout_secs: 45 } }`; returns `{ success, conversationId, callSid }` or `{ success: false, error }`. Overrides shape: `{ agent: { prompt: { prompt }, first_message, language: 'pt-br' }, tts: voice ? { voice_id } : undefined }`.

- [ ] Tests (axios post mocked; body shape and response mapping; failure), implement, commit.

### Task 5: The first call in the brief and the summarizer

**Files:** Modify `api/services/presenceBriefRender.js`, `api/services/presenceCallBrief.js`; create `api/services/presenceSummarizer.js` (moved from `presence-call.js`, exported `summarizeConversation(conversationId, presence, transcript, { firstCall })` returning `{ urgency, assent, preferredName }`); modify `api/routes/presence-call.js` to import it. Tests: `tests/unit/presenceBriefRender.test.js`, `tests/unit/presenceSummarizer.test.js` (llm mocked), `tests/api/routes/presenceCall.test.js` (unchanged behaviour).

Brief, when `firstCall`: a section "THIS IS YOUR FIRST CALL WITH HER" — introduce yourself as `${caller}`'s AI presence; say you will tell `${caller}` how she has been after each call; ask "Posso conversar com você de vez em quando?" and wait for a clear yes; if she says no, thank her warmly and say goodbye; ask what she likes to be called and what time of day is good to call; keep it under five minutes; do not use notes or memories on this call. First message on a first call: "Oi, ${caredFor}! Aqui é a presença de ${caller}, uma inteligência artificial que ${caller} criou para conversar com você. Tudo bem?"

Summarizer, when `firstCall`: JSON gains `"assent": "yes" | "no" | "unclear"`, `"preferred_name": ""`, `"preferred_time": ""`; the caller (webhook) stamps `recordElderAssent(presenceId, 'elder-assent-call-v1')` on `yes` and saves `preferred_name` as a fact (`kind: 'language'`, question `Como ela gosta de ser chamada`) via `saveFact`.

- [ ] RED, GREEN, commit.

### Task 6: The cron

**Files:** Create `api/routes/cron-presence-calls.js`; modify `api/server.js` (mount `/api/cron/presence-calls`), `vercel.json` (crons: `{ "path": "/api/cron/presence-calls", "schedule": "0 * * * *" }`); test `tests/api/routes/cronPresenceCalls.test.js`.

Flow: `verifyCronSecret` → if `PRESENCE_CALLS_ENABLED !== 'true'` return `{ skipped: 'disabled' }` → `listCallablePresences()` → for each, `isDue(presence, callsToday, now)` (calls from `listCallsSince(ids, startOfEarliestLocalDay)`) → cap `MAX_DIALS_PER_RUN = 20` → `compileCallBrief(presence, { firstCall: !presence.elder_assent_at })` → `startOutboundCall` → `createCall({ presence_id, scheduled_for: now, attempt, status: 'dialing', provider_conversation_id, call_sid })`; a failed dial creates a `failed` row with `failure_reason` and never retries this hour. `logCronExecution('presence-calls', ...)`. Env: `ELEVENLABS_PRESENCE_AGENT_ID`, `ELEVENLABS_PRESENCE_PHONE_NUMBER_ID`.

Tests: disabled → no store call; nothing due → no dial; due → dial with the brief as overrides and `presence_id` dynamic variable, row created; dial failure → `failed` row; cap respected; wrong secret → 401.

- [ ] RED, GREEN, commit.

### Task 7: The webhooks

**Files:** Create `api/services/elevenlabsWebhook.js` (`verifyElevenLabsSignature(rawBody, header, secret, now)` → boolean; `t=` older than 30 min rejected; multiple `v0=` accepted), `api/routes/webhooks-elevenlabs.js`; modify `api/server.js` (rawBody allowlist gains `/api/webhooks/elevenlabs`, mount). Tests: `tests/unit/elevenlabsWebhook.test.js`, `tests/api/routes/webhooksElevenlabs.test.js`.

`POST /api/webhooks/elevenlabs/post-call` (secret `ELEVENLABS_POST_CALL_SECRET`):
- `post_call_transcription`: presence from `data.conversation_initiation_client_data.dynamic_variables.presence_id`, else `findPresenceByElderPhone(data.metadata.phone_call.external_number)`; 200 `{ ignored }` if none. If `findConversationByProviderId(conversation_id)` exists → 200 `{ duplicate }`. Else create the conversation (`source: 'phone'` when `metadata.phone_call`, else `'web_call'`; transcript mapped as in `/complete`; `duration_seconds` from metadata; `provider_conversation_id`), `updateCallByConversation(conversation_id, { status: 'completed', conversation_id })`, mark notes delivered under the Phase 0 rule, then `await` the summarizer (webhooks may take a few seconds; ElevenLabs retries on 5xx only, so respond 200 after the write and run summary + relay after `res.json`, catching and logging), then `relayCall(presence, conversationRow, summary)` (Task 8). Always 200 once stored.
- `call_initiation_failure`: `updateCallByConversation(conversation_id, { status: failure_reason === 'busy' ? 'busy' : failure_reason === 'no-answer' ? 'no_answer' : 'failed', failure_reason })`; when it was attempt 2, `relayNoAnswer(presence)`.
- Unknown types → 200 `{ ignored }`. Bad signature → 401. Missing rawBody → 500.

`POST /api/webhooks/elevenlabs/initiation` (header `x-presence-secret` = `ELEVENLABS_WEBHOOK_SECRET`, timing-safe): body `{ caller_id, called_number, agent_id, conversation_id }` → `findPresenceByElderPhone(caller_id)`; 404 if none (the agent then answers with its default prompt; acceptable for unknown callers) ; else compile the brief (first call if no assent) and reply `{ type: 'conversation_initiation_client_data', conversation_config_override: { agent: { prompt: { prompt }, first_message, language: 'pt-br' }, tts? }, dynamic_variables: { presence_id } }`, and `createCall({ direction: 'inbound', status: 'answered', provider_conversation_id })`.

`/complete` (web channel): before creating, `findConversationByProviderId` → if found, answer 201 with that id (the webhook won the race); on insert unique-violation, read again and answer the same.

- [ ] RED (signed bodies), GREEN, commit.

### Task 8: The relay

**Files:** Create `api/services/presenceRelay.js`; test `tests/unit/presenceRelay.test.js` (whatsappService and store mocked).

- `composeDigest(presence, conversation)` (pure) → `{ text, templateParams }`: text is at most three lines: `Ela contou que ${summary}` / `Precisa de você: ${needs.join('; ')}` (only if any; urgent items first) / `Responda esta mensagem e ela ouve na próxima ligação.`; template params `[cared_for_name, summaryOneLine, needsOneLine || 'nada desta vez']` with newlines stripped and each capped at 300 chars.
- `relayCall(presence, conversation)`: `getOwnerWhatsApp(owner_user_id)` → none: log and return `{ sent: false, reason: 'no_channel' }`. Else `sendWhatsAppTemplate(phone, 'presence_call_digest', 'pt_BR', params)`; on `success: false` fall back to `sendWhatsAppMessage(phone, text)`; on success `setConversationDigest(conversation.id, messageId)`. If `conversation.urgency === 'high'`, first send `sendWhatsAppTemplate(phone, 'presence_urgent', 'pt_BR', [cared_for_name, needsOneLine])` with text fallback `Urgente: ${needs}. Ela falou disso na ligação de hoje. A Presença não é um serviço de emergência.`
- `relayNoAnswer(presence)`: `Não consegui falar com ${her} hoje: ela não atendeu nas duas tentativas.`
- `handleFamilyReply({ userId, text, contextMessageId })` → if `contextMessageId` matches `findConversationByDigestMessageId` → `queueNote({ presence_id, author_user_id: userId, body })` and return `'Anotado. Ela ouve na próxima ligação.'`; else if text starts with `nota:`/`recado:` (case-insensitive) and the user owns exactly one active presence → same; else `null` (not ours).

- [ ] RED, GREEN, commit.

### Task 9: Reply-as-note in the WhatsApp inbound path

**Files:** Modify `api/routes/whatsapp-kapso-webhook.js` (`parseIncomingMessage` adds `context: { messageId: msg.context?.id || null }` on every Kapso v2 and Meta-native branch), `api/services/whatsappInboundPipeline.js` (after step 2 user lookup and before step 3: `const presenceReply = await handleFamilyReply({ userId, text, contextMessageId: parsed.context?.messageId }); if (presenceReply) { await send(phone, presenceReply); return { handled: true, kind: 'presence_note', userId }; }`); tests: `tests/api/routes/whatsappKapsoContext.test.js` (parser), `tests/api/services/whatsappInboundPresence.test.js` (pipeline branch with relay mocked).

- [ ] RED, GREEN, commit.

### Task 10: Family API and the two scripts

**Files:** Modify `api/routes/presence.js` (`PATCHABLE_FIELDS` + validation: `elder_phone` E.164 or null, `call_hour` 0-23, `call_days` array of 0-6, `call_timezone` in `Intl.supportedValuesOf('timeZone')`; overview gains `calls: last 10 from listCallsSince` and `whatsapp: { linked, phone_last4 }` from `getOwnerWhatsApp`), `api/routes/webhooks-elevenlabs.js` no change; create `scripts/presence/import-number.mjs` (POST `/v1/convai/phone-numbers` with `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `PRESENCE_PHONE_NUMBER`, label "Presence", then PATCH with `agent_id`; prints `phone_number_id` to put in `ELEVENLABS_PRESENCE_PHONE_NUMBER_ID`), `scripts/presence/register-templates.mjs` (the `presence_call_digest` and `presence_urgent` UTILITY templates, language `pt_BR`, mirroring `scripts/register-statement-nag-template.mjs`). Tests in `tests/api/routes/presence.test.js` for the PATCH validation and the overview fields.

Template bodies (no newlines in params):
- `presence_call_digest`: "A Presença conversou com {{1}} hoje. Ela contou que {{2}}. Precisa de você: {{3}}. Responda esta mensagem e ela ouve na próxima ligação."
- `presence_urgent`: "Urgente: na ligação de hoje, {{1}} falou de algo que precisa de uma pessoa agora: {{2}}. A Presença não é um serviço de emergência."

- [ ] RED, GREEN, commit.

### Task 11: The pages

**Files:** Modify `src/services/api/presenceAPI.ts` (types: `elder_phone`, `call_hour`, `call_days`, `call_timezone` on `PresenceRecord`; overview `calls`, `whatsapp`; `patch` accepts them), `src/pages/presence/PresenceOnboarding.tsx` (new step 5 "O telefone dela" before relay: phone with +55 default, hour select, days chips, "quem vai estar com ela na primeira ligação" (you / a cuidadora / nobody), saved by PATCH; the relay step's copy explains the WhatsApp digest and how to link), `src/pages/presence/PresenceHome.tsx` (section "Ligações": number, hour, days, next call, last ten calls with status in Portuguese; section "WhatsApp": linked state, `wa.me/<KAPSO number>?text=oi` button "Abrir conversa" (opens the 24-hour window), then request code / enter code through the existing `/api/whatsapp-link` endpoints, unlink). Two subagents, one per page; the API file first by hand.

- [ ] tsc, eslint, build; commit.

### Task 12: Close

- [ ] Full vitest, baselines, build. Apply `20260916_presence_calls.sql` to production (Supabase MCP). Set `PRESENCE_CALLS_ENABLED`, `ELEVENLABS_PRESENCE_PHONE_NUMBER_ID`, `ELEVENLABS_POST_CALL_SECRET`, `ELEVENLABS_WEBHOOK_SECRET` on Vercel once the number and the webhook exist. Register the webhook URL (`https://twinme.me/api/webhooks/elevenlabs/post-call`, HMAC) and the initiation webhook in the ElevenLabs agent settings; run the two scripts. Update README section 10; push; report.

What only Stefano can do: a Twilio account and a number (a US number can call Brazilian mobiles at $0.0663/min; a +55 number needs a CNPJ and a Brazilian address), the Kapso WABA id for the templates, and the two ElevenLabs webhook secrets from the dashboard.
