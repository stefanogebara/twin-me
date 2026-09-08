/**
 * The transcript, kept outside the screen.
 * ========================================
 * The chat opens and closes like a page, and a page that forgets what was said the moment it
 * closes would greet the person again every time. So the lines live here, at module level,
 * for as long as the app runs; the screen subscribes and arranges them. One transcript per
 * use of the chat (onboarding, ask), and a memory of the last projection so the screen can
 * say in one line when an answer moved the month.
 */

import { useSyncExternalStore } from 'react';
import type { ChatAction, ChatReceipt, MoneyQuestion } from '../services/moneyApi';
import type { ChatFigure } from '../ui/figures';

export type TraceStep = { step: string; label: string; state: 'working' | 'done' | 'failed'; detail: string | null; count: number | null };

export type Line = {
  id: string;
  who: 'twin' | 'you';
  text: string;
  /** A leading amount lifted out of the text, set large above it. */
  lead?: string;
  /** Quieter sentences under the main one: a question's help, a consequence. */
  small?: string[];
  /** The line is waiting for the server; its text is the waiting words. */
  pending?: boolean;
  /** An aside in the quieter tone: what an answer changed, not an answer itself. */
  quiet?: boolean;
  figures?: ChatFigure[];
  actions?: ChatAction[];
  /** What happened to an action once it was pressed, by its index in `actions`. */
  acted?: Record<number, string>;
  receipts?: ChatReceipt[];
  trace?: TraceStep[];
  /** The question this line asks, when it asks one. Drives the cards and fields under it. */
  question?: MoneyQuestion;
};

export type ChatMode = 'onboarding' | 'ask';

let lineSeq = 0;
/* Ids carry the moment the module loaded: a development refresh resets the counter but keeps
   the transcript, and two lines with one key take the whole list down. */
const LINE_EPOCH = Date.now().toString(36);
export function lineId() { lineSeq += 1; return `l${LINE_EPOCH}-${lineSeq}`; }

const transcripts: Record<ChatMode, Line[]> = { onboarding: [], ask: [] };
const listeners = new Set<() => void>();
/** The month's likely total the last time the chat looked, to notice when it moves. */
let lastLikely: number | null = null;

function emit() { listeners.forEach((fn) => fn()); }

export function readLines(mode: ChatMode): Line[] { return transcripts[mode]; }

export function setLines(mode: ChatMode, next: Line[] | ((all: Line[]) => Line[])) {
  transcripts[mode] = typeof next === 'function' ? next(transcripts[mode]) : next;
  emit();
}

export function rememberLikely(v: number | null) { lastLikely = v; }
export function recallLikely(): number | null { return lastLikely; }

/** The transcript for one use of the chat, live. */
export function useTranscript(mode: ChatMode): Line[] {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    () => transcripts[mode],
    () => transcripts[mode],
  );
}
