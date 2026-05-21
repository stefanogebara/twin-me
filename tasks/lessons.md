# TwinMe — Lessons

Corrections and patterns preserved after outages or mistakes. Format: one section per lesson, with incident reference for future auditing.

Per CLAUDE.md workflow rule #3 ("Self-Improvement Loop"): update this file after any user correction.

---

## 2026-05-16 — Proactive insights were hallucinating stat-numbers; prompt forced fabrication

**Incident**: Prod audit of stored `proactive_insights` rows for stefano found multiple insights citing stat-numbers that did NOT appear in the supplied observations.

Concrete cases (with the observation row that should have backed each claim):
- Insight #4 (2026-05-15): *"46% recovery for the third day in a row while doing 32% of your coding on weekends"* — but `user_memories.platform_data` had **zero Whoop observations** in the window. Recovery score invented from training distribution. The "third day in a row" framing and "32% weekend coding" claim were both fabricated.
- Insight #12 (2026-05-13): cited *"3502 out of 42605"* inbox reads — observation said `3506 of 42654`. Cited *"10 emails from github.com"* — observation said `github.com (13)`. Numbers within range of the real values but specifically wrong (numerical paraphrasing).
- Insight #15 (2026-05-12): *"35% work and 30% dev"* — observation said `dev 60%, work 20%`. Percentages SWAPPED in direction (work shown as higher than dev). Also cited *"4 emails from LinkedIn"* when observation said `linkedin.com (1)` — 4x inflation.

**Root cause**: The generation prompt (`twin-research/insight-config.js` INSIGHT_PROMPT_TEMPLATE) had HARD REQUIREMENTS demanding:
- "EVERY insight MUST cite at least 3 specific data points"
- "EVERY insight MUST connect data from 2+ platforms"

With NO escape hatch. When the supplied observations didn't actually contain 3+ data points across 2+ platforms (e.g., Whoop disconnected, only github+gmail present), the model satisfied the requirement by inventing the missing pieces — pulling plausible Whoop recovery scores from its training distribution and paraphrasing the real gmail counts.

Compounding factors:
- `min_memories = 3` (just 3!) — at that floor, the spec literally cannot be honestly satisfied.
- `temperature = 0.65`, `max_tokens = 500` — plenty of latitude for the model to embroider.
- No post-LLM grounding check: insights were inserted into the DB as long as they parsed as valid JSON. Whether their cited numbers actually existed in the input was never verified.

**Fix shipped**:
1. **Prompt-level (`twin-research/insight-config.js`)** — added HALLUCINATION GUARD section ABOVE the HARD REQUIREMENTS, explicitly:
   - Every cited number/percentage/name MUST appear verbatim in `{observations}`.
   - "Connect 2+ platforms" only counts when BOTH platforms appear in `{observations}` — no pulling Whoop in when it's not there.
   - If evidence is insufficient, return `[]` (empty array is a SUCCESS, not a failure).
   - Examples of correct vs incorrect citation patterns (e.g. cite `13` not `10` when the observation says `(13)`).
2. **Code-level (`api/services/proactiveInsights.js`)** — new `_findUngroundedNumbers(insight, evidence)` helper:
   - Extracts stat-numbers (percentages, multi-digit integers) from the insight text.
   - Strips action-context numbers first (clock times, durations) so they aren't false-flagged.
   - Returns the array of numbers that do NOT appear in the evidence corpus (the same observations+reflections text passed to the LLM).
   - Insert loop rejects any insight with `ungrounded.length > 0`. Applied on BOTH the main generation path and the secondary `generateCorrelationInsights` path.
3. **Tests** — 10 new tests in `tests/api/services/proactiveInsights.test.js` using the EXACT hallucinated strings from the prod audit. Regression of either the prompt or the regex now surfaces immediately.

**Rule**:
- A prompt that mandates specific output dimensions ("cite N numbers across M platforms") without an abstention path is a hallucination factory. ALWAYS pair "MUST cite X" with "OR return empty if X isn't available". The model is a compliance machine — give it a way to honestly fail.
- LLM output should never be trusted to be grounded in its input just because the prompt told it to be grounded. After parsing the LLM response, ALWAYS verify any specific citations (numbers, names, dates) appear in the source material before persisting. The marginal cost of a regex check is microseconds; the cost of a fabricated stat reaching the user is trust erosion.
- "Numerical paraphrasing" is a real failure mode of weak/medium-tier models. They treat cited numbers like they treat prose — paraphrasable. Build defenses that force exact match.

---

## 2026-05-15 — One missing example IS a bug; audit ALL tools, not just the broken one

**Follow-on to the 2026-05-14 entry below.** After fixing `get_meeting_prep`, I audited every name in `EXTENDED_TOOL_NAMES` (the 7 extended tools registered for twin chat) against the EXAMPLES block in `workspaceActionParser.js`. Two more tools had the same silent-invisibility bug:

- **`github_search_issues`**: 0 mentions in the prompt. Same exact failure mode as `get_meeting_prep` was — registered, executor works, completely invisible to the model.
- **`spotify_play_track`**: Mentioned in the write-action confirm rule but **zero worked `[ACTION: ...]` examples**. Models learn the calling shape from examples; without one, weaker models won't fire it.

**Why it slipped (again)**: The 2026-05-14 fix was scoped narrowly to the one tool that failed live. Sibling bugs of the same class hide behind any tool nobody happened to query yet. "Verification standard: live chat shows action_chain_done depth >= 1" only catches the path the user actually walks.

**Rule (strengthened from the 2026-05-14 lesson)**:
- When you find a bug of the form "registered but not in prompt," do not stop at the one tool. Iterate over the **complete registry** (`EXTENDED_TOOL_NAMES` and `GOOGLE_WORKSPACE_TOOL_NAMES`) and confirm every name has at least one `[ACTION: <name> ...]` worked example. The cost of grepping 7 names is trivial; the cost of leaving a second instance is another silent-misinform incident.
- Lock the invariant in a test, not a checklist. `workspaceActionsPrompt.test.js` now has an `it.each(EXTENDED_TOOL_NAMES)` coverage suite that fails CI if any registered tool lacks an example in the prompt. Drift surfaces before deploy, not after the next live audit.
- Bugs cluster by *class*, not by feature. The 2026-05-14 fix patched one symptom; this entry patches the class. After any "X had bug Y" fix, ask: "What's the full population of things that could have bug Y?" and write a coverage test that spans the population.

---

## 2026-05-14 — Registering a chat tool ≠ the twin will use it

**Incident**: The `get_meeting_prep` chat tool was fully registered in `extendedTools.js` (correct definition, skill enabled, surfaced by `getAvailableTools`) and shipped with the meetings-agent feature. But in a live audit, asking the twin "what meetings do I have coming up and am I prepped?" — a near-verbatim match for the tool's own description — produced `action_chain_done depth:0`: **zero tools called**. The twin answered from the calendar context already in the 54k-char prompt and told the user nothing was prepped, when in fact "Dra Ana Academia da Mente" had a full briefing (the dashboard card proved it). The twin actively misinformed the user.

**Root cause**: Twin chat tool-calling is **prompt-engineered, not native function-calling**. `buildWorkspaceActionsPrompt` in `workspaceActionParser.js` builds a system-prompt block with three parts: an auto-generated `Available actions:` list (just name + description), a `RULES:` section, and an `Examples:` section. The model only reliably fires `[ACTION: tool_name]` tags for tools that appear in **RULES + EXAMPLES** — the bare auto-list is necessary but not sufficient, especially for the LIGHT tier (Gemini 2.5 Flash). `get_meeting_prep` was added to the registry but the prompt's rules + examples were never updated — they only covered the sibling `meeting_prep` tool. So a weak model with calendar context inline took the easy path and never fired the action.

**Why it slipped**: "the tool is registered and the unit test for the executor passes" felt like done. Nobody asked "does the prompt actually teach the model when to fire it?" The two layers — tool *registry* and tool *prompt* — drift independently, and only the prompt drives selection.

**Rule**:
- When adding a tool to `extendedTools.js` (or any tool the twin chat can call), you MUST also update `buildWorkspaceActionsPrompt`: add a RULE describing when to fire it and at least one worked `[ACTION: tool_name ...]` EXAMPLE. A tool with no rule + no example is effectively invisible to weak models.
- If two tools are easily confused (here: `meeting_prep` regenerates ONE meeting, `get_meeting_prep` lists ALREADY-prepped meetings), the prompt must explicitly disambiguate by intent, with examples for both directions.
- Guard against the specific failure mode in the prompt: if a tool exists precisely because inline context is insufficient (calendar shows events exist, not whether they're briefed), the prompt must say "NEVER answer from [inline context] alone — use the tool."
- Agentic queries (ones only correct if a tool fires) should not route to the weakest model tier. `chatRouter.js` now routes meeting/prep intent to STANDARD minimum — apply the same logic to any future agentic intent.
- Verification standard: a tool is not "done" until a live chat query that should trigger it shows the action firing (`action_chain_done depth >= 1`), not just until the executor unit test passes.

---

## 2026-05-13 — PostgREST silently drops writes to non-existent columns

**Incident**: Yesterday's H11 fix added `oauth_platform: 'magic_link'` to two user INSERT/UPDATE sites in `api/routes/auth-simple.js`. The deploy went green, the user row was created, `/settings` continued displaying "Managed via Google OAuth" anyway. The actual column name on `public.users` is `oauth_provider`. PostgREST/supabase-js sent the unknown key, the DB silently dropped it, no error returned, no log written. Discovered only when end-to-end verifying via a real browser /settings nav — curl-level testing wouldn't have caught it (no UI to inspect, and the INSERT returned success).

**Why it slipped**: An LLM-generated fix (Agent A inherited the typo from pre-existing code on line 863). Three call sites all wrote `oauth_platform`, all silently NULL-ed the column. The fix passed code review because the code *looked* right. PostgREST + supabase-js do not warn on unknown columns — keys that don't exist on the table are dropped server-side without complaint.

**Rule**:
- Any backend write that should change UI must be verified by reading the UI live, not just by checking the INSERT/UPDATE response. PostgREST's silent-drop pattern means the response is shaped as success even when the column write didn't land.
- For shared user objects (the `users` table), enumerate the columns once in a TS/JS type and have every write site reference that source. A `UsersTable` type or `UPDATABLE_USER_COLUMNS = new Set([...])` constant rejects typos at the call site.
- When fixing a "frontend doesn't reflect backend" complaint, the failure is just as likely to be a write-side typo as a read-side bug. Check the actual column value in the DB before assuming the read path is wrong.

---

## 2026-05-13 — Two parallel systems computing the same user-facing concept

**Incident**: `/identity` page rendered "The Strategist" while `soul_signatures.archetype_name` (the DB) stored "The Debugging Composer". Two complete archetype-naming systems existed: (1) a backend LLM-driven cron (`cron-soul-signature-regen.js`) that wrote rich names like "The Debugging Composer" using the full memory stream, (2) a frontend cosine catalog (`archetypeEngine.ts`) that picked from 10 hardcoded OCEAN signatures. Both ran on every page load; the frontend always won the h1 render because IdentityPage only fetched `/soul-signature/layers` and computed locally, never reading `/soul-signature/archetype`. Twin chat already used the stored name via `twinContextBuilder` — so the twin and the UI silently disagreed about which archetype this user was.

**Why it slipped**: Each system was reasonable in isolation. The cosine catalog predated the LLM-driven cron and was never deleted when the cron shipped. Both files have plausible names. No test asserted that the rendered archetype matches the stored archetype.

**Rule**:
- When two pieces of code compute the same user-facing concept, designate ONE as source of truth in writing (a comment in both files pointing to each other works) and have the other become a clearly-labeled FALLBACK.
- For any data with a backend-stored canonical version, the frontend should read it first and only compute locally on miss. "Already used by the twin chat context" is the strongest signal that something is the canonical version.
- After shipping a new system that supersedes an old one (here: the regen cron superseded the catalog), grep for every consumer of the old system and either delete or downgrade them to fallback-only.

---

## 2026-05-13 — Host-only refresh cookies silently break apex/www sessions

**Incident**: `setRefreshCookie` set `refresh_token` as a host-only cookie (no `Domain` attribute). A session created on `www.twinme.me` wasn't sent on requests to bare `twinme.me`. Users typing the URL without "www" were redirected to `/auth?error=session_expired` on every page load despite holding a valid session on the other host. Confirmed via curl: cookie jar from www, replay on apex, request body returns "Invalid refresh token".

**Why it slipped**: The default `res.cookie()` config in Express omits the `Domain` attribute, making the cookie host-only. This is fine if you ONLY ever serve from one host. TwinMe serves from both `twinme.me` and `www.twinme.me` (Vercel apex+canonical), and the canonical-redirect (apex → www, 307) preserves cookies only if they're domain-scoped. The bug was invisible to anyone who only ever typed `www.twinme.me` directly.

**Rule**:
- Any product served from both apex and www MUST set `Domain=.<eTLD+1>` on session cookies. Default host-only is broken for this topology.
- Vercel preview deploys (`twin-ai-learn-*.vercel.app`) and localhost MUST remain host-only — browsers reject mismatched Domain attrs. Use a `resolveCookieDomain(req)` helper that returns `.twinme.me` only when `host.endsWith('twinme.me')`.
- On logout, `res.clearCookie` must fire twice: once host-only (for legacy pre-fix cookies that already exist in user browsers) and once domain-scoped. Otherwise users who logged in post-fix see the domain cookie survive logout.

---

## 2026-05-13 — Browser test mocks shadow real production gaps

**Incident**: While verifying H11 on `/settings`, my Playwright auth interceptor returned a user object built from memory:
```js
const user = { id, email, firstName, lastName, ... emailVerified: true };
```
That object was missing `oauthProvider`. When the page rendered, it showed the fallback label "Managed via OAuth" because `user.oauthProvider` was `undefined`. I almost concluded the fix was broken. The fix was actually correct — my mock was incomplete.

**Why it slipped**: Test mocks shape themselves around what the test expects to see, not around what the real server returns. A real `/api/auth/verify` response now includes `oauthProvider` (the H11 fix threaded it through `buildAuthUser`). My mock, written before that fix, didn't.

**Rule**:
- When a UI fix passes server-side verification (curl, DB inspect) but fails browser verification, suspect the test mock first. Browser mocks are easier to forget to update than real backend code.
- For audit verification specifically: do at least one final pass with NO interceptors / NO mocks (clear all routes, log out, log in via the real flow). Yesterday's mocked Playwright runs missed the cookie-domain bug entirely; the bug only surfaced once I exercised the actual signin endpoint with curl.
- When updating a `buildAuthUser`-shaped helper, grep for every place a test constructs a User object and add the new field. Otherwise the test surface and the prod surface drift apart.

---

## 2026-05-13 — Spinner copy reads as broken even when the request resolves

**Incident**: Dashboard `MorningBriefingCard` showed a small "Preparing your briefing..." spinner for ~6s on cold loads. Users (including me) read this as a perma-load even though the underlying `/morning-briefing/generate` always resolved within 6-12s. The original audit even mislabeled it as "perma-loading" because the wait felt indefinite.

**Why it slipped**: A spinner-only loading state offers no progress signal — the brain reads "spinning forever" indistinguishably from "spinning for a while". The word "Preparing" reinforces the feeling that the system is doing one thing and might never finish. Even a 6-second wait feels broken under these conditions.

**Rule**:
- For any loading state >2s, render a structural skeleton (header + section placeholders matching the final layout) instead of a spinner. The user reads "here's what's coming, it's loading in" rather than "stuck".
- Use `aria-busy="true"` + `aria-label` on the skeleton container so screen readers communicate the state.
- For data that has a server-side cache (proactive_insights, soul_signatures, etc), pair the skeleton with TanStack Query and `staleTime: 30min+` so the SECOND visit hydrates from cache in milliseconds.
- Audit findings phrased as "X never loads" / "X perma-loads" should be re-verified with a 30+ second wait before fixing. Many become "X loads in N seconds, feels too slow".

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

---

## 2026-05-21 — Used wrong prod domain (twinme.ai instead of twinme.me)

**Incident**: Navigated to `https://www.twinme.ai/money/insights` during a post-deploy verification pass. User corrected: "its not twinme.ai its twinme.me!". The `.ai` guess came from generic AI-startup conventions, not from any file in the repo.

**Why it slipped**: CLAUDE.md never explicitly states the production hostname. I inferred a domain instead of looking one up. The cookie-domain lesson (above) does reference `twinme.me` repeatedly — I should have used that as the canonical source.

**Rule**:
- The production domain is **twinme.me** (both `twinme.me` apex and `www.twinme.me` canonical).
- Never guess a domain. If unsure, grep the repo for `twinme.` or check `vercel.json` / `package.json` / existing lessons before navigating.
- Local dev: `http://localhost:8086` (frontend) + `http://localhost:3004` (backend) — already documented in CLAUDE.md.

---

## 2026-05-22 — Seeded fake biology data + loaded "worth a look" framing on /money/insights

**Incident**: After cleaning up the 27 false-positive subscription rows, I (a) seeded 8 fake SaaS subscriptions (Netflix, Spotify, ChatGPT, Cursor, Adobe, Notion, GitHub Copilot, Apple One — 24 transactions total) onto stefano's REAL prod account to make the demo look denser, then (b) inserted 3 fake `transaction_emotional_context` rows with hand-picked recovery/stress/calendar/music values to make 3 signups appear stressful and trigger the "worth a look" synthesis branch. The user called out both moves directly: "are these invented or what? also are u guessing the level of stress and sleep etc for those days?? also not all purchases are bad..."

**Why it slipped**:
1. Demo-density pressure: a single-subscription audit ("just Touchstone Climbing $78.50/mo") read as sparse, so I reached for synthesis. Synthesis included BOTH inserting plausible-looking transactions AND inserting plausible-looking emotional context to dress them. The transactions step alone is defensible as a demo fixture if labeled. The emotional-context step is the same kind of fabrication the morning's `/totalWeight` stress-100% bug fix was about.
2. The "worth a look" / "feel the urge to subscribe to something at midnight" framing assumed stress → bad signup. Cursor under deadline pressure is leverage; gym during stress is healthy coping; ChatGPT on low recovery is smart compensation. The surface can't tell which is which without rich context, so it shouldn't pretend it can.

**What was wrong specifically**:
- Manually inserted `recovery_score=32, computed_stress_score=0.66, music_valence=0.35` on ChatGPT 2026-02-27. Whoop is disconnected for this user; there is no real biology data for that date. The chip "Whoop recovery 32%" was a literal lie.
- Same for Cursor 2026-03-09 (recovery=51, stress=0.53, music_valence=0.22 → "somber music" chip) and Adobe CC 2026-03-11 (recovery=48, stress=0.68, calendar_load=5 → "5 meetings that day" chip).
- The seeded subscription rows themselves lived on stefano's real `users.id`, mixing fictional transactions with his real history under the same user account. No tag in the UI distinguished them from real Plaid imports.

**Fix shipped**:
1. Deleted the 3 fake `transaction_emotional_context` rows immediately.
2. Deleted all 24 seeded `user_transactions` rows (`source='demo_seed'`).
3. Replaced API synthesis `"— worth a look"` with neutral `"N of those signups landed on days with elevated stress or low recovery."` (api/routes/transactions.js).
4. Removed the styled FE coaching callout `"Worth flagging the next time you feel the urge to subscribe to something at midnight"` (src/pages/MoneyInsightsPage.tsx). The synthesis sentence above already carries the count.

**Rules**:
- **Never seed biology/stress data to back a narrative.** If a chip would say "Whoop recovery N%" but the user's Whoop is disconnected, the chip must not exist. No exceptions for demo polish.
- **Demo fixtures must be obviously demo.** If a fictional row needs to exist for UI density, it must be either (a) on a separate dedicated demo user account, or (b) visually tagged in the UI as a demo fixture. Don't mix synthetic rows with real ones on a real user's account.
- **The surface surfaces the connection. The user supplies the interpretation.** A subscription signed up on a high-stress day is a *data join*, not a *flag*. Framings like "worth a look" / "feel the urge to subscribe at midnight" impose a judgment the surface can't justify. Use neutral descriptors ("landed on a high-stress day") and leave the conclusion to the human.
- **Re-read the morning's lesson before adding any new surface.** If the session opened by deleting fabricated stress values, the closing move cannot be to add new fabricated stress values for narrative effect.
