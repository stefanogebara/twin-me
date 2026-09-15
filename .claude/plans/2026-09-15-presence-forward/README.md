# Presence: audit, market, and the way forward

Date: 2026-09-15. Status: proposal, awaiting Stefano's decisions (section 9).
Inputs: a read-only audit of `design/twinme-cosmos` at cdd21d3a (backend identical
to origin; the three pages were restyled on 2026-09-12), the Folha article of
2026-09-12, and three research passes (voice models, market and evidence, X and
forums). Sources are listed at the end of each section.

Predecessor: `.claude/plans/2026-08-27-twinme-presence/README.md` (thesis, safety
model, pilot metrics, kill criteria). Everything there still holds; this document
does not repeat it.

---

## 1. Verdict in five lines

1. Presence is a well-built single-family, browser-only demo with a serious call
   brief and careful write paths. It is not a service: nobody is called, nobody
   is notified, the elder must open a URL herself.
2. The Folha piece confirms the buyer, the segment and even the name: an adult
   child far away, an autonomous elder, "ser a presença, o afeto, a escuta
   atenta". It also shows the elder cannot use apps. The web link fails her.
3. The market converged on one shape: the adult child configures on the web, the
   elder's phone rings at a fixed hour, the family gets a summary pushed to them.
   In Brazil the push channel is WhatsApp. Nobody serves pt-BR with a family relay.
4. The evidence says companionship-only AI has not moved loneliness in controlled
   trials; reminiscence with anchors, cognitive engagement and a human in the
   loop have. Our story anchors and the "needs a person" relay are the right bets.
   "Cures loneliness" is not a claim we can make.
5. Ten of the thirteen Presence commits since 2026-08-31 are design. The product
   has been restyled four times (Monsoon, Cosmos, Nocturne-adjacent, register)
   and has never called anyone. Freeze the design; build the call.

---

## 2. What exists (audit)

Branch `design/twinme-cosmos`, 3,840 lines across 10 Presence files, 80 tests.
`main` has none of the backend; the four migrations are on
`presence/migrations-only` (PR #299) and are applied in production. The branch is
209 files ahead of main and ~105 of those moved on main too, so shipping means a
narrow branch off main, not a merge (memory: twinme-presence-not-in-production).

### 2.1 Family onboarding (`src/pages/presence/PresenceOnboarding.tsx`, 1,069 lines)

Seven steps: start, bond (names, relationship, tone), about (2-minute voice note
or text, transcribed by Whisper and mined by DeepSeek into people, anchors,
boundaries, facts, tone hint), review (people up to 8, three anchors, boundaries),
voice (consent checkbox, then up to three samples), style (two free-text
questions), relay (a first note, a hard-coded demo digest). Draft in localStorage
v5; server sync is fire-and-forget, so the client can say "ready" when the server
gate says not. Everything is in English except the elder's screen.

What is good: the voice note as primary input is the right call. The extraction
into a review card ("what I understood") is the best screen in the product.

### 2.2 Family dashboard (`PresenceHome.tsx`, 462 lines; register version 645)

Plate with counts, call link (create, copy, rotate), readiness score. Sections:
"Who is this?" ask cards, "Needs a person", conversations with transcript,
notes, her people, your voice with revoke. No pause, delete, members, schedule,
notifications, or error surfacing (`presenceAPI.request` returns null on any
non-2xx; every action silently does nothing on failure).

### 2.3 Her screen (`PresenceCallPage.tsx`, 352 lines), route `/call/:token`

States loading, invalid, ready, connecting, live, saving, done, error. Starts an
ElevenLabs WebRTC session against a public agent id with the full compiled prompt,
first message, `language: 'pt'` and the cloned voice id sent as overrides from the
browser. Transcript is captured client-side and POSTed to `/complete`;
`sendBeacon` on pagehide. Type at her size (48 to 76px display, 21 to 25px body),
reduced motion, no glass. pt-BR throughout. The "Quem está falando?" card is the
only disclosure, and only if she taps it.

### 2.4 Backend (`api/routes/presence.js` 790 lines, `presence-call.js` 257,
`presenceStore.js` 399, `presenceCallBrief.js` 70, `presenceBriefRender.js` 114,
`presenceReadiness.js` 54)

Seventeen family endpoints and three elder endpoints (table in the audit output).
Store is the only Supabase caller; parallel reads report the first error;
people replacement and fact upsert are transactional RPCs. The brief compiler
assembles: identity and hard rules (AI disclosure, no visits, money, medicine),
family map with the deceased rule, relationship style, boundaries, story
anchors, up to five queued notes, the raw introduction (1,800 chars), the last
three summaries, the last twelve biography facts, and a reminiscence protocol
written from the real call of 2026-09-01 ("offer, never interrogate"; "silence is
welcome"). Summarizer returns summary, her_recap, needs_family (including
emotional withdrawal), learned facts (provisional, 30-day TTL), unknown people
(ask cards). Readiness: two people, two anchors, a tone.

### 2.5 What does not work, in order of harm

| # | Problem | Where |
|---|---|---|
| 1 | No outbound call, no schedule, no phone. She must open a URL and tap. | whole elder channel |
| 2 | No notification. The family learns nothing unless they open the page. | no email, WhatsApp or push anywhere |
| 3 | `express.json` limit is 100 kB; `/complete` accepts 400 turns x 4,000 chars. A long call 413s and the transcript is lost silently. | `server.js:346`, `presence-call.js:31` |
| 4 | Public ElevenLabs agent id and full prompt delivered to any holder of the URL; `/complete` accepts a fabricated transcript that becomes facts and the next prompt. | `PresenceCallPage.tsx:171-181`, `presence-call.js:120` |
| 5 | Call token never expires (`call_token_created_at` written, never read); a `draft` presence with a token still answers. | `presenceStore.js:83`, `presence-call.js:46` |
| 6 | Notes are marked delivered on any `/complete`, including a 3-second drop. | `presence-call.js:145` |
| 7 | Voice clone without `PRESENCE_VOICE_CLONE_ENABLED` is "queued" forever; samples are deleted, nothing consumes the queue. | `presence.js:608-661` |
| 8 | Family UI and summaries in English for Brazilian families; summary prompt asks for "sentences in English". | `presence-call.js:186`, all pages |
| 9 | Elder consent never recorded (`ai_disclosure` exists as a kind, nothing writes it); no privacy notice, retention, export or hard delete. LGPD treats her mood and health mentions as sensitive data. | consent flow |
| 10 | Distress is a prompt line and a post-hoc list. No urgency, no immediate alert, no emergency contact. | `presenceBriefRender.js:25`, `presence-call.js:188` |
| 11 | ElevenLabs agent `max_duration_seconds` defaults to 600. If the dashboard agent was never changed, every call is cut at ten minutes. Verify. | ElevenLabs dashboard, outside the repo |
| 12 | Onboarding promises pause and delete; neither exists. | `PresenceOnboarding.tsx:676` |
| 13 | No analytics event on any Presence page or route. | grep |
| 14 | `/about` re-runs insert every anchor and boundary again (`addFacts`, not `saveFact`). | `presence.js:546-555` |
| 15 | Prompt injection: notes, names, the raw intro and elder-learned facts are interpolated into the system prompt with no delimiters. | `presenceBriefRender.js` |

Tests cover the backend error paths well (80 passing). Nothing tests
`deriveReadiness`, `renderCallBrief` sections, the happy paths, or any frontend.

---

## 3. The Folha article (2026-09-12, Vinícius Lemos)

Read in full. What it says: "filhas de aluguel" accompany autonomous elders to
consultas, exames, supermercado, banco, prova de vida, aeroporto, "um café".
Daily rates from R$ 80 (market: R$ 150 to 250 a day for an acompanhante). The
professionals are women of 49 to 55 who turned what they did for relatives into
a business; one went viral on Facebook and was flooded by other women wanting the
income. Clients are the elders themselves or nearby family. The origin story:
"Elas não sabiam mexer em aplicativos, então não conseguiam pegar um transporte
pra voltar." Experts (geriatrician Maysa Seabra, psychologist Valmari Aranha,
USP gerontology's Rosa Chubaci): families are smaller and farther; this is a
complement, not abandonment; the acompanhante must be trained to notice
(walking, food, "o que conversar"). The last quote: "O objetivo é ser a
presença, o afeto, a escuta atenta e o tempo de qualidade."

What it means for Presence:

- The segment is exactly ours: autonomous, no clinical need, family far away.
  It is also the segment where the evidence and the regulators let an AI
  companion exist (no dementia positioning; the 08-27 plan already says so).
- The elder cannot use apps. A web link is an app. The elder side must be a
  phone ringing, from a name she knows.
- The core service being bought is listening and noticing, "percebe quando o
  idoso está quieto demais". Our summarizer's withdrawal signal is that
  noticing. It should be the headline of what the family receives.
- Practical tasks are human. The AI's job is to notice the need ("teve que
  cancelar uma endoscopia porque o patrão do filho não liberou") and relay it.
  That is the "needs a person" list, and its natural reader is the family or
  the filha de aluguel.
- Position Presence beside the human, not against her: the company between the
  days the acompanhante comes. The acompanhante is also a plausible partner:
  she sits with the elder, can do the first call together, and can leave notes
  ("hoje ela foi ao médico"). Edukaluz in Rio Grande do Sul already sells
  "Filha de Aluguel" companionship next to its WhatsApp AI.
- The price anchor is R$ 80 a day for a human. R$ 99 to 149 a month for daily
  AI company is a believable number in the same conversation.

Sources: the article (read via the gift link); A Voz Jundiaí 2026-08-27; Famyle
2026-06 (acompanhante prices); Café com Bytes 2025-07-11 (Edukaluz).

---

## 4. Market and evidence, compressed

### 4.1 Products

Phone-call SKUs, all the same shape (child configures on the web; elder's phone
rings; summary pushed): inTouch (EUR 29.90, landline OK, 1,400 questions, 404
Media called it "dystopian"), Meela ($20 to 40, "I am an AI" every call, 50%+
retention at 90 days, 35% of calls over 25 minutes, RiverSpring pre/post study
with significant drops in depression and anxiety, $3.5M seed), Callie ($15,
8,000 users, 85% asked to keep the calls, average 10 minutes, 44% of calls
mention health), JoyCalls ($9.99 to 29.99), ElderVoice ($19 to 49), Naver
CareCall (50,000 seniors, municipal, hallucinated rice deliveries per the NYT).
Devices: ElliQ ($249 + $39.99/mo, free through six US states, 834 NY users, 41
interactions a day), Ato ($99, screen-free button, 1,300 devices, average age
82, ~60% retention claimed), Sam ($199, viral on X), Hyodol (12,000 units,
government-bought, a dementia patient walked to a creek). Portugal: Flora
(CompanIA) lives inside WhatsApp, initiates daily, sends a Family Digest and
deliberately withholds intimate disclosures. Brazil: Sanii (R$ 13M, caregiver
marketplace with a WhatsApp bot), Edukaluz "Fabi" (WhatsApp guidance agent),
Nonno (marketplace). No Brazilian outbound voice companion exists.

### 4.2 Evidence

- BMC Geriatrics meta-analysis, 2026-05: 8 RCTs, 611 elders. Depression g =
  -0.25 (moderate certainty). Loneliness not significant (g = -0.67, CI crosses
  zero, I2 89%). Cognitive-engagement agents worked (g = -0.40); companionship-
  only did not (g = -0.07).
- BOCCO emo RCT (JMIR Aging 2025, n = 73, mean age 82): UCLA loneliness improved
  3.1 points. The robot voiced messages written by humans and family. The
  authors credit that authenticity. This is the strongest argument for the
  family relay being the product, not the chat.
- HELPeN (Spain, 2024): weekly 30-minute human calls for 36 weeks moved UCLA-10
  by about five points. That is the bar an AI caller is measured against.
- Reminiscence: Finding MeBo (CHI 2026) found photos and music work as anchors
  in conversation, not on their own, and elders want legacy recordings.
- Older adults and turn-taking: ASR does not degrade with age, pauses double.
  With a 700 ms silence threshold, 19.7% of utterances from people in their
  sixties are cut off, against 8% in their twenties; semantic turn models
  halve the gap (asr-age-gap). CHI 2025 (HKUST): cooperative interruptions and
  backchannels rated more natural by elders. Frontiers in Dementia 2024: on a
  pause, ask an incremental clarification instead of taking the turn.

### 4.3 What families say

Wanted: "is she OK today" without an interrogation, medication reminders, mood
trend not transcripts, patience with repetition, scam protection. Feared:
deception, being a way not to visit, sycophancy with confusion, data leaks,
cost against a human. Hacker News is uniformly hostile to "AI calls your
parents so you don't have to" (three threads, zero supportive comments); the
Forbes-profiled sons and institutional pilots are positive. The framing is the
difference. Our line, "a long conversation for her, a small real reply from
you", is on the right side of it.

No confirmed case of an elder reacting to a cloned relative's voice inside a
companion product. All cloned-voice material is scam coverage. Treat the clone
as unproven and decouple it from first value.

### 4.4 Brazil

32.1M people aged 60+ (15.6%, Census 2022); 5.66M live alone (28.7% of 60+).
Fixed lines fell to 20M at end-2025, 1998 levels. 74.5% of 60+ used the internet
in 2025; 48% of the unconnected are over 60. Locomotiva Social: "a primeira
geração que cuida dos idosos por WhatsApp". A PSTN-first US design does not
transfer; a WhatsApp-first one does, with the mobile number as fallback.

### 4.5 Rules

EU AI Act Art. 50 (from 2026-08-02): say it is AI, orally is fine, once is not
enough where attachment forms. Brazil PL 2338 passed the Senate, Câmara vote
unconfirmed; LGPD Art. 11 makes health data sensitive and the ANPD lists AI and
health among 2026-27 enforcement priorities. Practice guidance converges on:
disclosure at every call start, recorded assent, physical mute, no commitments,
caregiver notification within 24 to 48 hours of a trigger, DPIA for inferred
mood. Meela discloses every call and keeps its users; disclosure is not a
retention risk.

Sources: see the research outputs (voice landscape, market and evidence, X and
forums) saved with this session; the URL lists are in each.

---

## 5. Voice and real-time: the decision that matters

### 5.1 What changed last week

OpenAI released `gpt-live-1` to the API on 2026-09-10. It is not a new
gpt-realtime snapshot: a separate endpoint (`/v1/live/sessions`), full duplex
(listens while speaking, decides to keep listening, pause, interrupt or speak
several times a second), no manual turn control, backchannels, $0.05 a minute
flat billed per second, 0.8 s turn-taking latency against 1.4 s for
gpt-realtime-2.1, and Speak reports about 80% fewer unwanted interruptions.
"Delegation" hands reasoning and tools to a backend you own (client delegation
means our memory and rules stay ours). Custom voices are contact-sales only.
Direct SIP is inbound only; outbound calls go through Twilio, Telnyx, LiveKit
or Pipecat. Portuguese voices exist (Bossa, Tempo); whether they are Brazilian
is not documented anywhere. No patience knobs: silence tolerance is prompted,
not configured.

ElevenLabs Agents today: Eleven v3 Conversational GA, pt-BR voices, instant
clone in pt-BR, `turn_eagerness: Patient`, `turn_timeout` up to 30 s,
`soft_timeout` filler phrases, native Twilio outbound, post-call webhooks,
custom LLM over an OpenAI-compatible endpoint, per-conversation overrides.
$0.08 a minute at overage plus the LLM at cost. Default `max_duration_seconds`
600.

### 5.2 Cost per elder per month, 20 minutes a day (600 minutes)

| Stack | Model layer | Phone leg to a BR mobile (Twilio $0.0663/min + number) | Total |
|---|---|---|---|
| ElevenLabs + cheap LLM | $50 to 54 | $44 | ~$94 to 98 |
| GPT-Live-1 + cheap backend | $32 to 38 | $44 | ~$76 to 82 |
| Gemini Live on LiveKit | $16 to 33 | $44 | ~$60 to 77 |
| Any of the above over a WhatsApp call | same | ~$0 | model cost only |

At 10 minutes a day (Meela's and Callie's real average) halve everything. The
phone leg is the largest line for every stack. At R$ 149 a month (~$27) none of
the PSTN stacks break even at 20 minutes a day; GPT-Live or Gemini at 10
minutes over WhatsApp does. This is why the elder channel and the provider are
one decision, not two.

### 5.3 Recommendation

Keep ElevenLabs for the pilot: it is the only stack with pt-BR confirmed, an
in-agent clone, native Twilio outbound and patience knobs, and it is what we
have. Put it behind the provider adapter the 08-27 plan already asked for, so
the brief compiler and the post-call pipeline are provider-neutral. Then run the
bake-off the plan specified, in pt-BR, with three real elders and two stacks:
ElevenLabs (v3 conversational, turn_v3, Patient, 8 s timeout) against GPT-Live-1
over Twilio. Score it on the plan's criteria plus the two that matter most for
her: cut-off rate on her long pauses, and whether she could end the call when
she wanted to (Meela's Salvador Gonzalez could not). Full duplex with
backchannels is the most promising thing that has happened for slow speakers;
it is also five days old and undocumented for pt-BR. Two weeks of data beats
an opinion.

Tuning that applies to either: speak at about 135 words a minute; wait 6 to 8
seconds before taking the turn in silence; one question per turn (already in
the brief); backchannels on; on a pause ask "onde?" rather than a new question;
never repeat "você está aí?" (already); a recorded disclosure at the start of
every call; a clean way to say goodbye that the agent honours on the first
"tchau".

---

## 6. Onboarding, step by step

Two sides, one setup session of about twelve minutes on the family member's
phone, in Portuguese. The elder installs nothing. The complex parts (people,
boundaries, schedule, notes) stay with the family; the elder's part is one
phone call with someone beside her.

### 6.1 Family side

| Step | Screen | Collects | Notes |
|---|---|---|---|
| 1 | Quem é ela | her name, relationship, your name, what she calls you, tone (4 chips) | exists (bond). Login after this screen, not before: magic link or Google. |
| 2 | Me conta sobre ela | a voice note, up to two minutes, or text | exists. Whisper + extraction. This is the specialized-LLM interview, and it is voice-first because that is how a Brazilian family member talks about their mother. |
| 3 | Três perguntas | a short chat: the assistant asks only what the note left open (who has passed away, what never to bring up, what she loves telling) | new, replaces the two English free-text "style" questions. Chat-style, three turns, then done. Not an open-ended chat: bounded by what the extraction is missing. |
| 4 | O que entendi | people (up to 8, mark deceased), her stories, never mention | exists (review). Best screen in the product. |
| 5 | O telefone dela | her mobile number, best hour, which days, who will be with her for the first call (you, a cuidadora, nobody), and the disclosure script she will hear | new, the critical step. Sends her a contact card "Presença da Ana" by WhatsApp so the call arrives with a name and a photo. |
| 6 | A primeira ligação, juntos | the family member (or the acompanhante) is with her, physically or on the phone; the Presence calls her mobile; the family introduces it; the agent runs a five-minute script: says it is AI, asks if it may talk with her and tell Ana how she has been, asks what she likes to be called and what time is good; her assent is recorded as audio and as an `ai_disclosure` row | new. This is the assisted configuration the question asked about, and it is one call, not a setup. It records the elder's consent, which nothing does today. |
| 7 | Pronto | "Ela recebe a próxima ligação amanhã às 10h. Você recebe um resumo no WhatsApp depois de cada conversa." First note optional. | exists (relay), minus the fake digest. |

Your voice moves out of onboarding. After three calls: "Quer que ela ouça a sua
voz?" with consent and samples. First value does not wait for a clone, and the
clone's benefit is unproven (section 4.3).

### 6.2 Elder side

Nothing to install. Her phone rings at the agreed hour from "Presença da Ana".
She can also call that number whenever she wants (inbound line, as inTouch's
888). If a note is waiting, the call opens with it after the greeting. The web
page survives only as an optional tablet mode.

### 6.3 Who configures

The adult child, always. The acompanhante or cuidadora gets a second role
(section 7.3) that can add notes and see the "needs a person" list, not the
transcripts. Grandchildren fit the same role.

---

## 7. After onboarding: the relay, not a dashboard

### 7.1 WhatsApp is the surface

After each call the family member gets one WhatsApp message, three lines at
most: "Ela contou que..." (one thing she shared), "Precisa de você:" (only if
non-empty; withdrawal first, health second, requests third), "Ela pediu pra te
dizer:" (only if she asked). Replying to that message queues a note for her
next call. That reply is the relay; it needs no app open. Urgent items
(distress keywords, "not answering for two days") are a separate message, at
once, marked as such, with the reminder that Presence is not an emergency
service.

Meta Cloud API templates; the repo already has a WhatsApp inbound path for
receipts (verify before reuse).

### 7.2 The page is the record

Keep `/presence/home` in the register as already restyled; do not redesign
again. Sections, in this order: Hoje (last call, needs a person), Recados
(queued and delivered), Conversas (summaries, transcript on request), Ela (her
people with inline edit, ask cards, anchors, boundaries), Ligações (schedule,
pause, next call, call-back number), Configurações (voice, members, export,
delete). Every action surfaces its failure; the null-swallowing client goes.

### 7.3 Members

`presence_members(presence_id, user_id, role: owner | family | companion)`.
Owner: everything. Family: notes, summaries, asks. Companion (acompanhante,
cuidadora): notes and needs list only. Invites by WhatsApp link.

---

## 8. Architecture

```
  Scheduler (hourly cron, Vercel cost rule)
      |
      v
  Call orchestrator ---- compiles brief server-side at dial time
      |                     (presenceCallBrief, signed session, no public agent id)
      v
  Twilio outbound  --->  Voice provider (adapter: ElevenLabs now; GPT-Live-1 in bake-off)
  or WhatsApp call         |  turn policy: patient, backchannels, one question
  or inbound line          v
                       Post-call webhook (server-side transcript, signed)
                           |
                           v
                       Summarizer (summary, her_recap, needs_family with urgency,
                       learned facts, unknown people)
                           |
              +------------+-------------+
              v                          v
        Memory                       WhatsApp digest to members
        (facts, asks, links;         reply -> note -> next call
        provisional -> committed     urgent -> immediate message
        after two mentions;
        weekly consolidation)
```

What this changes in the code: the brief compiler and summarizer stay; the
elder page stops being the transport; `/complete` is replaced by the provider's
webhook (a fabricated transcript can no longer poison the prompt); tokens
become per-call and expire; a `presence_calls` schedule table and a members
table are added; the family client stops returning null.

Memory: today the brief carries three summaries and twelve facts. Daily calls
over months need a weekly consolidation ("what we talked about this week") and
promotion of provisional facts on repeat mention. The twin memory stream can
be reused later; do not couple to it now.

Safety: `needs_family` gains `urgency`; keyword and LLM tripwire at summary time;
an emergency contact per presence in the brief ("se ela falar de dor forte,
diga que vai avisar a Ana agora"); a call that finds no answer twice in a row
notifies the family.

---

## 9. Decisions for Stefano

1. Elder channel. Recommended: scheduled outbound call to her mobile through
   Twilio now (works today, CNPJ needed for a BR number), and a one-week spike
   on WhatsApp Business Calling to remove the phone leg. Alternative: keep the
   web link and send it daily by WhatsApp (cheap, weak for the segment).
2. Voice clone. Recommended: out of onboarding, offered after three calls.
   Alternative: keep it in step 5 as today.
3. Family surface. Recommended: WhatsApp digest with reply-as-note; page as the
   record. Alternative: email digest plus page.
4. Provider. Recommended: ElevenLabs behind an adapter for the pilot, bake-off
   against GPT-Live-1 in pt-BR with three elders. Alternative: switch to
   GPT-Live-1 now.
5. Segment. Recommended: autonomous elders only, as the article and the 08-27
   plan say; no dementia positioning.
6. Ship path. Recommended: narrow branch off main carrying backend, migrations
   and the register pages; fix the fifteen items in 2.5 on the way.
   Alternative: merge the cosmos branch (a merge of two eras).
7. Economics. At R$ 149 a month, which call length and which channel? The
   table in 5.2 says 10 minutes over WhatsApp with GPT-Live or Gemini is the
   only combination that clears cost. Your call on price.
8. Distribution. Filhas de aluguel and cuidadoras as partners (companion role,
   first call together, referral)? Sanii and Nonno are the marketplaces.
9. Design freeze. The register stays as applied on 2026-09-12 until the pilot
   has run.

---

## 10. Sequence (after the decisions)

Phase 0, this week: narrow branch off main; the fifteen fixes in 2.5 (body
limit, notes-delivered, token expiry, signed session, `max_duration`, pt-BR
family UI and summaries, elder assent row, pause and delete); analytics events;
design freeze.

**Phase 0 status (2026-09-15, branch `presence/ship` off main, 14 commits, not
pushed).** Done: the port with migrations and eight test files; the 2 MB body
parser; only an active presence answers its link; notes delivered only by a
call that happened (she spoke, three turns, a minute); private agent with a
server-issued session and the transcript read from ElevenLabs by conversation
id, with `provider_conversation_id` stored; `scripts/presence/configure-agent.mjs`
for max call length, turn policy, language, overrides and signed sessions;
family text fenced in the prompt; no duplicate facts on a second description;
her assent (`elder_assent_at`, screen before the first call); `urgency` on the
summary; pause and delete; voice step out of onboarding and `/voice-samples`
503 when cloning is off; Portuguese everywhere the family reads, including the
summary, the readiness mirror and the extraction; errors surfaced on every page
action; PostHog events. Moved to Phase 1: per-call tokens with expiry (the
link is still a long-lived bearer, gated on `active`) and the post-call
webhook (while ElevenLabs is still processing a call, the browser's transcript
is kept and logged). Needs before the pilot: apply
`20260915_presence_elder_assent.sql`; run the agent script with `--apply`;
set `ELEVENLABS_API_KEY`, `ELEVENLABS_PRESENCE_AGENT_ID` and, for summaries and
the voice note, `OPENROUTER_API_KEY`. Frontend verified by tsc, eslint and the
build; not exercised in a browser against a live backend.

Phase 1, two weeks: `presence_calls` schedule and orchestrator; Twilio outbound
through ElevenLabs; inbound number; first-call-together script with recorded
assent; post-call webhook replaces `/complete`; WhatsApp digest and
reply-as-note; urgency on `needs_family`; members and companion role.

Phase 2, two weeks: five families, Brazilian, autonomous elders, one of them
Stefano's own; the 08-27 pilot metrics (three voluntary calls a week, family
reads 70% of digests, replies three times a week, under five minutes a day of
burden, human contact stable or up, she can name it as AI); the provider
bake-off in parallel with three of the five.

Phase 3: memory consolidation, voice clone after three calls, export and hard
delete, LGPD notice and DPIA, payments, WhatsApp calling if the spike passes.

Kill criteria: unchanged from 2026-08-27.
