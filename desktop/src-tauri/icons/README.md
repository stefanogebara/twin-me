# Icons

Placeholder icons — solid amber `#C17E2C` squares. **Replace before shipping v0.1.**

To regenerate from a single 1024×1024 source PNG:

```bash
npx @tauri-apps/cli icon assets/twinme-logo-1024.png
```

This generates every size + `.icns` (macOS) + `.ico` (Windows) automatically. Drop them back into this folder.

Current files:
- `32x32.png` — menubar + tray icon
- `128x128.png` — app window icon
- `128x128@2x.png` (256×256) — Retina app window icon
- `icon.png` — generic 512×512 source
