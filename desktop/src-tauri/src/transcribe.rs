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
        let text = text.trim();
        if text.is_empty() {
            continue;
        }
        if !transcript.is_empty() {
            transcript.push(' ');
        }
        transcript.push_str(text);
    }

    Ok(transcript)
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
