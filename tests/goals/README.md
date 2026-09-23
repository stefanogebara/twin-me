# goals/ — feature canaries (agentic OS, Phase 1)

One tiny test per shipped feature pinning the invariant a USER would feel
break — not implementation detail. The whole suite must stay fast (seconds):
these run on every PR (normal vitest include) AND nightly against `main`
via `.github/workflows/goals-nightly.yml`, which on the first red posts a
GitHub issue with "what changed since last green" attribution.

Plan and rationale: `.claude/plans/2026-07-12-agentic-os/README.md`.

## Current goals

| Goal file | Shipped feature | Invariant pinned |
|---|---|---|
| `habit-loop-protocol.goal.test.js` | Daily WhatsApp habit loop (PR #178 + thread approvals) | Offer lands LAST in the composed brief; "yes"/"skip"/"sim"/"nao" still resolve; flag stays default-OFF |
| `vercel-cost-rules.goal.test.js` | Vercel cost rules ($375 incident, March 2026) | No cron more frequent than */15; maxDuration <= 60; crons stay under /api/cron/ |
| `no-emoji-twin-output.goal.test.js` | NO EMOJIS rule (QW2 + audit H7) | stripEmoji backstop keeps removing pictographic/ZWJ emoji, leaves accents alone |
| `money-first.goal.test.js` | Money is the product (Stefano, 2026-09-19) | `/`, `/home`, `/dashboard`, sign-in and the onboarding gate all land on `/money`; the twin is one link away, never the door |
| `agents-in-sync.goal.test.js` | One instruction file for two agents (2026-09-19) | `AGENTS.md` is byte-identical to `CLAUDE.md` |
| `money-imports.goal.test.js` | The money core loads a module at a time (audit A1, 2026-09-19) | every `api/_app/services/money/*.js` imports within two seconds; the modules still in a cycle are named and shrink with M2-1 |
| `money-page-shape.goal.test.js` | No function on the money pages is longer than 250 lines (M2-2, 2026-09-19) | every top-level function under `src/pages/money` measured; the three that were already long may only shrink |
| `money-one-request.goal.test.js` | Today is one request and waits on no third party (M2-3, 2026-09-19) | `useMoneyAccount` reads `moneyAPI.page()` and never the parts one by one; `index.html` loads no stylesheet or font from another origin |
| `money-one-read.goal.test.js` | One page, one read of the ledger and one of the facts (M2-A, 2026-09-22) | `readPage` against a counting database walks `money_ledger_page` once and reads `money_facts` once |
| `front-reach.goal.test.js` | Every file under `src/` is reached from `src/main.tsx` (M2-B front, 2026-09-22) | `scripts/ci/front-reach.mjs` lists nothing unreachable |
| `legacy-twin-unmounted.goal.test.js` | Every API mount is reachable from the product or parked (D20, 2026-09-22) | the reach set from `staying-roots.txt` and `LEGACY_TWIN_ROUTES` are complete against each other; the gate sits ahead of every mount |
| `script-csp.goal.test.js` | No script runs unless the CSP names its file (M1-C, 2026-09-22) | no inline script or handler in `index.html` or under `public/`; `script-src` is `'self'` and PostHog; `worker-src 'self' blob:` |
| `quiet-failures.goal.test.js` | No error in code the product reaches is swallowed without a name (M1-3, 2026-09-19; the whole reach set since M1-D, 2026-09-22) | no anonymous `.catch(() => [])` in the money services or routes; every `quietly('name')` is unique |
| `env-example-in-sync.goal.test.js` | `.env.example` is what the code reads (M3-4, 2026-09-19) | the committed file equals `scripts/env-example.mjs`'s output; the server's required keys are first and uncommented |
| `money-routes-validated.goal.test.js` | Every money write route runs `validate()` before its handler (M1-2, 2026-09-19) | a post, delete or patch on `api/_app/routes/money.js` without `validate({` fails, except the raw and multipart two |
| (persistence test) `persistence.integration.test.js` › the backup rehearsal | The ledger restores from its own dump, row for row (M0-4, 2026-09-20) | `scripts/money/backup-rehearsal.sh rehearse` against the CI database: dump, restore into a fresh database, every `money_*` count and an md5 of every ledger row identical |
| `workflows-parse.goal.test.js` | Every workflow parses as YAML with jobs (2026-09-20) | the nightly was invalid for two days over an unquoted colon in a step name, and ran with no jobs |

The nightly run also includes `tests/api/routes/whatsappZapiWebhookAuth.test.js`
(webhook auth gate) by reference — reuse, don't duplicate.

## Adding a goal

1. Ship a feature.
2. Ask: "what would the user FEEL break?" Write ONE test file pinning exactly
   that, named `<feature>.goal.test.js`. Keep imports light (pure functions,
   config files); stub Supabase env at the top if a service module needs it
   at import time.
3. Add a row to the table above.

## Report card (Phase 2, slice 1 — 2026-09-19)

Every job in goals-nightly.yml is a task type. `scripts/ci/reportCard.mjs` grades each
by its last twenty completed nights (rules pinned in `tests/unit/reportCard.test.js`):
twenty nights at 95% or better make a task type eligible for unattended runs, under 90%
takes it away. The `report-card` job runs after every other job, writes
`test-results/report-card.json` as an artifact and the grades into the step summary.
Money is never automated on a streak: `autonomous_writes` is false and is not a parameter.

The loop (`.github/workflows/agentic-loop.yml`, `scripts/agentic/loop.mjs`) runs after the
nightly: a cheap model reads what changed and the report card and says whether anything
needs attention; a stronger model writes the plan; it is opened as an issue labelled `loop`.
Since 2026-09-20 (slice 2) the implement job runs Claude Code headless on the plan on a
`loop/<date>` branch with edits and tests only (`scripts/agentic/implement.mjs`, tools in
`guard.mjs`, a dollar cap), refuses any change to the ledger's tables, the feed, the schema,
the crons, the workflows or .env, and opens a PR labelled `loop`; the inspect job
(`scripts/agentic/inspect.mjs`) has a fresh model read the diff against the plan and leaves
its verdict as a comment and a label. The PR's own CI starts but waits for a maintainer's
approval (the bot counts as a first-time contributor); the stage prints the one `gh api`
command that approves it, and runs the unit suite, the strict money typecheck and eslint
itself before it pushes, refusing on failure. The loop never merges; a person does, or not.
