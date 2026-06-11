# Replan — 2026-06-10 ("So what?" strategy review)

**Method:** live walkthroughs (talk-to-twin, connections+Manage, money — desktop,
authed) + DB data-flow verification + 5 parallel read-only analysts (learning
loop, content language, chat IA, platform portfolio, money page). Full analyst
JSON: `strategy-analysis-full.json`.

## The diagnosis in three sentences

1. **The product generates but does not learn** — every relevance signal is
   write-only, display-only, or broken at the single point it was supposed to
   change behavior (a one-line column bug, silently swallowed for months).
2. **There is no editorial layer** — everything every pipeline produces gets
   shown somewhere, often in 2-4 places at once (chat wears the dashboard as a
   coat; raw inbox noise renders as "intelligence"; lifetime stats repeat daily).
3. **The integration portfolio is ~2x its justified size** — 7 sources produce
   essentially all signal (extension + desktop mirroring + Spotify, Gmail,
   Calendar, Whoop, GitHub + Pluggy); ~15 platform stacks are dead weight and
   the #1 source of audit bugs.

## Data-flow ground truth (verified today)

| Source | Status | Evidence |
|---|---|---|
| Browser extension (web) | WORKING, high yield | 851 raw rows; 247 memories; freshest 6 min |
| Desktop app mirroring | WORKING | 299 memories tagged desktop; freshest 6 min |
| Mobile location | EFFECTIVELY DEAD | 3 memories, 32 days stale |
| Learning signals | COLLECTED, NOT CONSUMED | 201 insights, 6 "engaged" (and even those are corrupted — see below) |

BUT: the connections page shows the extension as "Connect" (unconnected) — your
single best source is invisible because it has no platform_connections row.

## Track A — Close the learning loop (highest leverage per hour)

1. **[15 MIN, P0]** `platform-insights.js:986` engage-seed selects `content,
   category` but the column is `insight` → errors on EVERY call → swallowed by
   empty catch → `twin_patterns` empty forever. Fix select + add failing test.
2. **[P0]** HeroInsight fires POST /engage in useEffect ON MOUNT — "engaged"
   currently means "was rendered". Move to the action click; add a `seen`
   distinction; stop writing thumbs-down as `engaged=false` (indistinguishable
   from never-seen).
3. **[P1]** Generation reads zero engagement signals by construction. Minimal
   close: feed per-category engaged/ignored stats (the /stats endpoint already
   computes them) into generateProactiveInsights as suppression weights; drop
   the hardcoded "first insight MUST be a nudge" (19% follow rate, 0 engagement).
4. **[30 MIN, P1]** Goal dismissals: add abandoned/dismissed (90d) to the
   exclusion list in generateGoalSuggestions — today the twin can re-suggest an
   explicitly rejected goal.
5. **[DELETE]** The DPO fine-tuning stack: 207 of 208 preference pairs are
   synthetic; ~920 of 1000 agent_actions were bulk-backfilled in one second
   (resolved_at < created_at); the trainer is gated on infra that doesn't
   exist. Keep the thumbs endpoint, delete the pipeline. Also delete the
   in-silico "engagement ranking" (static cosine prior wearing an engagement
   costume; ICA axes hardcoded to []).
6. **[KEEP]** evaluateNudgeOutcomes + PAST NUDGES chat context; memory recency
   loop + saliency replay; three-layer insight dedup.

## Track B — Editorial layer: language + density ("so what?" gate)

**Chat (talk-to-twin) — confirmed live: ~14 info clusters before the first
message.** The date renders twice, platform count up to 4 places, RECENT EMAILS
is unfiltered IMAP (two identical GitHub advisories + a HubSpot LOGIN CODE),
"0 Messages" counters. Your own code comments already point the way
("MorningBriefingCard removed — chat empty state should be clean").
- DELETE: the entire "Today" ChatContextSidebar (duplicates DashboardV2
  item-for-item), "Connect Your Tools" row + 8 icons, platform-count sentence,
  stats blocks.
- Target empty state: greeting + composer + 3 signal-driven chips +
  (reconnect chip only when true) + proposals badge folded behind one
  affordance. Mid-conversation: messages + composer, period.

**Language (real samples judged):** slow-cadence prose (twin summary, weekly
synthesis) is genuinely good — KEEP. Daily content is an echo chamber:
40k-unread stat appeared 6+ times in 3 days across 4 surfaces.
- Insight prompt: drop "MUST cite 3 exact numbers" → "a number only when it
  changes what the user should do; prefer deltas over lifetime totals".
- Gmail fetcher: emit the DELTA ("inbox grew by 47") not the lifetime total.
- Briefing: whitelist categories (nudge/celebration/trend/concern), never
  re-deliver yesterday's rows verbatim.
- Dedup: strip digits before comparison (incrementing numbers defeat it);
  per-theme cooldown (email-backlog max 1/week).
- DELETE: meeting prep for attendee-less personal events (tennis/therapy) and
  for agent-created blocks; email triage drafts replying to other AI
  assistants' notification emails.
- Reflections: skip insert when embedding-similarity >0.9 vs existing (CULTURE
  and SOCIAL experts shipping the same sentence — June audit).

## Track C — Portfolio: focus on the mirrors (the strategic cut)

**Barbell reality:** extension + desktop see everything; 5 OAuth platforms add
irreplaceable signal the mirrors can't see (Whoop biometrics, Spotify
full-history + mobile listening, Gmail/Calendar write-grade metadata, GitHub
private activity). Everything else is noise-to-maintenance.

- **KEEP + feature:** extension, desktop mirroring, Spotify, Gmail, Google
  Calendar, Whoop, GitHub, Pluggy (BR money rail). YouTube stays as passenger
  (Google OAuth share) but unfeatured.
- **MAKE THE MIRRORS FIRST-CLASS:** connections page must show
  extension/desktop as CONNECTED with freshness + yield ("251 pages observed
  this week") — currently shown as "Connect". This is the moat; treat it like one.
- **DELETE:** Reddit, LinkedIn, Twitch OAuth (4-month combined yield: ~22
  memories; extension already sees the browsing); all never-connected stacks
  (Strava, Oura, Fitbit, Garmin, Notion, Pinterest, SoundCloud, Slack, Steam,
  TikTok, Apple Music, Google Drive — ~4,400 lines); TrueLayer (unconfigured).
  Keep GDPR-upload paths (LinkedIn/Discord exports) as the replacement story.
- **DEMOTE:** Discord OAuth, Outlook (keep working, stop featuring).
- **DECIDE:** mobile location — fix the pipeline or remove the surface; 3
  memories in 32 days is the worst of both.
- **BUILD:** per-platform "memories in last 14 days" yield metric; only
  platforms above threshold get featured tiles.

**Analyst conflict, resolved:** platforms-analyst said consolidate money on
Plaid; money-analyst said Pluggy is the only configured live rail and the BR
market is first. Money-analyst is right — Plaid is where the sandbox pollution
comes from. Pluggy stays, Plaid parks behind a flag, TrueLayer deletes.

## Track D — Money page: demo → honest MVP

Verified live today: 644/651 transactions are Plaid SANDBOX (ins_109508 "First
Platypus Bank") rendering +1,234,467% P&L; 88% of transactions have zero
emotional signals; every wow surface (patterns/forecast/nudges/savings) has
fired zero times for the real user; "30 DAYS" chart shows 60 days.
- P0: purge sandbox rows + refuse to render sandbox-era connections.
- Keep: CSV/OFX upload, Pluggy connect, transaction list, summary, spending
  timeline; the tagging pipeline (it's a data-collection problem, not code).
- Collapse the 4 permanently-empty promise sections into ONE progress card
  ("connect bank + wear Whoop N days → unlock stress-spend").
- Park Plaid brokerage cards + cron behind a default-off flag; delete TrueLayer.

## Execution order (proposed)

1. **P0 quick wins (same day):** engage-seed bug, HeroInsight auto-engage,
   sandbox purge + render guard, extension/desktop shown as connected.
2. **P1 chat declutter** (mostly deletion) + language fixes (prompt, gmail
   delta, briefing whitelist, dedup digits) + goal-dismiss exclusion.
3. **P2 portfolio deletions** (own PR per cluster: dead stacks; Reddit/
   LinkedIn/Twitch; TrueLayer; DPO stack) + money MVP consolidation + yield
   metric.

Deletions are product-visible — each P2 cluster ships as its own reviewed PR.

## Post-ship product decisions (2026-06-11, delegated)

All four cycles + honest-count fix (#111) + /briefing route (#112) merged.
The three open calls flagged by the workflow agents, decided:

1. **Settings "personal model coming soon" placeholder: NO.** Promising a
   feature whose training pipeline was just deleted fails the same "so what?"
   bar this replan enforces everywhere else. Fidelity score stays; the row
   earns its way back when a real personal-model story ships.
2. **`money_plaid` flag: operator-only.** It is a US-market launch gate, not
   a user preference. No Settings exposure.
3. **YouTube: unfeatured regardless of yield.** Its ~69 memories/14d clear
   the threshold on watch-history volume, but volume is not signal and the
   extension already mirrors youtube.com browsing. Encoded as
   `ALWAYS_DEMOTED` in `platformYield.js` (with discord + outlook, the Track
   C demote set) — the demote list beats the yield rule, so policy and
   product can no longer silently disagree.

Known limitation parked for the next desktop build: the 7-9am toast window
uses the machine clock while the greeting uses the stored user timezone — a
traveling-user mismatch. Not fixed here because the Rust path cannot be
compiled or runtime-verified in this environment.
