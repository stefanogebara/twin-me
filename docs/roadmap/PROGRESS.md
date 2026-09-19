# TwinMe Money — the program, and where it stands

This file is the one place both agents (Claude Code and Codex) and Stefano look to know what is being done, by whom, and what is next. It is tracked in git on purpose: `.claude/plans/` is gitignored and the July agentic-OS plan was lost that way.

## How to use this file — the protocol for every agent

1. **Read it first**, every session, before touching code.
2. **Claim before you start.** Change a task's status to `doing (your name, date)`. If another agent has claimed it, work on something else or leave a note under Decisions.
3. **Finish with evidence.** `done (#PR, date)` and one line of what was measured. A test that fails without the change is the default evidence.
4. **Never silently undo the other agent.** Reverting a change or rewriting a test's assertions requires a Decisions entry saying why, with the measurement. (#419: one agent rewrote the other's balance tests to assert the opposite; both were wrong, and the third version — settle by the bank's own reading — was the one that shipped.)
5. **One source of truth for instructions.** `CLAUDE.md` is canonical; `AGENTS.md` must be byte-identical (`npm run sync:agents`, checked in CI). On 2026-09-19 `AGENTS.md` was a 170-line-drifted copy that still named a design system retired on 12 September — which is how #417 shipped off-register.
6. **Branches:** `claude/<topic>` and `codex/<topic>`. Plans that matter go here or in `docs/`, never in a gitignored directory.
7. **Money is the product.** Anything touching `money_*` tables or the bank is never automated on a test streak (`autonomous_writes:false` in the report card stays hard-coded).

Status words: `todo` · `doing (who, date)` · `done (#PR, date)` · `blocked (why)` · `dropped (why)`.

## Owner directives (2026-09-19, verbatim intent)

- **Money first.** TwinMe Money is the first product. Everything else is secondary. A signed-in user lands on `/money`; the twin comes after.
- **Design:** orbs, chat and loading use the exact design of https://libraries.dev/orbs (Jakub Antalik's thinking-orbs).
- **Work with Codex** in both directions.
- **Check whether the legacy twin is used** before parking it.
- **Claude chooses where the loop runs.**
- **Begin with the small wins**, then prioritise the rest.
- **Keep scouting** for ideas, competitors, papers, articles, X — creative, innovative, robust, a wow.
- **The standard:** complete, tested, documented; the finished product, not a plan.

## Now

| # | Task | Status |
|---|---|---|
| QW1 | `bankState.js`: refuse to sign or read without `JWT_SECRET`; `timingSafeEqual` | done (claude/quick-wins `ba89498a`, 2026-09-19) — 8 tests; the route answers 502 instead of signing with 'dev' |
| QW2 | Revoke `anon` on `money_*` tables (migration + catalog test) | done (`ba89498a`) — catalog test fails without the migration; found and fixed the test bootstrap loading only 17th/18th migrations |
| QW3 | `SENTRY_DSN` on Vercel + alert on `cron_executions` failures | blocked — needs a DSN from Stefano (open question 3) |
| QW4 | Rewrite `CLAUDE.md` architecture to what exists; `AGENTS.md` = `CLAUDE.md`; CI check | done (`8df36edf`) — money first; the five gone services named as gone; `npm run sync:agents` + `agents-in-sync.goal.test.js` |
| QW5 | Delete `test/`, `ml/`, `context/`, `screenshots/`; untrack `mobile/node_modules` | done (`ba89498a`) — `mobile/node_modules` was never tracked; ignore rule added |
| QW6 | Delete or fix the 79 skipped tests | done (`812f5770`) — 9 spec files + 11 cases of deleted code removed; what remains is opt-in gates (`TWINME_RUN_*`, `RUN_HEAVY_AUDITS`, `STRIPE_E2E`) and runtime guards; suite 5,506 passing, 4 skipped |
| OW1 | **Money first**: `/`, `/home`, `/dashboard`, post-sign-in and post-OAuth all land on `/money`; the twin is a secondary link | done (`783bc68d`) — `/home`, `/dashboard`, the onboarding gate; pinned by `money-first.goal.test.js` |
| OW2 | **Orbs exactly as the library**: monochrome ink per the library's own theme rule; chat avatar orb at 64 while thinking; every loading state on the money surface is an orb | done (claude/orbs-exact, 2026-09-19) — painter is the library's `M = round((dark ? 1-white : white)*255)`; measured on the built page: darkest dot rgb(26,26,26), 0 non-neutral pixels; chat pending orb at 64 |
| OW3 | **Codex protocol** live: this file, `sync:agents`, branch prefixes, the Decisions rule | done (`8df36edf`) — protocol in `CLAUDE.md`, copied to `AGENTS.md` |
| OW4 | **Scouting**: three background scouts (products, papers, social) reporting candidates into `docs/intel/` through the `/intel` rubric | done (2026-09-19) — 33 candidates triaged: 3 DISCUTIR (INTEL.md, Em aberto), 1 PROTOTIPAR (`dia-hurdle`) + 2 fusions (BACKLOG.md), 10 Radar, 17 descartes in `seen.jsonl`; the seven synthesised ideas are listed below for Stefano |

## Milestones (from the 19 September audit — `.claude/plans/2026-09-19-repo-audit/README.md`, published at https://claude.ai/code/artifact/ae6cd0ba-b090-4660-85ff-cfadb9323679)

### Milestone 0 — safety net

| ID | Task | Acceptance | Status |
|---|---|---|---|
| M0-1 | Coverage as a number for `api/services/money` and `src/pages/money`, threshold at today's value | CI fails below baseline | done (claude/loop-and-coverage) — `vitest.money.config.ts`: lines 65.19%, functions 58.78%, branches 52.41%, statements 61.52% over 67 files / 815 tests; floor 65/58/52/61 in CI |
| M0-2 | Find the order-dependent flake behind `--retry=2`; remove the retry | ten green nightlies at `--retry=0` | doing (Claude, 2026-09-19): the full suite passed locally at `--retry=0` (457 files, 5 565 tests); the nightly now runs it without retries as a graded job ('Unit suite, no retries'), and the report card counts the nights. Drop `--retry=2` in ci.yml after ten greens |
| M0-3 | Import-time canary: every `api/services/money/*.js` imports in < 2 s | fails today on `store.js` | done (claude/loadable-core, #432) — `tests/goals/money-imports.goal.test.js`, exception list empty |
| M0-4 | Backup rehearsal before ledger-touching migrations | restore proven once | todo |

### Milestone 1 — critical fixes

| ID | Task | Acceptance | Status |
|---|---|---|---|
| M1-1 | QW1 + QW2 + QW3 | as above | see Now |
| M1-2 | `validate(schema)` middleware; every money route, then top-20 legacy | 400 with a named field on a bad body | money done (2026-09-19): `api/middleware/validate.js` (zod; body, params, query; 400 `{ error: 'Invalid request', field, message }`), `api/routes/moneySchemas.js`, 18 write routes wired, 15 bad-body cases tested, goal test holds every write route validated. The top-20 legacy routes are open |
| M1-3 | Name every swallowed error in money (`.catch(() => null)` → counted outcome) | grep count 0 in money | done (#434, 2026-09-19): `quietly(name, fallback)` in `api/services/money/quietly.js` logs and counts each; the 26 anonymous catches are named (readings/facts, bank-callback/record-refused, ...); `tests/goals/money-quiet-failures.goal.test.js` holds the count at 0 and the names unique |
| M1-4 | Revocation on serverless: fail closed when Redis is down (recommended) | documented + tested | blocked (Stefano to confirm fail-closed) |

### Milestone 2 — high-leverage

| ID | Task | Acceptance | Status |
|---|---|---|---|
| M2-1 | Break the money cycles (`store.js ↔ calendar.js`, `store.js ↔ predictions.js`) | `madge --circular` = 0; M0-3 passes | done (#432) — `factsRepository.js` + `forecastService.js`; madge 0; bare import of `store.js` 252 ms where it never returned; store.js 1,237 → 1,108 lines |
| M2-2 | Split `MoneyForAccount` into a hook + three views | longest function < 250 lines | done (#434, 2026-09-19): `useMoneyAccount.ts` (three hooks + one composing), `views/{Today,Month,You}View.tsx` and their sections; same innerText on every view before/after in a Playwright walk at two viewports; `tests/goals/money-page-shape.goal.test.js` holds the 250 line limit |
| M2-2b | The three functions still over 250 lines: `MoneyConversation` (325), `MoneySetupPage` (409), `readingWords` (375) | each < 250; the goal test ratchets them | done (#434, 2026-09-19): `readingSayers.ts` (one sayer per kind) + `readingHelpers.ts`; `setup/useSetupQueue.ts` + `setup/AnswerFields.tsx` + `setup/setupWords.ts` (page 94 lines); `chat/useConversation.ts` + `chat/useLedgerTrace.ts` + `chat/askLine.ts`. Ratchet list empty; Ask asked and answered and Setup showed its first question in a Chrome smoke on the production build |
| M2-3 | One read per view, cached per ingestion revision | Today cold < 1.5 s | done (#434, 2026-09-19): `GET /api/money/page` reads the eleven parts once under one authentication (`pageRead.js`; the day reuses the month's forecast), the hook reads it once and keeps the last read per tab for an instant paint on reload, the auth middleware remembers the Redis revocation answer for 30 s (350 ms → 1 ms per request here), and index.html serves Geist itself instead of six blocking Google stylesheets (first request at 65 ms instead of 4–10 s). Local production build, warm API: Today painted in 857 ms and 1 368 ms (was 13–19 s), 1 page request (was 9 reads + preflights). Cold-server spikes here are the local Redis/Supabase link; production after #434 (2026-09-19, signed out, Chrome from Madrid): the document answers in 0.1–0.9 s, `/fonts/geist.css` in 0.22 s from the same origin, the 190 KB entry in 1.3 s; the first API request leaves at 3.9 s after the page's own load and PostHog arrives after it, blocking nothing. The signed-in paint waits on `MONEY_CANARY_TOKEN` (open question 7): a local token is not accepted by production |
| M2-4 | Separate the bank read from the daily loop (own cron, own budget) | `learnSkipped` = 0 for a week | done (claude/loop-and-coverage) — `/api/cron/money-learn` daily 05:30 UTC for every person with a ledger; 4 tests; cost canary green |
| M2-5 | Park the legacy twin behind `LEGACY_TWIN_ENABLED`; money CI lane | money CI < 3 min | todo — see Decisions D3 |
| M2-6 | Agentic OS phase 2: report card for every goal, money canaries, `loop.sh` triage → plan → implement → inspect | grades gate unattended runs | slice 1 done (#434, 2026-09-19): `scripts/ci/reportCard.mjs` grades every nightly job (20 nights, ≥95% eligible, <90% attention; money never automated), three graded jobs added (module loads, money first, money canaries), `report-card` job + artifact; `scripts/agentic/loop.mjs` triage → plan → issue on `.github/workflows/agentic-loop.yml` 06:30 UTC (refusals read from finish_reason, output capped at 1200 tokens). Slice 2 (implement + inspect) needs the agent harness key — open question 6 |

### Milestone 3 — quality

| ID | Task | Status |
|---|---|---|
| M3-1 | `strict: true` for `src/pages/money/**` | done (#434, 2026-09-19): `tsconfig.money.json` (extends the app's, strict, the money pages + MoneyOnboarding, LedgerOrb, Wait) passes with 0 errors after 15 fixes; checked in Build & Test and in the nightly 'Money first' job |
| M3-2 | Lazy-load every non-money route; drop `vendor-elevenlabs` from the money bundle | done (#434, 2026-09-19): the start warms only the money pages (the legacy twin's TodayPage, TalkToTwin, MoneyPage and recharts were fetched at 0 ms on every screen); PostHog arrives on idle behind an ordered queue (209 KB out); each dictionary only for its language with a first-frame guarantee (119 KB out); the front door, the OAuth return, the 404 and the legacy sidebar are their own files. Entry chunk 185 KB, was 556; the money screen loads no legacy chunk and `vendor-elevenlabs` (469 KB) is reached only from the onboarding's voice interview. Measured on a production build in Chrome: `/`, a missing page, `/money` and `/` signed in all render, 0 errors |
| M3-3 | One Redis client | done (#434, 2026-09-19): the OAuth rate limiter rode a second connection from the `redis` package, and its Redis store was built after the limiters were, so no limiter ever held it (every Vercel instance counted alone). Each limiter now has a store that is the shared ioredis client when it is up and memory when not, decided on first use, with its own prefix; the `redis` package is gone |
| M3-4 | Regenerate `.env.example` from code | done (#434, 2026-09-19): `scripts/env-example.mjs` scans api/ and src/ (154 keys, 13 areas, the four required first, notes kept); was 109 undocumented and 16 dead; `tests/goals/env-example-in-sync.goal.test.js` holds it |
| M3-5 | Resolve `--legacy-peer-deps` | done (#434, 2026-09-19): the one conflict was `lovable-tagger` (a Lovable-era dev plugin wanting vite 5 against vite 7); removed, the lock regenerated strictly, `.npmrc` and every `npm ci` in CI and the nightly without the flag |
| M3-6 | Real-backend Playwright canary for the money journey | built, waiting on a secret (2026-09-19): `tests/e2e/money-production.spec.ts` + `playwright.production.config.ts` walk Today (figure within 6 s, at most 8 money requests, one page read), Month and You on twin-ai-learn.vercel.app as a signed-in person; the nightly job 'Money on production' runs it when `MONEY_CANARY_TOKEN` is set and says so when it is not — open question 7 |

### Done this week (for the record)

| What | Evidence |
|---|---|
| Today paints after an interrupted mount; the day reads from the bank | #419, #421 |
| One payment, one line (three identities; settled pairs); one shop, one name, one key | #419, #422, #424 |
| One account, one row | #423 |
| The day's figure is a three-week mean (miss 28,41 → 22,14 EUR, measured by rolling origin) | #424 |
| Two-year first bank read; the currency said once | #424, #425 |
| The loop gets its share of the minute; the band carries its last widening; a failed place lookup is not a miss | #426 |
| Ledger repaired: 27 + 2 duplicate payments, 1 duplicate account, days rescored | scripts in `scripts/money/`, backups in the session scratchpad |
| Repository audit | artifact above |

## Decisions

- **D1 (2026-09-19) — The legacy twin is not used by people; its machinery still runs.** Measured: 34 `conversation` memories by 2 users in 30 days (about seventeen exchanges), against 3,214 reflections and 160 proactive insights generated by crons in the same window; money: 51 chat turns, 141 bank reads. The LLM spend of $3.18/30 days (15,261 DeepSeek calls) is almost entirely this machinery reflecting on nobody. **Recommendation:** park the routes (M2-5) *and* stop the reflection and insight crons for users with no twin-chat activity in 30 days. Awaiting Stefano's yes; parking is reversible.
- **D2 (2026-09-19) — Orbs.** The engine is vendored verbatim from thinking-orbs 0.3.1 (`src/lib/orb/engine.js`, MIT). The single deviation is colour: the library is strictly monochrome (neutral grey, dark dots on a light page); TwinMe draws in the register's warm ink. Stefano asked for the exact design, so OW2 adopts the library's monochrome rule; the register comment in `LedgerOrb.tsx` is updated to say so.
- **D3 (2026-09-19) — Money first is already half true.** `Index.tsx:13` and `ProtectedRoute.tsx:56` send a signed-in user to `/money`. What still points at the twin: `/home` and `/dashboard` → `/today` (`App.tsx:192,243`), `OAuthCallback` → `/soul-reveal`, `ProtectedRoute.tsx:71` → `/soul-reveal`, and `CustomAuth`'s default redirect. OW1 closes them.
- **D4 (2026-09-19) — Where the loop runs: GitHub Actions**, scheduled next to `goals-nightly.yml`. No machine has to be awake, secrets live in repository settings, run history *is* the report card (the existing `money-report-card.mjs` reads it), and it adds nothing to the Vercel bill. A Mac `launchd` job was the alternative and loses on all four.
- **D5 (2026-09-19) — Codex and Claude share this file and one instruction source.** See the protocol above. `AGENTS.md` becomes a generated copy of `CLAUDE.md`.

- **D6 (2026-09-19) — The intel scope now includes the product.** `intel.config.json` `focus_areas` were entirely about the twin; three money areas were added and the audit's measured gaps replaced the `ml/gnn` one (that directory was deleted today). `bets` and `settled` still describe the twin-first strategy ("30+ platforms is the moat") and are **not** edited — CLAUDE.md says only Stefano reopens `settled`; open question 6 asks him to.

## Open questions for Stefano

1. **M1-4:** fail closed on logout when Redis is down (some users get a 401 during an outage) — yes or no? Recommended yes.
2. **D1:** park the legacy twin and stop its crons for inactive users — yes or no?
3. **QW3:** a Sentry DSN (free tier is enough) — Claude cannot create the account.
4. **The day's number:** the most likely spend (shipped) or a sustainable allowance? The label "Today's estimate" fits either; commit to one.
5. **Enable Banking's reply** (sent 2026-09-18) and **Plaid eligibility** for the US friends.
7. **`MONEY_CANARY_TOKEN`** (and optionally `MONEY_CANARY_URL`) in the repository's Actions secrets: an access token for a canary account with a small real ledger, so the nightly walks production as a person. Claude can mint one locally only with the production `JWT_SECRET`, which it does not have; a token minted by Stefano (90 days) is enough.
6. **Actions secrets for the loop:** `OPENROUTER_API_KEY` in the repository's GitHub Actions secrets (the loop's triage runs without it but asks nothing), and later an agent-harness key for the implement/inspect stages. Claude cannot add secrets.

## Ideas the scouts synthesised (2026-09-19) — for Stefano to pick from, ranked by evidence TwinMe already holds

1. **The return window on a receipt.** The receipts inbox knows the purchase date; a receipt's own text often carries the return or warranty window. A quiet line near the deadline ("the return window on this closes in three days") saves money without asking anyone to think. No competitor surfaces it. Evidence held: `inbox.js`, `attachments.js`.
2. **The charge before it lands.** "Spotify renews tomorrow; the day still holds" or "…now tight, 8 EUR of slack this week." Copilot's most-loved moment is catching a forgotten subscription *after* the fact; the recurring series and the allowance already know it the day before. Evidence held: `recurring.js`, `allowance.js`; Karlan et al. say a nudge that names the specific expense works where a generic one does not.
3. **Reconciliation you can see.** Every competitor merges sources silently; the #1 quit reason is silent sync breakage. One grey line under a row — "seen by the bank and the phone" versus "bank only, not confirmed" — turns the invisible into trust. Evidence held: `money_sightings` per line.
4. **The Bizum that is the rent.** Recurring Bizum to the same two or three people near the 1st, similar amount: label it "looks like your rent split" and count it as rent, without a wallet and without holding money (Splitwise's pending-for-days is its most hated trait). Evidence held: `bizum.js`, `person` facts.
5. **Ninety seconds, not a ledger scroll.** The three to five payments that moved the forecast most this week, one yes/no each ("keep eating out this much, or was that a one-off?"). The manual-review ritual is what changes behaviour (HN, YNAB); this is its benefit without its labour. Evidence held: `deltas.js`, the verdict flow.
6. **Roast, but grounded.** Cleo's voice is loved and distrusted because it sits on numbers people doubt. TwinMe's chat only says computed numbers — the same dry, specific line ("four dinners out, 60% of the month's food gone") is provably right. A register question as much as a product one.
7. **Calendar-conditioned band.** Widen the day's band on a trip or exam week. Measured 19 September: one away day in 75 — nothing to learn from yet. Last, not first.

## Session log

- **2026-09-19 (Claude):** merged #424–#426 prerequisites; wrote the audit; created this file. Quick wins QW1, QW2, QW4, QW5, QW6 and OW1, OW3 done on `claude/quick-wins`; QW3 blocked on a DSN. Legacy usage measured (D1). Orb deviation found (D2). AGENTS.md drift found and fixed (D5). All three scouts returned and were triaged into `docs/intel/` (OW4). M0-3 and M2-1 done on `claude/loadable-core` (#432); orbs on `claude/orbs-exact` (#431); quick wins on `claude/quick-wins` (#430).
- **2026-09-19 (Claude, later):** M2-4 (daily learn cron) and M0-1 (coverage floor 65/58/52/61) on `claude/loop-and-coverage` (#434); M2-6 slice 1 on the same branch: report card generalised, graded jobs, the loop's triage stage on Actions. Next: M2-2 (split MoneyForAccount).
- **2026-09-19 (Claude, evening):** M2-2 done on `claude/loop-and-coverage` (#434) with a before/after Playwright walk; M2-2b opened for the three functions that were already long; M2-3 measured (30/31/38 requests per view). Baseline freeze locked on `claude/quick-wins` (eslint 73 → 71) and #431/#432/#434 rebased onto it.
- **2026-09-19 (Claude, night):** M2-3 done on `claude/loop-and-coverage` (#434): one read per view, per-tab kept read, blacklist memo, self-hosted Geist; lessons written (production build for measurements, preflights, third-party stylesheets). Next: M2-2b, then the production timing of Today after #434 lands.
- **2026-09-19 (Claude, late):** M2-2b, M1-3, M3-1 and M3-2 slice 1 on `claude/loop-and-coverage` (#434); the entry chunk measured for slice 2; the full suite is running at `--retry=0` for M0-2.
- **2026-09-19 (Claude, end of day):** #426, #430, #431, #432 merged (squash); `claude/loop-and-coverage` (#434, 28 commits) rebased onto main with #426's carried widening ported into `forecastService.js`. M2-2b, M1-3, M3-1, M3-2, M3-3, M3-4, M3-5 done; M0-2 graded nightly. Open: M0-4 (backup rehearsal, needs production access), M1-2 (validation middleware), M1-4/QW3/M2-5 (Stefano), M3-6 (real-backend canary, needs secrets). Next: land #434, then measure Today on Vercel.
- **2026-09-19 (Claude, night):** #434 merged into main. M1-2 for the money routes on #436 (`claude/validate-money`); M3-6 built on the same branch, waiting on `MONEY_CANARY_TOKEN`. Production boot probe of /money after the deploy is in the session scratchpad (`prod-boot.log`).
- **2026-09-19 (Claude, close):** #436 merged; production probed after #434's deploy (numbers under M2-3); two API servers left running in this worktree since 13 and 16 September (2.8 GB each) were stopped. The sign-in tab still says "Discover Your Soul Signature" (`/auth` title) — a one-line fix for the next session.
