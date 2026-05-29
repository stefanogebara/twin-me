# Icons

The TwinMe brand flower on an on-brand dark "squircle" with a soft amber glow.
Generated from `public/images/backgrounds/flower-hero.png`.

## Regenerate

```bash
python desktop/scripts/generate-icons.py
```

Requires Pillow. The script trims, centers, and composites the flower, then
emits every size below. Edit the brand tokens / ratios at the top of the
script to tweak the look, then re-run.

## Files

- `32x32.png` — menubar + tray icon (tray uses it in color; `iconAsTemplate: false`)
- `128x128.png` — app window icon
- `128x128@2x.png` (256×256) — Retina app window icon
- `icon.png` — generic 512×512 source
- `icon.ico` — Windows multi-size icon (16–256)
- `icon_master_1024.png` — 1024 master (preview / not bundled)

These names match the `bundle.icon` list + `trayIcon.iconPath` in
`tauri.conf.json`. Keep them in sync if you rename anything.
