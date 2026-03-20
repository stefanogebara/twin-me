/**
 * Score a prompt against criteria using LLM-as-judge.
 * 1. Run the prompt with test inputs to get output
 * 2. Judge each output against yes/no criteria
 * 3. Return averaged score across all test inputs
 */

import { buildLLMContext } from './promptExtractor.js';

const JUDGE_SYSTEM = `You are a strict quality judge. Score the given output against each criterion.
Return ONLY a JSON object, no other text:
{"criteria": [{"id": 1, "pass": true, "reason": "brief 5-word reason"}, ...], "total_pass": N, "total": M}`;

export async function scorePrompt(target, prompt, testData, complete) {
  const { testInputs, contextData } = testData;
  const inputs = testInputs.length > 0 ? testInputs : [{ role: 'user', content: 'Tell me about myself.' }];

  const allResults = [];
  let totalCost = 0;

  for (const input of inputs) {
    try {
      // Step 1: Run the prompt to get output
      const llmContext = buildLLMContext(target, prompt, input, contextData);
      const response = await complete({
        tier: 'TIER_ANALYSIS',
        system: llmContext.system,
        messages: llmContext.messages,
        maxTokens: 500,
        temperature: 0.6,
        userId: '00000000-0000-0000-0000-000000000000',
        serviceName: `autoresearch-${target.id}-generate`,
      });

      if (!response?.content) {
        allResults.push({ input, output: null, scores: null, error: 'Empty LLM response' });
        continue;
      }

      totalCost += response.cost || 0;

      // Step 2: Judge the output
      const criteriaText = target.criteria.map(c => `${c.id}. ${c.text}`).join('\n');
      const judgePrompt = `OUTPUT TO JUDGE:\n"""${response.content}"""\n\nCRITERIA:\n${criteriaText}\n\nScore each criterion as pass (true) or fail (false).`;

      const judgeResponse = await complete({
        tier: 'TIER_ANALYSIS',
        system: JUDGE_SYSTEM,
        messages: [{ role: 'user', content: judgePrompt }],
        maxTokens: 300,
        temperature: 0,
        userId: '00000000-0000-0000-0000-000000000000',
        serviceName: `autoresearch-${target.id}-judge`,
      });

      totalCost += judgeResponse?.cost || 0;

      // Step 3: Parse judge response
      const parsed = parseJudgeResponse(judgeResponse?.content, target.criteria.length);
      allResults.push({ input, output: response.content, scores: parsed });

    } catch (err) {
      // Retry once
      try {
        const llmContext = buildLLMContext(target, prompt, input, contextData);
        const retryResponse = await complete({
          tier: 'TIER_ANALYSIS',
          system: llmContext.system,
          messages: llmContext.messages,
          maxTokens: 500,
          temperature: 0.6,
          userId: '00000000-0000-0000-0000-000000000000',
          serviceName: `autoresearch-${target.id}-generate-retry`,
        });
        totalCost += retryResponse?.cost || 0;

        const criteriaText = target.criteria.map(c => `${c.id}. ${c.text}`).join('\n');
        const judgeResponse = await complete({
          tier: 'TIER_ANALYSIS',
          system: JUDGE_SYSTEM,
          messages: [{ role: 'user', content: `OUTPUT TO JUDGE:\n"""${retryResponse?.content}"""\n\nCRITERIA:\n${criteriaText}` }],
          maxTokens: 300,
          temperature: 0,
          userId: '00000000-0000-0000-0000-000000000000',
          serviceName: `autoresearch-${target.id}-judge-retry`,
        });
        totalCost += judgeResponse?.cost || 0;

        const parsed = parseJudgeResponse(judgeResponse?.content, target.criteria.length);
        allResults.push({ input, output: retryResponse?.content, scores: parsed });
      } catch (retryErr) {
        allResults.push({ input, output: null, scores: null, error: retryErr.message });
      }
    }
  }

  // Aggregate scores
  const validResults = allResults.filter(r => r.scores);
  if (validResults.length === 0) {
    return { score: 0, results: allResults, failingCriteria: target.criteria.map(c => c.id), cost: totalCost };
  }

  // Per-criterion pass rate
  const criterionPassCounts = {};
  for (const c of target.criteria) criterionPassCounts[c.id] = 0;

  for (const result of validResults) {
    for (const s of result.scores.criteria) {
      if (s.pass) criterionPassCounts[s.id] = (criterionPassCounts[s.id] || 0) + 1;
    }
  }

  const totalChecks = validResults.length * target.criteria.length;
  const totalPassing = Object.values(criterionPassCounts).reduce((a, b) => a + b, 0);
  const score = totalPassing / totalChecks;

  // Find most-failing criteria
  const failingCriteria = target.criteria
    .map(c => ({ ...c, passRate: (criterionPassCounts[c.id] || 0) / validResults.length }))
    .filter(c => c.passRate < 1)
    .sort((a, b) => a.passRate - b.passRate);

  return {
    score,
    totalPassing,
    totalChecks,
    results: allResults,
    criterionPassRates: Object.fromEntries(
      target.criteria.map(c => [c.id, (criterionPassCounts[c.id] || 0) / validResults.length])
    ),
    failingCriteria,
    cost: totalCost,
  };
}

function parseJudgeResponse(content, expectedCount) {
  if (!content) return { criteria: [], total_pass: 0, total: expectedCount };

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.criteria && Array.isArray(parsed.criteria)) {
        return parsed;
      }
    }
  } catch {}

  // Fallback: try to extract individual pass/fail from text
  const criteria = [];
  for (let i = 1; i <= expectedCount; i++) {
    const passMatch = content.match(new RegExp(`"id":\\s*${i}[^}]*"pass":\\s*(true|false)`, 'i'));
    criteria.push({ id: i, pass: passMatch ? passMatch[1] === 'true' : false, reason: 'parsed from text' });
  }
  return { criteria, total_pass: criteria.filter(c => c.pass).length, total: expectedCount };
}
