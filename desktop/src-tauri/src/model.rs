// TwinMe Desktop — Whisper model management (Phase 5B).
// =========================================================================
// Downloads the ggml multilingual `base` model (~141MB, handles English +
// Portuguese — the user is bilingual pt-BR/en) once into
// <data_dir>/TwinMe/models/ and locates it for the transcriber. We use the
// multilingual `base` (NOT `base.en`) so meeting notes in either language
// transcribe correctly.
//
// The base dir matches clips.rs (dirs::data_dir() -> TwinMe/) so the model
// sits alongside clips.db's parent, surviving app updates.
//
// The download is a one-time runtime fetch; CI only compiles this module
// (no network/model file in CI), so the download path is NOT unit-tested —
// only the pure path/size logic is. transcribe::transcribe_wav takes the
// model path as &str, and PathBuf converts cleanly (to_string_lossy / AsRef).
use std::path::PathBuf;

// Canonical ggml Whisper models live on Hugging Face. ggerganov/whisper.cpp is
// the original author repo; verified to resolve (302 -> CDN -> 200,
// Content-Length 147,951,465 = ~141MiB) for the multilingual base model.
const MODEL_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin";
const MODEL_FILENAME: &str = "ggml-base.bin";
// Reject a truncated/corrupt download. The real file is ~141MB; anything
// under ~100MB is incomplete.
const MIN_VALID_BYTES: u64 = 100 * 1024 * 1024;

/// Directory that holds downloaded models: <data_dir>/TwinMe/models/.
/// Mirrors clips.rs's `dirs::data_dir().join("TwinMe")` base so models sit
/// beside clips.db's parent.
pub fn models_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join("TwinMe").join("models"))
}

/// Absolute path to the ggml base model file (whether or not it exists yet).
pub fn model_path() -> Option<PathBuf> {
    models_dir().map(|d| d.join(MODEL_FILENAME))
}

/// Pure size check, unit-testable without touching disk/network. A complete
/// model is ~141MB, so anything below the floor is a truncated download.
fn is_valid_size(bytes: u64) -> bool {
    bytes >= MIN_VALID_BYTES
}

/// True if a complete-looking model is already on disk. A file that exists but
/// is too small (a half-written download) counts as absent so `ensure_model`
/// re-fetches it.
pub fn is_present() -> bool {
    model_path()
        .and_then(|p| std::fs::metadata(p).ok())
        .map(|m| is_valid_size(m.len()))
        .unwrap_or(false)
}

/// Ensure the model exists locally, downloading it if missing/incomplete.
/// Returns the path on success. Best-effort atomic: download to a `.part` temp
/// then rename, so a crashed download never leaves a half file that passes
/// `is_present()`.
///
/// One-time ~141MB in-memory fetch (no streaming feature needed — keeps the
/// reqwest dep minimal). Wired into the transcribe pipeline in a later 5B unit.
#[allow(dead_code)] // wired into the capture -> transcribe pipeline in 5B.5
pub async fn ensure_model() -> Result<PathBuf, String> {
    let path = model_path().ok_or("no data dir")?;
    if is_present() {
        return Ok(path);
    }
    let dir = models_dir().ok_or("no data dir")?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600)) // big file
        .build()
        .map_err(|e| e.to_string())?;
    let bytes = client
        .get(MODEL_URL)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    if !is_valid_size(bytes.len() as u64) {
        return Err(format!("downloaded model too small: {} bytes", bytes.len()));
    }

    // Atomic publish: write to <model>.part then rename into place. A rename on
    // the same filesystem is atomic, so readers see either no file or the
    // complete file — never a partial one.
    let tmp = path.with_extension("part");
    std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Guards on `if let Some` so it never panics in a sandbox where
    // dirs::data_dir() returns None — pure path logic, no network/FS state.
    #[test]
    fn model_path_under_twinme_models() {
        if let Some(p) = model_path() {
            let s = p.to_string_lossy();
            assert!(s.contains("TwinMe"));
            assert!(s.ends_with("ggml-base.bin"));
        }
    }

    // Pure boundary check on the size validator — no disk, no network.
    #[test]
    fn size_validation_rejects_truncated() {
        assert!(!is_valid_size(0));
        assert!(!is_valid_size(50 * 1024 * 1024)); // 50MB partial
        assert!(is_valid_size(141 * 1024 * 1024)); // full
    }
}
