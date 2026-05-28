# TwinMe Desktop

> Phase 1 of the desktop roadmap inspired by Littlebird and jo (see `../research/competitor-analysis.md`).
>
> **Status:** scaffolding complete, needs Rust + first `cargo build` to verify locally.

A native macOS / Windows / Linux shell that wraps the TwinMe web app and adds:

- **System tray + menubar icon** — TwinMe stays running in the background.
- **Global hotkey `Cmd+Shift+T`** (Ctrl+Shift+T on Win/Linux) — summons the main window from anywhere.
- **Native notifications** — proxied from TwinMe's web push.
- **Window-to-tray minimize** — closing the window hides it; Quit is explicit via tray menu.

Built on **Tauri 2** (Rust shell + system webview). ~10 MB binary.

---

## Roadmap

| Phase | Status | What |
|---|---|---|
| **1 — Shell** | merged (PR #46) | Webview + tray + hotkey + notifications |
| **2 — Clips index** | merged (PR #47) | Local SQLite + 5s poll + per-app exclude — stub Accessibility |
| **3 — Real Accessibility + sync** | merged (PR #48) | macOS AXUIElement focused app/window, real HTTPS sync, tray Pause/Resume, backend endpoint |
| **4 — Cross-platform + content + keyring** | this PR | Windows + Linux(X11) active-window, macOS in-window content extraction, OS keyring, tray exclude controls |
| 5 — Meeting Notes | later | Mic + local Whisper + Note/Summary/Transcript views |
| 6 — Hummingbird | later | Floating compact summoned by hotkey |
| 7 — Polish | later | Auto-update, signed bundles, real icons, onboarding |

---

## Layout

```
desktop/
├── package.json          # @tauri-apps/cli wrapper
├── www/
│   └── index.html        # stub frontend (window URL is set to https://twinme.me directly).
│                         # Folder named "www" not "dist" so root .gitignore
│                         # doesn't filter it — Tauri needs frontendDist in CI.
└── src-tauri/
    ├── Cargo.toml
    ├── build.rs
    ├── tauri.conf.json   # window/tray/bundle config
    ├── capabilities/
    │   └── default.json  # permissions for tray, hotkeys, notifications, shell.open
    ├── icons/
    │   ├── 32x32.png
    │   ├── 128x128.png
    │   ├── 128x128@2x.png
    │   ├── icon.png
    │   └── README.md     # how to regenerate from a real source
    └── src/
        ├── main.rs           # Windows console suppression + calls lib::run()
        ├── lib.rs            # tray (incl. Pause/Resume), hotkey, window events + spawns loops
        ├── clips.rs          # SQLite clip store (schema + CRUD + app_settings pause flag)
        ├── config.rs         # reads JWT from <config_dir>/twinme/auth.toml
        ├── active_window.rs  # focused app/window — real macOS Accessibility, None stub elsewhere
        ├── clip_indexer.rs   # 5s poll loop, skips when paused, opens/closes clips on focus change
        └── sync.rs           # 2-min HTTPS sync to /api/observations/clip (bearer auth)
```

### Phase 2 — Clips index (merged, PR #47)

In:
- Local SQLite at the OS data dir (Mac: `~/Library/Application Support/TwinMe/clips.db`)
- 5s poll loop tracking foreground app + window title
- Per-app exclude table (no UI yet)
- 2-min sync loop scaffolded but stubbed (logs "would sync N clips")

### Phase 3 — Real Accessibility + sync (merged, PR #48)

In:
- **macOS Accessibility**: `active_window::current()` reads the focused app + window title via `AXUIElementCreateSystemWide` (`accessibility-sys` + `core-foundation`). Non-macOS still returns `None`.
- **Real HTTPS sync**: `sync.rs` POSTs unsynced clips to `/api/observations/clip` every 2 min with bearer auth, marks synced + dropped (rejects aren't retried forever), leaves them on network/5xx error.
- **Auth**: `config::load_auth()` reads the JWT from `<config_dir>/twinme/auth.toml` (written by the webview post-login). `TWINME_SYNC_ENDPOINT` env overrides the default for dev.
- **Tray Pause/Resume**: `app_settings` table persists a `paused` flag; the indexer skips polling while paused.
- **Backend**: `POST /api/observations/clip` persists each clip into `user_memories` (`memory_type='observation'`, `metadata.source='desktop_clip'`), returns `{ local_id → memory_id }`.

NOT in (Phase 4):
- Windows / Linux active-window detection (still `None`)
- Content extraction from *inside* the focused window (we only capture the title)
- Settings UI for the per-app exclude list
- Secure OS keyring storage (still a plain TOML file)
- Dynamic tray relabel ("Pause" ↔ "Resume" — currently static "Pause indexing")

To verify the loop on a Mac: run `npm run server:dev`, write a JWT to `~/.config/twinme/auth.toml` as `token = "<jwt>"`, `export TWINME_SYNC_ENDPOINT=http://127.0.0.1:3004/api/observations/clip`, then `cd desktop && npm run dev`. Grant Accessibility in System Settings, restart, and watch for `[sync] uploaded N clips` after ~2 min.

### Phase 4 — Cross-platform capture + content + keyring (this PR)

In:
- **Windows active-window**: `GetForegroundWindow` + `GetWindowTextW` (title) + `QueryFullProcessImageNameW` (owning exe → app name), via the `windows` crate.
- **Linux (X11) active-window**: `_NET_ACTIVE_WINDOW` → `_NET_WM_NAME` (title) + `WM_CLASS` (app), via `x11rb`. Wayland sessions and any X connect failure (incl. headless CI) yield `None`.
- **macOS in-window content**: `active_window::focused_content()` walks the focused window's AX tree (depth ≤ 8, ≤ 500 nodes, ≤ 8000 chars) collecting text; the indexer captures it once at clip-open via `clips::set_content`. Exclude list still gates capture.
- **OS keyring**: `config::load_auth()` reads the keyring first (macOS Keychain / Windows Credential Manager / Linux Secret Service via pure-Rust `linux-native`), falling back to the Phase 3 `auth.toml` and migrating it into the keyring on first read.
- **Tray exclude controls**: dynamic Pause ↔ Resume relabel (reflects persisted state at startup); "Exclude current app"; an "Excluded apps" submenu that live-updates as you add/re-include.

NOT in (Phase 5+):
- Wayland active-window (no portable protocol; returns `None`)
- In-window content extraction on Windows / Linux (title only there; macOS-only this phase)
- A bundled local settings window (the remote webview can't call Tauri IPC, so exclusion UI is native-tray)
- Automatic webview → keyring token write (the token is still placed manually / via the dev flow; keyring is the storage, the write-path bridge is a follow-up)

---

## Prerequisites

1. **Rust toolchain** — not yet installed on this dev machine. Install:

   - macOS / Linux:
     ```bash
     curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
     ```
   - Windows: download [rustup-init.exe](https://www.rust-lang.org/tools/install)

2. **Node 20+** (already installed: `v22.14.0`)

3. **Platform-specific Tauri deps** ([full list](https://tauri.app/start/prerequisites/)):

   - macOS: Xcode Command Line Tools (`xcode-select --install`)
   - Windows: Microsoft C++ Build Tools + WebView2 (preinstalled on Windows 11)
   - Linux:
     ```bash
     sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libgtk-3-dev
     ```

---

## Develop

From the repo root:

```bash
cd desktop
npm install
npm run dev
```

This compiles the Rust shell (slow first time, ~3-5 min; fast after — incremental) and opens TwinMe in a native window.

### What works right now (Phase 1)

- Window opens to `https://twinme.me` — full web app, including `/twin-soul`, `/talk-to-twin`, etc.
- System tray icon (left-click focuses, right-click shows menu).
- Tray menu: **Open TwinMe** (Cmd+Shift+T) · **Hide window** · **Quit**.
- Global hotkey `Cmd+Shift+T` (Ctrl+Shift+T on Win/Linux) summons + focuses.
- Closing the window hides it instead of quitting (Littlebird/jo pattern).
- Notification plugin loaded — ready for Phase 2 to wire push.

### What's intentionally NOT in Phase 1

- No Accessibility API polling (Phase 2).
- No mic capture (Phase 3).
- No floating Hummingbird widget (Phase 4).
- No auto-updater (Phase 5).

---

## Build for distribution

```bash
cd desktop
npm run build
```

Outputs:

- **macOS:** `src-tauri/target/release/bundle/dmg/*.dmg` and `*.app`
- **Windows:** `src-tauri/target/release/bundle/{msi,nsis}/*.msi` `.exe`
- **Linux:** `src-tauri/target/release/bundle/{deb,appimage}/*`

### Signing & notarization

For distribution outside the Mac App Store and outside SmartScreen warnings on Windows, the GitHub Actions workflow at `.github/workflows/desktop-build.yml` will sign + notarize when these repo secrets are set:

| Secret | Where to get it |
|---|---|
| `APPLE_CERTIFICATE` | base64 of your Developer ID Application `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | password for the `.p12` |
| `APPLE_SIGNING_IDENTITY` | `"Developer ID Application: <Name> (<TEAMID>)"` |
| `APPLE_ID` | Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | [appleid.apple.com](https://appleid.apple.com) → App-Specific Passwords |
| `APPLE_TEAM_ID` | 10-char team ID from Apple Developer portal |
| `TAURI_SIGNING_PRIVATE_KEY` | for the auto-updater (Phase 5) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | password for above |

Without these, the build still runs and produces unsigned artifacts — useful for local QA but will be blocked by Gatekeeper on macOS for end users.

Tag a release with `git tag desktop-v0.1.0 && git push --tags` to auto-attach binaries to a GitHub Release.

---

## Why Tauri 2 (vs Electron)?

| | Tauri 2 | Electron |
|---|---|---|
| Bundle size | ~10 MB | ~100 MB |
| Memory | Low (system webview) | Heavy (bundled Chromium) |
| Cross-platform | Mac + Win + Linux | All |
| OS API access | Excellent via Rust | Decent via Node |
| Polish ceiling | Very high | Moderate |

Both Littlebird and jo's small bundle sizes + polish suggest they use Tauri or native, not Electron.

---

## Next steps for whoever picks this up

1. Install Rust (`rustup-init`).
2. `cd desktop && npm install`.
3. `npm run dev` — first compile takes ~5 min. After that, hot-reload-ish.
4. Replace placeholder icons (`src-tauri/icons/`) with the TwinMe brand mark — run `npx @tauri-apps/cli icon assets/twinme-1024.png` once you have a source.
5. Test the hotkey across apps. If `Cmd+Shift+T` clashes with anything important, rebind in `src-tauri/src/lib.rs`.
6. Decide whether the dock icon should be hidden by default (LSUIElement on macOS) — typical for menubar-first apps.

Then start on Phase 2 (clip indexer).
