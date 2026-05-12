#!/usr/bin/env bash
# Real-ESRGAN super-resolution for full-bleed backgrounds — TARGET-DIMENSION
# aware. Previous pipeline (d9a3f7f7) downsampled to 2× source, which left
# cosmic/* portraits at 1472 wide — far short of the 2880 physical px needed
# for a 1440 CSS px viewport at DPR=2. This version aims at retina-coverage
# dimensions for each source category:
#
#   cosmic-v2/* (1376×768 landscape native, full-bleed chapter backgrounds)
#     → ESRGAN ×4 → 5504×3072 → downscale to 3840 wide (4K retina target)
#
#   cosmic/* (~736×~1500 portrait native, parallax hero + service tabs)
#     → ESRGAN ×4 → ~2944×~5900 → keep full output (no downscale)
#
# Larger files, but the user reported the previous pass still looked
# pixelated — and the math says they were right. 2× of a 736px source is
# 1472, then the browser stretches that to ~2880 physical, giving ~2×
# upscale in render. Now @2x.webp ships native-pixel-correct for a 1440px
# CSS viewport at DPR=2.

set -euo pipefail

ESRGAN="/tmp/realesrgan/realesrgan-ncnn-vulkan.exe"
FFMPEG="/c/Users/stefa/Downloads/ffmpeg-2025-01-20-git-504df09c34-full_build/ffmpeg-2025-01-20-git-504df09c34-full_build/bin/ffmpeg"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP=$(mktemp -d)

# Encode an already-upscaled ESRGAN PNG → @2x.webp at a SPECIFIC target width.
# Height auto-scales to preserve aspect.
esrgan_to_webp() {
  local src="$1"
  local target_w="$2"
  local out="${src%.*}@2x.webp"
  local base=$(basename "$src" | sed 's/\.[^.]*$//')
  local tmp_png="$TMP/${base}-x4.png"

  echo "  $(basename "$src")  -> ESRGAN-x4 -> WebP at ${target_w}w"

  # 1. ESRGAN ×4 with anime-tuned model
  "$ESRGAN" -i "$src" -o "$tmp_png" -s 4 -n realesrgan-x4plus-anime -f png 2>/dev/null

  # 2. Downscale (or pass-through) to target width
  "$FFMPEG" -hide_banner -loglevel error -y \
    -i "$tmp_png" \
    -vf "scale=${target_w}:-1:flags=lanczos" \
    -c:v libwebp -quality 90 -compression_level 6 \
    "$out"

  rm -f "$tmp_png"
}

cd "$ROOT"

# cosmic-v2 (1376×768) — target 4K width for 1920px CSS viewport coverage
for f in public/images/cosmic-v2/*.jpg; do
  esrgan_to_webp "$f" 3840
done

# cosmic (~736×~1500) — keep full 4× output ≈ 2944 wide
for f in \
  public/images/cosmic/aux-starry-clouds.jpg \
  public/images/cosmic/01-space-earth.jpg \
  public/images/cosmic/04-aurora.jpg \
  public/images/cosmic/02-nebula.jpg \
  public/images/cosmic/07-ocean-birds.jpg \
  public/images/cosmic/aux-forest-cranes.jpg; do
  esrgan_to_webp "$f" 2944
done

rmdir "$TMP" 2>/dev/null || true

echo ""
echo "Done. @2x.webp dimensions:"
for f in public/images/cosmic-v2/*@2x.webp public/images/cosmic/*@2x.webp; do
  dim=$("$FFMPEG" -hide_banner -loglevel error -i "$f" 2>&1 | grep -oE '[0-9]+x[0-9]+' | head -1)
  kb=$(( $(wc -c < "$f") / 1024 ))
  printf "  %-50s %-12s %dKB\n" "${f#public/images/}" "$dim" "$kb"
done
