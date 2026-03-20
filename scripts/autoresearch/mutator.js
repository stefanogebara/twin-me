/**
 * Analyze failing criteria and generate ONE targeted prompt edit.
 * Returns the full updated prompt (or null if mutation failed).
 */

import { DEFAULTS } from './config.js';

const MUTATOR_SYSTEM = `You are an expert prompt engineer. Your job is to make ONE small, targeted edit to improve an LLM prompt.

Rules:
- Change ONLY what's needed to fix the specific failing criterion
- Keep the overall structure and tone intact
- Do NOT rewrite the whole prompt
- Mark your change with [CHANGED] ... [/CHANGED] tags
- Return the COMPLETE prompt with your edit applied`;

export async function mutatePrompt(currentPrompt, failingCriteria, scoreResults, complete) {
  if (failingCriteria.length === 0) return { prompt: currentPrompt, change: 'No changes needed', changed: false };

  // Pick the most-failing criterion
  const worstCriterion = failingCriteria[0];

  // Collect failure reasons from judge
  const failureReasons = [];
  for (const result of scoreResults.results) {
    if (!result.scores) continue;
    const criterion = result.scores.criteria.find(c => c.id === worstCriterion.id);
    if (criterion && !criterion.pass) {
      failureReasons.push(criterion.reason || 'no reason given');
    }
  }

  // Truncate prompt if very long (keep first and last 1000 chars to fit in timeout)
  let promptExcerpt = currentPrompt;
  if (currentPrompt.length > 2500) {
    promptExcerpt = currentPrompt.slice(0, 1200) + '\n\n[... middle truncated ...]\n\n' + currentPrompt.slice(-1000);
  }

  const mutationRequest = `CURRENT PROMPT:
"""
${promptExcerpt}
"""

FAILING CRITERION (pass rate: ${Math.round((worstCriterion.passRate || 0) * 100)}%):
"${worstCriterion.text}"

FAILURE REASONS FROM JUDGE:
${failureReasons.slice(0, 5).map((r, i) => `${i + 1}. ${r}`).join('\n')}

Make ONE specific, targeted edit to the prompt to improve this criterion. Return the COMPLETE updated prompt with [CHANGED] ... [/CHANGED] tags around the changed section.`;

  try {
    const response = await complete({
      tier: 'TIER_ANALYSIS',
      system: MUTATOR_SYSTEM,
      messages: [{ role: 'user', content: mutationRequest }],
      maxTokens: 3000,
      temperature: DEFAULTS.mutatorTemperature,
      userId: '00000000-0000-0000-0000-000000000000',
      serviceName: 'autoresearch-mutate',
    });

    if (!response?.content) return { prompt: currentPrompt, change: 'Mutation failed (empty response)', changed: false };

    // Extract the updated prompt
    let newPrompt = response.content;

    // Strip [CHANGED] tags but record what changed
    const changeMatch = newPrompt.match(/\[CHANGED\]([\s\S]*?)\[\/CHANGED\]/);
    const changeDescription = changeMatch ? changeMatch[1].trim().slice(0, 200) : 'Unknown change';

    newPrompt = newPrompt.replace(/\[CHANGED\]/g, '').replace(/\[\/CHANGED\]/g, '');

    // Strip any markdown code fences the LLM might wrap the prompt in
    newPrompt = newPrompt.replace(/^```[\s\S]*?\n/, '').replace(/\n```\s*$/, '').trim();

    // Validate: reject if diff is too large
    const diffRatio = Math.abs(newPrompt.length - currentPrompt.length) / currentPrompt.length;
    if (diffRatio > DEFAULTS.maxPromptDiffPercent && newPrompt.length < currentPrompt.length * 0.5) {
      return {
        prompt: currentPrompt,
        change: `Rejected: mutation changed ${Math.round(diffRatio * 100)}% of prompt (max ${Math.round(DEFAULTS.maxPromptDiffPercent * 100)}%)`,
        changed: false,
      };
    }

    // Validate: prompt shouldn't be too short
    if (newPrompt.length < currentPrompt.length * 0.3) {
      return { prompt: currentPrompt, change: 'Rejected: mutated prompt too short', changed: false };
    }

    return {
      prompt: newPrompt,
      change: `Fix "${worstCriterion.text}" -- ${changeDescription}`,
      changed: true,
      cost: response.cost || 0,
      targetCriterion: worstCriterion,
    };
  } catch (err) {
    return { prompt: currentPrompt, change: `Mutation error: ${err.message}`, changed: false };
  }
}
