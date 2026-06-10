# Batch 3 — Platform-State Unification Plan (2026-06-10)

Single source of truth for platform/connection state. Produced by a read-only
architecture pass over every consumer; this is the spec for the batch-3 PRs.

## Problem

Two backend endpoints with DIVERGENT semantics, two frontend hooks, four raw
fetches, one component consulting nothing, and two scoring functions:

- `GET /connectors/summary` (connectors.js:1289-1373) — CORRECT post-2026-06-10
  semantics: `expired` = genuine auth failure only; `stale` = no sync 7d or
  partial/error. No side effects, no cache. `{ total, active, expired, stale, breakdown }`.
- `GET /connectors/status/:userId` (connectors.js:1061-1267) — LEGACY:
  `tokenExpired = token_expires_at < now` (routine hourly lapse!), inline
  `ensureFreshToken()` side effect ON A GET (fails transiently -> false
  "Needs attention"), plus Redis/memory cache serving stale pre-refresh
  snapshots. Root of the Gmail-vs-Workspace same-page contradiction.

### Consumer inventory

usePlatformsSummary (correct, key ['platforms','summary'], staleTime 60s):
ChatEmptyState:69 (header counts), TalkToTwin:115 (footer chip),
InstantTwinOnboarding:54 (counts), SoulScore:293 (ring + "N sources" — uses
TOTAL -> "10 sources" bug), SoulRichnessBar:29 (cap only — numerator from
/status data!), GraphDetailPanel:64, OnboardingHeader/GenerateCTA (props).

usePlatformStatus (legacy, key ['platformStatus',userId], 30s poll):
TalkToTwin:108 (per-platform connected -> chat context), InstantTwinOnboarding:42
(active/expired arrays + banner gate :285), PlatformConnectionsStep:73+133
(re-derives OWN stale logic, local STALE_DAYS copy :70-89), GoogleWorkspaceConnect:34
("Workspace: Connected" badge), Settings:226 + ConnectedPlatformsSettings:84
(rows + disconnect optimistic), ExpiredTokenBanner:28, TokenExpiryBanner:48
(fetched, UNUSED — delete the line), TodayInsights:106 ("Connect X" rows),
IdentityPage:427, identity/ContextSidebar:43, ProactiveInsightsPanel:73,
SoulInterview:22, DataVerification:45, BrokerageActivityCard:159 (**BUG: called
with no userId -> query disabled -> whoopExpired always false, dead nudge**).

Raw fetch /connectors/status/:userId (no cache, no shared semantics):
PlatformConnectStep:88, CompactPlatformConnect:65, AwakeningScreen:78,
BetaOnboardingChecklist:34 (own query key 'beta-onboarding-platform-count').

Consults NOTHING: PlatformStep.tsx:129-143 — `connected` Set seeded only from
?connected= URL param (audit HIGH: 9-connected user sees all CONNECT).

Scoring divergence: SoulRichnessBar (weighted sum, /status numerator, 95 cap)
vs SoulScore.computeSoulScore (4x25% formula, summary input) -> 95 vs 88.

Invalidation gap: NOTHING invalidates ['platforms','summary'] after
connect/disconnect (only ['platformStatus',userId] is refetched; the Realtime
invalidation in usePlatformStatus:137 is disabled by default). Counts wrong up
to 60s+ after OAuth return.

## Design

1. **api/services/platformStateService.js (new)**: pure
   `classifyConnection(row) -> 'active'|'expired'|'stale'` (exact summary
   logic) + `buildPlatformsSummary(userId)`. Breakdown entries gain
   `{ connectedAt, lastSyncAt, source: 'oauth'|'nango' }` (additive).
   encryption_key_mismatch -> 'expired'. /summary route becomes a thin wrapper.
2. **/status auto-refresh side effect: DELETED.** Refresh already happens
   on-demand at every data-access site (all 13 fetchers, dataExtractionService,
   twinContextBuilder, dashboard-context). Under canonical semantics routine
   expiry is never displayed, and real auth_failed can't be fixed by refresh.
   Also removes per-pageview write amplification.
3. **usePlatformsSummary extended** (the ONLY hook): richer types, selectors
   (`byPlatform`, `isConnected`, `needsReconnect`, `connectedProviders`),
   `invalidatePlatformState(queryClient)` (invalidates ['platforms'] prefix),
   `useDisconnectPlatform` mutation (optimistic cache surgery, auth headers,
   invalidate on settle), refetchInterval 60s.
4. **Display convention**: primary = `active`; warning = `expired+stale`
   ("M need attention"); /you "sources" uses `active` not total.
5. **src/lib/soulScoring.ts (new)**: one `computeSoulScore({summary, memoryCount,
   axesCount})` (SoulScore formula, 95-cap rule). SoulRichnessBar renders the
   SAME number, relabeled "Soul Score". 95-vs-88 structurally impossible.

## Migration steps (each independently shippable)

1. Backend enrich: platformStateService.js + /summary delegation. (additive)
2. Hook extension + invalidation wiring: usePlatformConnect.ts:117,389,439 and
   InstantTwinOnboarding OAuth-return/modal handlers call invalidatePlatformState.
   (fixes stale-counts gap on its own)
3. Count-only swaps: IdentityPage:427, identity/ContextSidebar:43,
   ProactiveInsightsPanel:73, SoulInterview:22, BetaOnboardingChecklist (delete
   rogue query), AwakeningScreen (hook instead of raw fetch).
4. Per-platform migrations: TalkToTwin, TodayInsights (isConnected — expired
   gets reconnect banner not "Connect X"), GoogleWorkspaceConnect (any google_*
   entry state !== 'expired'; prop becomes summary — 2 call sites),
   ConnectedPlatformsSettings + Settings (useDisconnectPlatform),
   ExpiredTokenBanner (state==='expired' list; drop userId prop),
   PlatformConnectionsStep (delete local STALE_DAYS/computeAttention; per-tile
   from breakdown), InstantTwinOnboarding (banner gate = summary.expired>0),
   DataVerification (breakdown + lastSyncAt), BrokerageActivityCard
   (needsReconnect(summary,'whoop') — fixes dead-code bug),
   TokenExpiryBanner (delete unused call).
5. Onboarding connect steps: PlatformStep merges connectedProviders(summary)
   into its local Set; PlatformConnectStep + CompactPlatformConnect replace
   mount fetch with hook.
6. Scoring unification: soulScoring.ts + SoulScore/SoulRichnessBar edits.
   (Product-visible: /get-started 95% becomes the Soul Score value.)
7. Teardown: delete usePlatformStatus.ts, GET /connectors/status/:userId +
   cache helpers. Grep 'platformStatus' first.

## Risks

- AwakeningScreen/Settings were edited by batch-2 — rebase carefully.
- Freshness: 60s refetch vs old 30s poll — OAuth returns covered by explicit
  invalidation; acceptable.
- Disconnect UX must keep instant-removal feel (optimistic cache surgery).
- Verify useChatSession's connectedPlatforms shape before TalkToTwin swap.
- QA with a genuine auth_failed row: warnings must still appear (fewer false
  banners is the INTENDED change).
- Nothing renders per-platform expiresAt — confirm with grep before teardown.
