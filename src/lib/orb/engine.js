/**
 * Compatibility painter for TwinMe's LedgerOrb.
 * Geometry/presets now come from pinned thinking-orbs (MIT, Jakub Antalik).
 * Keep only the application-specific photograph ground; ordinary light/dark
 * surfaces use the upstream painter without changing its monochrome ink.
 */
import { MODE_FRAMES, paintFrame as upstreamPaintFrame } from 'thinking-orbs/engine';
export { MODE_FRAMES, resolvePreset, STATE_TO_MODE, finalizeFrame } from 'thinking-orbs/engine';

export function inkAt(ctx, level, alpha) {
  const o = ctx.__orb;
  if (o) {
    const k = level / 255;
    const ch = (i) => Math.round(o.ink[i] + (o.page[i] - o.ink[i]) * k);
    return `rgba(${ch(0)},${ch(1)},${ch(2)},${alpha})`;
  }
  const M = ctx.__theme === 'dark' ? 255 - level : level;
  return `rgba(${M},${M},${M},${alpha})`;
}

/** The public engine handles ordinary surfaces; photographs keep their declared ground. */
export function paintFrame(ctx, frame, dark = false) {
  if (!ctx.__orb) {
    upstreamPaintFrame(ctx, frame, ctx.__theme ? ctx.__theme === 'dark' : dark);
    return;
  }
  const ink = (mark) => {
    const white = Math.min(1, Math.max(0, mark.white));
    return inkAt(ctx, Math.round((dark ? 1 - white : white) * 255), mark.a ?? 1);
  };
  for (const line of frame.lines) {
    ctx.strokeStyle = ink(line);
    ctx.lineWidth = line.w;
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
  }
  for (const dot of frame.dots) {
    ctx.fillStyle = ink(dot);
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export const MODE_DRAWS = Object.fromEntries(
  Object.entries(MODE_FRAMES).map(([mode, frame]) => [
    mode, (ctx, size, time, dark, opts) => paintFrame(ctx, frame(size, time, opts), dark),
  ]),
);
