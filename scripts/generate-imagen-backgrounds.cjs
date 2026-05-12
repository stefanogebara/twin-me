/* eslint-disable */
// Generate 11 Ghibli-style background replacements via Imagen 4 (Gemini API).
// The old sources were flat AI cartoons with no high-frequency detail — that's
// what was reading as "pixelated low quality" no matter how much we upscaled.
// Imagen 4 outputs painterly images with real texture & visible brushwork.
//
// Output: writes JPGs to public/images/{cosmic,cosmic-v2}/ replacing originals.
// Aspect ratios match the layout expectations:
//   cosmic-v2/*  → 16:9 → 1408×768 native
//   cosmic/*     → 9:16 → 768×1408 native
// After this, run scripts/esrgan-backgrounds.sh to upscale to retina dims.

require('dotenv').config({ path: 'C:/Users/stefa/twin-ai-learn/.env' });
const fs = require('fs');
const https = require('https');
const path = require('path');

const KEY = process.env.GOOGLE_AI_API_KEY;
if (!KEY) { console.error('GOOGLE_AI_API_KEY unset'); process.exit(1); }

const STYLE = `Cinematic Studio Ghibli inspired painted illustration with rich painterly brushwork. ` +
  `Visible watercolor texture and brushstrokes throughout, NO flat color regions, NO vector look. ` +
  `Hand-painted Miyazaki film background style — Howl's Moving Castle skies, Princess Mononoke landscapes, ` +
  `Spirited Away countryside. Warm amber, copper, deep teal, dusty pink palette on deep navy/indigo underbase. ` +
  `Atmospheric haze and depth, soft glow, scattered detail. Ultra-detailed, every region has visual interest.`;

const PROMPTS = [
  // ── cosmic-v2 landscapes (16:9) ──
  {
    out: 'public/images/cosmic-v2/section6-landscape.jpg',
    aspect: '16:9',
    prompt: STYLE + ' Vast painted landscape at golden hour. Rolling teal-blue hills receding into atmospheric haze, ' +
      'a meandering amber river catching the sunset, distant snow-capped mountains, ethereal clouds with warm pink-orange undersides.'
  },
  {
    out: 'public/images/cosmic-v2/section8-meadow.jpg',
    aspect: '16:9',
    prompt: STYLE + ' Golden meadow with a winding footpath at sunset. Tall grass catching golden hour light, ' +
      'wildflowers, distant tree line, warm amber sky with painted clouds, soft cinematic atmosphere.'
  },
  {
    out: 'public/images/cosmic-v2/section11-twin-meeting.jpg',
    aspect: '16:9',
    prompt: STYLE + ' Two silhouetted figures meeting on a hilltop at sunset, painterly emotional payoff scene. ' +
      'Sweeping landscape behind them, warm amber sky with dramatic painted clouds, atmospheric haze.'
  },
  {
    out: 'public/images/cosmic-v2/stage3-arrival.jpg',
    aspect: '16:9',
    prompt: STYLE + ' Soft pink-amber dusk sky filling the frame with painted ethereal clouds. ' +
      'Cosmic feel with scattered stars beginning to show through, subtle atmospheric gradient from teal at the bottom to dusty pink at top.'
  },
  {
    out: 'public/images/cosmic-v2/stage5-horizon.jpg',
    aspect: '16:9',
    prompt: STYLE + ' Earth horizon viewed from above the atmosphere. Curved planet edge with soft amber atmospheric glow, ' +
      'wispy clouds catching golden light, deep navy starfield above, painterly illustration not photographic.'
  },

  // ── cosmic portraits (9:16) ──
  {
    out: 'public/images/cosmic/aux-starry-clouds.jpg',
    aspect: '9:16',
    prompt: STYLE + ' Tall vertical composition. Starry night sky with painted pink-amber clouds drifting through. ' +
      'Scattered golden stars of varying sizes, atmospheric depth, deep navy gradient background, warm clouds catching moonlight.'
  },
  {
    out: 'public/images/cosmic/01-space-earth.jpg',
    aspect: '9:16',
    prompt: STYLE + ' Tall vertical composition. Earth viewed from space, painted illustration. ' +
      'Soft pink and gold atmospheric haze around the planet, swirling clouds with real visible texture, deep cosmic background with stars.'
  },
  {
    out: 'public/images/cosmic/04-aurora.jpg',
    aspect: '9:16',
    prompt: STYLE + ' Tall vertical composition. Aurora borealis painted in soft purple, pink, and amber waves across a starry night sky. ' +
      'Translucent flowing curtains of light with painterly texture, dark silhouetted mountains at the bottom, scattered stars.'
  },
  {
    out: 'public/images/cosmic/02-nebula.jpg',
    aspect: '9:16',
    prompt: STYLE + ' Tall vertical composition. Deep space nebula with painted pink, gold, and dusty purple dust clouds. ' +
      'Watercolor texture, bright stars scattered throughout, atmospheric depth, no flat regions.'
  },
  {
    out: 'public/images/cosmic/07-ocean-birds.jpg',
    aspect: '9:16',
    prompt: STYLE + ' Tall vertical composition. Calm ocean at golden hour with a flock of birds flying over the horizon. ' +
      'Painted water reflections catching warm light, distant cloud bank lit pink-amber, atmospheric haze, painterly detail.'
  },
  {
    out: 'public/images/cosmic/aux-forest-cranes.jpg',
    aspect: '9:16',
    prompt: STYLE + ' Tall vertical composition. Misty forest at dawn with cranes flying above the tree line. ' +
      'Tall conifers and broadleaves in painted layers receding into amber fog, shafts of golden light filtering through, soft painterly detail.'
  },
];

function generateOne({ prompt, aspect }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio: aspect },
    });
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/imagen-4.0-generate-001:predict?key=${KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 120000,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c.toString('utf8'); });
      res.on('end', () => {
        try {
          const data = JSON.parse(buf);
          if (data.predictions && data.predictions[0]?.bytesBase64Encoded) {
            resolve(Buffer.from(data.predictions[0].bytesBase64Encoded, 'base64'));
          } else {
            reject(new Error(`No image in response: ${buf.slice(0, 300)}`));
          }
        } catch (e) {
          reject(new Error(`Parse failed: ${buf.slice(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('TIMEOUT')); });
    req.write(body);
    req.end();
  });
}

(async () => {
  const ROOT = 'C:/Users/stefa/twin-ai-learn/.claude/worktrees/money-fixes-pass1';
  for (const p of PROMPTS) {
    const outPath = path.join(ROOT, p.out);
    const t0 = Date.now();
    try {
      const buf = await generateOne(p);
      // Imagen returns PNG; convert to .jpg by saving as-is — the file extension
      // is just a label. Actually PNG-as-jpg might cause MIME confusion. Save as
      // PNG first then convert via ffmpeg in the next step. For simplicity now:
      // write the PNG bytes to .jpg path — browsers sniff content type from headers,
      // but our Vercel routes pick by extension. Safer: write as .png, convert later.
      const pngPath = outPath.replace(/\.jpg$/, '.gen.png');
      fs.writeFileSync(pngPath, buf);
      const dim = `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
      console.log(`  OK  ${p.out.replace('public/images/', '').padEnd(45)} ${dim}  ${Math.round(buf.length/1024)}KB  ${Math.round((Date.now()-t0)/1000)}s`);
    } catch (e) {
      console.log(`  FAIL ${p.out}: ${e.message}`);
    }
  }
})();
