/**
 * Future Simulation — "Doctor Strange mode" (MiroFish-lite, 2026-06-12).
 * ======================================================================
 * MiroFish (github.com/666ghj/MiroFish) predicts outcomes by simulating
 * thousands of agents in a parallel world. TwinMe holds the highest-fidelity
 * seed that exists for ONE person — the memory stream + personality profile —
 * so we run the same shape at personal scale:
 *
 *   1. SEED: top reflections + recent behavioral facts (no LLM).
 *   2. SWARM: N parallel twin VARIATIONS, each simulating the user's next
 *      month through a distinct lens (optimistic, cautious, social, health,
 *      creative, financial, adventurous, grounded). TIER_ANALYSIS — pennies.
 *   3. CONSENSUS: one synthesis call folds the runs into a single
 *      Doctor-Strange-style message: "I ran your next month N times — in K of
 *      them, X made the difference."
 *
 * Surfaces (one-interface: no page):
 *   - chat tool `simulate_future` ("what should my next month look like?")
 *   - weekly proactive insight (category future_simulation) riding the
 *     existing delivery rails (chat context + WhatsApp).
 */

import { supabaseAdmin } from './database.js';
import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { createLogger } from './logger.js';

const log = createLogger('future-simulation');

// The swarm's variation axes — MiroFish's "independent agents", personalized.
export const SIMULATION_LENSES = [
  'optimistic — things break the user\'s way',
  'cautious — risks materialize, energy is scarce',
  'social — relationships drive the month',
  'health-first — body and recovery set the pace',
  'creative — novelty and side projects pull hardest',
  'financial — money pressure shapes choices',
  'adventurous — the user says yes to the unusual',
  'grounded — routine wins, consistency compounds',
];

const MIN_MEMORIES = 20;

/** Seed: the strongest reflections + freshest behavioral facts. Pure DB. */
async function gatherSeed(userId) {
  const [{ data: reflections }, { data: signals }] = await Promise.all([
    supabaseAdmin
      .from('user_memories')
      .select('content')
      .eq('user_id', userId)
      .eq('memory_type', 'reflection')
      .order('importance_score', { ascending: false })
      .limit(12),
    supabaseAdmin
      .from('user_memories')
      .select('content, memory_type')
      .eq('user_id', userId)
      .in('memory_type', ['fact', 'platform_data', 'observation'])
      .order('created_at', { ascending: false })
      .limit(15),
  ]);
  return {
    reflections: (reflections || []).map((r) => r.content),
    signals: (signals || []).map((r) => r.content),
  };
}

function parseJson(content) {
  try {
    return JSON.parse(String(content || '').replace(/```json|```/g, '').trim());
  } catch {
    return null;
  }
}

/**
 * Run the personal swarm. Returns { insight, runs, scenarios } or null when
 * there isn't enough memory to simulate honestly.
 */
export async function simulateFutures(userId, { runs = 8, horizonDays = 30 } = {}) {
  const seed = await gatherSeed(userId);
  if (seed.reflections.length + seed.signals.length < MIN_MEMORIES / 2) {
    log.info(`not enough seed data for user ${userId}`);
    return null;
  }

  const seedBlock =
    `WHO THIS PERSON IS (deep patterns):\n${seed.reflections.map((r) => `- ${r.slice(0, 200)}`).join('\n')}\n\n` +
    `RECENT BEHAVIOR:\n${seed.signals.map((s) => `- ${s.slice(0, 150)}`).join('\n')}`;

  const lenses = SIMULATION_LENSES.slice(0, Math.max(2, Math.min(runs, SIMULATION_LENSES.length)));

  // 2. The swarm — independent parallel variations.
  const scenarioResults = await Promise.all(
    lenses.map((lens) =>
      complete({
        tier: TIER_ANALYSIS,
        system:
          'You simulate ONE plausible variation of a specific person\'s near future, ' +
          'grounded strictly in their real behavioral patterns. No mysticism, no generic advice — ' +
          'concrete, specific to THIS person. Answer with ONLY a JSON object: ' +
          '{"keyMoment": string, "bestDecision": string, "biggestRisk": string, "happinessDriver": string}',
        messages: [{
          role: 'user',
          content: `${seedBlock}\n\nSimulate this person's next ${horizonDays} days through this lens: ${lens}.`,
        }],
        maxTokens: 300,
        temperature: 0.9, // variation IS the point
        userId,
        serviceName: 'future-simulation-run',
        skipCache: true,
      })
        .then((r) => parseJson(r?.content))
        .catch((err) => {
          log.warn(`simulation run failed (${lens.split(' ')[0]}): ${err.message}`);
          return null;
        })
    )
  );

  const scenarios = scenarioResults.filter(Boolean);
  if (scenarios.length < 2) {
    log.warn(`only ${scenarios.length} simulation runs survived for user ${userId}`);
    return null;
  }

  // 3. Consensus synthesis — one call folds the swarm into one message.
  const synthesis = await complete({
    tier: TIER_ANALYSIS,
    system:
      'You are the person\'s digital twin reporting back from simulating their future. ' +
      `You ran ${scenarios.length} independent simulations of their next ${horizonDays} days. ` +
      'Find the CONSENSUS: which decision/driver appears across the most runs? ' +
      'Write 2-4 sentences, first person as their twin ("I ran your next month ' +
      `${scenarios.length} times..."), naming how many runs agreed and the single most ` +
      'consequential concrete recommendation. Direct, warm, specific. No emojis, no markdown.',
    messages: [{ role: 'user', content: JSON.stringify(scenarios) }],
    maxTokens: 220,
    temperature: 0.4,
    userId,
    serviceName: 'future-simulation-synthesis',
    skipCache: true,
  });

  const insight = (synthesis?.content || '').trim();
  if (!insight) return null;

  log.info(`simulated ${scenarios.length} futures for user ${userId}`);
  return { insight, runs: scenarios.length, scenarios };
}

/**
 * Weekly entry point: simulate + store as a proactive insight so it rides the
 * existing delivery rails (chat "THINGS I NOTICED" + WhatsApp insight push).
 * Skips users simulated in the last 6 days (cron-overlap guard).
 */
export async function runWeeklySimulation(userId) {
  const since = new Date(Date.now() - 6 * 24 * 3600_000).toISOString();
  const { data: recent } = await supabaseAdmin
    .from('proactive_insights')
    .select('id')
    .eq('user_id', userId)
    .eq('category', 'future_simulation')
    .gte('created_at', since)
    .limit(1);
  if (recent?.length) return { skipped: 'cooldown' };

  const result = await simulateFutures(userId);
  if (!result) return { skipped: 'insufficient_data' };

  const { error } = await supabaseAdmin.from('proactive_insights').insert({
    user_id: userId,
    insight: result.insight.substring(0, 500),
    urgency: 'medium',
    category: 'future_simulation',
  });
  if (error) {
    log.warn(`insight store failed for ${userId}: ${error.message}`);
    return { skipped: 'store_failed' };
  }
  return { stored: true, runs: result.runs };
}
