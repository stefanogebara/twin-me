/**
 * Multi-run eval wrapper — runs an eval N times and reports mean/std/min/max.
 * Reduces LLM-as-judge variance by averaging.
 *
 * Usage:
 *   node twin-research/multi-run-eval.js memory 3
 *   node twin-research/multi-run-eval.js insight 3
 */

import { execFileSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const EVAL_MAP = {
  memory:   { file: 'memory-eval.js',   scoreKey: 'memory_relevance_score' },
  insight:  { file: 'insight-eval.js',   scoreKey: 'insight_quality_score' },
  twin:     { file: 'twin-eval.js',      scoreKey: 'twin_quality_score' },
  coldstart:{ file: 'coldstart-eval.js', scoreKey: 'coldstart_quality_score' },
};

const evalType = process.argv[2] || 'memory';
const runs = parseInt(process.argv[3] || '3', 10);
const config = EVAL_MAP[evalType];

if (!config) {
  console.error(`Unknown eval type: ${evalType}. Use: ${Object.keys(EVAL_MAP).join(', ')}`);
  process.exit(1);
}

console.log(`Running ${config.file} x${runs}...\n`);

const scores = [];
for (let i = 0; i < runs; i++) {
  const start = Date.now();
  try {
    const output = execFileSync(
      process.execPath,
      [join(__dirname, config.file)],
      { cwd: repoRoot, timeout: 300_000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const match = output.match(new RegExp(`${config.scoreKey}:\\s*([\\d.]+)`));
    if (match) {
      const score = parseFloat(match[1]);
      scores.push(score);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  Run ${i + 1}: ${score.toFixed(6)} (${elapsed}s)`);
    } else {
      console.log(`  Run ${i + 1}: FAILED (no score in output)`);
    }
  } catch (err) {
    console.log(`  Run ${i + 1}: ERROR (${err.message?.slice(0, 80)})`);
  }
}

if (scores.length === 0) {
  console.log('\nNo successful runs.');
  process.exit(1);
}

const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
const std = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);
const min = Math.min(...scores);
const max = Math.max(...scores);

console.log(`\n${'─'.repeat(40)}`);
console.log(`${config.scoreKey} (${scores.length} runs):`);
console.log(`  mean:  ${mean.toFixed(6)}`);
console.log(`  std:   ${std.toFixed(6)}`);
console.log(`  min:   ${min.toFixed(6)}`);
console.log(`  max:   ${max.toFixed(6)}`);
console.log(`  range: ${(max - min).toFixed(6)}`);
