/**
 * Inngest Function: Action Reflection — Twin Learns from Outcomes
 * ================================================================
 * Daily cron analyzes resolved agent_actions from the past 7 days.
 * Groups outcomes by skill, detects patterns, and codifies successful
 * approaches as procedural memories. Also suggests autonomy upgrades
 * when acceptance rate exceeds 80%.
 *
 * Steps:
 *   1. gather-outcomes     — Query resolved agent_actions (last 7 days)
 *   2. analyze-patterns    — Group by skill, calculate acceptance rates
 *   3. collect-dpo-pairs   — Create DPO preference pairs from accepted vs rejected
 *   4. generate-procedures — Create procedure memories for repeated successes
 *   5. autonomy-suggestions — Suggest level changes based on acceptance rates
 *   6. compose-reflection  — LLM summarizes what the twin learned
 *   7. store-results       — Save procedures + deliver autonomy suggestions
 *
 * Cost: ~$0.002 per user (TIER_EXTRACTION for procedure + reflection)
 * Cron: daily 5am UTC
 */

import { inngest, EVENTS } from '../../services/inngestClient.js';
import { complete, TIER_EXTRACTION } from '../../services/llmGateway.js';
import { addMemory } from '../../services/memoryStreamService.js';
import { getBlocks, updateBlock } from '../../services/coreMemoryService.js';
import { collectFromActionFeedback } from '../../services/finetuning/preferenceCollector.js';
import { supabaseAdmin } from '../../services/database.js';
import { createLogger } from '../../services/logger.js';

const log = createLogger('ActionReflection');

const MIN_ACTIONS_FOR_PROCEDURE = 5;
const MIN_ACTIONS_FOR_AUTONOMY = 5;
const ACCEPTANCE_UPGRADE_THRESHOLD = 0.8;
const ACCEPTANCE_DOWNGRADE_THRESHOLD = 0.2;
const LOOKBACK_DAYS = 7;
const AUTONOMY_LOOKBACK_DAYS = 14;

export const actionReflectionFunction = inngest.createFunction(
  { id: 'action-reflection', name: 'Action Reflection Engine', retries: 1 },
  { event: EVENTS.ACTION_REFLECTION },
  async ({ event, step }) => {
    const { userId } = event.data;

    // Step 1: Gather resolved outcomes from last 7 days
    const outcomes = await step.run('gather-outcomes', async () => {
      const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabaseAdmin
        .from('agent_actions')
        .select('id, skill_name, action_type, action_content, user_response, outcome_data, created_at')
        .eq('user_id', userId)
        .not('resolved_at', 'is', null)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false });

      if (error) {
        log.error('Failed to fetch outcomes', { userId, error: error.message });
        return [];
      }

      log.info('Gathered outcomes', { userId, count: data?.length || 0 });
      return data || [];
    });

    if (outcomes.length < 3) {
      return { skipped: true, reason: 'insufficient_outcomes', count: outcomes.length };
    }

    // Step 2: Analyze patterns — group by skill, calculate acceptance rates
    const analysis = await step.run('analyze-patterns', () => {
      const bySkill = {};

      for (const action of outcomes) {
        const skill = action.skill_name || 'general';
        if (!bySkill[skill]) {
          bySkill[skill] = { accepted: 0, rejected: 0, ignored: 0, total: 0, examples: [] };
        }

        bySkill[skill].total++;

        const response = action.user_response?.toLowerCase() || '';
        if (response === 'accepted' || response === 'positive') {
          bySkill[skill].accepted++;
        } else if (response === 'rejected' || response === 'negative') {
          bySkill[skill].rejected++;
        } else {
          bySkill[skill].ignored++;
        }

        // Keep top 3 examples per skill for procedure generation
        if (bySkill[skill].examples.length < 3) {
          bySkill[skill].examples.push({
            content: (action.action_content || '').slice(0, 200),
            response: action.user_response,
            outcome: action.outcome_data,
          });
        }
      }

      // Calculate rates
      for (const skill of Object.keys(bySkill)) {
        const s = bySkill[skill];
        const responded = s.accepted + s.rejected;
        s.acceptanceRate = responded > 0 ? s.accepted / responded : 0;
        s.responseRate = s.total > 0 ? responded / s.total : 0;
      }

      return bySkill;
    });

    // Step 3: Collect DPO preference pairs from accepted vs rejected actions
    const dpoPairs = await step.run('collect-dpo-pairs', async () => {
      let totalCreated = 0;
      let totalSkipped = 0;

      for (const [skill, stats] of Object.entries(analysis)) {
        // Need both accepted AND rejected to form a preference pair
        if (stats.accepted === 0 || (stats.total - stats.accepted - stats.ignored) === 0) continue;

        const skillActions = outcomes
          .filter(a => (a.skill_name || 'general') === skill)
          .map(a => ({ content: (a.action_content || '').slice(0, 500), response: a.user_response }));

        const result = await collectFromActionFeedback(userId, skill, skillActions);
        totalCreated += result.created;
        totalSkipped += result.skipped;
      }

      log.info('DPO pairs collected from actions', { userId, created: totalCreated, skipped: totalSkipped });
      return { created: totalCreated, skipped: totalSkipped };
    });

    // Step 4: Generate procedure memories for skills with 5+ accepted actions
    const procedures = await step.run('generate-procedures', async () => {
      const created = [];

      for (const [skill, stats] of Object.entries(analysis)) {
        if (stats.accepted < MIN_ACTIONS_FOR_PROCEDURE) continue;

        // Build examples summary for LLM
        const exampleText = stats.examples
          .filter(e => e.response === 'accepted' || e.response === 'positive')
          .map(e => `- ${e.content}`)
          .join('\n');

        if (!exampleText) continue;

        try {
          const response = await complete({
            messages: [{
              role: 'user',
              content: `Analyze these accepted twin actions for the "${skill}" skill and extract a reusable procedure.

ACCEPTED ACTIONS (${stats.accepted} total, ${Math.round(stats.acceptanceRate * 100)}% acceptance rate):
${exampleText}

Write a concise procedure (2-3 sentences) describing:
1. When this approach works (conditions)
2. What makes it effective (framing/timing)
3. What to avoid (if any rejections hint at failure modes)

Write as an instruction for the twin, not as analysis. Example: "When user has low recovery and a packed calendar, suggest rescheduling with 'protect your energy' framing. Best delivered in morning briefing, not during evening recap."

Procedure:`
            }],
            tier: TIER_EXTRACTION,
            maxTokens: 200,
            temperature: 0.3,
            userId,
            serviceName: 'inngest-action-reflection-procedure',
          });

          const procedureText = (response?.content || response?.text || '').trim();
          if (procedureText && procedureText.length > 20) {
            // Store as procedure memory
            const mem = await addMemory(
              userId,
              `[PROCEDURE:${skill}] ${procedureText}`,
              'fact',
              { source: 'action_reflection', skill_name: skill, procedure: true },
              { importanceScore: 8 }
            );

            if (mem?.id) {
              created.push({ skill, procedureId: mem.id, text: procedureText.slice(0, 100) });
            }
          }
        } catch (err) {
          log.warn('Procedure generation failed', { userId, skill, error: err.message });
        }
      }

      return created;
    });

    // Step 5: Check autonomy suggestions (14-day window)
    const autonomySuggestions = await step.run('check-autonomy-suggestions', async () => {
      const suggestions = [];
      const cutoff = new Date(Date.now() - AUTONOMY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

      // Get 14-day stats per skill
      const { data: recentActions } = await supabaseAdmin
        .from('agent_actions')
        .select('skill_name, user_response')
        .eq('user_id', userId)
        .not('resolved_at', 'is', null)
        .gte('created_at', cutoff);

      if (!recentActions?.length) return suggestions;

      const bySkill = {};
      for (const action of recentActions) {
        const skill = action.skill_name || 'general';
        if (!bySkill[skill]) bySkill[skill] = { accepted: 0, rejected: 0, total: 0 };
        bySkill[skill].total++;
        const r = action.user_response?.toLowerCase() || '';
        if (r === 'accepted' || r === 'positive') bySkill[skill].accepted++;
        else if (r === 'rejected' || r === 'negative') bySkill[skill].rejected++;
      }

      for (const [skill, stats] of Object.entries(bySkill)) {
        if (stats.total < MIN_ACTIONS_FOR_AUTONOMY) continue;
        const responded = stats.accepted + stats.rejected;
        if (responded === 0) continue;

        const rate = stats.accepted / responded;

        if (rate >= ACCEPTANCE_UPGRADE_THRESHOLD) {
          suggestions.push({
            skill,
            direction: 'upgrade',
            rate: Math.round(rate * 100),
            accepted: stats.accepted,
            total: responded,
            message: `You've accepted ${stats.accepted}/${responded} of my ${skill.replace(/_/g, ' ')} suggestions. Want me to handle these more autonomously?`,
          });
        } else if (rate <= ACCEPTANCE_DOWNGRADE_THRESHOLD) {
          suggestions.push({
            skill,
            direction: 'downgrade',
            rate: Math.round(rate * 100),
            accepted: stats.accepted,
            total: responded,
            message: `Only ${stats.accepted}/${responded} of my ${skill.replace(/_/g, ' ')} suggestions were helpful. Should I dial back and just observe for a while?`,
          });
        }
      }

      return suggestions;
    });

    // Step 6: Compose reflection summary
    const reflection = await step.run('compose-reflection', async () => {
      const skillSummaries = Object.entries(analysis)
        .map(([skill, stats]) => `${skill}: ${stats.accepted} accepted, ${stats.rejected} rejected, ${stats.ignored} ignored (${Math.round(stats.acceptanceRate * 100)}% acceptance)`)
        .join('\n');

      try {
        const response = await complete({
          messages: [{
            role: 'user',
            content: `Summarize what this twin learned from its recent actions in 2-3 sentences. Be specific about patterns.

ACTION OUTCOMES (last 7 days):
${skillSummaries}

${procedures.length > 0 ? `NEW PROCEDURES LEARNED:\n${procedures.map(p => `- ${p.skill}: ${p.text}`).join('\n')}` : ''}

${autonomySuggestions.length > 0 ? `AUTONOMY OBSERVATIONS:\n${autonomySuggestions.map(s => `- ${s.skill}: ${s.direction} (${s.rate}% acceptance)`).join('\n')}` : ''}

Write a brief reflection as if the twin is thinking about what it learned. Start with "I learned that..." or "I noticed that..."`
          }],
          tier: TIER_EXTRACTION,
          maxTokens: 200,
          temperature: 0.4,
          userId,
          serviceName: 'inngest-action-reflection-summary',
        });

        return (response?.content || response?.text || '').trim();
      } catch (err) {
        log.warn('Reflection composition failed', { userId, error: err.message });
        return null;
      }
    });

    // Step 7: Store results and deliver suggestions
    const results = await step.run('store-and-deliver', async () => {
      const stored = { reflection: false, autonomySuggestions: 0 };

      // Store reflection as memory
      if (reflection && reflection.length > 20) {
        await addMemory(
          userId,
          reflection,
          'reflection',
          { source: 'action_reflection', expert: 'self_improvement' },
          { importanceScore: 7 }
        );
        stored.reflection = true;
      }

      // Deliver autonomy suggestions as insights
      for (const suggestion of autonomySuggestions) {
        try {
          await supabaseAdmin
            .from('proactive_insights')
            .insert({
              user_id: userId,
              category: 'suggestion',
              insight: suggestion.message,
              urgency: 'low',
              source_data: {
                type: 'autonomy_suggestion',
                skill: suggestion.skill,
                direction: suggestion.direction,
                acceptance_rate: suggestion.rate,
              },
              delivered: false,
            });
          stored.autonomySuggestions++;
        } catch (err) {
          log.warn('Failed to store autonomy suggestion', { userId, skill: suggestion.skill, error: err.message });
        }
      }

      // Update GOALS block if we learned significant procedures
      if (procedures.length > 0) {
        try {
          const blocks = await getBlocks(userId);
          const currentGoals = blocks.goals?.content || '';
          const procedureSummary = procedures.map(p => `- Learned: ${p.text}`).join('\n');
          const updatedGoals = currentGoals
            ? `${currentGoals}\n\nRECENT LEARNINGS:\n${procedureSummary}`
            : `RECENT LEARNINGS:\n${procedureSummary}`;

          // Keep under 800 chars (GOALS block limit)
          if (updatedGoals.length <= 800) {
            await updateBlock(userId, 'goals', updatedGoals);
          }
        } catch (err) {
          log.warn('Failed to update GOALS block', { userId, error: err.message });
        }
      }

      return stored;
    });

    log.info('Action reflection complete', {
      userId,
      outcomes: outcomes.length,
      dpoPairsCreated: dpoPairs.created,
      procedures: procedures.length,
      autonomySuggestions: autonomySuggestions.length,
      reflectionStored: results.reflection,
    });

    return {
      success: true,
      outcomes: outcomes.length,
      dpoPairsCreated: dpoPairs.created,
      procedures: procedures.length,
      autonomySuggestions: autonomySuggestions.length,
      reflectionStored: results.reflection,
    };
  }
);
