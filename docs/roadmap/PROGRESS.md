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
| QW1 | `bankState.js`: refuse to sign or read without `JWT_SECRET`; `timingSafeEqual` | doing (Claude, 2026-09-19) |
| QW2 | Revoke `anon` on `money_*` tables (migration + catalog test) | todo |
| QW3 | `SENTRY_DSN` on Vercel + alert on `cron_executions` failures | todo — needs the DSN from Stefano |
| QW4 | Rewrite `CLAUDE.md` architecture to what exists; `AGENTS.md` = `CLAUDE.md`; CI check | todo |
| QW5 | Delete `test/`, `ml/`, `context/`, `screenshots/`; untrack `mobile/node_modules` | todo |
| QW6 | Delete or fix the 79 skipped tests | todo |
| OW1 | **Money first**: `/`, `/home`, `/dashboard`, post-sign-in and post-OAuth all land on `/money`; the twin is a secondary link | todo |
| OW2 | **Orbs exactly as the library**: monochrome ink per the library's own theme rule; chat avatar orb at 64 while thinking; every loading state on the money surface is an orb | todo |
| OW3 | **Codex protocol** live: this file, `sync:agents`, branch prefixes, the Decisions rule | doing (Claude, 2026-09-19) |
| OW4 | **Scouting**: three background scouts (products, papers, social) reporting candidates into `docs/intel/` through the `/intel` rubric | doing (Claude, 2026-09-19) |

## Milestones (from the 19 September audit — `.claude/plans/2026-09-19-repo-audit/README.md`, published at https://claude.ai/code/artifact/ae6cd0ba-b090-4660-85ff-cfadb9323679)

### Milestone 0 — safety net

| ID | Task | Acceptance | Status |
|---|---|---|---|
| M0-1 | Coverage as a number for `api/services/money` and `src/pages/money`, threshold at today's value | CI fails below baseline | todo |
| M0-2 | Find the order-dependent flake behind `--retry=2`; remove the retry | ten green nightlies at `--retry=0` | todo |
| M0-3 | Import-time canary: every `api/services/money/*.js` imports in < 2 s | fails today on `store.js` | todo |
| M0-4 | Backup rehearsal before ledger-touching migrations | restore proven once | todo |

### Milestone 1 — critical fixes

| ID | Task | Acceptance | Status |
|---|---|---|---|
| M1-1 | QW1 + QW2 + QW3 | as above | see Now |
| M1-2 | `validate(schema)` middleware; every money route, then top-20 legacy | 400 with a named field on a bad body | todo |
| M1-3 | Name every swallowed error in money (`.catch(() => null)` → counted outcome) | grep count 0 in money | todo |
| M1-4 | Revocation on serverless: fail closed when Redis is down (recommended) | documented + tested | blocked (Stefano to confirm fail-closed) |

### Milestone 2 — high-leverage

| ID | Task | Acceptance | Status |
|---|---|---|---|
| M2-1 | Break the money cycles (`store.js ↔ calendar.js`, `store.js ↔ predictions.js`) | `madge --circular` = 0; M0-3 passes | todo |
| M2-2 | Split `MoneyForAccount` into a hook + three views | longest function < 250 lines | todo |
| M2-3 | One read per view, cached per ingestion revision | Today cold < 1.5 s | todo |
| M2-4 | Separate the bank read from the daily loop (own cron, own budget) | `learnSkipped` = 0 for a week | todo |
| M2-5 | Park the legacy twin behind `LEGACY_TWIN_ENABLED`; money CI lane | money CI < 3 min | todo — see Decisions D3 |
| M2-6 | Agentic OS phase 2: report card for every goal, money canaries, `loop.sh` triage → plan → implement → inspect | grades gate unattended runs | todo — see Decisions D4 |

### Milestone 3 — quality

| ID | Task | Status |
|---|---|---|
| M3-1 | `strict: true` for `src/pages/money/**` | todo |
| M3-2 | Lazy-load every non-money route; drop `vendor-elevenlabs` from the money bundle | todo |
| M3-3 | One Redis client | todo |
| M3-4 | Regenerate `.env.example` from code | todo |
| M3-5 | Resolve `--legacy-peer-deps` | todo |
| M3-6 | Real-backend Playwright canary for the money journey | todo |

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

## Open questions for Stefano

1. **M1-4:** fail closed on logout when Redis is down (some users get a 401 during an outage) — yes or no? Recommended yes.
2. **D1:** park the legacy twin and stop its crons for inactive users — yes or no?
3. **QW3:** a Sentry DSN (free tier is enough) — Claude cannot create the account.
4. **The day's number:** the most likely spend (shipped) or a sustainable allowance? The label "Today's estimate" fits either; commit to one.
5. **Enable Banking's reply** (sent 2026-09-18) and **Plaid eligibility** for the US friends.

## Session log

- **2026-09-19 (Claude):** merged #424–#426 prerequisites; wrote the audit; created this file; started QW1, OW3, OW4. Legacy usage measured (D1). Orb deviation found (D2). AGENTS.md drift found (D5).
