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
| `wa-thread-affinity.goal.test.js` | Wrong-thread fix (2026-07-13 smoke incident) | Outbound never switches to a different sender number on fallback; every selectable provider webhook feeds whatsappInboundPipeline |
| `vercel-cost-rules.goal.test.js` | Vercel cost rules ($375 incident, March 2026) | No cron more frequent than */15; maxDuration <= 60; crons stay under /api/cron/ |
| `no-emoji-twin-output.goal.test.js` | NO EMOJIS rule (QW2 + audit H7) | stripEmoji backstop keeps removing pictographic/ZWJ emoji, leaves accents alone |

The nightly run also includes `tests/api/routes/whatsappZapiWebhookAuth.test.js`
(webhook auth gate) by reference — reuse, don't duplicate.

## Adding a goal

1. Ship a feature.
2. Ask: "what would the user FEEL break?" Write ONE test file pinning exactly
   that, named `<feature>.goal.test.js`. Keep imports light (pure functions,
   config files); stub Supabase env at the top if a service module needs it
   at import time.
3. Add a row to the table above.

## Report card (Phase 2 pointer)

The workflow-run history of goals-nightly IS the report card for now: each
run is a pass/fail with a sha. Phase 2 aggregates trailing-20 grades per task
type and gates unattended execution on >= 95% (demote below 90%). Do not
build a parallel log until that phase lands.
