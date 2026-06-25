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

use std::sync::atomic::{AtomicBool, Ordering};
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

/// Record the default input device into a 16kHz mono buffer until `stop` is set
/// (the meeting ended) OR `max_secs` elapses (a safety cap on very long
/// meetings). Mirrors `record_to_wav`'s capture path — native-rate mono in the
/// data callback, then one linear resample to 16kHz — but returns the samples
/// instead of writing a WAV, and runs for a stop-flagged (unbounded) duration.
///
/// Deliberately self-contained rather than refactoring `record_to_wav`: this is
/// untestable-in-CI native code, so keeping the proven fixed-duration path
/// byte-for-byte and duplicating the (simple) capture setup is the safer trade.
///
/// Like `record_to_wav` it owns a `!Send` cpal `Stream`, so the caller must run
/// it on a blocking thread (spawn_blocking) and never hold it across an `.await`.
/// `stop` is the only cross-thread channel — the meeting recorder sets it from
/// the indexer when the session ends.
#[allow(dead_code)] // wired into the meeting recorder in the next 5B unit
pub fn record_until_stopped(stop: &AtomicBool, max_secs: u32) -> Result<Vec<f32>, String> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "no input device available".to_string())?;
    let supported = device
        .default_input_config()
        .map_err(|e| format!("failed to get default input config: {e}"))?;
    let sample_format = supported.sample_format();
    let channels = supported.channels().max(1) as usize;
    let src_rate = supported.sample_rate().0;
    let config: cpal::StreamConfig = supported.into();

    let captured: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let err_fn = |err: cpal::StreamError| {
        eprintln!("[audio_capture] stream error: {err}");
    };

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
        other => return Err(format!("unsupported sample format: {other:?}")),
    }
    .map_err(|e| format!("failed to build input stream: {e}"))?;

    stream
        .play()
        .map_err(|e| format!("failed to start input stream: {e}"))?;

    // Poll the stop flag (and the safety cap) on a coarse interval. 200ms keeps
    // stop latency low without busy-spinning; audio accumulates on cpal's own
    // thread regardless of this loop's cadence. 5 ticks/sec * max_secs = the cap.
    let max_ticks = (max_secs as u64).saturating_mul(5);
    let mut ticks: u64 = 0;
    while !stop.load(Ordering::Relaxed) && ticks < max_ticks {
        std::thread::sleep(Duration::from_millis(200));
        ticks += 1;
    }
    drop(stream);

    let mono = {
        let guard = captured
            .lock()
            .map_err(|_| "capture buffer lock poisoned".to_string())?;
        guard.clone()
    };
    if mono.is_empty() {
        return Err("no audio captured (is a microphone connected and permitted?)".to_string());
    }

    Ok(resample_linear(&mono, src_rate, TARGET_SAMPLE_RATE))
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

/// Capture the SYSTEM'S OUTPUT (what the speakers/headphones are playing — the
/// other side of a meeting) until `stop` is set or `max_secs` elapses, returned
/// as 16kHz mono f32 like the mic path (Phase 5B.3).
///
/// Windows: WASAPI loopback. Loopback mode has no explicit flag in the wasapi
/// crate — it's inferred from opening the default RENDER device and then
/// initializing the client with `Direction::Capture` in shared mode (the crate
/// maps that mismatch to AUDCLNT_STREAMFLAGS_LOOPBACK; exclusive+loopback is a
/// hard error upstream). We request f32 stereo 44.1kHz with `autoconvert: true`
/// (engine-side conversion), downmix to mono, then reuse `resample_linear` —
/// the same proven tail as the mic path.
///
/// Key loopback gotcha: the capture event only fires while the engine is
/// rendering. With nothing playing there are no events at all, so an event
/// timeout means "silence right now", NOT an error — we keep polling the stop
/// flag instead of breaking (unlike the upstream record example, which is a
/// fixed-duration recorder and treats timeout as fatal).
#[cfg(target_os = "windows")]
pub fn record_system_until_stopped(stop: &AtomicBool, max_secs: u32) -> Result<Vec<f32>, String> {
    use std::collections::VecDeque;
    use wasapi::{initialize_mta, DeviceEnumerator, Direction, SampleType, StreamMode, WaveFormat};

    // Per-thread COM init (MTA). Belt-and-suspenders: joining an existing
    // process MTA is fine; if this thread were somehow STA the device
    // enumerator below would fail loudly with a real error.
    let _ = initialize_mta();

    let enumerator =
        DeviceEnumerator::new().map_err(|e| format!("loopback: device enumerator: {e}"))?;
    let device = enumerator
        .get_default_device(&Direction::Render)
        .map_err(|e| format!("loopback: no default render device: {e}"))?;
    let mut audio_client = device
        .get_iaudioclient()
        .map_err(|e| format!("loopback: get_iaudioclient: {e}"))?;

    // Same conservative format as the crate's record example: f32 stereo
    // 44.1kHz with autoconvert, so the engine hands us exactly this regardless
    // of the device's mix format.
    const SRC_RATE: usize = 44_100;
    const CHANNELS: usize = 2;
    let desired_format = WaveFormat::new(32, 32, &SampleType::Float, SRC_RATE, CHANNELS, None);
    let blockalign = desired_format.get_blockalign() as usize; // bytes per frame (8: 2ch x f32)

    let (_def_time, min_time) = audio_client
        .get_device_period()
        .map_err(|e| format!("loopback: get_device_period: {e}"))?;
    let mode = StreamMode::EventsShared {
        autoconvert: true,
        buffer_duration_hns: min_time,
    };
    audio_client
        .initialize_client(&desired_format, &Direction::Capture, &mode)
        .map_err(|e| format!("loopback: initialize_client: {e}"))?;
    let h_event = audio_client
        .set_get_eventhandle()
        .map_err(|e| format!("loopback: set_get_eventhandle: {e}"))?;
    let capture_client = audio_client
        .get_audiocaptureclient()
        .map_err(|e| format!("loopback: get_audiocaptureclient: {e}"))?;
    audio_client
        .start_stream()
        .map_err(|e| format!("loopback: start_stream: {e}"))?;

    let mut byte_queue: VecDeque<u8> = VecDeque::new();
    let mut mono: Vec<f32> = Vec::new();
    let started = std::time::Instant::now();
    let max = Duration::from_secs(max_secs as u64);

    while !stop.load(Ordering::Relaxed) && started.elapsed() < max {
        // Drain all pending packets FIRST, then wait — the upstream examples'
        // proven loop order.
        if let Err(e) = capture_client.read_from_device_to_deque(&mut byte_queue) {
            eprintln!("[audio_capture] loopback read error (continuing): {e}");
        }
        // Decode whole frames: blockalign bytes = CHANNELS interleaved LE f32s.
        while byte_queue.len() >= blockalign {
            let mut sum = 0.0f32;
            for _ in 0..CHANNELS {
                let mut b = [0u8; 4];
                for byte in b.iter_mut() {
                    // Queue length was checked against blockalign above.
                    *byte = byte_queue.pop_front().unwrap_or(0);
                }
                sum += f32::from_le_bytes(b);
            }
            mono.push(sum / CHANNELS as f32);
        }
        // 500ms timeout keeps stop latency low through silent stretches.
        let _ = h_event.wait_for_event(500);
    }
    let _ = audio_client.stop_stream();

    // Empty is legitimate here (nothing played the whole meeting) — the mixed
    // recorder treats it as "mic only", unlike the mic path where empty means
    // a broken/unpermitted microphone.
    Ok(resample_linear(&mono, SRC_RATE as u32, TARGET_SAMPLE_RATE))
}

/// Linux: PulseAudio/PipeWire expose every output's monitor as a normal input
/// device ("Monitor of ..."), so system audio is just a cpal capture of that
/// device. If no monitor source is visible (bare ALSA without Pulse/PipeWire),
/// we return Err and the mixed recorder degrades to mic-only.
#[cfg(target_os = "linux")]
pub fn record_system_until_stopped(stop: &AtomicBool, max_secs: u32) -> Result<Vec<f32>, String> {
    let host = cpal::default_host();
    let monitor = host
        .input_devices()
        .map_err(|e| format!("loopback: enumerate input devices: {e}"))?
        .find(|d| {
            d.name()
                .map(|n| n.to_lowercase().contains("monitor"))
                .unwrap_or(false)
        })
        .ok_or_else(|| "loopback: no monitor (system-audio) input device found".to_string())?;
    record_cpal_device_until_stopped(&monitor, stop, max_secs)
}

/// macOS system audio needs ScreenCaptureKit bindings — its own follow-up
/// unit. Until then the mixed recorder degrades to mic-only on Mac.
#[cfg(target_os = "macos")]
pub fn record_system_until_stopped(_stop: &AtomicBool, _max_secs: u32) -> Result<Vec<f32>, String> {
    Err("loopback: system-audio capture not yet supported on macOS (ScreenCaptureKit follow-up)".to_string())
}

/// cpal capture of a SPECIFIC input device until stopped — the Linux monitor
/// path. Same body shape as `record_until_stopped`, which deliberately stays
/// untouched (proven, hardware-only-testable code; see its doc comment) — this
/// variant only differs in taking the device instead of using the default.
#[cfg(target_os = "linux")]
fn record_cpal_device_until_stopped(
    device: &cpal::Device,
    stop: &AtomicBool,
    max_secs: u32,
) -> Result<Vec<f32>, String> {
    let supported = device
        .default_input_config()
        .map_err(|e| format!("failed to get input config: {e}"))?;
    let sample_format = supported.sample_format();
    let channels = supported.channels().max(1) as usize;
    let src_rate = supported.sample_rate().0;
    let config: cpal::StreamConfig = supported.into();

    let captured: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let err_fn = |err: cpal::StreamError| {
        eprintln!("[audio_capture] stream error: {err}");
    };

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
        other => return Err(format!("unsupported sample format: {other:?}")),
    }
    .map_err(|e| format!("failed to build input stream: {e}"))?;

    stream
        .play()
        .map_err(|e| format!("failed to start input stream: {e}"))?;

    let max_ticks = (max_secs as u64).saturating_mul(5);
    let mut ticks: u64 = 0;
    while !stop.load(Ordering::Relaxed) && ticks < max_ticks {
        std::thread::sleep(Duration::from_millis(200));
        ticks += 1;
    }
    drop(stream);

    let mono = {
        let guard = captured
            .lock()
            .map_err(|_| "capture buffer lock poisoned".to_string())?;
        guard.clone()
    };
    Ok(resample_linear(&mono, src_rate, TARGET_SAMPLE_RATE))
}

/// Record mic AND system audio simultaneously until `stop` is set, returning
/// one mixed 16kHz mono track (Phases 5B.3 + 5B.4). The system stream runs on
/// its own thread (each capture owns a `!Send` audio handle); the mic runs on
/// the calling (blocking) thread — same threading contract as
/// `record_until_stopped`.
///
/// Degradation ladder — a missing loopback device must never cost the meeting:
///   mic ok + system audio    -> mixed
///   mic ok + system empty/err-> mic only (full gain, not halved)
///   mic err + system audio   -> system only (the other side is still notes)
///   both fail                -> the mic error
pub fn record_until_stopped_mixed(stop: Arc<AtomicBool>, max_secs: u32) -> Result<Vec<f32>, String> {
    let sys_stop = Arc::clone(&stop);
    let sys_handle = std::thread::Builder::new()
        .name("twinme-system-audio".to_string())
        .spawn(move || record_system_until_stopped(&sys_stop, max_secs))
        .map_err(|e| format!("failed to spawn system-audio thread: {e}"))?;

    let mic = record_until_stopped(&stop, max_secs);

    // Join AFTER mic capture finishes — both watch the same stop flag, so this
    // does not extend the recording window; it only collects the result.
    let system = match sys_handle.join() {
        Ok(Ok(samples)) => samples,
        Ok(Err(e)) => {
            eprintln!("[audio_capture] system loopback unavailable ({e}); continuing with mic only");
            Vec::new()
        }
        Err(_) => {
            eprintln!("[audio_capture] system-audio thread panicked; continuing with mic only");
            Vec::new()
        }
    };

    match (mic, system) {
        (Ok(m), s) if s.is_empty() => Ok(m),
        (Ok(m), s) if m.is_empty() => Ok(s),
        (Ok(m), s) => Ok(mix_streams(&m, &s)),
        (Err(mic_err), s) if !s.is_empty() => {
            eprintln!("[audio_capture] mic capture failed ({mic_err}); using system audio only");
            Ok(s)
        }
        (Err(mic_err), _) => Err(mic_err),
    }
}

/// Mix two mono f32 streams — already resampled to the same 16kHz rate — into a
/// single mono track (Phase 5B.4). The mic and system-loopback streams run on
/// independent clocks and either may be shorter (or silent, when nothing is
/// playing), so we mix over the overlap and append the tail of the longer one.
///
/// Each input is summed at 0.5 gain to leave headroom for two simultaneous
/// speakers, then soft-clamped to [-1.0, 1.0] — the same range `write_wav_16k_mono`
/// and `transcribe_samples` expect. Pure and hardware-free, so it's unit-tested
/// directly (the cpal/WASAPI capture paths are exercised on real hardware).
pub fn mix_streams(a: &[f32], b: &[f32]) -> Vec<f32> {
    let n = a.len().max(b.len());
    let mut out = Vec::with_capacity(n);
    for i in 0..n {
        let x = a.get(i).copied().unwrap_or(0.0);
        let y = b.get(i).copied().unwrap_or(0.0);
        out.push(((x + y) * 0.5).clamp(-1.0, 1.0));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mix_equal_length_averages_samples() {
        let a = vec![1.0, -1.0, 0.5];
        let b = vec![1.0, 1.0, 0.5];
        // (x + y) * 0.5: (2)*.5=1 clamped, (0)*.5=0, (1)*.5=0.5
        assert_eq!(mix_streams(&a, &b), vec![1.0, 0.0, 0.5]);
    }

    #[test]
    fn mix_unequal_length_keeps_tail_of_longer() {
        let a = vec![0.4, 0.4];
        let b = vec![0.4, 0.4, 0.8, 0.8];
        let out = mix_streams(&a, &b);
        assert_eq!(out.len(), 4);
        // overlap mixed at 0.5 gain; tail is b alone at 0.5 gain.
        assert!((out[0] - 0.4).abs() < 1e-6);
        assert!((out[2] - 0.4).abs() < 1e-6); // (0 + 0.8)*0.5
    }

    #[test]
    fn mix_with_silent_stream_is_other_at_half_gain() {
        let a = vec![1.0, 0.6, 0.2];
        let silent = vec![0.0, 0.0, 0.0];
        assert_eq!(mix_streams(&a, &silent), vec![0.5, 0.3, 0.1]);
    }

    #[test]
    fn mix_clamps_when_both_loud() {
        // Two near-full-scale signals: (1.9 + 1.9)*0.5 = 1.9 -> clamped to 1.0.
        let out = mix_streams(&[1.9], &[1.9]);
        assert_eq!(out, vec![1.0]);
    }

    #[test]
    fn mix_empty_inputs() {
        assert!(mix_streams(&[], &[]).is_empty());
        assert_eq!(mix_streams(&[], &[0.3, 0.3]), vec![0.15, 0.15]);
    }

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
