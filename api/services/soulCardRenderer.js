/**
 * Soul Card Renderer
 *
 * Generates a 1200x630 PNG card for OG image previews and downloads.
 * Uses satori (JSX -> SVG) + @resvg/resvg-js (SVG -> PNG).
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load fonts once at module init
const fontsDir = path.join(__dirname, '..', 'fonts');
const interRegular = fs.readFileSync(path.join(fontsDir, 'Inter-Regular.woff'));
const interBold = fs.readFileSync(path.join(fontsDir, 'Inter-Bold.woff'));

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

// Helper: satori needs display:flex on every div with >1 child
function div(style, children) {
  return {
    type: 'div',
    props: {
      style: { display: 'flex', ...style },
      children,
    },
  };
}

function span(style, text) {
  return { type: 'span', props: { style, children: text } };
}

/**
 * Render a soul signature card as PNG buffer.
 */
export async function renderSoulCard(data) {
  const {
    firstName = 'Someone',
    archetypeName = 'Soul Signature',
    subtitle = '',
    traits = [],
    colorScheme = {},
  } = data;

  const accent = colorScheme?.primary || '#E8D5B7';
  const topTraits = traits
    .filter(t => t && t.trait)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 3);

  // Build trait elements
  const traitElements = topTraits.map((t) =>
    div(
      { flexDirection: 'column', alignItems: 'center', gap: '8px', minWidth: '200px' },
      [
        // Trait name
        span(
          { fontSize: 16, fontWeight: 700, color: '#C1C0B6', textTransform: 'uppercase', letterSpacing: '0.06em' },
          t.trait.length > 22 ? t.trait.slice(0, 20) + '...' : t.trait,
        ),
        // Score bar row
        div({ alignItems: 'center', gap: '10px', width: '200px' }, [
          // Bar background
          div({ flex: 1, height: '8px', borderRadius: '4px', backgroundColor: 'rgba(193, 192, 182, 0.15)', overflow: 'hidden' }, [
            // Bar fill
            div({
              width: `${Math.min(t.score || 0, 100)}%`,
              height: '100%',
              borderRadius: '4px',
              backgroundColor: accent,
              opacity: 0.8,
            }, span({ fontSize: 1, opacity: 0 }, ' ')),
          ]),
          span({ fontSize: 15, fontWeight: 700, color: accent, minWidth: '30px' }, `${Math.round(t.score || 0)}`),
        ]),
      ],
    ),
  );

  // Bottom children: divider + optional traits + CTA
  const bottomChildren = [
    // Divider line
    div({
      width: '100%',
      height: '1px',
      backgroundColor: `${accent}40`,
    }, span({ fontSize: 1, opacity: 0 }, ' ')),
  ];

  if (traitElements.length > 0) {
    bottomChildren.push(
      div({ justifyContent: 'center', gap: '32px' }, traitElements),
    );
  }

  // CTA row
  bottomChildren.push(
    div({ justifyContent: 'space-between', alignItems: 'center' }, [
      span({ fontSize: 16, color: 'rgba(193, 192, 182, 0.5)', letterSpacing: '0.02em' }, 'Discover yours at twin-ai-learn.vercel.app'),
      span({ fontSize: 22, color: accent, opacity: 0.5 }, '\u25C7'),
    ]),
  );

  // Center children
  const centerChildren = [
    span({
      fontSize: 22,
      color: 'rgba(193, 192, 182, 0.6)',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
    }, `${firstName}'s Soul Signature`),
    span({
      fontSize: 52,
      fontWeight: 700,
      color: accent,
      textAlign: 'center',
      lineHeight: 1.15,
    }, archetypeName),
  ];

  if (subtitle) {
    centerChildren.push(
      span({
        fontSize: 22,
        fontStyle: 'italic',
        color: 'rgba(193, 192, 182, 0.7)',
        textAlign: 'center',
        marginTop: '4px',
      }, `"${subtitle}"`),
    );
  }

  const markup = div(
    {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '48px 60px',
      background: 'linear-gradient(135deg, #0C0C0C 0%, #1a1a17 50%, #0C0C0C 100%)',
      fontFamily: 'Inter',
      color: '#C1C0B6',
    },
    [
      // Top: Brand
      div({ alignItems: 'center', gap: '8px' }, [
        span({ fontSize: 20, fontWeight: 700, color: accent, letterSpacing: '0.05em' }, 'Twin Me'),
        span({ fontSize: 16, color: accent, opacity: 0.7 }, '\u2726'),
      ]),

      // Center: Name + Archetype + Subtitle
      div({ flexDirection: 'column', alignItems: 'center', gap: '6px' }, centerChildren),

      // Bottom: Divider + Traits + CTA
      div({ flexDirection: 'column', gap: '20px' }, bottomChildren),
    ],
  );

  // Render SVG via satori
  const svg = await satori(markup, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: [
      { name: 'Inter', data: interRegular, weight: 400, style: 'normal' },
      { name: 'Inter', data: interBold, weight: 700, style: 'normal' },
    ],
  });

  // Convert SVG -> PNG via resvg
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: CARD_WIDTH },
  });
  const pngData = resvg.render();
  return pngData.asPng();
}

/**
 * Render a generic fallback card (no user data).
 * @returns {Promise<Buffer>} PNG buffer
 */
export async function renderFallbackCard() {
  return renderSoulCard({
    firstName: 'Your',
    archetypeName: 'Soul Signature',
    subtitle: 'Discover what makes you authentically you',
    traits: [],
    colorScheme: { primary: '#E8D5B7' },
  });
}
