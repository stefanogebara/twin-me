# TwinMe Money

A spending ledger for students in Spain. A PSD2 bank feed, phone payment notifications, an
email receipts inbox and statement uploads are reconciled into one ledger; the day and the
month are forecast with a band that scores itself nightly; a chat phrases only numbers the
code computed. A signed-in person lands on `/money`.

The "digital twin" this repository was named for is retired: its routes answer 410 and its
pages one quiet line while `LEGACY_TWIN_ENABLED=false` (tracker, D1 and D20), and the files
behind them are deleted thirty days on.

## Run it

```bash
npm install
npm run dev          # the app, http://localhost:8086
npm run server:dev   # the API, http://localhost:3004
npm run dev:full     # both
```

Copy `.env.example` to `.env` and fill the four the server refuses to start without
(`JWT_SECRET`, `ENCRYPTION_KEY`, `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`); the
rest are optional and documented in place. `.env.example` is generated from the code
(`node scripts/env-example.mjs`) and a test keeps it in step.

## Read first

- `docs/roadmap/PROGRESS.md` — the program tracker: directives, milestones, decisions
  with their measurements, open questions. Read it first every session; two agents share it.
- `CLAUDE.md` — how the product is built, the rules that hold in `api/services/money/`, the
  design register. `AGENTS.md` is a generated copy (`npm run sync:agents`).
- `docs/intel/INTEL.md` — market and technical context, triaged.

## Where the money lives

```
bank feed / phone / email inbox / statement
  -> money_sightings (what one channel saw)
  -> ledger.js reconcile -> money_transactions
  -> recurring.js / projection.js / calibration.js / allowance.js
  -> routes/money.js -> pageRead.js (one read) -> src/pages/money/*
```

Rules that hold everywhere in money: computed, not generated; one spending rule; evidence
separate from conclusions; silence over guessing; the product scores itself. They are
pinned by the goal tests under `tests/goals/`.

## Tests

```bash
npx vitest run                          # everything (the Postgres file needs a local database)
npx vitest run --config vitest.money.config.ts --coverage   # money, with its floors
npx playwright test --config playwright.money.config.ts     # the money pages in a browser
```

The nightly (`.github/workflows/goals-nightly.yml`) walks production as a signed-in person
and grades every job into a report card.
