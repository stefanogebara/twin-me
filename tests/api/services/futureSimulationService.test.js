/**
 * Doctor Strange mode (MiroFish-lite) — pins the swarm orchestration:
 * seed gating, parallel lens runs, junk-run tolerance, consensus synthesis,
 * and the weekly cooldown + insight storage path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// supabaseAdmin stub: fixtures per table + insert capture.
let reflectionRows;
let signalRows;
let recentSimRows;
const inserts = [];
vi.mock('../../../api/services/database.js', () => {
  function builder(table) {
    const b = { _table: table };
    for (const m of ['select', 'eq', 'in', 'gte', 'order']) b[m] = () => b;
    b.insert = (payload) => { inserts.push({ table, payload }); return Promise.resolve({ error: null }); };
    b.limit = (n) => {
      if (table === 'proactive_insights') return Promise.resolve({ data: recentSimRows, error: null });
      // user_memories: reflections query limits 12, signals limits 15
      const data = n === 12 ? reflectionRows : signalRows;
      return Promise.resolve({ data, error: null });
    };
    return b;
  }
  return { supabaseAdmin: { from: (t) => builder(t) }, serverDb: {} };
});

const completeMock = vi.fn();
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: (...a) => completeMock(...a),
  TIER_ANALYSIS: 'analysis',
  TIER_CHAT: 'chat',
  TIER_EXTRACTION: 'extraction',
}));

const { simulateFutures, runWeeklySimulation, SIMULATION_LENSES } = await import(
  '../../../api/services/futureSimulationService.js'
);

const SCENARIO = JSON.stringify({
  keyMoment: 'ships the desktop release',
  bestDecision: 'book the trip',
  biggestRisk: 'burnout from 4am sessions',
  happinessDriver: 'finishing what is started',
});

function seedEnough() {
  reflectionRows = Array.from({ length: 8 }, (_, i) => ({ content: `reflection ${i}` }));
  signalRows = Array.from({ length: 8 }, (_, i) => ({ content: `signal ${i}`, memory_type: 'fact' }));
}

describe('simulateFutures', () => {
  beforeEach(() => {
    completeMock.mockReset();
    inserts.length = 0;
    recentSimRows = [];
    seedEnough();
  });

  it('runs one call per lens plus one synthesis, returns the consensus', async () => {
    completeMock.mockImplementation(({ serviceName }) =>
      Promise.resolve({
        content: serviceName === 'future-simulation-synthesis'
          ? 'I ran your next month 8 times — in 6 of them, booking the trip was the turning point.'
          : SCENARIO,
      })
    );

    const result = await simulateFutures('u1', { runs: 8 });

    expect(result.runs).toBe(8);
    expect(result.insight).toMatch(/ran your next month/);
    // 8 lens runs + 1 synthesis
    expect(completeMock).toHaveBeenCalledTimes(9);
    // every lens run got the seed block; synthesis got the scenario JSON
    const synthCall = completeMock.mock.calls.find(([o]) => o.serviceName === 'future-simulation-synthesis');
    expect(synthCall[0].messages[0].content).toContain('book the trip');
  });

  it('tolerates junk runs and still synthesizes from the survivors', async () => {
    let n = 0;
    completeMock.mockImplementation(({ serviceName }) => {
      if (serviceName === 'future-simulation-synthesis') {
        return Promise.resolve({ content: 'Consensus from survivors.' });
      }
      n++;
      return n % 2 === 0
        ? Promise.resolve({ content: 'not json at all' })
        : Promise.resolve({ content: SCENARIO });
    });

    const result = await simulateFutures('u1', { runs: 8 });
    expect(result.runs).toBe(4); // half survived
    expect(result.insight).toBe('Consensus from survivors.');
  });

  it('returns null without any LLM call when seed data is too thin', async () => {
    reflectionRows = [{ content: 'one lonely reflection' }];
    signalRows = [];
    const result = await simulateFutures('u1');
    expect(result).toBe(null);
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('returns null when fewer than 2 runs survive', async () => {
    completeMock.mockResolvedValue({ content: 'garbage' });
    const result = await simulateFutures('u1', { runs: 4 });
    expect(result).toBe(null);
  });

  it('has 8 distinct lenses', () => {
    expect(new Set(SIMULATION_LENSES).size).toBe(8);
  });
});

describe('runWeeklySimulation', () => {
  beforeEach(() => {
    completeMock.mockReset().mockImplementation(({ serviceName }) =>
      Promise.resolve({
        content: serviceName === 'future-simulation-synthesis' ? 'Weekly consensus.' : SCENARIO,
      })
    );
    inserts.length = 0;
    recentSimRows = [];
    seedEnough();
  });

  it('stores the consensus as a future_simulation proactive insight', async () => {
    const r = await runWeeklySimulation('u1');
    expect(r.stored).toBe(true);
    const insert = inserts.find((i) => i.table === 'proactive_insights');
    expect(insert.payload.category).toBe('future_simulation');
    expect(insert.payload.urgency).toBe('medium');
    expect(insert.payload.insight).toBe('Weekly consensus.');
  });

  it('skips when a simulation ran in the last 6 days (cooldown)', async () => {
    recentSimRows = [{ id: 'sim-1' }];
    const r = await runWeeklySimulation('u1');
    expect(r.skipped).toBe('cooldown');
    expect(completeMock).not.toHaveBeenCalled();
  });
});
