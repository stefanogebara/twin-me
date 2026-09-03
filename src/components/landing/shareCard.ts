/**
 * Soul Signature share card — drawn directly on canvas, no DOM capture.
 * 1080x1920 (Instagram Stories) on the Nocturne canvas: flat obsidian,
 * no orbs, Fraunces narrative over a mono source line.
 */

interface ShareCardInput {
  name: string | null;
  lines: string[];
  sources: string[];
}

const W = 1080;
const H = 1920;

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

  // Canvas resolves NO CSS custom properties. `ctx.font = '400 54px
  // var(--font-heading)'` is an invalid font string, and the spec says an
  // invalid assignment is IGNORED — so ctx.font silently stayed at its
  // default 10px sans-serif and the whole card rendered in tiny system type.
  // That shipped: the var() spelling is on main. Canvas needs real families.
  const serif = "'Fraunces', Georgia, 'Times New Roman', serif";
  const sans = "'Inter', system-ui, -apple-system, sans-serif";

  // Nocturne: flat obsidian, no orbs (Law 1 — elevation is a colour step).
  ctx.fillStyle = '#0f1011';
  ctx.fillRect(0, 0, W, H);

  // Wordmark
  ctx.fillStyle = '#fafafa';
  ctx.font = `400 54px ${serif}`;
  ctx.textBaseline = 'top';
  ctx.fillText('TwinMe', 96, 120);

  // Kicker
  ctx.font = `500 30px ${sans}`;
  ctx.fillStyle = '#9f9fa0';
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
    ctx.fillStyle = '#fafafa';
    ctx.fillText(name, 96, 400);
  }

  // Narrative — up to two beats, serif, generous leading
  ctx.font = `400 52px ${serif}`;
  ctx.fillStyle = '#fafafa';
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
    ctx.fillStyle = '#6a6b6b';
    ctx.fillText('READ FROM', 96, H - 380);
    ctx.font = `500 32px ${sans}`;
    ctx.fillStyle = '#9f9fa0';
    ctx.fillText(sources.slice(0, 5).join('  ·  '), 96, H - 328);
  }

  // Footer
  ctx.font = `500 34px ${sans}`;
  ctx.fillStyle = '#6a6b6b';
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
