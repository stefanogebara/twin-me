# Money: ten-person student beta

## Release follow-up (supersedes older pre-deployment notes below)

PR #415 merged as `4c6f21f4` after all six required checks passed: 5,337 regular tests, 23 PostgreSQL invariants, 22 Playwright checks, mobile types, Android compilation/JVM tests, baseline and secret scanning. All six additive migrations were applied and verified live; advanced integrations are allowlisted to the existing owner. The private backup restored successfully with all 18 Money tables and matching counts.

A live preview test with a temporary user verified statement account creation, replay, distinct accounts, ownership and currency guards. Its browser step exposed an unguarded first-visit bank dialog that the previous fixture hid by pre-skipping onboarding. Production build `dpl_4Ryu9Cb71x4gLCCJVNrRSW1t9PAv` was canceled before activation; the previous production deployment remains live. The temporary user's records were removed and zero remaining payments/sightings verified.

Follow-up: first-visit onboarding now uses the same server capabilities as Sources, including direct `?start=banks` and `?start=phone` links. Capability failure closes advanced setup; responses are bound to the current owner and stale loads are ignored. New browser cases retain first-visit state and verify both statement-user restrictions and owner access. Final deployment and live verification will be recorded in the follow-up PR.

Owner authorization: 2026-09-17, implement the audit milestones; owner is currently the only user and plans to invite about ten friends. Make ordinary technical decisions, use existing accounts and simulator, and request login when necessary.

Draft PR: https://github.com/stefanogebara/twin-me/pull/415. Branch: `codex/money-student-beta`, based on `d66f84a1`. Isolated from the older, modified shared checkout. Audit: `/Users/stefanogebara/code/twin-me/.Codex/plans/2026-09-17-money-product-audit/README.md`.

## Decisions

- Retain Express, Supabase, the existing UI, and existing scheduling infrastructure.
- EUR-only eligibility for spending advice; preserve but never silently convert foreign-currency evidence.
- Phone capture belongs to an account and detaches on logout, including expired-session cleanup.
- Preserve raw evidence and manual corrections. Any historical repair starts as a dry-run report.
- Keep the sixty-second deployment ceiling and existing bank-access limits.
- Use real disposable PostgreSQL for persistence/tenant/rollback tests; no production credentials in tests.
- Delay inviting friends until financial correctness/account isolation checks pass and Enable Banking application eligibility is verified.
- Owner confirmed this is a personal student project with no registered company. Continue owner-only live banking; prepare a statement-led pilot while provider eligibility is unresolved. Do not create a company, accept paid terms or contact the provider without separate authorisation.

### Statement selection design lock

Direct build within the existing Money Sources screen. Primary references are `src/styles/money-v2.css` and the current Sources account/feed rows; supporting reference is Refero's bundled `references/craft-details.md` (explicit labels, focus-visible, inline errors and accessible asynchronous status). Live Refero tools are unavailable. Preserve white canvas, Geist, ink-only actions, weight at most 500, existing field/button radii and section rhythm. A chevron opens the statement form; no nested row button. Choose an existing account or name a statement-only account, then select one file and import. Keep selection/file on failure, announce result inline, and distinguish manual records from a live bank connection. No new visual system or imagery.

Statement follow-up verification: reproduced anonymous chat import in a failing test, then added the shared account requirement. The full regression run passed 5,333 regular tests (18 existing skips), 22 real PostgreSQL tests passed, and 20 desktop/phone Playwright checks passed. A subsequent failing test reproduced an unknown explicit currency being labelled EUR; after correction, all 66 focused importer, HTTP, attachment and persistence checks passed. The database tests cover cross-owner selection, repeated account creation, identical statements on different accounts, replay, currency conflicts and old unassigned evidence. HTTP tests verify the authenticated owner and selected account reach ingestion and that failed ownership/historical checks prevent writes. Browser tests cover required selection and retry retaining the file without creating a second account. Production build passed; existing lint/type baselines did not increase. Visual review at phone and desktop sizes led to shortening the selected-account label while preserving its full masked identifier underneath. These changes remain on the draft branch, not deployed.

## Milestone status

| Task | Milestone | Status / remaining verification |
|---|---|---|
| T00 Recovery baseline | 0 | Live schema/grants and completed backups inventoried. Private backup of all 18 Money tables restored into disposable PostgreSQL with real constraints and matching counts (176 payments, 216 sightings); the rehearsal database was then removed. This is a Money-data restore rehearsal, not a whole-project Supabase restore. |
| T01 Persistence regressions | 0 | Implemented: real PostgreSQL, concurrent replay, rollback, isolation, pending settlement and financial authority. |
| T02 CI gates | 0 | Money database/browser/native jobs added and passed hosted checks. Main now requires Build & Test, Mobile typecheck, Money persistence, Money browser, Android capture and gitleaks; other protection settings were preserved. |
| T03 Upload and table access | 1 | Multer/ZIP/CSV and Vite patched; development binds to loopback and rejects untrusted Host headers. Places RLS/grants fixed and verified live. |
| T04 Capture account lifecycle | 1 | Account-scoped credentials, immediate detach, delayed-refresh guards and per-owner screen reset implemented. |
| T05 Event/account identity | 1 | Stable capture/provider identity and reconnect fingerprint implemented. Statement uploads now require an owned account, with an account selector and statement-only identities for users without a bank connection. Historical unassigned matches are blocked for review; linking a statement-only identity to a future live bank connection remains a separate migration task. |
| T06 Reconciliation | 1 | One policy for batch/single; same-source purchases preserved; pending/booked and currency/card/account guards tested. |
| T07 Atomic writes and repair | 1 | Two-RPC atomic path and private read-only historical repair report implemented. One proven primary-evidence pointer repaired after reviewing an exact guarded patch; financial fields are unchanged and backed up privately. Ambiguous payments were preserved. |
| T08 Balance guidance | 1 | Provider timestamps, unresolved outflows, supported balance types and EUR-only aggregates implemented. |
| T09 Future receipts | 1 | Unpaid/future notices stored separately from paid spending. A dedicated notice inbox UI remains polish work. |
| T10 Native retry | 1 | Encrypted account-owned SQLite queue and OS-scheduled retry implemented. Hosted Android compilation and JVM delivery-status checks passed. Physical-device lifecycle tests remain a release gate. |
| T11 Receipt delivery | 1 | Verified processing failures return retryable 503; HTTP failure/replay tests pass. |
| T12 Bank work bounds | 2 | Due-owner claims, shared-consent access reservations, deadlines and durable page cursor implemented. Test real bank continuation expiry before larger backfills. |
| T13 Complete ledger | 2 | Cursor pagination implemented; database test reads 1,005 rows and browser test reaches row 201. |
| T14 Reproducible schema | 2 | Disposable Money schema bootstraps from the existing archived base plus canonical, uniquely versioned forward migrations. This is not a bootstrap of the entire Soul platform. |
| T15 Domain boundary | 2 | Pure allowance policy separated from storage orchestration; common ingestion and transaction repository extracted. Broader legacy cycles deferred. |
| T16 Validation | 2 | Money ingestion UUID/date/source/currency/amount/account boundary validated. Whole-repo JS-to-TS conversion deferred. |
| T17 Operations docs | 3 | Setup, migration ordering, recovery, beta limitations and checks below. |
| T18 Dependency follow-up | 3 | Production High/Critical advisories patched; CSV parser upgraded. Router/Bull moderate advisories triaged below. |
| T19 Nightly report card | 3 | Existing nightly workflow gains Money canaries and previous-20-run shadow grades. No automatic merge, data repair or email agent. |

## Verification and release record

- Live inspection: 18 Money tables, daily completed backups (latest 2026-09-17 01:26 UTC), no PITR. Private inventory is outside git. A production restore has not been rehearsed.
- Live security fix applied through the Supabase Management migration endpoint: `20260917_money_places_service_only`. Verified RLS enabled, anon INSERT/DELETE denied, authenticated UPDATE denied, service CRUD retained. No financial rows changed.
- Real PostgreSQL baseline: five failing persistence regressions (identical purchases, weekend settlement, pending/booked, authority, rollback). New atomic path made all pass. Forced same-snapshot concurrent replay passes; 100 payments take two RPC calls.
- Local verification: 5,328 regular tests (18 existing skips), 18 real PostgreSQL tests, six mobile lifecycle tests and 16 Playwright checks passed. Mobile TypeScript and Vite build passed. Baseline gate held at 73 lint/110 type/113 direct-route-DB findings. The staged gitleaks scan found no secrets.
- Dependency patch pass: full production-and-development audit now reports zero High/Critical and four Moderate package entries. Remaining breaking upgrades will be triaged separately; no force downgrade of Bull.
- Backend changes remain local until the complete release checks pass. Six Money routes passed browser checks at desktop and phone sizes, including receipt expansion, chat, outages, retry and pagination. The new iOS native build compiled in Xcode and the iOS JavaScript bundle exported successfully; interactive simulator checks await macOS control permission.
- Enable Banking login completed in Playwright on 2026-09-17. The production TwinMe application is Active with Account Information marked Restricted and one owner-linked account. The dashboard explicitly limits retrieval to linked accounts. Billing shows no accessible billing account and says unrestricted production access is available only to organisations. The ten-person bank-connected beta is blocked pending provider approval; login itself did not remove the restriction.

Implementation decisions: two bounded RPCs with optimistic per-owner revisions; one JS matching policy; 250 rows per atomic chunk; stable bank entry reference scoped to account, unstable transaction_id excluded; pending multiplicity tracked across pages; future/unconfirmed receipt notices held outside spending; EUR-only aggregates; explicit ledger pagination; encrypted per-owner capture credentials and durable native retry queue.

Cost decision: change the existing Money cron to hourly, claiming at most three due owners per run and scheduling successful owners eight hours later. This spreads ten beta owners across requests rather than overflowing a 60-second function. No new cron and no new LLM call; no-work runs return after the database claim. No historical financial repair without inspecting its proposed diff.

## Context used

SecondBrain: project page, data-honesty lesson, silent-data-failures lesson. These are historical reference material; live repo/schema/provider facts are verified separately. TwinMe development skill governs backend conventions and the canonical `database/migrations/` path.

## Local verification / setup

Use Node 22 (`.nvmrc`). Root: `npm ci --legacy-peer-deps`; mobile: `npm ci` inside `mobile/`. Web uses `npm run dev` on 8086 and the API uses `npm run server:dev` on 3004. The frontend API URL includes `/api`. The phone uses `EXPO_PUBLIC_API_URL`; OAuth uses `EXPO_PUBLIC_OAUTH_API_URL`. Test accounts are synthetic and never production credentials.

For persistence tests, start PostgreSQL 16 locally and create **twinme_money_test**. Set `MONEY_TEST_DATABASE_URL` to that loopback database and run `npx vitest run tests/api/services/money/persistence.integration.test.js`. The helper deliberately drops its public schema and refuses non-loopback or non-test database names. Do not point ordinary integration tests at production. Set the three Supabase variables to the CI stubs in `.github/workflows/ci.yml` for module import only.

Other gates: `npx vitest run --exclude '**/*.integration.test.js'`; `npx vitest run --config vitest.mobile.config.ts`; mobile `npx tsc --noEmit`; `node scripts/ci/check-baselines.mjs`; `npm run build`; `npx playwright test --config playwright.money.config.ts`. Local Playwright uses installed Chrome; CI installs Chromium. Browser fixtures abort non-local requests. Android's hosted job compiles the notification module and runs its JVM tests; it does not prove actual background behavior on a handset.

## Release order and recovery

Release authorised by the owner on 2026-09-17: test and deploy the statement-led web beta. `MONEY_ADVANCED_BETA_USER_IDS` is an explicit comma-separated public.users ID allowlist for live banking and phone capture; no setting means neither is available. Production/preview are configured for the current owner only. The API enforces it on bank connection, callback and capture, and the web presents statement onboarding for everyone else. The mobile binary is not part of this web release. Final local gate: 5,336 regular tests (18 existing skips), 22 Playwright checks, production build and unchanged lint/type baselines passed; database invariants already passed 22 tests. A private pre-deployment backup of all 18 existing Money tables and the previous production deployment identifier were saved outside git.

Deployment compatibility check found that the old Android binary sends only text and acknowledges every HTTP response below 500. Undated captures are now held in `money_notices` with kind `capture_needs_update`, acknowledged only after durable storage, and never converted into ledger spending. Storage failure returns 503 so old clients retain their queue. A text hash deduplicates retries in the holding area; it cannot determine real payment multiplicity or dates, so human review is still required. The rebuilt native app supplies original event time. This compatibility path requires no additional migration.

All six additive migrations were applied and recorded. The Management API generated colliding migration versions when consecutive requests landed in the same second; the remaining applications were spaced out and all six verified in history. Existing counts stayed at 176 payments and 216 sightings. No financial rows were rewritten by these migrations.

The private Money backup was restored into a disposable database using the repository schema and real foreign-key constraints. Every backed-up column was present, all 18 table counts matched, and the rehearsal database was removed afterward. Legacy-capture compatibility checks passed, including durable holding, retry on storage failure, owner isolation and no ledger payment from missing-time evidence (23 database invariants in total). The final UI still passed all 22 Playwright checks.

1. Keep friends out until provider production eligibility and the native capture release gates are confirmed. Start with one friend, then three, then ten after checking one full booking cycle. Support EUR accounts first. Do not advertise automatic iOS notification access: iOS uses a user-created Shortcut, and that Shortcut survives app logout until disabled or its key revoked.
2. Verify a recent completed backup and preserve a private pre-release inventory. Apply only this branch's six `database/migrations/20260917*_money_*.sql` files in filename order, once each, recording versions in Supabase migration history. Do not replay the archived Money migrations on production. The access-only places migration was already applied under the Management API name `20260917_money_places_service_only`; it is idempotent if run again for version alignment.
3. Deploy the server after the additive migrations; deploy the web with it. Old servers do not use revision locking, so allow in-flight requests to drain before running imports against the new server. The schema is backward compatible for a code rollback. Do not drop the new evidence tables during rollback.
4. Release the rebuilt phone application. Existing native binaries cannot gain the encrypted queue from a JavaScript-only update; unsupported Android builds now say to install the update. Confirm offline capture, airplane-mode recovery, process termination, reboot, logout during delivery, and account A/B separation on a real Android device. On iOS verify the Shortcut sends the original transaction date, merchant and amount.
5. Check `/money/today`, the final ledger page, verified email retry, and cron outcomes. Balance guidance intentionally stays unavailable until a provider read supplies both provider time and observation time. Budget-based estimates name their basis. A bank continuation failure is partial, never a claim of complete history.
6. Roll back application code if a financial invariant fails, pause Money cron reads if necessary, preserve incoming evidence and inspect the failed owner's rows. Reconcile differences before any restore: a whole-project restore can discard newer valid activity. No automatic historical deletion or destructive down migration is provided.

Historical review: `node scripts/money/repair-preview.mjs --user-id UUID --env-file /private/path/.env --output /private/path/report.json`. It enforces a read-only Management API query, writes with owner-only permissions, refuses output inside the checkout, and has no apply mode. The inspected owner had zero repeated stable bank references, nine ambiguous same-day groups, and one incorrect primary-evidence link. That link's sole correctly attached bank sighting matched owner, amount, currency, direction, merchant and time. After reviewing the guarded patch, only its primary_sighting_id was corrected; a fresh read confirmed zero broken primary links and unchanged financial fields. Private before/after rows and the exact SQL are in the owner-only Codex artifacts folder. Future repairs still require an exact reviewed before/after patch. Similar prices/dates alone never justify deleting purchases.

## Remaining limits and deliberate trade-offs

- Provider eligibility for ten unrelated friends is now a confirmed live-banking release blocker: the production application remains restricted to the owner's linked account. Owner confirmed this is a personal student project with no company. No activation request, quote request, contract or billing change was submitted. The standard unrestricted application form requires an organisation; a student exception is unverified. Do not add friends' accounts to the owner's whitelist as a workaround.
- Statement selection now supports multiple accounts explicitly. Supported formats remain the existing day-first Excel/CSV importer, EUR only, one account per file. Account names identify statement-only accounts; use distinct names for distinct accounts. Moving an existing manual ledger onto a future live bank connection requires an explicit account-linking workflow to avoid duplicates. Old unassigned statement matches return a review-required conflict; historical attribution is not guessed.
- Unnamed bank-alert emails cannot be safely matched by amount alone. They remain distinct evidence; resolving ambiguity needs a review flow. Future notices are accessible via the authenticated notices API and attachment acknowledgment; a dedicated inbox view is pending.
- Backfill pagination stores a continuation cursor, but bank-specific cursor expiry/restart behavior needs a real provider exercise. The one-page unattended policy favors budget safety over fast large backfills.
- Remaining production advisories: React Router's backslash navigation and SSR hydration advisories require a deliberate router upgrade and navigation review; the app is a Vite SPA, but that does not make the navigation issue irrelevant. Bull uses uuid.v4 without caller-provided buffers; the reported uuid issue concerns v3/v5/v6 with buffers. Do not force npm's suggested Bull downgrade. References: [Router navigation](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6), [UUID buffer handling](https://github.com/advisories/GHSA-w5hq-g745-h8pq). The CSV parser was upgraded to address [the columns-path advisory](https://github.com/advisories/GHSA-8cw4-87c7-c6xx).
- Keep the existing stack. No new queue service, microservices, broad UI redesign, full legacy rewrite, or unverified “Fable 5” model configuration is needed for ten students. A nightly streak is a reliability signal, not evidence that arbitrary autonomous financial changes are safe.

Hosted verification: the first run passed Build & Test, Mobile typecheck, Money persistence, Money browser, smoke and gitleaks. Android setup failed before compilation because the setup action requested the retired `tools` SDK package; the workflow now explicitly requests platform-tools, Android 36 and build-tools 36.0.0. Native authorization failures now pause the owner’s queue until explicit capture-key renewal.

Final validation follow-up: the Android job passed after explicit SDK package selection. Upgraded Vite to 7.3.6 (supported by the existing React SWC plugin), retained the previous browser compilation targets, and verified localhost returns 200 while an untrusted development Host returns 403. Vite build and all 16 Playwright checks passed. A full local run hit four worker-start timeouts under concurrent activity; the bounded two-worker rerun passed all 5,328 tests with no unhandled errors. The existing baseline gate remains green. The final dependency scan contains four Moderate package entries and no High/Critical findings, including development dependencies. Source: [Vite advisory](https://github.com/advisories/GHSA-fx2h-pf6j-xcff).

Live changes in this session are limited to places-table RLS/grants, required merge checks, and the one verified primary-evidence pointer correction. Application code, remaining additive migrations, and the rebuilt phone release are not yet in production. PR #415 remains a draft while rollout conditions are checked.

## Enable Banking verification and prepared enquiry

Observed in the authenticated [applications dashboard](https://enablebanking.com/cp/applications) and [billing page](https://enablebanking.com/cp/billing) on 2026-09-17: production TwinMe is active but restricted; sandbox is active; billing offers a quote form requiring company name, incorporation country, registration number, usage estimates and an effective date. The page explicitly states that unrestricted access is available only to organisations. No price or student exception was shown. Account identifiers and login tokens are intentionally omitted here.

The provider's [FAQ](https://enablebanking.com/docs/faq/) explains that full activation requires a contract and company KYB, and that non-whitelisted accounts are filtered out even after successful bank authorisation. Its [control-panel guide](https://enablebanking.com/docs/api/control-panel/) describes manual review of the application, policy links, contract and billing association. This makes a successful bank consent screen insufficient evidence that a friend's account can be imported.

Decision: continue owner-only bank testing. Keep bank-connected friend invitations closed until the provider approves the intended use and the remaining software/device gates pass. Owner confirmed there is no registered company. Prepare a statement-only pilot instead; it must not imply that live bank connections are available. The new account selector, guarded import API and chat guard close the account-attribution gap without a paid provider or new database migration.

Prepared enquiry for owner review; **not sent**. Recipient: info@enablebanking.com (published in the provider FAQ). Subject: TwinMe student pilot — eligibility and pricing for 10 invited users.

> Hello Enable Banking team,
>
> I am building TwinMe, a student project that helps users understand their spending from bank transactions and receipts. I currently test it with my own linked account, and my production application is active in restricted mode. I would like to run an invite-only beta with approximately ten friends, each consenting to read-only access to their own accounts. The product does not initiate payments.
> This is a personal student project; I have not incorporated a company.
>
> Before inviting them, could you confirm the appropriate approval route, whether you support a student pilot before company incorporation, and the contract, identity/business verification and minimum monthly pricing requirements? Please also explain how accounts are counted for billing and whether any pilot fees or commitments apply. I will confirm the participants' countries and account counts before requesting a quote.
>
> I am seeking eligibility and pricing information only at this stage, with no paid activation or contractual commitment.
>
> Thank you,
> Stefano Gebara
