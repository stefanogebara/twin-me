# Extraction Ownership

**Status:** Living reference (consolidation Phase 0, 2026-06-08).
**Companion:** `tasks/extraction-consolidation-2026-06-08/README.md` (the migration plan).

This is the one-screen "who owns what" table for platform data extraction. Use it
before touching any extractor so a fix lands in the **canonical** place and isn't
silently missed in a duplicate.

## The three paths (recap)

| Path | File | Trigger | `ingestion_source` | Writes |
|------|------|---------|--------------------|--------|
| **P1** | `observationIngestion.js` | cron + post-onboarding | `background`, `post_onboarding` | memory stream |
| **P2** | `extractionOrchestrator.js` | on-demand / user-triggered | `on_demand` | memory stream + jobs + feature extractors |
| **P3** | `dataExtractionService.js` | OAuth connect / queue | `oauth_callback` | raw `user_platform_data` + jobs |

Every path now emits a single greppable `extraction_run` telemetry event
(`api/services/extractionTelemetry.js`). To see which paths actually fire per
platform in prod, aggregate logs by `ingestion_source` + `platform`:

```
grep extraction_run <logs> | ... group by ingestion_source, platform
```

## Canonical fetcher = `observationFetchers/<platform>.js`

The memory stream is the canonical sink. `observationFetchers/*` is the canonical
implementation for every OAuth/API platform. `featureExtractors/*` (behavioral
OCEAN features) and `extractors/*` (raw `user_platform_data`) are **secondary** —
flagged below as duplicates to collapse in Phases 4-5.

| Platform | Canonical (P1) | featureExtractors (P2) | extractors (P3) | Raw producer(s) | Notes |
|----------|----------------|------------------------|-----------------|-----------------|-------|
| spotify | `spotify.js` | `spotifyExtractor` | `spotifyExtractor` | `spotifyExtraction.js` -> `comprehensive_music_profile`; `extractors/spotifyExtractor` -> granular rows | **3 impls, 2 raw shapes** — unify raw in P4 |
| google_calendar | `calendar.js` | `calendarExtractor` | `calendarExtractor` | `calendar.js` upserts `data_type='events'` | dup x3 |
| github | `github.js` (+ `githubLanguageAggregator`) | `githubExtractor` | `githubExtractor` | `extractors/githubExtractor` | dup x3 |
| discord | `discord.js` | `discordExtractor` | `discordExtractor` | `extractors/discordExtractor` | dup x3 |
| linkedin | `linkedin.js` | `linkedinExtractor` | `linkedinExtractor` | `extractors/linkedinExtractor` | dup x3 |
| reddit | `reddit.js` | `redditExtractor` | `redditExtractor` | `extractors/redditExtractor` | dup x3 |
| youtube | `youtube.js` | `youtubeFeatureExtractor` | — | Nango transport via P3 | feature dup |
| gmail | `gmail.js` | `gmailExtractor` | stub -> `observationIngestion` | — | P3 stub is near-dead |
| slack | `slack.js` | — | `slackExtractor` | `extractors/slackExtractor` | |
| whoop | `whoop.js` | `whoopExtractor` | — | — | P3 was a no-op stub |
| oura | `oura.js` | `ouraExtractor` | — | — | feature dup |
| twitch | `twitch.js` | `twitchExtractor` | — | Nango transport via P3 | feature dup |
| strava | `strava.js` | `stravaExtractor` | — | — | feature dup |
| outlook | `outlook.js` | — | — | — | P1/P2 only |
| garmin | `garmin.js` | — | — | — | non-OAuth (credential SSO) |
| fitbit | `fitbit.js` | — | — | — | |
| google_drive | `googleDrive.js` | — | — | — | |
| apple_music | `appleMusic.js` | — | — | — | two-token flow (AUTH_FAILED deferred) |
| instagram | `instagram.js` | — | — | — | extension-sourced (P1 only) |
| notion | — | — | `notionExtractor` | `extractors/notionExtractor` | **P2-only** (niche) |
| pinterest | — | — | `pinterestExtractor` | `extractors/pinterestExtractor` | **P2-only** (niche) |
| soundcloud | — | — | `soundcloudExtractor` | `extractors/soundcloudExtractor` | **P2-only** (niche) |
| steam | — | — | `steamExtractor` | `extractors/steamExtractor` | **P2-only**, API-key (no OAuth) |
| tiktok | — | — | `tiktokExtractor` | `extractors/tiktokExtractor` | **P3-only** — needs a real `observationFetchers/tiktok.js` (P4) |
| teams | — | — | stub (no-op) | — | dead stub — delete in P4 |
| web | extension ingest (`ingestWebObservations`) | — | — | — | pseudo-platform (P1) |
| location | mobile clusters (`ingestLocationClusters`) | — | — | — | pseudo-platform (P1) |

## Duplicates to collapse

**`featureExtractors/*` ∩ `extractors/*` (exact base-name collisions, Phase 5):**
`calendar`, `discord`, `github`, `linkedin`, `reddit`, `spotify` — 6 platforms have a
module of the same name in both directories with different responsibilities (behavioral
features vs raw rows). Rename/merge to one module per platform with a single
responsibility.

**Raw Spotify (Phase 4):** `spotifyExtraction.js` (`comprehensive_music_profile`) and
`extractors/spotifyExtractor.js` (granular `recently_played`/`top_track`/`top_artist`/
`playlist`/`saved_track`) write **different `data_type` shapes** — not trivially
mergeable. Requires a `data_type` consumer audit first.

**Only-in-one-path (must be preserved when retiring a path):**
- **P1 only:** `instagram` (extension), `web`, `location`.
- **P2 only:** `notion`, `pinterest`, `soundcloud`, `steam`.
- **P3 only:** `tiktok`, raw `user_platform_data` production, `data_extraction_jobs`
  lifecycle, WebSocket extraction notifications, Nango transport for `youtube`/`twitch`.

## Rule of thumb

1. Fixing observation/memory behavior -> edit `observationFetchers/<platform>.js`.
2. Fixing raw `user_platform_data` -> check the **Raw producer(s)** column first.
3. Adding a platform -> add `observationFetchers/<platform>.js` + register in
   `PLATFORM_FETCHERS` (P1) **and** the P2 dispatcher. Don't start in `extractors/*`.
