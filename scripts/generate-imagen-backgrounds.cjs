/* eslint-disable */
// Generate 11 cosmic→Earth backgrounds via Imagen 4 (Gemini API).
//
// 2026-05-12 v2: User feedback after v1 — "design style is perfect, but
// not supposed to be fiction with dragons etc, supposed to be something
// cosmic, galactic and that zooms in to Earth where we are from."
//
// v1 prompts referenced Howl's Moving Castle and Spirited Away directly,
// which Imagen 4 took LITERALLY — generating Ghibli castles and structures.
// v2 keeps the painterly watercolor STYLE but strips all film references
// and explicitly forbids buildings/castles/characters. Narrative arc
// follows the existing CosmicHero parallax: pure cosmic origin → distant
// Earth → atmospheric arrival → Earth from orbit → Earth surface.

require('dotenv').config({ path: 'C:/Users/stefa/twin-ai-learn/.env' });
const fs = require('fs');
const https = require('https');
const path = require('path');

const KEY = process.env.GOOGLE_AI_API_KEY;
if (!KEY) { console.error('GOOGLE_AI_API_KEY unset'); process.exit(1); }

// Painted watercolor STYLE without invoking specific films (which leak into content).
const STYLE = `Cinematic painted illustration in soft watercolor style with visible painterly brushwork. ` +
  `Atmospheric depth, soft glow, scattered fine detail throughout — NO flat color regions, NO vector look. ` +
  `STRICTLY NO buildings, NO castles, NO houses, NO structures, NO characters, NO people, NO animals besides those explicitly requested, NO fantasy elements. ` +
  `Warm amber, copper, deep teal, dusty pink palette on deep navy/indigo underbase. ` +
  `Ultra-detailed cosmic / natural scenery, every region has painterly visual interest.`;

const PROMPTS = [
  // ── CosmicHero parallax narrative: ORIGIN → VARIATION → ARRIVAL → BODY → TWIN ──

  // Stage 1 — ORIGIN — pure cosmic stardust (cosmic/aux-starry-clouds.jpg, 9:16)
  {
    out: 'public/images/cosmic/aux-starry-clouds.jpg',
    aspect: '9:16',
    prompt: STYLE + ' Tall vertical composition. Deep cosmic origin scene. ' +
      'Vast starry void with painted nebula clouds in pink, amber and indigo dust, scattered bright stars of varying sizes, ' +
      'a soft distant spiral galaxy glow. Pure stardust — NO Earth visible, NO planets in this frame.'
  },

  // Stage 2 — INFINITE VARIATION — Earth from very far away (cosmic/01-space-earth.jpg, 9:16)
  {
    out: 'public/images/cosmic/01-space-earth.jpg',
    aspect: '9:16',
    prompt: STYLE + ' Tall vertical composition. Earth viewed from deep space, very far away. ' +
      'The blue-green planet appears small and distant against a vast starry void, surrounded by soft pink and amber cosmic nebula clouds. ' +
      'NO landscape detail on the planet — Earth is just a luminous blue-green sphere in the cosmos. NO ships, NO satellites.'
  },

  // Stage 3 — ARRIVAL — Approaching Earth's atmosphere (cosmic-v2/stage3-arrival.jpg, 16:9)
  {
    out: 'public/images/cosmic-v2/stage3-arrival.jpg',
    aspect: '16:9',
    prompt: STYLE + ' Cinematic wide landscape. Earth viewed from low orbit, planet curvature visible across the bottom of the frame. ' +
      'Soft amber atmospheric glow along the curved horizon, painted swirling clouds above the planet surface catching pink and gold light, ' +
      'starfield transitioning above. We are arriving at Earth. NO civilization visible, NO landmass detail — clouds dominate.'
  },

  // Stage 4 — THE BODY — Aurora seen from orbit (cosmic/04-aurora.jpg, 9:16)
  {
    out: 'public/images/cosmic/04-aurora.jpg',
    aspect: '9:16',
    prompt: STYLE + ' Tall vertical composition. Aurora borealis seen from low Earth orbit looking down. ' +
      'Soft green, pink, and purple aurora curtains dance across the curved planet edge, starfield above transitioning to atmospheric glow, ' +
      'the dark side of Earth visible below the auroral band. NO landscape, NO ground detail — orbital view.'
  },

  // Stage 5 — THE TWIN — Earth surface at sunrise/sunset, the journey ends here (cosmic-v2/stage5-horizon.jpg, 16:9)
  {
    out: 'public/images/cosmic-v2/stage5-horizon.jpg',
    aspect: '16:9',
    prompt: STYLE + ' Cinematic wide landscape. Earth surface from a high vantage at golden hour. ' +
      'Vast painted landscape of rolling teal-blue hills and amber river valleys receding into atmospheric haze, ' +
      'a meandering river catching golden sunset light, distant snow-capped mountains, warm pink-amber sky with painted clouds. ' +
      'NO buildings anywhere, NO civilization, NO people — pure natural Earth landscape. The cosmic journey ends here, on the ground.'
  },

  // ── Chapter dividers (cosmic-v2) — Earth landscapes ──

  // chapter-landscape (cosmic-v2/section6-landscape.jpg, 16:9)
  {
    out: 'public/images/cosmic-v2/section6-landscape.jpg',
    aspect: '16:9',
    prompt: STYLE + ' Cinematic wide landscape. Vast painted Earth landscape at golden hour. ' +
      'Rolling teal-blue hills receding into atmospheric haze, a meandering amber river catching sunset light, ' +
      'distant snow-capped mountains, painted clouds with warm pink-orange undersides. NO buildings, NO people, NO bridges — pure natural scenery.'
  },

  // chapter-meadow (cosmic-v2/section8-meadow.jpg, 16:9)
  {
    out: 'public/images/cosmic-v2/section8-meadow.jpg',
    aspect: '16:9',
    prompt: STYLE + ' Cinematic wide landscape. Golden meadow with a winding footpath at sunset. ' +
      'Tall grass and wildflowers catching golden hour light, distant tree line on the horizon, warm amber sky with painted clouds. ' +
      'NO buildings, NO people, NO animals — pure natural pastoral scene.'
  },

  // chapter-twin (cosmic-v2/section11-twin-meeting.jpg, 16:9)
  // Despite the name, render this as an EARTH LANDSCAPE — the emotional payoff scene
  // is "where we are from", not literal figures meeting.
  {
    out: 'public/images/cosmic-v2/section11-twin-meeting.jpg',
    aspect: '16:9',
    prompt: STYLE + ' Cinematic wide landscape. Vast painted Earth landscape at golden hour, emotional payoff scene. ' +
      'Sweeping vista across rolling hills toward a distant ocean horizon, warm amber sky with dramatic painted clouds, ' +
      'atmospheric haze in the valleys, golden light catching the edges. The journey ends in a place that feels like home. ' +
      'NO buildings, NO people, NO castles — pure natural Earth landscape.'
  },

  // ── Decorative portraits used in Index.tsx service tabs (cosmic, 9:16) ──

  // Connect tab → 02-nebula (pure cosmic, "connection to vast")
  {
    out: 'public/images/cosmic/02-nebula.jpg',
    aspect: '9:16',
    prompt: STYLE + ' Tall vertical composition. Deep space nebula painted in soft watercolor. ' +
      'Swirling cosmic dust clouds in pink, amber, and deep indigo, bright scattered stars of varying sizes, ' +
      'ethereal cosmic depth with painted texture throughout. NO planets, NO buildings, pure abstract cosmic scene.'
  },

  // Control tab → 07-ocean-birds (Earth's ocean, "choose your depth")
  {
    out: 'public/images/cosmic/07-ocean-birds.jpg',
    aspect: '9:16',
    prompt: STYLE + ' Tall vertical composition. Calm ocean at golden hour with a flock of birds flying low over the water. ' +
      'Painted water reflections catching warm pink-amber light, distant cloud bank lit golden, atmospheric haze along the horizon. ' +
      'NO buildings, NO boats, NO people — pure natural seascape with birds.'
  },

  // Understand tab → aux-forest-cranes (Earth's forest, "patterns in nature")
  {
    out: 'public/images/cosmic/aux-forest-cranes.jpg',
    aspect: '9:16',
    prompt: STYLE + ' Tall vertical composition. Misty forest at dawn with cranes flying gracefully above the tree canopy. ' +
      'Tall painted conifers and broadleaves in layered receding into warm amber fog, shafts of golden light filtering through, ' +
      'soft painterly detail throughout. NO buildings, NO paths, NO people — pure natural forest with cranes.'
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
      const pngPath = outPath.replace(/\.jpg$/, '.gen.png');
      fs.writeFileSync(pngPath, buf);
      const dim = `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
      console.log(`  OK  ${p.out.replace('public/images/', '').padEnd(45)} ${dim}  ${Math.round(buf.length/1024)}KB  ${Math.round((Date.now()-t0)/1000)}s`);
    } catch (e) {
      console.log(`  FAIL ${p.out}: ${e.message}`);
    }
  }
})();
