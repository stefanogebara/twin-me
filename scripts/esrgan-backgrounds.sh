#!/usr/bin/env bash
# Replace the lanczos-only @2x.webp variants with REAL super-resolution using
# Real-ESRGAN-x4plus-anime (trained on painterly/anime art — perfect for the
# Ghibli-style AI backgrounds).
#
# Pipeline per source:
#   1. realesrgan-ncnn-vulkan ×4  → temporary PNG with actual generated detail
#   2. ffmpeg lanczos downscale     → 2× WebP at exact retina target size
#
# Why ×4 then downscale: ESRGAN's training is optimized for ×4. Downsampling
# from 4× to 2× via lanczos preserves detail better than ESRGAN ×2 directly.
#
# Net: lanczos-only @2x.webp = smooth blur over pixelated upscale.
#      ESRGAN @2x.webp = actual detail synthesized by a neural net.

set -euo pipefail

ESRGAN="/tmp/realesrgan/realesrgan-ncnn-vulkan.exe"
FFMPEG="/c/Users/stefa/Downloads/ffmpeg-2025-01-20-git-504df09c34-full_build/ffmpeg-2025-01-20-git-504df09c34-full_build/bin/ffmpeg"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP=$(mktemp -d)

esrgan_to_2x_webp() {
  local src="$1"
  local out_2x="${src%.*}@2x.webp"
  local base=$(basename "$src" | sed 's/\.[^.]*$//')
  local tmp_png="$TMP/${base}-x4.png"

  # Read source dims for the downscale target (× 2)
  read sw sh < <(node -e "
    const buf = require('fs').readFileSync('$src');
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
  local tw=$(( sw * 2 ))
  local th=$(( sh * 2 ))

  echo "  $(basename "$src")  ${sw}x${sh} -> ESRGAN-x4 -> downscale ${tw}x${th} -> .webp"

  # 1. ESRGAN ×4 with anime-tuned model
  "$ESRGAN" -i "$src" -o "$tmp_png" -s 4 -n realesrgan-x4plus-anime -f png 2>/dev/null

  # 2. Downscale to retina target + WebP encode
  "$FFMPEG" -hide_banner -loglevel error -y \
    -i "$tmp_png" \
    -vf "scale=${tw}:${th}:flags=lanczos" \
    -c:v libwebp -quality 92 -compression_level 6 \
    "$out_2x"

  rm -f "$tmp_png"
}

cd "$ROOT"

# All cosmic-v2 (1376×768)
for f in public/images/cosmic-v2/*.jpg; do
  esrgan_to_2x_webp "$f"
done

# The cosmic/ files actually referenced in code
for f in \
  public/images/cosmic/aux-starry-clouds.jpg \
  public/images/cosmic/01-space-earth.jpg \
  public/images/cosmic/04-aurora.jpg \
  public/images/cosmic/02-nebula.jpg \
  public/images/cosmic/07-ocean-birds.jpg \
  public/images/cosmic/aux-forest-cranes.jpg; do
  esrgan_to_2x_webp "$f"
done

rmdir "$TMP" 2>/dev/null || true

echo ""
echo "Done. Real-ESRGAN @2x.webp variants regenerated next to originals."
