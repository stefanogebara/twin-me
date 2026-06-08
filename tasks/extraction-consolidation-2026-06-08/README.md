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
- **Spotify has 3 implementations** with 2 token strategies: `observationFetchers/spotify.js` (P1/P2), `spotifyExtraction.js` (P2's switch — historically didn't refresh, per `lessons.md`), `extractors/spotifyExtractor.js` (P3, correct `ensureFreshToken`). The orchestrator uses the function-style one.
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

**Phase 0 — Freeze + characterize (no behavior change).**
- Add a one-screen "extraction ownership" table to repo docs: platform → canonical fetcher. Mark the duplicates.
- Log `ingestion_source` everywhere extraction runs, so prod shows which path actually fires per platform before deleting anything.

**Phase 1 — Kill the Spotify triple (the proven bug).**
- Make P2's `case 'spotify'` use `observationFetchers/spotify.js` (already used by P1) instead of `spotifyExtraction.js`.
- Delete `spotifyExtraction.js` once nothing imports it. Verify refresh via `ensureFreshToken`.
- *Lowest-risk, highest-symbolic-value — directly closes the `lessons.md` item.*

**Phase 2 — Standardize tokens in the fetcher layer.**
- Audit each `observationFetchers/*` to ensure it calls `ensureFreshToken` (or the platform's correct refresh) before API calls. Fix any that decrypt-and-use raw tokens.
- Removes the "first 401 → connection drifts to expired" class.

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
