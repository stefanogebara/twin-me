/**
 * Which orb her call page shows.
 *
 * The orb is LedgerOrb (Jakub Antalik's thinking-orbs engine, the one the money pages
 * use), and it keeps its one meaning here: something is happening right now. While
 * the page loads or waits for her it breathes; connecting is connecting; in the call
 * it listens when she talks, composes when it talks back, breathes in her pauses;
 * keeping the conversation is work. Once nothing is happening there is no orb.
 */
import type { OrbState } from '../../components/LedgerOrb';

export type CallState = 'loading' | 'invalid' | 'unavailable' | 'ready' | 'connecting' | 'live' | 'saving' | 'done' | 'lost' | 'error';
export type OrbMode = 'idle' | 'listening' | 'speaking';

export type CallOrb = { state: OrbState; size: number; speed: number };

/** Her screen's orb: large enough to read from a lap. */
const STAGE = 128;
/** The wait and the save: the money pages' centre size. */
const WAIT = 64;

export function orbFor(state: CallState, mode: OrbMode): CallOrb | null {
  switch (state) {
    case 'loading': return { state: 'breathing', size: WAIT, speed: 1 };
    case 'ready': return { state: 'breathing', size: STAGE, speed: 1 };
    case 'connecting': return { state: 'connecting', size: STAGE, speed: 1 };
    case 'live':
      if (mode === 'listening') return { state: 'listening', size: STAGE, speed: 1 };
      if (mode === 'speaking') return { state: 'composing', size: STAGE, speed: 1.3 };
      return { state: 'breathing', size: STAGE, speed: 1 };
    case 'saving': return { state: 'working', size: WAIT, speed: 1 };
    default: return null;
  }
}
