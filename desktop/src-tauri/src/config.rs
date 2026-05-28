// TwinMe Desktop — Auth config (Phase 3a)
// ========================================
// Reads the TwinMe auth token the web app writes after login.
// Location: <config_dir>/twinme/auth.toml (e.g. ~/.config/twinme/auth.toml on
// Linux, ~/Library/Application Support/twinme/auth.toml on macOS,
// %APPDATA%\twinme\auth.toml on Windows). Phase 3a: a plain TOML file. Phase 3b
// will move to the OS keyring.
use std::path::PathBuf;

#[allow(dead_code)]
pub fn auth_path() -> Option<PathBuf> {
    dirs::config_dir().map(|d| d.join("twinme").join("auth.toml"))
}

#[allow(dead_code)]
pub fn load_auth() -> Option<String> {
    auth_path().and_then(|p| load_auth_from(&p))
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
