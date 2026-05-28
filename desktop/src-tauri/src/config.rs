// TwinMe Desktop — Auth config (Phase 4)
// ========================================
// Reads the TwinMe auth token the web app writes after login.
//
// Source of truth is the OS keyring (macOS Keychain / Windows Credential
// Manager / Linux Secret Service). Phase 3 wrote a plaintext TOML file at
// <config_dir>/twinme/auth.toml (e.g. ~/.config/twinme/auth.toml on Linux,
// ~/Library/Application Support/twinme/auth.toml on macOS,
// %APPDATA%\twinme\auth.toml on Windows). That file is now only a legacy
// fallback + one-time migration source: load_auth() reads the keyring first,
// and if the token is only found in the TOML it copies it into the keyring so
// future reads use the secure store.
use std::path::PathBuf;

const KEYRING_SERVICE: &str = "twinme-desktop";
const KEYRING_USER: &str = "auth-token";

#[allow(dead_code)]
pub fn auth_path() -> Option<PathBuf> {
    dirs::config_dir().map(|d| d.join("twinme").join("auth.toml"))
}

/// Store the JWT in the OS keyring. Returns Err(reason) on failure.
#[allow(dead_code)]
pub fn store_auth(token: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())?;
    entry.set_password(token).map_err(|e| e.to_string())
}

/// Read the JWT. Order: (1) OS keyring; (2) legacy TOML file — and if found
/// there, migrate it into the keyring (best-effort) so future reads use the
/// secure store. Returns None if neither has a non-empty token.
pub fn load_auth() -> Option<String> {
    // 1. Keyring (source of truth).
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER) {
        if let Ok(token) = entry.get_password() {
            let t = token.trim();
            if !t.is_empty() {
                return Some(t.to_string());
            }
        }
        // NoEntry / any error → fall through to the legacy TOML file.
    }
    // 2. Legacy TOML fallback + one-time migration into the keyring.
    let token = auth_path().and_then(|p| load_auth_from(&p))?;
    let _ = store_auth(&token); // best-effort migration; ignore failure
    Some(token)
}

pub fn load_auth_from(path: &std::path::Path) -> Option<String> {
    let contents = std::fs::read_to_string(path).ok()?;
    let value: toml::Value = toml::from_str(&contents).ok()?;
    let token = value.get("token")?.as_str()?.trim();
    if token.is_empty() {
        None
    } else {
        Some(token.to_string())
    }
}

#[cfg(test)]
mod tests {
    // NOTE: we deliberately only unit-test the TOML-fallback parser
    // (load_auth_from). store_auth / load_auth's keyring path hit the OS
    // credential store (Keychain / Credential Manager / Secret Service), which
    // is unavailable on the headless Linux CI runner — calling keyring::Entry
    // there would fail. Keyring behaviour is covered by manual/integration
    // testing on real desktops instead.
    use super::*;

    #[test]
    fn returns_none_when_missing() {
        let path = std::env::temp_dir().join("twinme-test-missing.toml");
        let _ = std::fs::remove_file(&path);
        assert!(load_auth_from(&path).is_none());
    }

    #[test]
    fn parses_valid_toml() {
        let path = std::env::temp_dir().join("twinme-test-valid.toml");
        std::fs::write(&path, "token = \"abc123\"\n").unwrap();
        assert_eq!(load_auth_from(&path).unwrap(), "abc123");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn rejects_empty_token() {
        let path = std::env::temp_dir().join("twinme-test-empty.toml");
        std::fs::write(&path, "token = \"\"\n").unwrap();
        assert!(load_auth_from(&path).is_none());
        let _ = std::fs::remove_file(&path);
    }
}
