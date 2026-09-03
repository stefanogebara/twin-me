/**
 * Pure rules of the Portrait (spec: .claude/plans/2026-09-03-portrait/README.md).
 * State is derived from dates and the person's verdict; the support line is computed
 * from evidence, never shown as a number.
 */
import type { AskScript, Reading } from '../data/demoPortrait';

export type ReadingState = 'new' | 'standing' | 'fading' | 'disputed';

const DAY = 86_400_000;
const NEW_DAYS = 7;
const FADE_DAYS = 45;
const HARDENED_FADE_DAYS = 120;

/** Accepts "YYYY-MM-DD" and "YYYY-MM-DD HH:MM"; both are read as UTC. */
function parse(iso: string): number {
  return iso.length === 10 ? Date.parse(`${iso}T00:00:00Z`) : Date.parse(`${iso.replace(' ', 'T')}:00Z`);
}

export function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - parse(iso)) / DAY);
}

export function deriveState(reading: Reading, now: Date): ReadingState {
  if (reading.verdict === 'wrong') return 'disputed';
  const limit = reading.verdict === 'true' ? HARDENED_FADE_DAYS : FADE_DAYS;
  if (daysSince(reading.supportedAt, now) > limit) return 'fading';
  if (daysSince(reading.writtenAt, now) <= NEW_DAYS) return 'new';
  return 'standing';
}

export function supportLine(reading: Reading): string {
  const events = reading.evidence.length;
  const sources = new Set(reading.evidence.map((e) => e.source)).size;
  const days = reading.evidence.map((e) => Math.floor(parse(e.at) / DAY));
  const span = Math.max(...days) - Math.min(...days) + 1;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return `${plural(events, 'event')}, ${plural(sources, 'source')}, ${plural(span, 'day')}`;
}

export const LEDGER_ORDER: ReadingState[] = ['new', 'standing', 'fading', 'disputed'];

export function groupReadings(readings: Reading[], now: Date): { state: ReadingState; readings: Reading[] }[] {
  return LEDGER_ORDER
    .map((state) => ({ state, readings: readings.filter((r) => deriveState(r, now) === state) }))
    .filter((g) => g.readings.length > 0);
}

export function findScripted(scripts: AskScript[], query: string): AskScript | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const q = norm(query);
  if (!q) return null;
  return scripts.find((s) => norm(s.q) === q || norm(s.q).includes(q) || q.includes(norm(s.q))) ?? null;
}
