/**
 * Soul Signature share card — drawn directly on canvas, no DOM capture.
 * 1080x1920 (Instagram Stories) on the Claura canvas: #13121a + the four
 * ambient orbs from ClassicBackground, Instrument Serif narrative.
 */

interface ShareCardInput {
  name: string | null;
  lines: string[];
  sources: string[];
}

const W = 1080;
const H = 1920;

function orb(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  rgba: string,
) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, rgba);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderShareCard({ name, lines, sources }: ShareCardInput): Promise<Blob> {
  await document.fonts.ready;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');

  const serif = "var(--font-heading)";
  const sans = "'Geist', 'Inter', system-ui, sans-serif";

  // Canvas + orbs (ClassicBackground geometry, scaled)
  ctx.fillStyle = '#13121a';
  ctx.fillRect(0, 0, W, H);
  orb(ctx, W * 0.15, H * 0.12, 620, 'rgba(210,145,55,0.34)');
  orb(ctx, W * 0.85, H * 0.1, 520, 'rgba(180,110,65,0.26)');
  orb(ctx, W * 0.5, H * 0.94, 640, 'rgba(160,95,55,0.30)');
  orb(ctx, W * 0.74, H * 0.52, 460, 'rgba(55,45,140,0.24)');

  // Wordmark
  ctx.fillStyle = '#F5F5F4';
  ctx.font = `400 54px ${serif}`;
  ctx.textBaseline = 'top';
  ctx.fillText('TwinMe', 96, 120);

  // Kicker
  ctx.font = `500 30px ${sans}`;
  ctx.fillStyle = 'rgba(245,245,244,0.5)';
  const kicker = 'SOUL SIGNATURE — FIRST GLIMPSE';
  ctx.save();
  // letter-spacing by hand (canvas has no tracking pre-Chrome-99 fallback)
  let x = 96;
  for (const ch of kicker) {
    ctx.fillText(ch, x, 320);
    x += ctx.measureText(ch).width + 5;
  }
  ctx.restore();

  // Name
  if (name) {
    ctx.font = `400 96px ${serif}`;
    ctx.fillStyle = '#F5F5F4';
    ctx.fillText(name, 96, 400);
  }

  // Narrative — up to two beats, serif, generous leading
  ctx.font = `400 52px ${serif}`;
  ctx.fillStyle = 'rgba(245,245,244,0.9)';
  let y = name ? 600 : 440;
  for (const beat of lines.slice(0, 2)) {
    for (const l of wrapText(ctx, beat, W - 192)) {
      ctx.fillText(l, 96, y);
      y += 72;
    }
    y += 44;
    if (y > H - 560) break;
  }

  // Sources
  if (sources.length > 0) {
    ctx.font = `500 28px ${sans}`;
    ctx.fillStyle = 'rgba(245,245,244,0.4)';
    ctx.fillText('READ FROM', 96, H - 380);
    ctx.font = `500 32px ${sans}`;
    ctx.fillStyle = 'rgba(245,245,244,0.6)';
    ctx.fillText(sources.slice(0, 5).join('  ·  '), 96, H - 328);
  }

  // Footer
  ctx.font = `500 34px ${sans}`;
  ctx.fillStyle = 'rgba(245,245,244,0.45)';
  ctx.fillText('Discover who you really are — twinme.me', 96, H - 180);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

export async function downloadShareCard(input: ShareCardInput): Promise<void> {
  const blob = await renderShareCard(input);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'soul-signature.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
