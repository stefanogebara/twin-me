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

Phase 1 (this scaffold) ships the wrapper. Future phases:

| Phase | What | Inspired by |
|---|---|---|
| **1 — Shell** ✅ scaffolded | Webview wrapping `twinme.me` + tray + hotkey + notifications | both |
| 2 — Clips index | Local SQLite + macOS Accessibility API hook + per-app exclude | jo |
| 3 — Meeting Notes | Mic capture + local Whisper + Note/Summary/Transcript views | Littlebird |
| 4 — Hummingbird widget | Floating compact window summoned by hotkey, three modes | Littlebird |
| 5 — Polish | Auto-update channels, onboarding wizard, "Here's what I picked up" reveal | both |

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
        ├── main.rs       # Windows console suppression + calls lib::run()
        └── lib.rs        # tray, hotkey, window-event handling
```

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
