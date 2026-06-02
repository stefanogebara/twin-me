// TwinMe Desktop — Microphone permission trigger (onboarding)
// ===========================================================
// A single blocking helper that briefly opens the default input device so the
// OS surfaces its microphone-access prompt during first-run onboarding.
//
// IMPORTANT: this records NOTHING. The input stream's data callback is a no-op
// (`|_data, _info| {}`) — captured samples are dropped on the floor. We open
// the device, play for a moment so the OS registers an access attempt (which is
// what triggers the macOS TCC dialog), then drop the stream. No buffer, no
// disk, no transcription. Phase 5B will add real capture; this is only the
// permission handshake.
//
// Runs under `spawn_blocking` (see lib.rs): cpal's `Stream` is `!Send` and the
// sleep is blocking, so we keep the whole thing on a blocking thread and never
// hold the stream across an await.

use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::SampleFormat;

/// How long to keep the input stream open. Long enough for the OS to register
/// an access attempt and show its prompt; short enough to feel instant.
const PROBE_DURATION: Duration = Duration::from_millis(400);

/// Open the default input device just long enough to trigger the OS mic prompt,
/// then close it. Returns `Ok(())` on success, or a human-readable error string
/// (no device, unsupported format, stream build/play failure).
///
/// On Windows/Linux there is typically no per-app runtime prompt (mic access is
/// gated in system settings), so this simply opens and closes the device and
/// returns Ok — which the UI treats as "enabled".
pub fn prompt_microphone() -> Result<(), String> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "No microphone input device found".to_string())?;

    let supported = device
        .default_input_config()
        .map_err(|e| format!("Could not read default input config: {e}"))?;

    let sample_format = supported.sample_format();
    let config: cpal::StreamConfig = supported.into();

    // No-op error callback: an async stream error during this tiny probe is
    // harmless (we're about to drop the stream anyway), so just log it.
    let err_fn = |err: cpal::StreamError| {
        eprintln!("[onboarding] mic probe stream error: {err}");
    };

    // Build a typed input stream whose data callback discards every sample.
    // cpal requires the callback type to match the device's sample format, so
    // match over the common formats. We never touch `_data`.
    let stream = match sample_format {
        SampleFormat::F32 => device.build_input_stream(
            &config,
            move |_data: &[f32], _: &cpal::InputCallbackInfo| {},
            err_fn,
            None,
        ),
        SampleFormat::I16 => device.build_input_stream(
            &config,
            move |_data: &[i16], _: &cpal::InputCallbackInfo| {},
            err_fn,
            None,
        ),
        SampleFormat::U16 => device.build_input_stream(
            &config,
            move |_data: &[u16], _: &cpal::InputCallbackInfo| {},
            err_fn,
            None,
        ),
        other => {
            // Fall back to f32 for any less-common format; if the device truly
            // can't do f32 the build will error and we surface that.
            eprintln!("[onboarding] mic probe: unusual sample format {other:?}, trying f32");
            device.build_input_stream(
                &config,
                move |_data: &[f32], _: &cpal::InputCallbackInfo| {},
                err_fn,
                None,
            )
        }
    }
    .map_err(|e| format!("Could not open microphone: {e}"))?;

    // Playing the stream is what prompts the OS for access on macOS.
    stream
        .play()
        .map_err(|e| format!("Could not start microphone: {e}"))?;

    // Hold the device open briefly, then drop it. Blocking sleep is fine here —
    // this runs on a spawn_blocking thread, not the async runtime.
    std::thread::sleep(PROBE_DURATION);
    drop(stream);

    Ok(())
}
