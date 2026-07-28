# Desktop Audio -> Transcription Pipeline (Phase 5B completion)

**Date:** 2026-06-09
**Scope:** Tasks #49 (system-audio loopback), #50 (mix mic+system), #51 (transcribe + summary + surface)
**Status:** PLAN — awaiting approval before any code

---

## 1. Goal (user-facing outcome)

When you're in a meeting (Zoom / Google Meet / Teams — already detected in Phase 5A), TwinMe Desktop captures the audio, transcribes it **on your device** with Whisper, summarizes it server-side, and surfaces it as a meeting memory that feeds your twin. **Raw audio never leaves your machine — only the text transcript syncs.**

## 2. Why this shape

- **Privacy-first.** Capture + speech-to-text are 100% local. Only text leaves the device. The right posture for recording other people's voices.
- **Cost: ~$0.** On-device Whisper = no cloud STT bill. Only the summary touches an LLM (TIER_ANALYSIS / DeepSeek, fractions of a cent per meeting). No Vercel function time for transcription.
- **Built on proven pieces.** The whisper-rs SPIKE already proved whisper.cpp compiles+links across the full CI matrix; mic capture, model download, and transcription already exist (section 3).

## 3. Current state (ground truth)

### Already built — on branch `feat/desktop-phase-5b` (NOT on main, **107 commits behind**)
- `audio_capture.rs` — `record_to_wav(path, secs)`: cpal mic -> downmix to mono f32 -> `resample_linear` -> 16 kHz mono i16 WAV. `resample_linear` is pure and **unit-tested** (4 tests).
- `transcribe.rs` — `transcribe_wav(model, wav)`: whisper-rs 0.16 (CPU-only, zero default features), validates 16 kHz, greedy, returns the transcript.
- `model.rs` — `ensure_model()` (async): downloads the ggml Whisper model (~141 MB) on first use, caches to disk.
- `lib.rs` wiring — "Test mic capture (10s)" tray item: `ensure_model` -> `spawn_blocking(record_to_wav + transcribe_wav)` -> notification. (cpal `Stream` is `!Send`, so capture stays on one blocking thread, never crossing `.await`.)
- Cargo deps: `whisper-rs = { version = "0.16", default-features = false }`, `hound = "3"`, `cpal = "0.15"`.
- SPIKE commit `c2d76ffd` also added the **CI C++ toolchain** (cmake + libclang/bindgen; Linux `libasound2-dev`).

### Already on main (the 5B branch predates all of it)
- Phase 5A meeting **DETECTION**: `meetings.rs` + `POST /api/observations/meeting` + meeting-briefing / debrief crons (`cron-meeting-debrief.js`, `meeting-briefings.js`). **The surfacing system already exists** — transcripts enrich it.
- Backend `observations-meeting.js`: `MeetingSchema { local_id, platform, title?, started_at, ended_at? }` — **no `transcript` field yet.**
- The whole onboarding overhaul, auto-updater (`update.rs`), the capture bug-fix saga, canonical-host fix, v0.1.0 -> v0.2.10.

The 107-commit gap is the #1 logistical risk (section 7). The 3 audio files are NEW (apply cleanly); only `lib.rs` / `Cargo.toml` / the CI workflow need manual re-integration.

## 4. Architecture / data flow

```
[Meeting detected -- Phase 5A, meetings.rs]
        |
        v
[Capture]   mic (cpal, EXISTS) ----+
            system loopback -------+   #49 (per-OS, the hard part)
                                   v
[Mix]       mix_to_16k_mono(mic, system)            #50 (pure DSP, unit-tested)
                                   v
            16 kHz mono PCM (in memory / temp WAV)
                                   v
[Transcribe] whisper on-device (EXISTS)             #51
                                   v
            transcript text   --> delete WAV immediately
                                   v
[Sync]      POST /api/observations/meeting { ...session, transcript }   #51
                                   v
[Summarize] backend LLM (TIER_ANALYSIS) -> meeting summary
                                   v
[Surface]   memory stream -> twin chat + Meetings page + meeting-debrief cron
```

## 5. Staged plan (recommended order: value early, risk staged)

The naive order is #49 -> #50 -> #51. The **smart** order is different: mic-only transcription already has every piece, so it ships first as a complete feature with **zero new native risk**. System loopback is layered on afterward, per-platform, Windows first (the only OS we can verify here).

### Phase 0 — Re-baseline 5B onto current main (prereq, no new features)
- [ ] New branch `feat/desktop-audio` off current `main`.
- [ ] Copy the 3 new files verbatim (clean — absent on main): `audio_capture.rs`, `model.rs`, `transcribe.rs`.
- [ ] Re-add Cargo deps (`whisper-rs` no-default-features, `hound`; `cpal` already on main).
- [ ] Re-integrate the SPIKE's CI C++ toolchain into the **current** `.github/workflows/desktop-build.yml` (cmake, libclang, Linux `libasound2-dev`) — careful merge with the tauri-action auto-updater rewrite.
- [ ] Re-wire `lib.rs`: `mod` decls + `notify()` helper + "Test mic capture" item, against today's lib.rs.
- **Gate:** CI matrix (macOS arm64/x64, Win x64, Linux x64) compiles whisper.cpp + the app. Re-proves the SPIKE on current main. **No user-visible change** (tray test is dev-only; the feature stays dark).

### Phase 1 — Mic-only meeting transcription, end to end (delivers #51 with no new native code)
- [ ] Refactor `audio_capture.rs`: extract `record_mic_to_16k(secs) -> Result<Vec<f32>>`; keep `record_to_wav` as a thin wrapper (sets up #50).
- [ ] `transcribe.rs`: add `transcribe_samples(model, &[f32])` (skip the WAV round-trip on the live path); keep `transcribe_wav`.
- [ ] Meeting hook: when Phase 5A ends a session and transcription is enabled, record the meeting window (mic), transcribe, attach the transcript. Long meetings: chunk into N-second windows, transcribe incrementally (section 7).
- [ ] Backend: extend `MeetingSchema` with `transcript: z.string().max(...).nullish()`; when present, summarize via LLM (TIER_ANALYSIS) and store the richer meeting memory; feed the existing debrief.
- [ ] Surface: transcript/summary on the Meetings page; flows to the twin via the memory stream.
- [ ] Feature flag `meeting_transcription` (default OFF) + explicit opt-in + recording indicator (section 8).
- **Gate:** CI green + pure unit tests (chunking math). Stefano runs a real meeting on Windows and confirms transcript + summary + surfacing.

### Phase 2 — Windows system loopback (#49, the verifiable platform)
- [ ] **Spike first:** confirm cpal 0.15 WASAPI loopback (open the default *output* device as a loopback input). If cpal can't, fall back to a thin WASAPI loopback via the `windows` crate (already a dep).
- [ ] `system_audio.rs`: `record_system_to_16k(secs) -> Result<Vec<f32>>`, `#[cfg(windows)]` first.
- [ ] "Test system capture (10s)" tray item (mirrors the mic test) for on-device proof.
- **Gate:** CI compiles; Stefano verifies system audio is captured on Windows.

### Phase 3 — Mix mic + system (#50, pure DSP)
- [ ] `mix.rs`: `mix_tracks(a, b) -> Vec<f32>` — length-align (pad shorter), level-balance, sum + soft-clip. Pure, **fully unit-tested** (no hardware).
- [ ] Wire the meeting hook to capture BOTH, mix, then transcribe. Graceful fallback to mic-only when loopback is unavailable/unsupported.
- **Gate:** CI + mix unit tests; Stefano confirms both sides of a meeting appear in the transcript on Windows.

### Phase 4 — Linux loopback (#49)
- [ ] PipeWire / PulseAudio monitor source (the default sink's `.monitor`), opened via cpal (ALSA `pulse` plugin) or libpulse. `#[cfg(target_os = "linux")]`.
- **Gate:** CI compiles; verify on a Linux box.

### Phase 5 — macOS loopback (#49, hardest — may punt)
- [ ] Option A: ScreenCaptureKit audio (macOS 13+, ObjC interop) — real but heavy, potentially a sub-project.
- [ ] Option B (interim): detect no native loopback -> instruct the user to install a virtual device (BlackHole) and select it; capture it as a normal input. Ships value without ScreenCaptureKit.
- **Gate:** CI compiles (feature-gated); verify on macOS.

### Phase 6 — Polish (#51)
- [ ] Summary prompt tuning (action items, decisions, participants).
- [ ] Long-meeting chunking + progress UI; model-size choice (tiny / base / small).
- [ ] Privacy controls (retention, redaction) in the privacy dashboard.

## 6. Verification strategy (the "can't build locally" reality)

This environment has **no Rust toolchain, no cmake, and no audio hardware**. So:
- **Primary gate = CI matrix compilation.** whisper.cpp + bindgen + cmake across macOS arm64/x64, Win x64, Linux x64. Green = the hardest unknown (native linking) is proven. Every phase stays CI-green.
- **Pure unit tests for ALL DSP.** `resample_linear` exists; add `mix_tracks`, chunking, downmix. These run headless in CI — the only behavior we can prove automatically.
- **On-device tray tests for native capture** (no mic/loopback in CI). Scripted manual steps per platform: Windows = Stefano (primary); Linux/macOS = Stefano if available, else a tester (macOS may lag).
- **No silent platform gaps:** every phase logs which platforms are verified vs compile-only.

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| 5B branch 107 behind; `lib.rs`/CI conflict | Re-apply, don't rebase. New files are clean; Phase 0 isolates the `lib.rs`/Cargo/CI merge. |
| macOS loopback needs ScreenCaptureKit (big) | Ship Windows/Linux first; macOS via virtual-device interim, ScreenCaptureKit later. Don't block the feature on it. |
| CPU transcription slow on long meetings | Chunk + transcribe incrementally on a blocking thread; default `base.en`; offer `tiny`. Never block the UI. |
| 141 MB model download | One-time, first-use, with progress; reuse `ensure_model`. |
| SPIKE CI changes vs auto-updater workflow rewrite | Phase 0 carefully merges; CI green proves the toolchain still builds. |
| Consent / legal (recording others) | Section 8 — opt-in, indicator, transient audio. Hard gate before Phase 1 ships. |

## 8. Consent / privacy / legal (HARD GATE before Phase 1 ships)

Recording meeting audio — especially **system audio (other people's voices)** — triggers two-party-consent law in many jurisdictions. Before Phase 1 ships:
- Feature **OFF by default**; explicit per-user opt-in with a plain-language explanation.
- Visible "recording this meeting" indicator while capturing.
- Audio is **transient**: the WAV is deleted immediately after transcription; raw audio never syncs.
- Only the text transcript leaves the device; the user controls retention (privacy dashboard).
- (Decision) Optional one-time consent acknowledgment + auto-pause in unknown meetings.

## 9. Open decisions for you

1. **Order** — ship **mic-only first** (Phase 1) before any system loopback? (Recommended: real value in one PR, zero new native risk.)
2. **macOS** — ScreenCaptureKit (native, heavy) vs virtual-device interim (BlackHole) first?
3. **Transcript storage** — store the **full transcript** in the memory stream (richest twin) or **summary-only** (more private)?
4. **Model default** — `base.en` (better) vs `tiny.en` (faster on CPU)? Offer a choice?
5. **Consent UX** — minimal (opt-in + indicator) vs explicit per-meeting acknowledgment?

## 10. Rough effort

- Phase 0 (re-baseline): 0.5-1 day, mostly CI babysitting.
- Phase 1 (mic-only e2e): 1-2 days (Rust + backend + UI + flag + consent).
- Phase 2 (Win loopback): 1 day + spike.
- Phase 3 (mix): 0.5 day (pure, testable).
- Phase 4 (Linux): 1 day.
- Phase 5 (macOS): 2-4 days (ScreenCaptureKit) or 0.5 day (virtual-device interim).
- Phase 6 (polish): ongoing.

---

## Appendix — why mic-only first is the key insight

`record_to_wav` + `transcribe_wav` + `ensure_model` already exist and are CI-proven to compile. A complete, shippable meeting-transcription feature (record your own meeting audio from the mic -> transcribe locally -> summarize -> surface) needs **no new native audio code at all** — only the re-baseline (Phase 0), the meeting hook + backend transcript field (Phase 1), and the consent gate. System-audio loopback (#49) then upgrades the transcript from "my side" to "both sides," one platform at a time, Windows first because it's the only platform we can actually verify from here.
