/**
 * Soul Signature share card — drawn directly on canvas, no DOM capture.
 * 1080x1920 (Instagram Stories) in the register: the warm page, warm ink at
 * three strengths, Geist throughout, sentence case, no ornament.
 */

interface ShareCardInput {
  name: string | null;
  lines: string[];
  sources: string[];
}

const W = 1080;
const H = 1920;

// Canvas resolves NO CSS custom properties, so the register's colours are
// written out here. They are register.css's values: keep them in step.
const PAGE = '#fbfaf9';  // --rg-page
const INK = '#251f21';   // --rg-ink
const INK_2 = '#585254'; // --rg-ink-2
const INK_3 = '#6c6867'; // --rg-ink-3

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

/** Tracking where the canvas supports it (Chrome 99+, Safari 18+); a no-op elsewhere. */
function track(ctx: CanvasRenderingContext2D, value: string) {
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = value;
}

export async function renderShareCard({ name, lines, sources }: ShareCardInput): Promise<Blob> {
  // Canvas resolves NO CSS custom properties. `ctx.font = '400 54px
  // var(--font-heading)'` is an invalid font string, and the spec says an
  // invalid assignment is IGNORED — so ctx.font silently stayed at its
  // default 10px sans-serif and the whole card rendered in tiny system type.
  // That shipped once. So the family is read from the token at draw time and
  // handed to the canvas as a real font list.
  const sans =
    getComputedStyle(document.documentElement).getPropertyValue('--rg-sans').trim() ||
    'system-ui, -apple-system, sans-serif';
  await document.fonts.ready;
  // Ask for the exact weights drawn below, so the first card is not set in a fallback.
  await Promise.all(['300 96px', '400 52px', '500 32px'].map((f) => document.fonts.load(`${f} ${sans}`).catch(() => [])));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');

  // The page: flat, no gradient, no ornament.
  ctx.fillStyle = PAGE;
  ctx.fillRect(0, 0, W, H);

  // Wordmark
  ctx.fillStyle = INK;
  ctx.font = `500 44px ${sans}`;
  ctx.textBaseline = 'top';
  track(ctx, '-1px');
  ctx.fillText('TwinMe', 96, 120);

  // Kicker: a grey line, sentence case
  ctx.font = `500 32px ${sans}`;
  ctx.fillStyle = INK_2;
  track(ctx, '0px');
  ctx.fillText('Soul signature, a first glimpse', 96, 320);

  // Name: the Cosmos title, Geist 300 at -0.05em
  if (name) {
    ctx.font = `300 96px ${sans}`;
    ctx.fillStyle = INK;
    track(ctx, '-4.8px');
    ctx.fillText(name, 96, 400);
  }

  // Narrative — up to two beats, Geist 400, generous leading
  ctx.font = `400 52px ${sans}`;
  ctx.fillStyle = INK;
  track(ctx, '-1.5px');
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
  track(ctx, '0px');
  if (sources.length > 0) {
    ctx.font = `500 28px ${sans}`;
    ctx.fillStyle = INK_3;
    ctx.fillText('Read from', 96, H - 380);
    ctx.font = `500 32px ${sans}`;
    ctx.fillStyle = INK_2;
    ctx.fillText(sources.slice(0, 5).join('  ·  '), 96, H - 328);
  }

  // Footer
  ctx.font = `500 34px ${sans}`;
  ctx.fillStyle = INK_3;
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
