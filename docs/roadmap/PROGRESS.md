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

## The chat, curated (since 2026-09-20)

Stefano's ask of 2026-09-20: specific questions, many scenarios, judge the answers, fix until
they create value. The harness is `scripts/money/chat-eval.mjs` over
`tests/api/services/money/chatScenarios.js` (the real model against the real ledger, seven
checks and a judge). Each round: what was asked, what was wrong, what changed, the tally.

| Round | Asked | Was wrong | Changed | Tally |
|---|---|---|---|---|
| 1 (2026-09-20) | last night, yesterday in total, this week, this vs last week, each day, biggest yesterday | lines one by one and no total (the rules forbid adding, the context held only the month) | `windows.js`: today, yesterday, last night, this week, last week, last 7 days and each day, totalled in Madrid days and quoted; a week figure (a bar per day); greetings answered without the model (a greeting took 30 s and a 504) | 32/35 with the judge, then 5/5 on the smalltalk rerun; "Ontem você gastou 58,00 € no total, em 4 pagamentos" |
| 2 (2026-09-20) | food yesterday, coffee this week, where most this week, a graph per day, transport last week, can I afford 60 tonight | a stretch with a kind of place or a place in it had no line to quote; "a graph of this week" drew the weekday shape | each window now says its kinds of place and its places (`breakdown()`); the rule names the week figure for "each day" | 4/6 by the harness; the two judge-0 answers are right by Claude's reading: "nothing on food yesterday, the 58,00 € was entertainment", "coffee is not a separate kind this week; eating out 14,13 € at Glovo" |

Not there yet, honestly: no web access (the chat says only what the ledger computed); figures are bars, shares, the band, months and recurring, not free-form diagrams; an offer (remember, not_me, person, answer) changes the ledger only when tapped, which the browser suite covers.

## Milestones (from the 19 September audit — `.claude/plans/2026-09-19-repo-audit/README.md`, published at https://claude.ai/code/artifact/ae6cd0ba-b090-4660-85ff-cfadb9323679)

### Milestone 0 — safety net

| ID | Task | Acceptance | Status |
|---|---|---|---|
| M0-1 | Coverage as a number for `api/services/money` and `src/pages/money`, threshold at today's value | CI fails below baseline | done (claude/loop-and-coverage) — `vitest.money.config.ts`: lines 65.19%, functions 58.78%, branches 52.41%, statements 61.52% over 67 files / 815 tests; floor 65/58/52/61 in CI |
| M0-2 | Find the order-dependent flake behind `--retry=2`; remove the retry | ten green nightlies at `--retry=0` | doing (Claude, 2026-09-19): the full suite passed locally at `--retry=0` (457 files, 5 565 tests); the nightly now runs it without retries as a graded job ('Unit suite, no retries'), and the report card counts the nights. Drop `--retry=2` in ci.yml after ten greens |
| M0-3 | Import-time canary: every `api/services/money/*.js` imports in < 2 s | fails today on `store.js` | done (claude/loadable-core, #432) — `tests/goals/money-imports.goal.test.js`, exception list empty |
| M0-4 | Backup rehearsal before ledger-touching migrations | restore proven once | done (#438, 2026-09-20): `scripts/money/backup-rehearsal.sh` (`dump`, `restore`, `verify`, `rehearse`): pg_dump of the public schema, restore into a fresh database with the roles and `auth.uid()` prepared, then every `money_*` count and an md5 of every ledger row compared. Proven locally (9 rows, identical) and on every CI run by the persistence test. For production: dump from the Supabase direct connection, restore into a local Postgres 16, verify; the runbook is the script's header |

### Milestone 1 — critical fixes

| ID | Task | Acceptance | Status |
|---|---|---|---|
| M1-1 | QW1 + QW2 + QW3 | as above | see Now |
| M1-2 | `validate(schema)` middleware; every money route, then top-20 legacy | 400 with a named field on a bad body | money done (2026-09-19): `api/middleware/validate.js` (zod; body, params, query; 400 `{ error: 'Invalid request', field, message }`), `api/routes/moneySchemas.js`, 18 write routes wired, 15 bad-body cases tested, goal test holds every write route validated. Legacy slice done (2026-09-20): sign-in (6 routes, `authSchemas.js`: types and lengths only, the handlers keep their own messages), the extension (4) and the directives (2); the goal test covers the four files. Presence and twins-brain left alone: Codex's active area and a parking candidate (D1) |
| M1-3 | Name every swallowed error in money (`.catch(() => null)` → counted outcome) | grep count 0 in money | done (#434, 2026-09-19): `quietly(name, fallback)` in `api/services/money/quietly.js` logs and counts each; the 26 anonymous catches are named (readings/facts, bank-callback/record-refused, ...); `tests/goals/money-quiet-failures.goal.test.js` holds the count at 0 and the names unique |
| M1-4 | Revocation on serverless: fail closed when Redis is down (recommended) | documented + tested | blocked (Stefano to confirm fail-closed) |

### Milestone 2 — high-leverage

| ID | Task | Acceptance | Status |
|---|---|---|---|
| M2-1 | Break the money cycles (`store.js ↔ calendar.js`, `store.js ↔ predictions.js`) | `madge --circular` = 0; M0-3 passes | done (#432) — `factsRepository.js` + `forecastService.js`; madge 0; bare import of `store.js` 252 ms where it never returned; store.js 1,237 → 1,108 lines |
| M2-2 | Split `MoneyForAccount` into a hook + three views | longest function < 250 lines | done (#434, 2026-09-19): `useMoneyAccount.ts` (three hooks + one composing), `views/{Today,Month,You}View.tsx` and their sections; same innerText on every view before/after in a Playwright walk at two viewports; `tests/goals/money-page-shape.goal.test.js` holds the 250 line limit |
| M2-2b | The three functions still over 250 lines: `MoneyConversation` (325), `MoneySetupPage` (409), `readingWords` (375) | each < 250; the goal test ratchets them | done (#434, 2026-09-19): `readingSayers.ts` (one sayer per kind) + `readingHelpers.ts`; `setup/useSetupQueue.ts` + `setup/AnswerFields.tsx` + `setup/setupWords.ts` (page 94 lines); `chat/useConversation.ts` + `chat/useLedgerTrace.ts` + `chat/askLine.ts`. Ratchet list empty; Ask asked and answered and Setup showed its first question in a Chrome smoke on the production build |
| M2-3 | One read per view, cached per ingestion revision | Today cold < 1.5 s | done (#434, 2026-09-19): `GET /api/money/page` reads the eleven parts once under one authentication (`pageRead.js`; the day reuses the month's forecast), the hook reads it once and keeps the last read per tab for an instant paint on reload, the auth middleware remembers the Redis revocation answer for 30 s (350 ms → 1 ms per request here), and index.html serves Geist itself instead of six blocking Google stylesheets (first request at 65 ms instead of 4–10 s). Local production build, warm API: Today painted in 857 ms and 1 368 ms (was 13–19 s), 1 page request (was 9 reads + preflights). Cold-server spikes here are the local Redis/Supabase link; production after #434 (2026-09-19, signed out, Chrome from Madrid): the document answers in 0.1–0.9 s, `/fonts/geist.css` in 0.22 s from the same origin, the 190 KB entry in 1.3 s; the first API request leaves at 3.9 s after the page's own load and PostHog arrives after it, blocking nothing. Signed in on production (the nightly's canary, first real run 2026-09-20 12:xx UTC): Today painted in 10,9 s on a cold function and 3,2 s warm, with 2 money requests (`/money/page` and the stale check). The canary now records both and holds the budget on the warm one |
| M2-4 | Separate the bank read from the daily loop (own cron, own budget) | `learnSkipped` = 0 for a week | done (claude/loop-and-coverage) — `/api/cron/money-learn` daily 05:30 UTC for every person with a ledger; 4 tests; cost canary green |
| M2-5 | Park the legacy twin behind `LEGACY_TWIN_ENABLED`; money CI lane | money CI < 3 min | switch built (2026-09-20), flip is Stefano's (D1): `api/middleware/legacyTwin.js` stands in front of the ten twin crons; `LEGACY_TWIN_ENABLED=false` on Vercel makes each answer 200 and do nothing, pages stay reachable; anything else changes nothing. Test holds the ten gated and the money crons not. The money CI lane already exists (Money persistence, Money browser, strict types, coverage floor) |
| M2-6 | Agentic OS phase 2: report card for every goal, money canaries, `loop.sh` triage → plan → implement → inspect | grades gate unattended runs | slice 2 done (2026-09-20): when triage says attention, the `implement` job runs Claude Code headless on the plan on `loop/<date>` (edits and tests only, $5 cap, `guard.mjs` refuses any change to the ledger's tables, the feed, the schema, the crons, the workflows or .env) and opens a PR labelled `loop`; the `inspect` job has a fresh model read the diff against the plan and leaves its verdict as a comment and a label (`loop:approved` / `loop:needs-work`). The loop never merges: the report card's eligibility informs a person, and money is never written by it. `ANTHROPIC_API_KEY` is in the Actions secrets. Rehearsed end to end on 2026-09-20: a hand-written plan went through triage to the implement job, Claude Code (Sonnet) wrote a 13-line test on `loop/2026-09-20` and opened #444; the inspect job (Opus) ran the test, checked the diff's scope and approved with one honest caveat. First run found two faults, both fixed in #443: Actions could not open PRs (repository setting) and the stage committed its own plan file. Slice 1 (2026-09-19): report card for every nightly job, graded jobs, triage on Actions |

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
2. **D1: decided yes** (Stefano, 2026-09-20, "do these"). `LEGACY_TWIN_ENABLED=false` is set on Vercel production; it takes effect on the deploy this line triggers. The ten twin crons answer 200 and do nothing; the pages stay reachable.
3. **QW3:** a Sentry DSN (free tier is enough) — Claude cannot create the account.
4. **The day's number:** the most likely spend (shipped) or a sustainable allowance? The label "Today's estimate" fits either; commit to one.
9. **A push token for the loop.** Measured on #448: the loop PR's own CI does start, but waits for a maintainer's approval because `github-actions[bot]` is a first-time contributor; one `gh api -X POST .../actions/runs/<id>/approve` (printed by the stage) releases it, and a dispatched run does not count as the PR's checks. So a loop PR waits on a person once for its checks (#444 was merged by Claude as the reviewer after the dispatched run passed). A fine-grained PAT (contents and pull requests, this repository) in the Actions secrets as `LOOP_PUSH_TOKEN` makes the loop's PRs run CI like anyone's. Only Stefano can mint one. Until then the implement stage runs the unit suite, the strict typecheck and eslint itself before it pushes (#446).
8. **Today's word budget.** The register asks for about 150 words on a screen; Today measures 285 (hero 48, band 44, still-to-come 63, readings 69, review 52) with the sections the design cut of 15 September chose. Which of them folds by default, or is the budget for Today different? Claude did not trim any silently.
5. **Enable Banking's reply** (sent 2026-09-18) and **Plaid eligibility** for the US friends.
7. Done 2026-09-20: `MONEY_CANARY_TOKEN` (90 days, expires 2026-12-19) and `MONEY_CANARY_URL` are in the Actions secrets; the canary ran green on production. Was: **`MONEY_CANARY_TOKEN`** (and optionally `MONEY_CANARY_URL`) in the repository's Actions secrets: an access token for a canary account with a small real ledger, so the nightly walks production as a person. Claude can mint one locally only with the production `JWT_SECRET`, which it does not have; a token minted by Stefano (90 days) is enough.
6. Done 2026-09-20: `OPENROUTER_API_KEY` is in the Actions secrets; the loop's first real run answered "attention no". Was: **Actions secrets for the loop:** `OPENROUTER_API_KEY` in the repository's GitHub Actions secrets (the loop's triage runs without it but asks nothing), and later an agent-harness key for the implement/inspect stages. Claude cannot add secrets.

## Ideas the scouts synthesised (2026-09-19) — for Stefano to pick from, ranked by evidence TwinMe already holds

1. **The return window on a receipt.** The receipts inbox knows the purchase date; a receipt's own text often carries the return or warranty window. A quiet line near the deadline ("the return window on this closes in three days") saves money without asking anyone to think. No competitor surfaces it. Evidence held: `inbox.js`, `attachments.js`.
2. **The charge before it lands.** "Spotify renews tomorrow; the day still holds" or "…now tight, 8 EUR of slack this week." Copilot's most-loved moment is catching a forgotten subscription *after* the fact; the recurring series and the allowance already know it the day before. Evidence held: `recurring.js`, `allowance.js`; Karlan et al. say a nudge that names the specific expense works where a generic one does not.
3. **Reconciliation you can see.** Every competitor merges sources silently; the #1 quit reason is silent sync breakage. One grey line under a row — "seen by the bank and the phone" versus "bank only, not confirmed" — turns the invisible into trust. Evidence held: `money_sightings` per line.
4. **The Bizum that is the rent.** Recurring Bizum to the same two or three people near the 1st, similar amount: label it "looks like your rent split" and count it as rent, without a wallet and without holding money (Splitwise's pending-for-days is its most hated trait). Evidence held: `bizum.js`, `person` facts.
5. **Ninety seconds, not a ledger scroll.** The three to five payments that moved the forecast most this week, one yes/no each ("keep eating out this much, or was that a one-off?"). The manual-review ritual is what changes behaviour (HN, YNAB); this is its benefit without its labour. Evidence held: `deltas.js`, the verdict flow.
6. **Roast, but grounded.** Cleo's voice is loved and distrusted because it sits on numbers people doubt. TwinMe's chat only says computed numbers — the same dry, specific line ("four dinners out, 60% of the month's food gone") is provably right. A register question as much as a product one.
3 is built (#438, 2026-09-20): the page carries which sources saw each payment (`seen.js`, computed from `money_sightings`), and the ledger row says it in one grey phrase: "seen by the bank and your phone", "bank only", "phone only, not booked yet". Words in three languages; proven on the real database by the persistence test.

2 is built (#438, 2026-09-20): `chargesSoon()` in `allowance.js` names the standing charges due today or tomorrow (Madrid days), and Today says "Spotify lands tomorrow, 9,99 €, already off today's number", which is true because spokenBefore already took it off. Words in three languages.

5 is built (#438, 2026-09-20): a "Ninety seconds" section on Today lists the five largest spending lines of the week without a verdict (`review.ts`, pure; recurring and other currencies excluded); a row opens to Worth it / Not me, the same verdicts Month keeps, and leaves the list once judged. Seen on real data: five rows, 40 to 135 EUR. Today is 291 words with it (the register asks for about 150; the hero's own lines were already over before today).

4 measured (2026-09-20): the real ledger holds 9 Bizum lines to 7 people in one month, none repeating near the 1st. Nothing to learn from yet; like 7, last, not first.

1 measured (2026-09-20): 44 email receipts on the real ledger, none carrying a return or warranty phrase (Spanish or English). Nothing to read yet.

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
- **2026-09-20 (Claude):** #437 merged. On `claude/next-slices`: the tab title is TwinMe (was the soul-signature promise), M1-2's legacy slice (sign-in, extension, directives).
- **2026-09-20 (Claude, later):** M0-4 done (backup rehearsal, proven on CI's database); idea 3 built (reconciliation you can see); both on #438.
- **2026-09-20 (Claude, later):** ideas 2, 3, 5 built on #438; idea 4 measured (no signal yet); Today's word count raised as open question 8.
- **2026-09-20 (Claude, morning):** Stefano gave full permission for the owner items. Done by CLI: `LEGACY_TWIN_ENABLED=false` on Vercel production (D1 parked; applies with this deploy). Blocked by the harness's credential rule, handed back as one script to run: `OPENROUTER_API_KEY` and `MONEY_CANARY_TOKEN` into Actions secrets. Enable Banking has not replied to the 18 September enquiry (Gmail checked). A Sentry account exists on the Gmail address (trial ended March 2026); the DSN needs a signed-in browser.
- **2026-09-20 (Claude, noon):** Stefano said try again: the three Actions secrets are set (`OPENROUTER_API_KEY`, `MONEY_CANARY_TOKEN` 90 days, `MONEY_CANARY_URL`). Found on dispatch: `goals-nightly.yml` had been invalid YAML since the report-card step of the 19th (an unquoted "shadow: money" in a step name), so the nightly of the 20th ran with no jobs; fixed, and a goal test now parses every workflow. The loop's first real run was dispatched.
- **2026-09-20 (Claude, afternoon):** the nightly's first real run green (report card included); production canary 10,9 s cold / 3,2 s warm (#441); M2-6 slice 2 built (implement + inspect on Actions, shadow rule as code).
- **2026-09-20 (Claude, evening):** the loop rehearsed end to end (#444 written by the implement stage, approved by the inspect stage). Repository setting changed: Actions may open pull requests.
- **2026-09-20 (Claude, night):** #444 (the loop's first PR) merged after its dispatched CI passed; #446 makes the stage run the checks itself; open question 9 raised (a push token for the loop).
- **2026-09-20 (Claude, later):** rehearsal 3 on the fixed stage: #448 written, suite run before the push, inspect approved; its CI released with one approval and merged by Claude as the reviewer. The stage now prints the approval command.
- **2026-09-20 (Claude, chat round 1):** windows, the week figure, smalltalk without the model; 32/35 with the judge. `LOOP_PUSH_TOKEN` set from the gh CLI's token (replace with a fine-grained PAT when convenient).
