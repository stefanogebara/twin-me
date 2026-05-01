# TwinMe — Lessons

Corrections and patterns preserved after outages or mistakes. Format: one section per lesson, with incident reference for future auditing.

Per CLAUDE.md workflow rule #3 ("Self-Improvement Loop"): update this file after any user correction.

---

## 2026-04-30 — `proactive_insights` has a 20h cooldown trigger that drops inserts silently

**Incident**: Built `POST /api/insights/inbox/refresh` for the dashboard inbox card. Endpoint completed without error but the row never persisted. `.select().single()` returned PGRST116 ("Cannot coerce the result to a single JSON object"). Stale memory tried `service_role bypasses RLS` — yes, but RLS isn't the gate here.

**Root cause**: Migration `20260323_insight_cooldown_trigger.sql` installs a `BEFORE INSERT` trigger (`trg_insight_cooldown` → `enforce_insight_cooldown()`). For categories `music_mood_match` (6h) / `briefing` / `evening_recap` / `email_triage` (20h), it counts existing rows in the window and `RETURN NULL`s the insert if any exist. PostgreSQL drops the row, no error raised, RAISE NOTICE only — invisible to a Node Supabase client.

**Rule for any user-facing "regenerate" / "refresh" action that writes to `proactive_insights`**:
- Don't `.insert()` blindly. First read the latest row in the cooldown window (20h for email_triage). If one exists, `UPDATE` it instead — preserves user-applied state (dismissed/sent flags) and bypasses the trigger.
- If the trigger fundamentally blocks your use case, change the trigger (allowlist `metadata->>on_demand = 'true'` to skip), do not bypass it ad-hoc per call site — the trigger exists to prevent automated spam.

**How to apply**: any new endpoint that lets a human re-trigger an insight category MUST follow the upsert pattern. Cron paths keep using `.insert()` so the trigger keeps doing its job for automated traffic.

---

## 2026-04-30 — `mistralai/mistral-small-creative` is dead on OpenRouter

**Incident**: First `/api/insights/inbox/refresh` call failed with `404 No endpoints found for mistralai/mistral-small-creative`. The model ID in `api/config/aiModels.js` for `TIER_EXTRACTION` is no longer routable.

**Why it slipped**: `aiModels.js` had a TODO comment "replaces deprecated gemini-2.0-flash" — the replacement also got deprecated and nobody noticed because the Inngest path was silently failing in prod (signing key missing) and the cron path was hitting `wasRecentlyRun` cooldowns most days. Net effect: every extraction-tier call had been silently failing-over via fallback paths for an unknown duration.

**Fix (shipped)**: swapped `TIER_EXTRACTION` to `deepseek/deepseek-v3.2` (same model used by `TIER_CHAT` and `TIER_ANALYSIS` — proven to work, slight cost bump from $0.10/$0.30 → $0.25/$0.38 per M).

**Rule**: when an OpenRouter model 404s, fix `OPENROUTER_MODELS` in `api/config/aiModels.js` immediately — don't paper over it. Pick a known-working ID (deepseek-v3.2 is the safe default in this codebase) rather than guessing at Mistral version strings that turn over fast.

---

## 2026-04-21 — Never modify `.vercelignore` without per-entry preview-deploy verification

**Incident**: Two prod outages in a single session from `.vercelignore` changes.
- `3d425f00` added 11 dir excludes in one shot → prod `/api/*` returned 500 with `ERR_MODULE_NOT_FOUND`.
- `6ccffc1b` tried a "safer subset" (9 of the 11) → same outage, same error.

**Why static analysis fails**: Vercel's `nft` (node-file-trace) follows both static imports AND transitive references (dynamic imports, `require.resolve`, package exports maps). `grep "from '../scripts/'"` finds nothing — yet some transitive chain into `node_modules` references a path at build-trace time. Culprit still unidentified.

**Rule**:
- Do NOT add entries to `.vercelignore` from the current baseline
- If build time becomes painful, extract standalone Vercel Functions (like `api/webhook-pluggy.js` from `3d425f00`) instead
- If testing a new exclude: push as its own branch (`bisect/vercelignore-X`), wait for preview deploy, verify `/api/health` = 200 before merging. ONE dir per commit.

`.vercelignore` has a multi-line header warning the next person who touches it.

---

## 2026-04-21 — Every `api/routes/cron-*.js` MUST call `verifyCronSecret(req)`

**Incident**: `cron-bank-consent.js` shipped with `router.get('/', async (_req, res) => { ... })` and no auth gate. `curl` with no Authorization returned 200. Any visitor could trigger Supabase queries + push-notification fanout. `cron-nudge-retrospective.js` had the same gap.

**Rule**:
- Every file matching `api/routes/cron-*.js` must import `verifyCronSecret` from `../middleware/verifyCronSecret.js`, call `verifyCronSecret(req)` at the top of the handler, and return early on `!authResult.authorized`
- Enforced by `tests/unit/cronSecurityGate.test.js` — 73 assertions across 24 cron files. Breaks CI if a new cron ships without the gate.

**Pattern**:
```js
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
router.all('/', async (req, res) => {
  const authResult = verifyCronSecret(req);
  if (!authResult.authorized) {
    return res.status(authResult.status).json({ error: authResult.error });
  }
  // cron body
});
```

Use `router.all` (not `.get` or `.post`) — Vercel's cron runner may use either verb.

---

## 2026-04-21 — Vercel preview deploys are the ONLY way to validate bundle-trace changes

**Context**: Local `node api/server.js` boots fine regardless of `.vercelignore` config. That made the outages confusing: "works on my machine" said nothing about whether nft would resolve.

**Rule**: For any `.vercelignore`, `vercel.json`, `package.json` (esp. `exports`), or dynamic-import change: push as a branch, wait for preview deploy, probe `/api/health` on the preview URL. Do NOT merge-then-verify. Bundle trace failures only surface on Vercel's build infra.

---

## 2026-04-21 — Branch protection on main (config reference)

Enabled via `gh api PUT .../branches/main/protection`:
- `required_status_checks: { contexts: ['Vercel'] }`
- `enforce_admins: false`
- `allow_force_pushes: false`
- `allow_deletions: false`

Direct push still works for admins but logs warning about Vercel check. Prefer PR flow (`gh pr create` → preview green → `gh pr merge --squash`) for non-trivial. Direct push OK for hotfixes.

---

## 2026-04-21 — PostHog funnel instrumentation pattern

For any multi-step user flow:
- Fire one event per lifecycle: `*_started`, `*_step_N_shown`, `*_step_N_answered`, `*_completed`, `*_skipped`
- Use `startedAtRef` + `stepShownAtRef` refs for duration + think-time
- Use `*_firedRef` flags for one-shot events (prevents double-fire across React re-renders)
- Trust silent no-op when `VITE_POSTHOG_KEY` unset or demo mode
- Consistent event prefix so PostHog funnel builder groups automatically

Expected measurement outcomes for the 12→3 onboarding (7-day window): completion rate vs baseline, drop-off cluster by step, voice vs text split, median think-time per step.
