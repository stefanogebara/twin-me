// TwinMe Desktop — on-device transcription (Phase 5B).
// =========================================================================
// Wraps whisper.cpp (via the whisper-rs crate, CPU-only build). transcribe_wav
// loads a 16kHz mono WAV and runs the given model, returning the concatenated
// transcript. The model file (e.g. ggml-base.en.bin) is downloaded/managed
// separately in a later 5B unit; this module is the core transcription path.
//
// This is the make-or-break feasibility piece: if whisper-rs-sys compiles and
// links whisper.cpp across the CI matrix (macOS arm64/x64, Windows x64, Linux
// x64), the hardest unknown of Phase 5B is proven.
//
// API surface (whisper-rs 0.16):
//   WhisperContext::new_with_params(path: impl AsRef<Path>, WhisperContextParameters)
//       -> Result<WhisperContext, WhisperError>
//   ctx.create_state() -> Result<WhisperState, WhisperError>
//   FullParams::new(SamplingStrategy::Greedy { best_of }) -> FullParams
//   state.full(params, &[f32]) -> Result<(), WhisperError>
//   state.full_n_segments() -> c_int
//   state.get_segment(i: c_int) -> Option<WhisperSegment>
//   segment.to_str_lossy() -> Result<Cow<str>, WhisperError>

use whisper_rs::{
    FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters,
};

/// Whisper models are trained on 16kHz mono PCM. The capture unit guarantees
/// this sample rate; we assert it here so a mismatched WAV fails loudly rather
/// than producing garbage (whisper does not resample for us).
const WHISPER_SAMPLE_RATE: u32 = 16_000;

/// Load a 16kHz mono WAV at `wav_path` and transcribe it with the whisper model
/// at `model_path`. Returns the concatenated transcript (segments joined by a
/// space) or a human-readable error string.
///
/// All whisper-rs / hound errors are mapped to `String` so the caller (a Tauri
/// command in a later unit) gets a serializable error without leaking error
/// types across the IPC boundary.
#[allow(dead_code)] // wired into the capture -> transcribe pipeline in a later 5B unit
pub fn transcribe_wav(model_path: &str, wav_path: &str) -> Result<String, String> {
    // Load the WAV into a 16kHz mono f32 buffer, then run the shared core.
    let samples = load_wav_mono_f32(wav_path)?;
    transcribe_samples(model_path, &samples)
}

/// Transcribe a 16kHz mono f32 PCM buffer with the whisper model at
/// `model_path`. The in-memory counterpart to `transcribe_wav` — the meeting
/// recorder feeds captured samples here directly, skipping the WAV round-trip.
/// Same CPU-only whisper path: greedy sampling, segments joined by single
/// spaces, lossy UTF-8 at chunk boundaries.
#[allow(dead_code)] // wired into the meeting recorder in the next 5B unit
pub fn transcribe_samples(model_path: &str, samples: &[f32]) -> Result<String, String> {
    // Build a whisper context from the model file. Default params = CPU, GPU off
    // (whisper-rs 0.16 has no GPU features enabled in our build). &str implements
    // AsRef<Path>, so we pass model_path directly.
    let ctx = WhisperContext::new_with_params(model_path, WhisperContextParameters::default())
        .map_err(|e| format!("failed to load whisper model '{model_path}': {e}"))?;

    // Each decode needs its own state (holds the KV cache + results).
    let mut state = ctx
        .create_state()
        .map_err(|e| format!("failed to create whisper state: {e}"))?;

    // Greedy sampling with best_of = 1 — fastest, deterministic, fine for meeting
    // notes. (Beam search is a later quality tuning knob.)
    let params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });

    state
        .full(params, samples)
        .map_err(|e| format!("whisper transcription failed: {e}"))?;

    // Concatenate every segment's text. full_n_segments() returns a c_int (not a
    // Result); get_segment(i) yields the WhisperSegment, and to_str_lossy()
    // tolerates invalid UTF-8 at chunk boundaries instead of failing the whole
    // transcript.
    let n_segments = state.full_n_segments();
    let mut transcript = String::new();
    for i in 0..n_segments {
        let segment = state
            .get_segment(i)
            .ok_or_else(|| format!("segment {i} missing (expected {n_segments})"))?;
        let text = segment
            .to_str_lossy()
            .map_err(|e| format!("failed to read segment {i}: {e}"))?;
        push_segment(&mut transcript, &text);
    }

    Ok(transcript)
}

/// Append one whisper segment to the transcript: trim it, skip it when empty,
/// and join non-empty segments with a single space. Extracted from the
/// `transcribe_samples` loop (byte-for-byte the same behavior) so the joining
/// contract is unit-testable without a whisper model — whisper emits segments
/// with leading spaces (" Hello") and occasional blank/whitespace-only ones.
fn push_segment(transcript: &mut String, text: &str) {
    let text = text.trim();
    if text.is_empty() {
        return;
    }
    if !transcript.is_empty() {
        transcript.push(' ');
    }
    transcript.push_str(text);
}

/// Read a WAV file into a mono `Vec<f32>` in the [-1.0, 1.0] range.
///
/// Whisper expects 16kHz mono f32 PCM. We read i16 samples (the format the
/// capture unit writes), normalize by dividing by 32768.0, and average channels
/// down to mono if the source is stereo. The sample rate is validated against
/// `WHISPER_SAMPLE_RATE` so an unexpected rate fails fast.
fn load_wav_mono_f32(wav_path: &str) -> Result<Vec<f32>, String> {
    let mut reader = hound::WavReader::open(wav_path)
        .map_err(|e| format!("failed to open WAV '{wav_path}': {e}"))?;

    let spec = reader.spec();
    if spec.sample_rate != WHISPER_SAMPLE_RATE {
        return Err(format!(
            "WAV must be {WHISPER_SAMPLE_RATE}Hz for whisper, got {}Hz",
            spec.sample_rate
        ));
    }

    let channels = spec.channels.max(1) as usize;

    // Read every i16 sample (interleaved by channel), normalizing to f32.
    let interleaved: Vec<f32> = reader
        .samples::<i16>()
        .map(|s| s.map(|v| v as f32 / 32_768.0))
        .collect::<Result<Vec<f32>, _>>()
        .map_err(|e| format!("failed to read WAV samples from '{wav_path}': {e}"))?;

    // Already mono: hand the buffer back as-is.
    if channels == 1 {
        return Ok(interleaved);
    }

    // Stereo/multi-channel: average each frame's channels into one mono sample.
    let mono = interleaved
        .chunks(channels)
        .map(|frame| frame.iter().sum::<f32>() / channels as f32)
        .collect();

    Ok(mono)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::{Path, PathBuf};

    // ── push_segment: the transcript-joining contract ────────────────────
    // Pure string logic, extracted from the whisper segment loop precisely so
    // it can be pinned here without a model file.

    #[test]
    fn segments_join_with_single_spaces() {
        // Whisper emits segments with leading spaces; they must not double up.
        let mut t = String::new();
        push_segment(&mut t, " Hello,");
        push_segment(&mut t, " world.");
        assert_eq!(t, "Hello, world.");
    }

    #[test]
    fn first_segment_gets_no_leading_space() {
        let mut t = String::new();
        push_segment(&mut t, " only");
        assert_eq!(t, "only");
    }

    #[test]
    fn empty_and_whitespace_segments_are_skipped() {
        let mut t = String::new();
        push_segment(&mut t, "");
        push_segment(&mut t, "   ");
        assert_eq!(t, "", "blank segments must not seed the transcript");
        push_segment(&mut t, "start");
        push_segment(&mut t, "\t \n");
        push_segment(&mut t, "end");
        // The whitespace-only segment in the middle must not leave a double space.
        assert_eq!(t, "start end");
    }

    #[test]
    fn interior_whitespace_is_preserved() {
        // Only the segment EDGES are trimmed; internal spacing is whisper's.
        let mut t = String::new();
        push_segment(&mut t, "  double  spaced  ");
        assert_eq!(t, "double  spaced");
    }

    // ── load_wav_mono_f32: WAV → whisper input buffer ────────────────────
    // Exercised against real (tiny) WAV files written with hound into the OS
    // temp dir — file IO but no audio hardware, models, or network.

    /// Unique-per-test temp path so parallel tests never collide.
    fn temp_wav_path(tag: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "twinme_transcribe_test_{}_{tag}.wav",
            std::process::id()
        ))
    }

    /// Write an i16 PCM WAV (the format audio_capture produces) for a test.
    fn write_test_wav(path: &Path, channels: u16, sample_rate: u32, samples: &[i16]) {
        let spec = hound::WavSpec {
            channels,
            sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(path, spec).unwrap();
        for &s in samples {
            writer.write_sample(s).unwrap();
        }
        writer.finalize().unwrap();
    }

    #[test]
    fn wav_mono_16k_normalizes_i16_to_unit_range() {
        let path = temp_wav_path("mono_norm");
        write_test_wav(&path, 1, 16_000, &[0, 16_384, -16_384, i16::MAX, i16::MIN]);
        let samples = load_wav_mono_f32(path.to_str().unwrap()).unwrap();
        let _ = std::fs::remove_file(&path);

        // v / 32768.0 — the exact inverse of write_wav_16k_mono's scaling.
        // Note the asymmetry: i16::MAX maps just under 1.0, i16::MIN to -1.0.
        let expected = [0.0f32, 0.5, -0.5, 32_767.0 / 32_768.0, -1.0];
        assert_eq!(samples.len(), expected.len());
        for (i, (got, want)) in samples.iter().zip(expected.iter()).enumerate() {
            assert!((got - want).abs() < 1e-6, "sample {i}: got {got}, want {want}");
        }
    }

    #[test]
    fn wav_stereo_averages_to_mono() {
        let path = temp_wav_path("stereo_downmix");
        // Two interleaved L/R frames: (1000, 3000) and (-2000, 2000).
        write_test_wav(&path, 2, 16_000, &[1_000, 3_000, -2_000, 2_000]);
        let samples = load_wav_mono_f32(path.to_str().unwrap()).unwrap();
        let _ = std::fs::remove_file(&path);

        assert_eq!(samples.len(), 2, "one mono sample per stereo frame");
        assert!((samples[0] - 2_000.0 / 32_768.0).abs() < 1e-6); // avg(1000, 3000)
        assert!(samples[1].abs() < 1e-6); // avg(-2000, 2000) = 0
    }

    #[test]
    fn wav_wrong_sample_rate_is_rejected() {
        // Whisper does not resample; a non-16kHz WAV must fail loudly, naming
        // both the expected and the actual rate.
        let path = temp_wav_path("wrong_rate");
        write_test_wav(&path, 1, 44_100, &[0, 0, 0]);
        let err = load_wav_mono_f32(path.to_str().unwrap()).unwrap_err();
        let _ = std::fs::remove_file(&path);

        assert!(err.contains("16000"), "should name the required rate: {err}");
        assert!(err.contains("44100"), "should name the offending rate: {err}");
    }

    #[test]
    fn wav_missing_file_errors_with_path_context() {
        let path = temp_wav_path("does_not_exist");
        let _ = std::fs::remove_file(&path); // ensure absent
        let err = load_wav_mono_f32(path.to_str().unwrap()).unwrap_err();
        assert!(err.contains("failed to open"), "unexpected error: {err}");
    }
}
