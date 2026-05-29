#!/usr/bin/env python3
"""Regenerate TwinMe Desktop app icons from the brand flower mark.

Composes the translucent flower (public/images/backgrounds/flower-hero.png)
onto an on-brand dark "squircle" with a soft amber glow, then emits every
size Tauri needs (PNGs + multi-size .ico). Run from the repo root:

    python desktop/scripts/generate-icons.py

Requires Pillow (PIL). Reproducible — re-run any time the mark changes.
"""
import os
from PIL import Image, ImageDraw, ImageFilter

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(REPO_ROOT, "public", "images", "backgrounds", "flower-hero.png")
OUT_DIR = os.path.join(REPO_ROOT, "desktop", "src-tauri", "icons")
MASTER = 1024

# Brand tokens (from CLAUDE.md design system)
BG_DARK = (0x16, 0x14, 0x1E, 255)   # near --background #13121a, a touch lifted
GLOW = (0xC1, 0x7E, 0x2C, 130)      # --accent-amber, soft
RADIUS_RATIO = 0.2237               # Apple-ish squircle corner radius
FLOWER_RATIO = 0.76                 # flower fills 76% of the canvas


def build_master() -> Image.Image:
    flower = Image.open(SRC).convert("RGBA")
    # Trim transparent margins so the bloom is truly centered.
    bbox = flower.getbbox()
    if bbox:
        flower = flower.crop(bbox)

    radius = int(MASTER * RADIUS_RATIO)

    # Dark rounded-square base.
    base = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    ImageDraw.Draw(base).rounded_rectangle(
        [0, 0, MASTER - 1, MASTER - 1], radius=radius, fill=BG_DARK
    )

    # Soft amber glow behind the bloom.
    glow = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    gr = int(MASTER * 0.36)
    cx, cy = MASTER // 2, int(MASTER * 0.47)
    ImageDraw.Draw(glow).ellipse(
        [cx - gr, cy - gr, cx + gr, cy + gr], fill=GLOW
    )
    glow = glow.filter(ImageFilter.GaussianBlur(int(MASTER * 0.09)))
    base = Image.alpha_composite(base, glow)

    # Scale + center the flower.
    target = int(MASTER * FLOWER_RATIO)
    fw, fh = flower.size
    scale = target / max(fw, fh)
    nw, nh = max(1, int(fw * scale)), max(1, int(fh * scale))
    flower = flower.resize((nw, nh), Image.LANCZOS)
    base.alpha_composite(flower, ((MASTER - nw) // 2, (MASTER - nh) // 2))

    # Clip to the rounded-square so the dock/menu-bar corners are transparent.
    mask = Image.new("L", (MASTER, MASTER), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, MASTER - 1, MASTER - 1], radius=radius, fill=255
    )
    out = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    out.paste(base, (0, 0), mask)
    return out


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    master = build_master()

    png_sizes = {
        "icon.png": 512,
        "128x128@2x.png": 256,
        "128x128.png": 128,
        "32x32.png": 32,
    }
    for name, size in png_sizes.items():
        master.resize((size, size), Image.LANCZOS).save(os.path.join(OUT_DIR, name))
        print(f"  wrote {name} ({size}x{size})")

    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    master.resize((256, 256), Image.LANCZOS).save(
        os.path.join(OUT_DIR, "icon.ico"), format="ICO", sizes=ico_sizes
    )
    print(f"  wrote icon.ico ({', '.join(str(s[0]) for s in ico_sizes)})")

    # Keep a 1024 master next to the icons for previews / future regen.
    master.save(os.path.join(OUT_DIR, "icon_master_1024.png"))
    print("  wrote icon_master_1024.png (preview/master)")
    print("done.")


if __name__ == "__main__":
    main()
