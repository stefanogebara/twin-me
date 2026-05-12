#!/usr/bin/env bash
# Upscale + WebP-encode background images that get stretched to full-bleed.
# 2026-05-10: AI-generated JPGs at 1376×768 / 736×1500 look pixelated on
# retina displays. We:
#   1. Generate <name>.webp at original size  (smaller payload than JPG)
#   2. Generate <name>@2x.webp at 2× via lanczos resample (softens pixelation)
# CSS will reference these via image-set() so 2× displays get the 2× variant.
#
# Lanczos doesn't add real detail — it just interpolates smoothly. The real
# fix is regenerating these at native 2K+ from the source AI tool. This
# is the best we can do without re-running the artwork pipeline.

set -euo pipefail

FFMPEG="/c/Users/stefa/Downloads/ffmpeg-2025-01-20-git-504df09c34-full_build/ffmpeg-2025-01-20-git-504df09c34-full_build/bin/ffmpeg"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

upscale() {
  local src="$1"
  local base="${src%.*}"  # strip extension
  local original_w original_h
  # Read dimensions
  read original_w original_h < <(node -e "
    const fs = require('fs');
    const buf = fs.readFileSync('$src');
    function dim(b){
      if (b[0]===0x89 && b[1]===0x50) return [b.readUInt32BE(16), b.readUInt32BE(20)];
      if (b[0]===0xFF && b[1]===0xD8) {
        let i=2;
        while (i<b.length) {
          if (b[i]!==0xFF) return [0,0];
          const m=b[i+1], len=b.readUInt16BE(i+2);
          if (m>=0xC0 && m<=0xCF && m!==0xC4 && m!==0xC8 && m!==0xCC) return [b.readUInt16BE(i+7), b.readUInt16BE(i+5)];
          i+=2+len;
        }
      }
      return [0,0];
    }
    const [w,h]=dim(buf);
    console.log(w+' '+h);
  ")
  if [ "$original_w" -eq 0 ]; then
    echo "  ! Could not read dims for $src"
    return
  fi
  local x2_w=$(( original_w * 2 ))
  local x2_h=$(( original_h * 2 ))
  echo "  $(basename "$src")  ${original_w}x${original_h} → 1x.webp + ${x2_w}x${x2_h}@2x.webp"

  # 1x WebP (same dimensions, just better compression than JPG)
  "$FFMPEG" -hide_banner -loglevel error -y \
    -i "$src" \
    -c:v libwebp -quality 90 -compression_level 6 \
    "${base}.webp"

  # 2x WebP with lanczos upscale
  "$FFMPEG" -hide_banner -loglevel error -y \
    -i "$src" \
    -vf "scale=${x2_w}:${x2_h}:flags=lanczos" \
    -c:v libwebp -quality 88 -compression_level 6 \
    "${base}@2x.webp"
}

cd "$ROOT"

# Cosmic-v2: 6 full-bleed AI backgrounds at 1376×768
for f in public/images/cosmic-v2/*.jpg; do
  upscale "$f"
done

# Cosmic: the ones actually referenced in CosmicHero (4 of 12)
for f in \
  public/images/cosmic/aux-starry-clouds.jpg \
  public/images/cosmic/01-space-earth.jpg \
  public/images/cosmic/04-aurora.jpg; do
  upscale "$f"
done

# Sundust full-page backgrounds (1024×1024 PNGs)
for f in public/images/backgrounds/sundust-*.png; do
  upscale "$f"
done

# Flower hero — used as small avatar but also as 12-16px brand mark on retina
upscale public/images/backgrounds/flower-hero.png

echo ""
echo "Done. WebP files written next to originals."
