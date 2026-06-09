# Extraction Path Consolidation — Design Plan

**Status:** Proposal (doc-only, no code). Awaiting approval.
**Author:** audit follow-up, 2026-06-08
**Related:** `tasks/lessons.md:365` ("Two parallel Spotify extraction paths…"), audit `tasks/audit-2026-06-06/`.

## 1. Problem

The codebase has **three parallel data-extraction paths**, and most platforms are implemented in 2–3 of them with subtly different logic, write targets, and token handling. This is the documented "two extraction paths = one is wrong" trap (`lessons.md:392`) — but codebase-wide, not just Spotify.

| Path | File | Role | Writes | Helpers |
|------|------|------|--------|---------|
| **P1** | `observationIngestion.js` | cron + post-onboarding (always-on) | memory stream (`user_memories`) | `observationFetchers/*` |
| **P2** | `extractionOrchestrator.js` | on-demand triggers (user-facing) | memory stream + `data_extraction_jobs` + feature extractors | `observationFetchers/*`, `featureExtractors/*`, some `extractors/*` |
| **P3** | `dataExtractionService.js` | OAuth-connect / queue (legacy "soul signature") | raw `user_platform_data` + `data_extraction_jobs` | `extractors/*` |

**Concrete hazards (verified):**
- **Spotify has 3 implementations serving DIFFERENT purposes** (correction 2026-06-08 — all now refresh tokens; the `lessons.md` no-refresh bug is already FIXED): `observationFetchers/spotify.js` → memory observations (`getValidAccessToken`); `spotifyExtraction.js` → raw `user_platform_data` as `data_type: 'comprehensive_music_profile'` (`ensureFreshToken`, used by the orchestrator); `extractors/spotifyExtractor.js` → raw `user_platform_data` as *granular* rows (`recently_played`/`top_track`/`top_artist`/`playlist`/`saved_track`, used by P3). These are NOT redundant copies — 1 observation producer + 2 raw producers writing **different `data_type` shapes**. The genuine redundancy is the two raw producers, but unifying them needs a consumer audit of which `data_type`s are read (deferred to Phase 4).
- **GitHub/Discord/LinkedIn/Reddit/Calendar/Whoop** each exist in all three directories (`observationFetchers/`, `featureExtractors/`, `extractors/`) — a fix to one silently misses the others.
- **Whoop divergence:** P3 is a no-op stub; P1/P2 run the real fetcher → data presence depends on which path fired.
- **Gmail in P3 is dead-on-arrival:** imports `fetchGmailObservations` from `observationIngestion.js`, which doesn't export it (`dataExtractionService.js:16-24`).
- **Token handling is inconsistent across the fetcher layer** — exactly the bug class from `lessons.md`.

## 2. Current platform × path coverage

P1 = 19 real platforms (+ web/location pseudo-platforms, + instagram via extension).
P2 = 22 (widest OAuth/API coverage; adds notion/pinterest/soundcloud/steam; missing instagram).
P3 = 12 (incl. 2 stubs + 1 no-op).

Only-in-one-path (must be preserved):
- **P1 only:** instagram (extension), web (extension), location (mobile clusters).
- **P2 only:** notion, pinterest, soundcloud, steam (via `extractors/*`).
- **P3 only:** tiktok (via `extractors/tiktokExtractor.js`), raw `user_platform_data` production, full `data_extraction_jobs` lifecycle, WebSocket extraction notifications, Nango transport for youtube/twitch.

## 3. Target architecture

**One dispatcher over `observationFetchers/*` (the `PLATFORM_FETCHERS` map), invoked by all three triggers via an `ingestion_source` discriminator.**

```
            cron ─┐
   on-demand UI ──┼──► runExtraction(userId, platform[], { source }) ──► PLATFORM_FETCHERS[platform]
 post-onboarding ─┘                                                         │
                                                                           ├─► addPlatformObservation → user_memories   (always)
                                                                           ├─► raw user_platform_data + jobs            (when consumers need raw)
                                                                           └─► featureExtractors                        (opt-in, if retained)
```

Principles:
- **Memory stream is the canonical sink** — every platform writes NL observations via `addPlatformObservation`. (P3 deliberately skips this today, which is why TikTok was a dead end before #87.)
- **One implementation per platform.** Delete the function-style `spotifyExtraction.js`; pick one of `featureExtractors/*` vs `extractors/*` per platform (or clearly separate "raw extractor" vs "feature extractor" responsibilities and name them so).
- **Token acquisition standardized on `ensureFreshToken`** inside the fetcher layer (fixes the recurring refresh-drift bug class).
- **Raw `user_platform_data`** becomes an explicit per-platform capability flag, not a separate path — only platforms whose downstream consumers (purchase-bot, goal tracker, soulSignatureBuilder, behavioralEvidencePipeline) read raw rows produce them.

## 4. Migration phases (each independently shippable + reversible)

**Phase 0 — Freeze + characterize (no behavior change) (DONE 2026-06-08).**
- **DONE:** one-screen "extraction ownership" table at `docs/extraction-ownership/README.md` (platform → canonical fetcher, duplicates flagged, only-in-one-path preserved).
- **DONE:** `ingestion_source` telemetry — new `api/services/extractionTelemetry.js` emits a single greppable `extraction_run` event with a frozen `INGESTION_SOURCE` enum (`background`/`post_onboarding`/`on_demand`/`oauth_callback`). Wired into all four dispatch points (P1 cron + post-onboarding, P2 orchestrator, P3 dataExtractionService). Pure logging, no behavior change. Aggregate prod logs by `ingestion_source`+`platform` to see which paths actually fire per platform before any deletion in P3-P5.

**Phase 1 — Spotify observation parity (REVISED + DONE 2026-06-08).**
- The original plan ("swap orchestrator to `observationFetchers/spotify.js` + delete `spotifyExtraction.js`") was **dropped after verification**: the `lessons.md` token bug is already fixed (`spotifyExtraction.js:48` uses `ensureFreshToken`), and `spotifyExtraction.js` is the sole producer of the `comprehensive_music_profile` raw row — deleting it would lose data. The two raw extractors also write *different* `data_type` shapes, so they aren't trivially mergeable.
- **DONE:** the orchestrator's `case 'spotify'` now ALSO emits memory observations via `observationFetchers/spotify.js` (canonical, token-refreshing), so on-demand Spotify extraction updates the memory stream like every other platform (it previously wrote raw only → the stream only refreshed via the cron). Additive, no deletions.
- **Deferred to Phase 4:** unifying the two raw producers (`comprehensive_music_profile` vs the granular rows) — requires a `data_type` consumer audit first.

**Phase 2 — Standardize token handling in the fetcher layer (DONE 2026-06-08).**
- Audit finding: token *refresh* is already standardized — every OAuth fetcher uses `getValidAccessToken` or Nango (both refresh); the only `decryptToken` is github's PAT fallback (PATs don't expire). No refresh bugs remain.
- The real gap was *error surfacing*: `spotify` + `youtube` threw a tagged `AUTH_FAILED` on token failure (→ ingestion records `auth_failed` → /inbox Reconnect CTA), but `discord/calendar/gmail/googleDrive/linkedin/oura/reddit/slack/whoop/twitch/strava` silently `return []`, masked as `no_new_data` — expired connections produced nothing with no Reconnect prompt.
- **DONE:** those 11 fetchers now throw the tagged error (matching `spotify.js`). `observationIngestion.js:549` already flips `status='auth_failed'` on `code:'AUTH_FAILED'`, so expired connections surface a Reconnect CTA consistently. Full suite green.
- Deferred: `appleMusic` (two-token flow — risky single-branch swap); `garmin`/`instagram`/`web`/`location` are non-OAuth (N/A).

**Phase 3 — Fold P2 into the unified dispatcher.**
- Replace `extractionOrchestrator`'s hand-written `switch` with `PLATFORM_FETCHERS` dispatch (it already mostly delegates to the same fetchers after #86). Keep the on-demand wrapper (jobs table, `twin_summaries` invalidation, feature-extractor hooks) as a thin layer around the shared dispatcher.
- Decide feature-extractors' fate: keep as opt-in post-step, or retire (CLAUDE.md hints OCEAN was partly removed).

**Phase 4 — Re-home P3's unique capabilities, then retire it.**
- Move raw-`user_platform_data` production into the fetcher layer as a per-platform `writesRawData` capability (only platforms with raw consumers).
- Give TikTok a real `observationFetchers/tiktok.js` + add to `PLATFORM_FETCHERS` (its memory-stream observations were added in #87).
- Re-home Nango transport for youtube/twitch + WebSocket notifications + reauth detection.
- Delete the broken Gmail/Teams stubs.
- Once nothing calls `dataExtractionService.extractPlatformData`, delete Path 3 + redundant `extractors/*` duplicates.

**Phase 5 — De-duplicate directories.**
- Collapse `featureExtractors/*` vs `extractors/*` name collisions (10 platforms). One module per platform, single responsibility.

## 5. Risks & mitigations
- **Raw-data consumers break if P3 retired early** → Phase 4 re-homes raw production *before* deleting P3; gate with Phase-0 `ingestion_source` logging.
- **Token regressions** → Phase 2 is dedicated to `ensureFreshToken`; add a per-platform "refresh works" check.
- **Feature-extractor loss** → explicit decision in Phase 3, not an accident.
- **Nango platforms (youtube/twitch)** use a different transport → handle explicitly in Phase 4.
- **instagram/web/location** have no OAuth equivalent → stay on the P1 ingestion model; the dispatcher must support extension/mobile-sourced "fetchers."

## 6. Open decisions (need product/eng call)
1. Keep or retire `featureExtractors/*` (OCEAN/behavioral)?
2. Is raw `user_platform_data` still needed for all current consumers, or can some read the memory stream instead?
3. Nango vs direct OAuth as the long-term transport for youtube/twitch/whoop/oura (auth audit showed direct-OAuth callbacks live in `connectors.js`/`entertainment-connectors.js` while Nango is primary).

## 7. Sequencing recommendation
Phases 1 → 2 first (small, high-value, directly fix known bugs). Pause for review. Phases 3–5 are larger structural work — each its own PR, with the Phase-0 `ingestion_source` telemetry backing the deletions.
