/**
 * Doctor Strange mode (MiroFish-lite) — pins the swarm orchestration:
 * seed gating, parallel lens runs, junk-run tolerance, consensus synthesis,
 * what-if conditioning, the prediction-vs-reality feedback loop, weekly
 * cooldown, insight storage, and direct WhatsApp delivery.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// supabaseAdmin stub: fixtures per table, query-shape aware.
let reflectionRows;   // user_memories reflections (limit 12)
let signalRows;       // user_memories signals (limit 15)
let actualRows;       // user_memories actuals-since-prediction (gte + order)
let cooldownRows;     // proactive_insights cooldown check (gte, no order)
let priorRows;        // proactive_insights prior prediction (order, no gte)
let channelRows;      // messaging_channels
const inserts = [];
const updates = [];
vi.mock('../../../api/services/database.js', () => {
  function builder(table) {
    const b = { _table: table, _gte: false, _ordered: false };
    for (const m of ['select', 'eq', 'in']) b[m] = () => b;
    b.gte = () => { b._gte = true; return b; };
    b.order = () => { b._ordered = true; return b; };
    b.insert = (payload) => {
      inserts.push({ table, payload });
      b._inserted = Array.isArray(payload) ? payload[0] : payload;
      return b; // allow .select().single() chaining
    };
    b.single = () => Promise.resolve({ data: { id: 'ins-1', ...(b._inserted || {}) }, error: null });
    b.update = (payload) => { updates.push({ table, payload }); return b; };
    b.limit = (n) => {
      if (table === 'proactive_insights') {
        return Promise.resolve({ data: b._ordered ? priorRows : cooldownRows, error: null });
      }
      if (table === 'messaging_channels') return Promise.resolve({ data: channelRows, error: null });
      if (b._gte) return Promise.resolve({ data: actualRows, error: null });
      return Promise.resolve({ data: n === 12 ? reflectionRows : signalRows, error: null });
    };
    b.then = (resolve, reject) => Promise.resolve({ data: null, error: null }).then(resolve, reject);
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

const deliverInsightMock = vi.fn();
vi.mock('../../../api/services/messageRouter.js', () => ({
  deliverInsight: (...a) => deliverInsightMock(...a),
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
function happyLLM(synthText = 'I ran your next month 8 times — book the trip.') {
  completeMock.mockImplementation(({ serviceName }) =>
    Promise.resolve({ content: serviceName === 'future-simulation-synthesis' ? synthText : SCENARIO })
  );
}

describe('simulateFutures', () => {
  beforeEach(() => {
    completeMock.mockReset();
    inserts.length = 0;
    updates.length = 0;
    cooldownRows = []; priorRows = []; actualRows = []; channelRows = [];
    seedEnough();
  });

  it('runs one call per lens plus one synthesis, returns the consensus', async () => {
    happyLLM();
    const result = await simulateFutures('u1', { runs: 8 });
    expect(result.runs).toBe(8);
    expect(result.insight).toMatch(/ran your next month/);
    expect(completeMock).toHaveBeenCalledTimes(9);
  });

  it('what-if scenario conditions every lens run AND the synthesis framing', async () => {
    happyLLM('If you take the Lisbon job...');
    await simulateFutures('u1', { runs: 4, scenario: 'taking the job in Lisbon' });

    const lensCalls = completeMock.mock.calls.filter(([o]) => o.serviceName === 'future-simulation-run');
    expect(lensCalls.length).toBe(4);
    for (const [opts] of lensCalls) {
      expect(opts.messages[0].content).toContain('taking the job in Lisbon');
      expect(opts.messages[0].content).toContain('CONDITION');
    }
    const synth = completeMock.mock.calls.find(([o]) => o.serviceName === 'future-simulation-synthesis');
    expect(synth[0].system).toContain('taking the job in Lisbon');
  });

  it('feedback injects last prediction + reality into the synthesis prompt', async () => {
    happyLLM();
    await simulateFutures('u1', {
      runs: 2,
      feedback: { prediction: 'block Wednesday afternoons', actuals: ['kept Wednesday free twice'] },
    });
    const synth = completeMock.mock.calls.find(([o]) => o.serviceName === 'future-simulation-synthesis');
    expect(synth[0].system).toContain('LAST PREDICTION: block Wednesday afternoons');
    expect(synth[0].system).toContain('kept Wednesday free twice');
    expect(synth[0].system).toMatch(/checking the last prediction against reality/);
  });

  it('tolerates junk runs and still synthesizes from the survivors', async () => {
    let n = 0;
    completeMock.mockImplementation(({ serviceName }) => {
      if (serviceName === 'future-simulation-synthesis') return Promise.resolve({ content: 'Consensus.' });
      n++;
      return Promise.resolve({ content: n % 2 === 0 ? 'not json' : SCENARIO });
    });
    const result = await simulateFutures('u1', { runs: 8 });
    expect(result.runs).toBe(4);
  });

  it('returns null without any LLM call when seed data is too thin', async () => {
    reflectionRows = [{ content: 'one' }];
    signalRows = [];
    expect(await simulateFutures('u1')).toBe(null);
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('has 8 distinct lenses', () => {
    expect(new Set(SIMULATION_LENSES).size).toBe(8);
  });
});

describe('runWeeklySimulation (the self-correcting loop)', () => {
  beforeEach(() => {
    completeMock.mockReset();
    deliverInsightMock.mockReset().mockResolvedValue({ delivered: 1, channels: [{ channel: 'telegram', success: true }] });
    inserts.length = 0;
    updates.length = 0;
    cooldownRows = []; priorRows = []; actualRows = []; channelRows = [];
    seedEnough();
    happyLLM('Weekly consensus.');
  });

  it('stores with scenarios metadata and routes through the multi-channel deliverInsight', async () => {
    const r = await runWeeklySimulation('u1');

    expect(r.stored).toBe(true);
    expect(r.delivered).toBe(true);
    const insert = inserts.find((i) => i.table === 'proactive_insights');
    expect(insert.payload.category).toBe('future_simulation');
    expect(insert.payload.metadata.runs).toBe(8);
    expect(insert.payload.metadata.scenarios.length).toBe(8);
    // routed through the channel-agnostic router (it delivered to Telegram in prod)
    expect(deliverInsightMock).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'ins-1', category: 'future_simulation' }));
    // delivered marked so chat doesn't double-announce it
    expect(updates.some((u) => u.table === 'proactive_insights' && u.payload.delivered === true)).toBe(true);
  });

  it('closes the loop: prior prediction + actuals reach the synthesis', async () => {
    priorRows = [{ insight: 'block Wednesday afternoons', created_at: new Date(Date.now() - 7 * 86400_000).toISOString() }];
    actualRows = [{ content: 'Worked through Wednesday afternoon on coding sprint' }];

    const r = await runWeeklySimulation('u1');
    expect(r.hadFeedback).toBe(true);
    const synth = completeMock.mock.calls.find(([o]) => o.serviceName === 'future-simulation-synthesis');
    expect(synth[0].system).toContain('block Wednesday afternoons');
    expect(synth[0].system).toContain('Worked through Wednesday afternoon');
  });

  it('survives every channel being down (stored, not delivered, no throw)', async () => {
    deliverInsightMock.mockResolvedValue({ delivered: 0, channels: [{ channel: 'whatsapp', success: false }] });
    const r = await runWeeklySimulation('u1');
    expect(r.stored).toBe(true);
    expect(r.delivered).toBe(false);
    // not marked delivered, so cron-deliver-insights will retry it
    expect(updates.some((u) => u.payload.delivered === true)).toBe(false);
  });

  it('skips on the 6-day cooldown without LLM calls', async () => {
    cooldownRows = [{ id: 'sim-1' }];
    const r = await runWeeklySimulation('u1');
    expect(r.skipped).toBe('cooldown');
    expect(completeMock).not.toHaveBeenCalled();
  });
});
