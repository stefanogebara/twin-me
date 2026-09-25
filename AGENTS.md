# TwinMe - Soul Signature Platform

## User Preferences (MUST FOLLOW)

- **NO EMOJIS** — The user dislikes emojis. Never use them in UI text, twin responses, insight text, or any user-facing content. Use plain text only.
- **Design**: the register (since 2026-09-12, every page) — Instinct's signed-in app with the Cosmos headings. Warm page #fbfaf9, one warm ink #251f21 at AA-safe strengths (#585254, #6c6867), #eae9ea hairlines, the warm field #f4efec, 13px Geist with weight for hierarchy, Cosmos headings (Geist 300 / 400, never a serif), rows under a 1px ink rule instead of cards, 32px/4px buttons with one ink primary, no uppercase tracked labels, very little text. Contract: /system + src/styles/register.css. Full section below.

## Vercel Cost Rules (CRITICAL: $375 in March 2026, $309 in September 2026)

The team-wide rules live in `~/.claude/CLAUDE.md` ("Vercel spend rules") and
`scripts/ci/vercel-spend-audit.mjs` checks them against the live team. What is specific
to this repository:

- **One function: `api/index.js`, and everything else under `api/_app/` (D26, 2026-09-23).**
  Vercel compiles every `.js` directly reachable under `api/` as its own serverless
  function, each with its own copy of node_modules, and skips anything under a folder whose
  name starts with an underscore. Zero-config had built all 674 files: 264,398 files and
  2.5 GB per build, 19 minutes, $0.18 each, $132 in September. With the server under
  `api/_app/` the same pipeline builds one function of 6,216 files and 59 MB in 23 seconds
  (measured with `vercel build --prod` locally; **63 s end to end on Vercel**, measured on the
  merge of #552). Never put a second `.js` directly under
  `api/`; a new route is a mount in `api/_app/server.js`, reached through the rewrite of
  `/api/*` to `api/index.js`. The legacy `builds` block was tried first and stalled on
  Vercel (15 minutes with no output after Vite); it is not the answer.
- **Only `main` builds** (`scripts/ci/vercel-ignore.sh`, D21), and only when the commit
  touches something the site serves; `bisect/*` is the one preview exception, for build
  experiments, and a bisect branch is deleted after. A Vercel check reading "skipped" on a
  pull request is this working.
- **Build machine basic, fixed.** `vite build` takes 4 s; nothing here needs more.
- **maxDuration 60 s** (`functions` in `vercel.json`, and the project default), crons never
  more often than `*/15` (deliver-insights and prospective-check are at `*/15`; the
  token-refresh cron was removed), and an LLM call in a cron checks its cooldown first.
  Runtime cost $4 in September; builds were the bill.
- **One deploy per push;** batch commits. The GitHub Action duplicate deploy is disabled.
- **The function runs in `cdg1` (Paris), beside the database** (`regions` in `vercel.json`,
  2026-09-25). With no region set it ran in `iad1`, Washington DC, while Supabase is
  `eu-west-3` in Paris and the people are in Spain, so every query crossed the Atlantic and
  came back. Measured on the same warm function: `/api/health` 237 ms with no database,
  `/api/health/deep` 902-1 863 ms for one round trip, and `/money/page` 7 249 ms on a first
  load because it makes several in sequence. It reads as a cold start and is not one: a cold
  `/api/health` answers in 629 ms against 307 ms warm. If the database moves, move this with
  it; `tests/goals/function-region.goal.test.js` holds the two together.

## Workflow & Task Management

Global workflow rules live in `~/CLAUDE.md` ("Workflow Orchestration" +
"Task Management") and `~/.claude/rules/` — don't duplicate them here; the
last copy of this section drifted for months because it was a verbatim
mirror. Project-specific notes only:

- Durable plans for this repo: `.claude/plans/<date>-<topic>/README.md`
  (the doc-file hook blocks new .md elsewhere; `tasks/todo.md` is legacy —
  read it if present, don't extend it).
- Lessons for this repo: append to `tasks/lessons.md` after corrections.
- Bug reports here default to failing-test-first (vitest); trivial fixes
  (typo, stale ref, one-line config) can skip the reproduction harness —
  say why.

## The program tracker and working with Codex (since 2026-09-19)

- **Read `docs/roadmap/PROGRESS.md` first, every session.** It holds the owner's
  directives, the milestones with a status per task, the decisions log, and the
  open questions. Claim a task there (`doing (you, date)`) before starting it;
  close it with `done (#PR, date)` and the measurement.
- **Two agents commit here under one identity** (Claude Code and Codex). Never
  undo the other's change or rewrite its test assertions without a Decisions
  entry in the tracker saying why, with the measurement.
- **`AGENTS.md` is a generated copy of this file** (`npm run sync:agents`;
  `tests/goals/agents-in-sync.goal.test.js` fails when they differ). Edit
  `CLAUDE.md` only.
- Branches: `claude/<topic>` and `codex/<topic>`.

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

---

## What TwinMe is now (money first, since 2026-09-19)

**TwinMe Money is the product.** A spending ledger for students in Spain (US friends
next): a PSD2 bank feed, phone payment notifications, an email receipts inbox and
statement uploads are reconciled into one ledger; the month and the day are forecast
with a band that scores itself nightly; a chat phrases only numbers the code computed.
A signed-in person lands on `/money`. Everything under "the twin" below is secondary,
kept reachable at its own addresses, and a candidate for parking (tracker, D1).

### Money — the pipeline

```
bank feed / phone / email inbox / statement
   -> sightings (money_sightings)  -- what one channel saw
   -> reconcile (ledger.js: merchant, amount within 1%, four days) -> money_transactions
   -> recurring.js (standing charges) / projection.js (month band) / calibration.js
      (day figure = three-week mean; band = twelve-week spread + conformal widening)
   -> allowance.js (today's number, anchored on the bank balance, settled by the
      bank's own reading) / analyst.js, brain.js, deltas.js (readings)
   -> routes/money.js -> store.js (persistence + orchestration)
   -> src/pages/money/* (Today, Month, Plan, You, Ask)
```

Rules that hold everywhere in money:
- **Computed, not generated.** No LLM in `projection.js`, `calibration.js`,
  `allowance.js`, `brain.js`, `deltas.js`. The chat (`chat.js`) drops any sentence
  carrying a euro figure the context does not hold.
- **One spending rule** (`spending.js`) for the forecast, the categories and the chat.
- **Evidence stays separate from conclusions.** A sighting is what a channel saw; a
  transaction is the reconciled fact; a payment the phone saw and the bank booked is one
  line. Identities: `pend:<fingerprint>`, `bank:fallback:<fingerprint>`,
  `bank:<account>:<entry_reference>`; a reading carries every earlier name.
- **Silence over guessing.** A figure that cannot be grounded is withheld with a
  sentence saying why; a failed read never renders as an empty ledger.
- **The product scores itself.** `money_figure_scores` nightly; a day is scored four
  days after it (settling); widening is conformal, in the person's euros; the band
  carries its last issued widening while no day is scored.
- **One currency, one timezone, said once:** `currency.js` (`MONEY_CURRENCY`),
  `zone.js` (`MONEY_TZ`). **Where a person is comes from their own data** (`profile.js`,
  since 2026-09-23): country from the IBANs of their accounts, currency from the accounts,
  timezone and language from their row; the deployment values are the fallback and every
  field says its source. Threaded into the place and home lookups, the merchant judge and
  the bank routes. **The timezone follows the person too** (2026-09-23): every `zone.js` helper
  takes a zone and otherwise reads the request's, set by the money router's middleware, the
  crons' per-person loop and the WhatsApp inbound (`inPersonZone`, `withZone`); the page reads
  its days in the zone the payload carries (`profile.timezone`). **The currency follows the
  person too** (2026-09-23, stage three): `currency.js` reads `ledgerCurrency()` from the same
  scope (`scope.js`: `withPerson`, `currentPerson`), `ours()` and `money()` follow it, every
  euro literal in the reads is the ledger's own currency, and the page's `euro()`, `ownCurrency()`
  and filters follow `profile.currency` (`setLedgerCurrency`). Conversion is still deliberately
  absent: a row in another currency is refused, never added.

Key money files (`api/_app/services/money/`): `ledger.js` (reconcile), `ingestion.js`
(atomic plan/commit), `store.js` (persistence, being split), `projection.js`,
`calibration.js`, `allowance.js`, `predictions.js` + `figureScoring.js` +
`figureScoreStore.js` (the loop), `recurring.js`, `spending.js`, `narrative.js` (a bank
sentence to a name), `places.js` + `home.js` (place lookup), `calendar.js` + `ics.js` +
`covariates.js`, `chat.js`, `feeds/enableBanking.js`, `statements/importer.js`,
`inbox.js` (receipts), `twinBridge.js` (what the twin is told). WhatsApp channel:
`channel.js` (pure: who is allowed on, reply-to-message rendering, offer labels),
`channelInbound.js` (`handleMoneyInbound`, the one effectful entry point, deps-injected),
`channelStore.js` (its database reads and writes), `attachmentDeps.js` (dependencies for
reading an attachment into the ledger, shared byte for byte with the page's own
POST /chat/attach). Routes: `routes/money.js`, `routes/cron-money-pull.js` (hourly;
bank read yields to the loop at 30 s).
Repair and evaluation scripts: `scripts/money/` (`merge-duplicate-payments.mjs`,
`merge-duplicate-accounts.mjs`, `rescore-figures.mjs`, `evaluate-day-forecast.mjs`),
`scripts/eval/page-eval.mjs`. The Ask benchmark (since 2026-09-23): `tests/api/_app/services/money/chatBench.js`
(the questions, statements and sequences in ten dimensions), `scripts/money/chat-bench.mjs` (runs them
against a local API, checks figures, actions, grounding, speed, asks a grader, undoes what it taught;
run it under `caffeinate -i`), `scripts/money/chat-bench-report.mjs` (the HTML).

Tables: `money_transactions`, `money_sightings`, `money_accounts`, `money_recurring`,
`money_facts`, `money_figure_scores`, `money_predictions`, `money_readings`,
`money_places`, `money_chat_turns`, `money_feed_accesses`, `money_ingestion_revisions`,
`money_channel_inbound` (dedupes a provider retry), `money_channel_offers` (a reply's
tap targets), `money_facts_retired` (a forgotten fact, kept and dated). RLS is on for
all of them (a `DO ... EXECUTE` block, so static scans undercount); `anon` is revoked on
every money table.

The WhatsApp channel is gated by `MONEY_WHATSAPP_USER_IDS` (comma-separated
`public.users.id`; unset means nobody is on it). **Bank connections are a capability computed
per person** (`betaCapabilities.js`, since 2026-09-23): open when the aggregator is configured
and the person is already linked, or on `MONEY_ADVANCED_BETA_USER_IDS`, or the production
application is unrestricted (`ENABLE_BANKING_UNRESTRICTED=true`, set by the owner when Enable
Banking confirms the contract and KYB; their API does not say) and their country is one it
serves; `why` names the reason and the Sources page says it. Phone capture is open to everyone
signed in (D23).

### The twin (deleted 2026-09-24)

Measured 2026-09-19: 34 twin-chat memories by 2 users in 30 days against 3,214 reflections and
160 insights generated by crons for nobody. Parked behind a 410 gate on 2026-09-22 (D20) and
**deleted on 2026-09-24** (M2-B api, on Stefano's directive: money from scratch, forget the
rest): every file under `api/_app/` that no root in `scripts/ci/staying-roots.txt` reaches went,
with its mounts, its startup jobs and its tests. What remains of it is the gate:
`api/_app/middleware/legacyTwin.js` keeps `LEGACY_TWIN_ROUTES`, the 114 addresses that answer
410 with the parked line, and `src/lib/legacyTwin.ts` parks the pages; a goal test keeps the
list unmounted. `scripts/ci/reach.mjs` walks the roots and the staying-set coverage floor is
measured over exactly that set. Do not resurrect a twin file from git history without a
Decisions entry.

## Tech Stack
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, shadcn/ui
- **Backend**: Node.js, Express 5, JWT Auth
- **Database**: Supabase (PostgreSQL + pgvector) - ONLY active database
- **AI**: OpenRouter (DeepSeek V3.2 for analysis, Mistral Small for extraction, Claude Sonnet for twin chat)
- **LLM Gateway**: `api/_app/services/llmGateway.js` - ALL LLM calls route through here
- **Cache**: Redis (ioredis) with in-memory fallback
- **Auth**: JWT + OAuth 2.0 for platform connections
- **Analytics**: PostHog

## Sources (the money product's, since 2026-09-24)

Stefano, 2026-09-24: "forget Spotify and the other platforms connected in TwinMe; money is the
new product we are making from scratch." What a ledger reads from, and nothing else:

1. **The bank** (PSD2 through Enable Banking; `feeds/enableBanking.js`), read four times a day.
2. **The phone's notifications** (Android app, iPhone Shortcut; `routes/purchase-notification.js`).
3. **The receipts address** (`in.twinme.me`, Resend inbound; `inbox.js`, `mailAttachments.js`): a
   forwarded receipt, a bank's alert mail, a statement as an attachment.
4. **Statements** uploaded on Sources or sent on WhatsApp (`statements/importer.js`).
5. **The calendar** (Google Calendar OAuth, and pasted Canvas or Blackboard links; `calendar.js`).
6. **WhatsApp** (the channel; `channel*.js`), modelled on Instinct's assistant: reactions as
   answers, one interruption removed at a time, never writing first until the per-message
   pricing is decided.

The legacy OAuth platforms (Spotify, YouTube, Gmail as a twin source, Discord, GitHub, Whoop,
Instagram, Outlook; `VALID_PROVIDERS` in `routes/oauth-callback.js`) are parked behind the 410
gate (D20) and leave with the parked API on 2026-10-22 (M2-B). Do not build on them.

## LLM Model Strategy
All LLM calls route through `llmGateway.js` using the tiers in `api/_app/config/aiModels.js` (single source of truth). Twin chat additionally smart-routes per message via `chatRouter.js`.

| Tier | Use Case | OpenRouter Model ID | Why |
|------|----------|---------------------|-----|
| CHAT | Twin conversation (default) | `deepseek/deepseek-v3.2` | 12x cheaper, ~3x faster TTFT; smart-routes up for hard turns |
| ANALYSIS | Reflections, twin summary, proactive insights | `deepseek/deepseek-v3.2` | Good enough, 95% cheaper |
| EXTRACTION | Importance rating, fact extraction | `deepseek/deepseek-v3.2` | mistral-small-creative was 404'ing on OpenRouter (2026-04-30) |
| VISION | WhatsApp receipt/image extraction | `google/gemini-2.5-flash` | vision-capable, ~$0.001/image |

Smart routing (`chatRouter.js`): Chat Light = `google/gemini-2.5-flash` (greetings/acks), Chat Standard = `deepseek/deepseek-v3.2` (medium), Chat Deep = `deepseek/deepseek-v3.2` (emotional / identity / complex — kept on DeepSeek for cost; `CHAT_TIER_MODELS` in chatRouter.js is the source of truth, drift-guarded by a test).

## Development
```bash
npm run dev          # Frontend: http://localhost:8086
npm run server:dev   # Backend: http://localhost:3004
npm run dev:full     # Both together
```

## Project Structure
```
twin-ai-learn/
├── src/                    # Frontend (React + TypeScript)
│   ├── pages/              # Route pages
│   ├── components/         # Reusable components
│   ├── contexts/           # React Context providers
│   ├── services/           # API client layer
│   └── hooks/              # Custom hooks
├── api/                    # index.js is the one serverless function (D26)
│   └── _app/               # the Express server; the underscore keeps Vercel from compiling it
│       ├── routes/         # API endpoints
│       ├── services/       # Business logic
│       ├── middleware/     # Auth, rate limiting, validation
│       └── config/         # AI models, constants
├── database/               # Supabase migrations
└── browser-extension/      # Chrome extension
```

## Environment Variables (Required)
```
NODE_ENV, PORT, VITE_APP_URL, VITE_API_URL
VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
JWT_SECRET, ENCRYPTION_KEY
OPENROUTER_API_KEY
SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
YOUTUBE_API_KEY
```

## Philosophy
- **From Resume to Soul**: Moving beyond professional achievements to authentic personality
- **Instant Wow**: Users should be surprised by what we know in the first 60 seconds
- **Privacy as Feature**: The privacy spectrum dashboard IS the trust builder
- **Quality over Quantity**: 5 great integrations > 56 half-built ones
- **The Twin Must Have Soul**: Not ChatGPT with facts - it must EMBODY the user's personality
- **Memory Is Everything**: The twin's quality is directly proportional to how well its memory stream works

## Critical Gotchas

### User IDs: public.users NOT auth.users
The app uses `public.users.id` everywhere (user_memories, twin_goals, etc.), NOT `auth.users.id`. These are DIFFERENT UUIDs. All FK constraints reference `public.users(id)`. The test user is `167c27b5-a40b-49fb-8d00-deb1b1c57f4d` (stefanogebara@gmail.com).

### JWT Token Format
Auth middleware reads `payload.id || payload.userId`. The verify endpoint uses `decoded.id`. ALWAYS use `id` field when generating test tokens.

### Frontend API Base URL
`VITE_API_URL=http://127.0.0.1:3004/api` already includes `/api`. Frontend API clients use paths like `/goals` not `/api/goals` to avoid double prefix.

### Memory Stream Composition
Recent memories are dominated by reflections (~90 of last 100). Platform data observations are sparse (~4 in 200). When scanning for platform data, fetch 200+ memories and filter by `memory_type === 'platform_data'`.

### Windows Process Management on Git Bash
`taskkill /PID 12345 /F` fails in Git Bash due to path expansion (`/PID` -> `C:/Program Files/Git/PID`). Use `cmd.exe //c "taskkill /PID 12345 /F"` instead.

## NODE PROCESS MANAGEMENT
**NEVER kill ALL node processes (crashes the CLI):**
- `taskkill /F /IM node.exe` - NEVER
- `pkill node` - NEVER

**OK to kill specific processes by PID:**
- `cmd.exe //c "taskkill /PID 12345 /F"` - OK when you know the specific PID

## Custom Slash Commands
- `/verify-app` - TypeScript check + Vite build + server health
- `/test-api <endpoint>` - Test API endpoints with auth
- `/test-twin <message>` - Test twin chat context pipeline
- `/code-review` - Full code review of current branch
- `/design-review` - Design review with browser testing

---
## Design System (the register — every page since 2026-09-12)

> The register is Instinct's signed-in app (app.instinct.co, measured signed in
> on 2026-09-11) with the Cosmos headings kept. It shipped on the money pages and
> sign-in in #306 and became every page's foundation on 2026-09-12.
> **Nocturne was retired on 2026-09-12:** `nocturne.css` keeps its `--n-*`
> names and `.n-*` classes, and `nocturne-bridge.css` keeps the semantic
> tokens (`--background`, `--primary`, `--muted-foreground`...), but both now
> resolve to the register, so every page follows without being edited.
> Source of truth: `src/styles/register.css` (`--rg-*`). Living spec: `/system`
> (also `/nocturne/system`; both dev-only routes), which reads its tokens live.
> Reference implementation: `src/styles/money-v2.css` + `src/pages/money/*`.
> Spec: `.claude/plans/2026-09-11-instinct-register/`.

### Tokens
- **Grounds:** page `#fbfaf9` (every screen) · white `#ffffff` (a secondary
  button, a card until it becomes rows) · field `#f4efec` (an input, a pressed
  choice).
- **Ink, one warm ink at three strengths:** ink `#251f21` (text, the rule on top
  of every list, the primary fill) · ink-2 `#585254` (the one grey line under a
  title, 7.3:1 on the page) · ink-3 `#6c6867` (quiet: empty states, names,
  timestamps, 5.3:1).
- **Lines:** hairline `#eae9ea` between rows; hover is ink at 5%.
- **Never text:** `--rg-quiet` `#969394` (2.9:1, disabled and decorative only) and
  `--rg-mark` `#8c8889` (the switch's off track, 3.4:1).
- **State:** danger text `#c42533` (5.5:1), its line `#f5aaae`; ok text
  `#3d7566` (5.1:1), its line `#73a89a`. Instinct's own red and green fail as
  text, so they stay lines.
- **The five signatures** (domain and data colour only: tiles, strokes, brand
  icons), re-tuned for the light page to clear 3:1 as a stroke: ember `#c47833`
  motivation · iris `#8179fb` personality · verdigris `#4c9786` cultural ·
  orchid `#ba70b6` social · periwinkle `#668cc2` lifestyle · signal `#0096ba`
  for chart strokes. Text on a tile is ink (4.7:1); a signature is never text.
  Each has an `-rgb` triplet: `rgb(var(--rg-ember-rgb) / 0.2)`.

### Type
Everything is Geist (variable range, loaded in `index.html`); Geist Mono only for
a value to copy. **Never a serif**: `--n-serif` and `font-heading` resolve to Geist.
- **Page title:** Geist 300, line-height 1.0, letter-spacing −0.05em, balanced.
  App screens 32–40px; marketing `clamp(46px, 6.3vw, 74px)`.
- **Section heading:** Geist 400, line-height 1.08, −0.04em, balanced. App
  `clamp(28px, 3.2vw, 38px)`; marketing `clamp(38px, 5.5vw, 66px)`.
- **Everything else is 13px**, and weight makes the hierarchy: row title 13/20
  at 500 ink · grey line 13/19.5 at 350 ink-2 · quiet 13/19.5 at 350 ink-3 ·
  prose 13/19.5 at 400. Tracking −0.176px; tabular figures.
- **No uppercase tracked labels, anywhere.** Labels are sentence case.

### Layout: rows, not cards
- Content column 820px; a 200px sidebar of plain text links 80px to its left,
  the current link underlined, nothing filled. Phone (≤ 767px): 24px gutters,
  navigation behind a menu button, every other size unchanged.
- Sections 160px apart (112 on a phone; raised from 72/56 on 2026-09-15 and from 128/96 on 2026-09-21). A section
  is a heading, one grey line 4px under it, then a list under a **1px ink rule**
  32px further down.
- **No cards, panels, glass, gradients or shadows on app screens.** A row is
  `[32px icon] [title + one grey line] [one action]`, min-height 80, padding
  20/12, a hairline under it; the action is a chevron, a 32px button or a "…"
  menu, never two. A sub-row is indented 50px. An empty state is one quiet line.
- Until a page is converted, a card is white with a hairline and an 8px corner.

### Controls
- **Button:** 32 tall, padding 0 16, 4px corner, 13px. Primary: ink fill,
  page-colour text, **one per screen**. Secondary: white, hairline, ink text.
  Danger: white, `#f5aaae` line, danger text, never a red fill.
- **The one exception:** the main call to action of a marketing or sign-in page
  is 48 tall, 12px corner, 15px 500, ink fill (`<Button size="lg">`).
- **Field:** no border, the warm field, 44 tall, 4px corner, padding 11/14, 13px.
- **Switch:** a 44×26 pill, ink when on, a 20px page-colour knob.
- Targets at least 24×24. The shared shadcn primitives in `src/components/ui/`
  (button, input, textarea, select, switch, tabs, dialog, sheet, drawer,
  alert-dialog, toasts, card) already speak the register: use them.

### Copy
One grey line per row, about 60 characters at most, never a paragraph in a row.
A screen stays under about 150 words, a sign-in under 50 (count `innerText` of
`main`). Sentence case, plain words as a person would say them: no jargon.

### Must hold (AA)
- Text at least 4.5:1, or 3:1 at 24px and above; strokes, icons and control
  boundaries at least 3:1. `tests/unit/registerContrast.test.ts` re-measures the
  tokens from `register.css`; `scripts/audit-cosmos-ink.mjs` (`ALL=1`, root
  `#root` by default) measures rendered pages at 402×874 and 1440×900.
- Marketing pages keep their photography and film. Text on a photograph keeps
  an audited white ink (see `.n-atmosphere`), and must still pass AA.

### Rules for AI code generation
1. Build new surfaces on `--rg-*` tokens and the `.mv` / shadcn primitives. The
   `--n-*`, `n-*` and `claura-*` names still resolve, but never add new uses.
   The shapes more than one page needed live once in `register-kit.css`:
   `.rg-compact` (57px rows), `.rg-choice` / `.rg-choices` (on
   `.n-btn.n-btn--ghost`, `--num` for figures), `.rg-input`, `.rg-bar`,
   `.rg-danger`, `.rg-figures`. Use them; never re-cut one in a page sheet.
2. NO EMOJIS in user-facing UI (unchanged, permanent).
3. Never a serif, never bolder than 500, never a signature hue as text, never a
   shadow, glass or gradient on an app screen.
4. SVG presentation attributes and canvas do not resolve `var()`: write the
   register's hex there, with a comment naming the token.
5. Single appearance: the register is light by design. `data-theme` is still
   stamped `dark` by ThemeContext; the bridge maps both to the same light world.
6. `:root:root` in the bridge is load-bearing (Tailwind hoists `:root` blocks
   past it); `tests/frontend/bridgePrecedence.test.ts` pins it.

### Regression tells
A shadow under a card, glass, a gradient, an uppercase tracked label, a serif,
white text on the page, a filled nav item, two primaries on a screen, or a
signature colour used as text means someone built on a retired system.

## Inteligência de mercado e técnica

Contexto vivo deste projeto — concorrentes, papers e mudanças de plataforma já
triados — vive em `docs/intel/`:

- **`docs/intel/INTEL.md`** — leia no começo de qualquer sessão sobre rumo de
  produto, arquitetura ou posicionamento. A seção "Em aberto" tem decisões
  esperando o Stefano; traga-as à tona quando o assunto encostar nelas.
- **`docs/intel/BACKLOG.md`** — spikes e implementações que saíram da triagem.
  Antes de propor um experimento novo, veja se ele já está aqui.
- **`intel.config.json`** — o que este projeto é, sua stack, suas apostas
  (`bets`), seus buracos (`known_gaps`) e o que já foi decidido (`settled`).
  **Não rediscuta o que está em `settled`** sem que o Stefano reabra.

Para atualizar: `/intel`. A rubrica de triagem está em
`.claude/skills/intel/references/rubric.md` — nada entra nesses arquivos sem
passar por ela.
