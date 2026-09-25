/** Public upstream types, with TwinMe's optional photo-ground painter. */
export type { OrbState, ModeKey, ModeOpts, Dot, Line, OrbFrame, Resolved } from 'thinking-orbs/engine';
export { STATE_TO_MODE, MODE_FRAMES, finalizeFrame, resolvePreset } from 'thinking-orbs/engine';
import type { ModeKey, ModeDraw, OrbFrame } from 'thinking-orbs/engine';
export const MODE_DRAWS: Record<ModeKey, ModeDraw>;
export function paintFrame(ctx: CanvasRenderingContext2D, frame: OrbFrame, dark?: boolean): void;
export function inkAt(ctx: { __theme?: 'light' | 'dark'; __orb?: { ink: number[]; page: number[] } }, level: number, alpha: number): string;
