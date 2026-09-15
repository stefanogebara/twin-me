/** Types for the vendored orb engine (src/lib/orb/engine.js). See that file's header. */
export type OrbState = 'working' | 'searching' | 'solving' | 'listening' | 'connecting' | 'weaving' | 'composing' | 'breathing' | 'shaping';
export type ModeKey = 'orbits' | 'globe' | 'rubik' | 'wave' | 'web' | 'braid' | 'ribbon' | 'ring' | 'morph';
export type ModeOpts = Record<string, unknown>;
export type Dot = { x: number; y: number; z: number; r: number; white: number; a?: number };
export type Line = { x1: number; y1: number; x2: number; y2: number; w: number; white: number; a?: number };
export type OrbFrame = { dots: Dot[]; lines: Line[] };
export type Resolved = { mode: ModeKey; speed: number; opts: ModeOpts };
export const STATE_TO_MODE: Record<OrbState, ModeKey>;
export const MODE_FRAMES: Record<ModeKey, (size: number, t: number, opts: ModeOpts) => OrbFrame>;
export const MODE_DRAWS: Record<ModeKey, (ctx: CanvasRenderingContext2D, size: number, t: number, dark: boolean, opts: ModeOpts) => void>;
export function finalizeFrame(dots: Dot[], lines: Line[], minRadius?: number): OrbFrame;
export function paintFrame(ctx: CanvasRenderingContext2D, frame: OrbFrame, dark: boolean): void;
export function resolvePreset(state: OrbState, size: 20 | 64): Resolved;
