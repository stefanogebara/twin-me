# TwinMe — Lessons

Corrections and patterns preserved after outages or mistakes. Format: one section per lesson, with incident reference for future auditing.

Per CLAUDE.md workflow rule #3 ("Self-Improvement Loop"): update this file after any user correction.

---

## 2026-05-11 — Untracked-but-imported files cause silent 17h prod outages

**Incident**: Every `/api/*` endpoint returned `FUNCTION_INVOCATION_FAILED` for 17 hours. Root cause: `api/services/beta-feedback.js` existed on disk locally and was imported by `api/server.js`, but was never `git add`-ed. The Vercel webhook accepted the push, Vite build passed (Vite only validates the frontend module graph), and lambda boot crashed with `ERR_MODULE_NOT_FOUND` on cold start. No dashboard signal — the import path is only checked at lambda boot, which happens AFTER deploy success is reported.

**Why it slipped**: The file appeared via a linter side-effect that created it without staging. Local dev kept working because the file was on disk. CI didn't catch it because there's no boot-time sanity test on the api lambda.

**Rule**:
- Before any push that touches `api/server.js` route registration or service imports: cross-reference `git ls-tree -r HEAD --name-only` against the list of relative imports under `api/`. Any `from './x.js'` whose resolved target is NOT in `ls-tree` output → unstaged dependency, do not push.
- Implementation note: the scanner belongs in `scripts/` (path: `scripts/check-untracked-imports.cjs`) and should walk every tracked `.js` under `api/`, regex-match relative imports, and assert the target appears in tracked files. Exit 1 with a fix-list on miss. Wire as a git pre-push hook so it fires automatically.
- "Vite build green" never implies "lambda boots green". Treat the two as independent gates.

---

## 2026-05-11 — `vercel.json` regex syntax silently rejects webhook deploys

**Incident**: A push that included a font-caching rewrite like `/(.*\.(woff2?|ttf|otf|eot))` (path-to-regexp pattern with `?` quantifier and nested capture groups) made the Vercel webhook drop the deploy silently. The dashboard showed no failed build, no error event, no notification — the webhook just 4xx'd server-side and never created a deployment. Three subsequent fix-commits stacked up before we noticed pushes weren't producing deploys.

**Why it slipped**: path-to-regexp 6 (which Vercel uses) does not support the `?` quantifier or nested capture groups. The Vercel build container parses `vercel.json` at deploy creation time, but the rejection happens in the webhook handler, BEFORE a deployment row exists — so there's nothing visible in the dashboard. `vercel --prod` from the CLI shows the parse error immediately.

**Rule**:
- For any change to `vercel.json` rewrites/headers/redirects: run `vercel deploy --prod --no-wait` (or `vercel build` locally with the Vercel CLI) BEFORE git push. Webhook silently dropping deploys means you cannot rely on "push and check the dashboard" as validation.
- When you need to match multiple file extensions, write N separate rules (`/:path*.woff`, `/:path*.woff2`, etc.) instead of one regex alternation. The path-to-regexp wildcard syntax is limited — don't fight it.
- If a push went through but no deployment shows up within ~60s, immediately check `vercel.json` recently changed and run the CLI deploy to see the actual error. Do not push more commits assuming the webhook will pick them up.

---

## 2026-05-11 — `logCronExecution` signature mismatch silently no-ops the insert

**Incident**: Three cron files (`cron-soul-signature-regen.js`, `cron-pluggy-sync.js`, `cron-financial-weekly-report.js`) called `logCronExecution(jobName, status, { durationMs, resultData })` — passing an options object as the third argument. The helper expects positional args: `logCronExecution(jobName, status, executionTimeMs, resultData, errorMessage)`. When `executionTimeMs` is an object, the `INSERT INTO cron_executions` runs with `execution_time_ms = '[object Object]'`, the typecast fails, supabase-js returns the error in the rejected promise, and the wrapper catches it without re-throwing — every insert was a silent no-op. The crons themselves succeeded; only the observability row was missing.

**Why it slipped**: The shape mismatch is invisible without an observability row to look at. We were looking for the row to confirm cron runs, found nothing, and assumed the cron wasn't firing — sent us on a multi-hour wild goose chase auditing the Vercel cron schedule, the `verifyCronSecret` gate, and the path-to-regexp routing before we read the logger's source and noticed the call sites were wrong.

**Rule**:
- When introducing a new shared helper that other files will adopt: pick positional args XOR a single options object — never both. If you're going to support an options object, validate it at runtime and throw on shape mismatch so the failure is loud.
- For any helper called from many files: add a unit test that imports each call site and asserts the call signature compiles. TypeScript would have caught this — these are `.js` files, so we need a runtime equivalent.
- When a cron "isn't running": before suspecting the scheduler, grep call sites of the observability logger for shape mismatches. Cron schedule is the LAST thing to check, not the first.

---

## 2026-05-11 — First-pass perf fixes need empirical validation before declaring done

**Incident**: Two follow-up bugs surfaced after declaring perf work "done":
- **C1**: Memory-stream cold-start latency fix initially only addressed `graph-expansion-async` and lifted `has_memory_stream` from 0% → 75%. Declared done. Real bottleneck was the HyDE LLM call on the reflections retrieval track (2-3s on cold lambdas, which serialized inside the 7s breaker). Required a second fix adding `skipHyDE: true` to reflections + per-leg `withLegTimeout(label, promise)` 5s timeout on all 5 inner Promise.all legs, plus breaker bump 7s → 10s.
- **C2**: `soul_signature_id` write-path was correct, but `_fetchSoulSignature` SELECT list didn't include `id` — so the row read back into `twinContextBuilder` had `undefined` for the id, and the link write inserted NULL. Declared done after fixing the write path; the SELECT bug shipped to prod.

**Why it slipped**: Both first-pass fixes addressed the most visible symptom (the function that timed out, the column that was missing) without tracing through every value-flow path. C1 ignored the parallel retrieval legs; C2 ignored that the read query was the bottleneck.

**Rule**:
- After any perf or correctness fix, run post-deploy SQL to compare a PRE-fix baseline against a POST-fix sample on real cold-start traffic. Not "I tested it locally", not "the metric improved on the warm path". Cold-start latency only manifests on Vercel's lambda boot.
- For data-flow bugs: trace the value through every SELECT, INSERT, and helper between the write site and the read site. If a column needs to be present at any downstream step, it must be in every SELECT list — search for the column name across the entire service file before declaring fixed.
- "Declare done" requires evidence (a SQL row count, a latency histogram, a log line), not absence of new error reports. Absence of evidence ≠ evidence of fix.

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

---

## 2026-05-12 — Real-ESRGAN: anime-tuned model over-smooths painterly art

**Incident**: Three back-to-back ship attempts (lanczos upscale → ESRGAN anime model → larger ESRGAN anime model) all failed the user's "looks pixelated" complaint. Spent ~3 hours and 4 deploys before pausing to actually inspect the output.

**Diagnostic**: Encoded the same 600×400 crop from both models' 4× output to PNG. PNG size is a proxy for high-frequency content (lossless format, no compression of detail):
- Lanczos-only crop: 224 KB
- ESRGAN `realesrgan-x4plus-anime` crop: **45 KB (5× less detail)**
- ESRGAN `realesrgan-x4plus` (photo) crop: **222 KB (preserves detail + adds synthesis)**

The anime model is trained to clean up noisy anime scans — it aggressively removes "noise" which on painterly Ghibli-style sources looks like the actual art. Photo model retains detail then adds plausible refinement.

**Rule**:
- For AI-generated painterly art / illustrations / non-anime content: use `realesrgan-x4plus` (photo model), NOT `realesrgan-x4plus-anime`.
- Anime model ONLY for genuine anime/manga sources with hard line art and flat fills.
- When debugging "still looks blurry" after upscale: compare PNG-encoded crops between models. Smaller PNG = more smoothing = less detail. The visual differences can be subtle but the entropy never lies.
- Default verification step: before shipping an upscale pass, eyeball the @2x output AND check the PNG-crop entropy ratio against the source. If output entropy ≤ 50% of source, the model is over-smoothing.
