# Secret Rotation Runbook (rotate-on-leak)

Durable procedure for rotating a leaked or suspected-compromised credential.

Lives at `docs/security/` rather than a root `SECURITY.md` because #112 removed
the outdated root security doc, the repo doc-file hook blocks new top-level
`.md` files, and `.claude/plans/` is gitignored (local scratch only). A README
under the tracked `docs/` tree is the hook-allowed, committable home.

Ties off tasks #95 (rotate leaked secrets + runbook), #121 (Supabase
service_role), #135 (Reddit OAuth secret), #122 (this runbook + the
scrub-vs-accept decision below).

## Decision: rotate-and-accept-history (not history-scrub)

When a secret lands in git history, there are two responses: rewrite history
to purge the blob (BFG / git-filter-repo + force-push), or rotate the secret
and leave history as-is.

**Standing decision for this repo: ROTATE and ACCEPT history.**

Rationale:
- Once the secret is rotated, the copy in history is inert -- it authenticates
  nothing. The exposure window is "until rotation," and rotation closes it.
- History rewriting force-pushes over a shared repo: it invalidates every
  clone, open PR, and review, and rewrites every commit SHA. High blast radius,
  easy to get wrong.
- Reserve a history scrub for a secret that genuinely **cannot** be rotated
  (e.g. a third party won't reissue it). That is not the case for any secret
  below -- all are reissuable.
- Prevention is already in place: gitleaks runs pre-commit and in CI (#96), so
  the next leak is caught before it lands, not cleaned up after.

The one prior scrub (2026-03, BFG removed 14 committed `.env` files) was
justified because those files held *many* secrets at once, several of which
could not be cheaply rotated in bulk. A single reissuable OAuth secret does
not clear that bar.

## General procedure

1. **Generate** a new secret in the provider's console (only a human with that
   account can do this -- it is never scriptable from CI or an agent).
2. **Propagate** the new value everywhere it is consumed:
   - Vercel -> Project `twin-ai-learn` -> Settings -> Environment Variables ->
     update for **Production and Preview** (and Development if used).
   - Local `.env` (and any teammate `.env`).
   - Confirm no other store holds it (Fly.io bridge, GitHub Actions secrets,
     etc.) -- grep the repo for the env var name first, step 5.
3. **Redeploy** so the new value takes effect (Vercel -> Deployments ->
   Redeploy latest, or push a commit). Env changes do not apply to running
   deployments retroactively.
4. **Verify** the app still works with the new value (see per-secret checks).
5. **Confirm the old secret is dead**: after rotation the old value must be
   rejected. If the provider issued a *new* app/id (Reddit), delete the old app.

Before rotating, run `grep -rn <ENV_VAR_NAME> --include='*.js' --include='*.ts'`
(exclude `coverage/` and `*.md`) to enumerate every consumer and confirm the
secret is read from `process.env` only -- never hardcoded. As of 2026-07-07
both secrets below are env-only, so rotation needs **no code change**.

## Per-secret specifics

### Supabase `service_role` key -- `SUPABASE_SERVICE_ROLE_KEY`

Consumed via `api/config/supabase.js` (admin client; throws if missing). This
key bypasses RLS -- treat as maximally sensitive.

Check **Supabase dashboard -> Settings -> API Keys** for which key system the
project uses:

- **New API keys** (`sb_secret_...` / `sb_publishable_...`): create a new
  secret key, set `SUPABASE_SERVICE_ROLE_KEY` to it, redeploy, then revoke the
  old key. Independent rotation, **zero user disruption**. Prefer this.
- **Legacy JWT keys only**: `service_role` and `anon` are both JWTs signed by
  the project JWT secret, so rotating `service_role` means rolling the JWT
  secret (Settings -> API -> JWT Settings). That **also** invalidates the
  `anon` key (update `VITE_SUPABASE_ANON_KEY` too) **and logs out every user**
  (all existing user JWTs die). Do it in a low-traffic window. Migrating to the
  new API-key system removes this coupling for next time.

Verify: after redeploy, hit any authenticated route that reads through the
admin client and expect 200 (not a 401/500 from a rejected key).

### Reddit OAuth app secret -- `REDDIT_CLIENT_SECRET` (+ `REDDIT_CLIENT_ID`)

**RESOLVED 2026-08-02.** No replacement app was created: Reddit was retired in
the replan-2026-06-10 Track C portfolio cut, so the fix was deletion, not
rotation-and-replace.

What was done:

1. Deleted the "Twin Me - Soul Signature" app at
   https://www.reddit.com/prefs/apps. Deleting the developed app also revoked
   the outstanding authorization grant -- both entries disappeared.
2. Removed `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` from Vercel
   (`REDDIT_CLIENT_SECRET` was Production; `REDDIT_CLIENT_ID` spanned
   Production/Preview/Development as a single variable).
3. Removed the Reddit entry from `tokenRefreshService.js` (6d23df85), so no
   code in `api/` or `src/` reads either variable.

Worth recording: immediately before deletion the secret shown in Reddit's app
console was **byte-identical to the leaked one**, confirming it had never been
rotated and had been live from the leak until 2026-08-02. If a similar leak
recurs, assume the credential is live until proven otherwise.

The leaked values remain readable in git history at `bbc526db` (and in the
`add-vercel-env.sh` blob removed from `main` by #168). They are now inert --
the app they authenticate against no longer exists -- but history was never
rewritten, so do not treat their presence there as a new incident.

## Post-rotation checklist

Generic template -- copy it per incident. The boxes below are intentionally
unchecked; they do **not** track the Reddit item above, which is resolved.

- [ ] New secret generated in the provider console.
- [ ] Vercel env updated (Production + Preview) and redeployed.
- [ ] Local `.env` updated.
- [ ] Verified the app works with the new value.
- [ ] Old secret confirmed dead / old app deleted.
- [ ] Corresponding task (#121 / #135) marked done.
