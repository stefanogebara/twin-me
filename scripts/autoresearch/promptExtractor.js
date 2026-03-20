/**
 * Extract current prompt text from TwinMe source files.
 * Reads files as raw text and uses regex to pull the prompt string.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(process.cwd());

export function extractPrompt(target) {
  const filePath = resolve(ROOT, target.sourceFile);
  const source = readFileSync(filePath, 'utf-8');

  // Special handling for reflections (array of expert personas)
  if (target.id === 'reflections') {
    return extractExpertPrompt(source, target.expertIndex ?? 0);
  }

  const match = source.match(target.extractPattern);
  if (!match || !match[1]) {
    throw new Error(
      `Failed to extract prompt from ${target.sourceFile}. ` +
      `Pattern: ${target.extractPattern}. File length: ${source.length} chars.`
    );
  }

  const prompt = match[1].trim();
  if (prompt.length < 50) {
    throw new Error(`Extracted prompt too short (${prompt.length} chars) -- likely a regex issue.`);
  }

  return prompt;
}

function extractExpertPrompt(source, expertIndex) {
  const arrayMatch = source.match(/EXPERT_PERSONAS\s*=\s*\[([\s\S]*?)\];/);
  if (!arrayMatch) throw new Error('Could not find EXPERT_PERSONAS array');

  const arrayContent = arrayMatch[1];
  const promptPattern = /prompt:\s*`([\s\S]*?)`/g;
  const prompts = [];
  let m;
  while ((m = promptPattern.exec(arrayContent)) !== null) {
    prompts.push(m[1].trim());
  }

  if (prompts.length === 0) throw new Error('No expert prompts found in EXPERT_PERSONAS');
  if (expertIndex >= prompts.length) throw new Error(`Expert index ${expertIndex} out of range (${prompts.length} experts)`);

  return prompts[expertIndex];
}

/**
 * Build the full LLM call context for a target.
 * Returns { system, messages } ready for complete().
 */
export function buildLLMContext(target, prompt, testInput, contextData) {
  switch (target.id) {
    case 'twin-chat':
      return {
        system: prompt + (contextData?.twinSummary ? `\n\nTWIN SUMMARY:\n${contextData.twinSummary}` : '')
          + (contextData?.memories ? `\n\nRECENT CONTEXT:\n${contextData.memories.map(m => m.content).join('\n')}` : ''),
        messages: [{ role: 'user', content: testInput.content }],
      };

    case 'onboarding':
      return {
        system: prompt,
        messages: [
          ...testInput.history,
          ...(testInput.history.length > 0 ? [] : [{ role: 'user', content: 'Starting interview' }]),
        ],
      };

    case 'reflections':
      return {
        system: 'You are an expert analyst generating personality observations.',
        messages: [{
          role: 'user',
          content: prompt + '\n\nEVIDENCE:\n' + (contextData?.memories || []).map(m => `- ${m.content}`).join('\n'),
        }],
      };

    case 'insights':
      return {
        system: 'Generate proactive insights as JSON.',
        messages: [{
          role: 'user',
          content: prompt
            .replace('{observations}', (contextData?.observations || []).map(m => `- ${m.content}`).join('\n'))
            .replace('{reflections}', (contextData?.reflections || []).map(m => `- ${m.content}`).join('\n')),
        }],
      };

    default:
      throw new Error(`Unknown target: ${target.id}`);
  }
}
