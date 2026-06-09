// TwinMe Desktop — microphone capture (Phase 5B).
// =========================================================================
// Records the default input device for a fixed duration and writes a 16kHz
// mono WAV (the format whisper.cpp expects). Captures at the device's native
// rate/channels, downmixes to mono, and linear-resamples to 16kHz (dependency-
// free — good enough for speech; a higher-quality resampler can come later).
//
// transcribe::transcribe_wav reads exactly this format (16kHz mono i16 PCM and
// validates the sample rate), so the two halves of the pipeline line up without
// either touching the other.
//
// cpal's `Stream` is `!Send` (it owns platform audio-thread handles), so the
// capture must stay on the thread that built it. The caller runs this via
// `spawn_blocking`, where it never crosses an `.await`. Only `resample_linear`
// is unit-testable without a microphone; the cpal stream path is exercised by
// the "Test mic capture" tray item on real hardware.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::SampleFormat;

/// Whisper is trained on 16kHz mono PCM; transcribe_wav rejects any other rate.
const TARGET_SAMPLE_RATE: u32 = 16_000;

/// Record the default input device for `seconds` and write a 16kHz mono i16 WAV
/// to `out_path`. Captures at the device's native rate/channels, downmixes to
/// mono in the data callback, then resamples the collected buffer to 16kHz.
///
/// All cpal/hound errors are mapped to `String` so the Tauri tray handler gets a
/// serializable error. cpal's `Stream` is `!Send`, so this whole function must
/// run on one thread (the caller uses `spawn_blocking`) — the stream is built,
/// played, slept on, and dropped here without ever crossing an `.await`.
pub fn record_to_wav(out_path: &str, seconds: u32) -> Result<(), String> {
    // 1. Default host + default input device (the OS-selected microphone).
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "no input device available".to_string())?;

    // 2. The device's preferred config gives us sample rate, channel count, and
    //    sample format. We capture in whatever native format the device offers
    //    and convert to f32 mono ourselves.
    let supported = device
        .default_input_config()
        .map_err(|e| format!("failed to get default input config: {e}"))?;
    let sample_format = supported.sample_format();
    let channels = supported.channels().max(1) as usize;
    let src_rate = supported.sample_rate().0;
    let config: cpal::StreamConfig = supported.into();

    // 3. Shared mono f32 buffer. The data callback (audio thread) pushes into
    //    it; we drain it after the stream is dropped (capture thread). A Mutex
    //    is fine here — contention is trivial at audio buffer sizes.
    let captured: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));

    // Error callback shared by every sample-format branch: log and keep going.
    // A transient stream error shouldn't abort the whole recording.
    let err_fn = |err: cpal::StreamError| {
        eprintln!("[audio_capture] stream error: {err}");
    };

    // 4. Build the input stream. The data callback receives a slice of the
    //    device's native sample type (f32 / i16 / u16); we downmix each frame
    //    (one sample per channel) to a single mono f32 in [-1.0, 1.0] and push
    //    it. We match on the format so each branch gets the correct slice type.
    let stream = match sample_format {
        SampleFormat::F32 => {
            let buf = Arc::clone(&captured);
            device.build_input_stream(
                &config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    if let Ok(mut out) = buf.lock() {
                        for frame in data.chunks(channels) {
                            let sum: f32 = frame.iter().copied().sum();
                            out.push(sum / channels as f32);
                        }
                    }
                },
                err_fn,
                None,
            )
        }
        SampleFormat::I16 => {
            let buf = Arc::clone(&captured);
            device.build_input_stream(
                &config,
                move |data: &[i16], _: &cpal::InputCallbackInfo| {
                    if let Ok(mut out) = buf.lock() {
                        for frame in data.chunks(channels) {
                            let sum: f32 = frame.iter().map(|&s| s as f32 / 32_768.0).sum();
                            out.push(sum / channels as f32);
                        }
                    }
                },
                err_fn,
                None,
            )
        }
        SampleFormat::U16 => {
            let buf = Arc::clone(&captured);
            device.build_input_stream(
                &config,
                move |data: &[u16], _: &cpal::InputCallbackInfo| {
                    if let Ok(mut out) = buf.lock() {
                        for frame in data.chunks(channels) {
                            // u16 PCM is unsigned with midpoint 32768; center it
                            // to [-1.0, 1.0) before downmixing.
                            let sum: f32 = frame
                                .iter()
                                .map(|&s| (s as f32 - 32_768.0) / 32_768.0)
                                .sum();
                            out.push(sum / channels as f32);
                        }
                    }
                },
                err_fn,
                None,
            )
        }
        other => {
            return Err(format!("unsupported sample format: {other:?}"));
        }
    }
    .map_err(|e| format!("failed to build input stream: {e}"))?;

    // 5. Play, capture for the requested duration, then stop. Dropping the
    //    stream stops the audio callback; we then own the full buffer.
    stream
        .play()
        .map_err(|e| format!("failed to start input stream: {e}"))?;
    std::thread::sleep(Duration::from_secs(seconds as u64));
    drop(stream);

    // Take the captured samples out of the shared buffer.
    let mono = {
        let guard = captured
            .lock()
            .map_err(|_| "capture buffer lock poisoned".to_string())?;
        guard.clone()
    };

    if mono.is_empty() {
        return Err("no audio captured (is a microphone connected and permitted?)".to_string());
    }

    // 6. Resample the native-rate mono buffer down/up to 16kHz, then write the
    //    16kHz mono i16 WAV that transcribe_wav expects.
    let resampled = resample_linear(&mono, src_rate, TARGET_SAMPLE_RATE);
    write_wav_16k_mono(out_path, &resampled)?;

    Ok(())
}

/// Write a mono f32 buffer (already at 16kHz) as a 16kHz mono i16 WAV.
/// Samples are clamped to [-1.0, 1.0] and scaled to i16 — the exact inverse of
/// transcribe_wav's `i16 / 32768.0` normalization.
fn write_wav_16k_mono(out_path: &str, samples: &[f32]) -> Result<(), String> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: TARGET_SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = hound::WavWriter::create(out_path, spec)
        .map_err(|e| format!("failed to create WAV '{out_path}': {e}"))?;
    for &s in samples {
        let v = (s.clamp(-1.0, 1.0) * 32_767.0) as i16;
        writer
            .write_sample(v)
            .map_err(|e| format!("failed to write WAV sample: {e}"))?;
    }
    writer
        .finalize()
        .map_err(|e| format!("failed to finalize WAV '{out_path}': {e}"))?;
    Ok(())
}

/// Pure linear-interpolation resampler, unit-testable without audio hardware.
///
/// Maps each output index back to a fractional source position and linearly
/// blends the two neighboring input samples. Good enough for speech going into
/// whisper; a windowed-sinc resampler is a later quality knob. Returns the input
/// unchanged when the rates match or when there's nothing to interpolate.
fn resample_linear(input: &[f32], src_rate: u32, dst_rate: u32) -> Vec<f32> {
    // Identity fast-path: same rate, or degenerate inputs we can't interpolate.
    if src_rate == dst_rate || src_rate == 0 || input.len() < 2 {
        return input.to_vec();
    }

    // Output length scales by the rate ratio (rounded). At least 1 sample so a
    // non-empty input never resamples to nothing.
    let out_len = ((input.len() as u64 * dst_rate as u64) / src_rate as u64).max(1) as usize;
    let mut out = Vec::with_capacity(out_len);

    // Step through the source in fractional increments. ratio = src/dst samples
    // of input consumed per output sample.
    let ratio = src_rate as f64 / dst_rate as f64;
    let last = input.len() - 1;
    for i in 0..out_len {
        let src_pos = i as f64 * ratio;
        let idx = src_pos.floor() as usize;
        if idx >= last {
            // Past the final sample: clamp to the endpoint.
            out.push(input[last]);
        } else {
            let frac = (src_pos - idx as f64) as f32;
            let a = input[idx];
            let b = input[idx + 1];
            out.push(a + (b - a) * frac);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resample_preserves_endpoints_and_length() {
        let input = vec![0.0, 1.0, 0.0, -1.0]; // 4 samples @ 8000
        let out = resample_linear(&input, 8000, 16000); // upsample 2x
        assert!((out.len() as i64 - 8).abs() <= 1); // ~2x length
                                                     // first sample preserved
        assert!((out[0] - 0.0).abs() < 1e-6);
    }

    #[test]
    fn resample_same_rate_is_identity_ish() {
        let input = vec![0.1, 0.2, 0.3];
        let out = resample_linear(&input, 16000, 16000);
        assert_eq!(out.len(), 3);
    }

    #[test]
    fn resample_downsample_halves_length() {
        // 8 samples @ 32000 -> 16000 should be ~4 samples.
        let input = vec![0.0, 0.5, 1.0, 0.5, 0.0, -0.5, -1.0, -0.5];
        let out = resample_linear(&input, 32000, 16000);
        assert!((out.len() as i64 - 4).abs() <= 1);
        // First sample is always preserved exactly (src_pos 0 -> input[0]).
        assert!((out[0] - 0.0).abs() < 1e-6);
    }

    #[test]
    fn resample_empty_and_single_are_passthrough() {
        // Too few samples to interpolate: returned unchanged regardless of rate.
        assert!(resample_linear(&[], 8000, 16000).is_empty());
        assert_eq!(resample_linear(&[0.42], 8000, 16000), vec![0.42]);
    }
}
