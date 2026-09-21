/**
 * Which orb for which wait (2026-09-21). Every page wait used the reading globe, so the
 * orbs all looked the same; each kind of work has its own shape in LedgerOrb.
 */
import type { OrbState } from '../../components/LedgerOrb';

export const ORB_FOR = {
  page: 'breathing',      // a page's first read: Today, Month, Plan, You
  learning: 'shaping',    // the ledger reading payments to learn from them: You's patterns, Setup
  bank: 'searching',      // a bank being read
  connect: 'connecting',  // a bank's consent page, somebody else's turn
  trace: 'weaving',       // the ledger recomputing under Ask
  reading: 'searching',   // the chat reading the ledger before it answers
  thinking: 'solving',    // the model reasoning
  writing: 'composing',   // an answer being written
  file: 'shaping',        // a file being read
} as const satisfies Record<string, OrbState>;
export type Work = keyof typeof ORB_FOR;
export const orbFor = (work: Work): OrbState => ORB_FOR[work];
