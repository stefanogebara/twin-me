/**
 * The orb: the ledger at work, on the phone.
 * ==========================================
 * The same dotted thought-orb the web draws (Jakub Antalik's thinking-orbs engine, vendored
 * in src/lib/orb as a copy of the web's file), with the same meaning on every screen: real
 * work is running right now. Never decoration, never shown at rest, one per screen at most.
 * The states name the kind of work:
 *
 *   searching    a bank or the ledger is being read
 *   solving      the model is reasoning
 *   composing    an answer is being written
 *   connecting   waiting on somebody else: a bank's consent page, a sign-in email
 *   weaving      the month is being recomputed after new rows
 *   shaping      places are being looked up, the ledger is learning
 *   breathing    a page on its way (the loading screen)
 *   working      anything else
 *   listening    reserved for voice; not used yet
 *
 * There is no canvas here and no SVG, so each frame is painted with plain views: one circle
 * per dot, one thin rotated bar per line, in the ink lerped towards the page exactly as the
 * web painter does it. The engine gives the geometry for (size, t); this file only asks for
 * a frame about thirty times a second and lays it out.
 *
 * Views are dearer than canvas pixels, so the phone always draws the engine's 20-point
 * geometry (its sparsest) and lets the engine scale it to the size asked for: a 64 ring is
 * 120 dots here, not 484. Above 40 points the dots are drawn a little larger to keep the
 * ink of the sparser field, and the loop drops to 24 frames a second. Reduced motion gets
 * one still frame. The orb sleeps while the app is not in front.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { AppState, View, type StyleProp, type ViewStyle } from 'react-native';
import { cosmos } from '../constants/cosmos';
import { MODE_FRAMES, resolvePreset, type OrbFrame, type OrbState } from '../lib/orb/engine';
import { useReducedMotion } from './motion';

export type { OrbState };

const LABEL: Record<OrbState, string> = {
  working: 'Working', searching: 'Reading', solving: 'Working it out', listening: 'Listening', connecting: 'Waiting on the other side',
  weaving: 'Recomputing', composing: 'Writing', breathing: 'One moment', shaping: 'Learning',
};

/** How often a new frame is asked for. Thirty a second reads as continuous on a dotted orb
 *  and leaves the JS thread room for the screen around it; a big orb settles for 24. */
const FRAME_MS_SMALL = 1000 / 30;
const FRAME_MS_LARGE = 1000 / 24;
/** From this size up the orb is "large": slower loop, larger dots. */
const LARGE = 40;
/** The 20-point geometry drawn at 64 is 120 dots where the web's own 64 preset has 484, so
 *  each dot is drawn 1.3 times its radius, which keeps the ring's ink area within about a
 *  sixth of the web's. */
const RADIUS_LARGE = 1.3;
/** The instant shown when the orb is still (reduced motion, or paused): the web's own. */
const STILL_T = 0.6;

type Rgb = [number, number, number];
function rgbOf(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
/* The register's ink and page, from the tokens; the orb is never drawn in a colour the page
   does not have. */
const INK = rgbOf(cosmos.color.ink);
const PAGE = rgbOf(cosmos.color.canvas);

/** The colour of a dot or a line: the ink lerped to the page by `white` (0 ink, 1 gone into
 *  the page) at alpha `a`, as the web painter does it. Cached, because a frame's few hundred
 *  marks share a few dozen colours and the next frame shares nearly all of them. */
const colours = new Map<number, string>();
function inkAt(white: number, a: number): string {
  const level = Math.round(Math.min(1, Math.max(0, white)) * 255);
  const alpha = Math.round(Math.min(1, Math.max(0, a)) * 100);
  const key = level * 101 + alpha;
  const hit = colours.get(key);
  if (hit) return hit;
  const k = level / 255;
  const ch = (i: number) => Math.round(INK[i] + (PAGE[i] - INK[i]) * k);
  const c = `rgba(${ch(0)},${ch(1)},${ch(2)},${alpha / 100})`;
  colours.set(key, c);
  return c;
}

const now = (): number => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

type Props = {
  state?: OrbState;
  /** Points. 20 inline, 64 for a screen; other sizes borrow the nearer preset. */
  size?: number;
  paused?: boolean;
  /** What a screen reader hears; the state's word when not given. An empty string hides the
   *  orb from the reader, for when the words are already beside it. */
  label?: string;
  style?: StyleProp<ViewStyle>;
};

export function Orb({ state = 'working', size = 20, paused = false, label, style }: Props) {
  const reduced = useReducedMotion();
  const still = reduced || paused;
  /* Always the 20 preset: the engine scales its geometry to `size`, and the dot count stays
     the sparse one a view-per-dot painter can carry. */
  const preset = useMemo(() => resolvePreset(state, 20), [state]);
  const large = size >= LARGE;
  const frameMs = large ? FRAME_MS_LARGE : FRAME_MS_SMALL;
  const rs = large ? RADIUS_LARGE : 1;
  const [frame, setFrame] = useState<OrbFrame>(() => MODE_FRAMES[preset.mode](size, STILL_T, preset.opts));

  useEffect(() => {
    const draw = MODE_FRAMES[preset.mode];
    const at = (t: number) => setFrame(draw(size, t, preset.opts));
    if (still) { at(STILL_T); return; }

    let raf = 0;
    let running = false;
    let last = 0;
    const tick = () => {
      if (!running) return;
      const ms = now();
      /* Every second or third display frame, with a little slack so an exact gap is not missed. */
      if (ms - last >= frameMs - 1) { last = ms; at((ms / 1000) * preset.speed); }
      raf = requestAnimationFrame(tick);
    };
    const start = () => { if (!running) { running = true; raf = requestAnimationFrame(tick); } };
    const stop = () => { running = false; cancelAnimationFrame(raf); };
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') start(); else stop(); });
    const s0 = AppState.currentState;
    if (s0 !== 'background' && s0 !== 'inactive') start();
    return () => { stop(); sub.remove(); };
  }, [preset, size, still, frameMs]);

  const box = useMemo<ViewStyle>(() => ({ width: size, height: size, overflow: 'visible' }), [size]);
  const hidden = label === '';

  return (
    <View
      style={[box, style]}
      pointerEvents="none"
      accessibilityRole={hidden ? undefined : 'image'}
      accessibilityLabel={hidden ? undefined : label || LABEL[state]}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    >
      {frame.lines.map((l, i) => {
        const dx = l.x2 - l.x1;
        const dy = l.y2 - l.y1;
        const len = Math.hypot(dx, dy);
        if (len < 0.01) return null;
        /* A view turns about its own centre, so the bar is laid over the line's midpoint. */
        return (
          <View
            key={`l${i}`}
            style={{
              position: 'absolute',
              left: (l.x1 + l.x2) / 2 - len / 2,
              top: (l.y1 + l.y2) / 2 - l.w / 2,
              width: len,
              height: l.w,
              backgroundColor: inkAt(l.white, l.a ?? 1),
              transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
            }}
          />
        );
      })}
      {frame.dots.map((d, i) => {
        const r = d.r * rs;
        return (
          <View
            key={`d${i}`}
            style={{
              position: 'absolute',
              left: d.x - r,
              top: d.y - r,
              width: r * 2,
              height: r * 2,
              borderRadius: r,
              backgroundColor: inkAt(d.white, d.a ?? 1),
            }}
          />
        );
      })}
    </View>
  );
}
