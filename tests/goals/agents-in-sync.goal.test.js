/**
 * Both agents read the same instructions.
 *
 * Claude Code reads CLAUDE.md; Codex reads AGENTS.md. On 2026-09-19 the second was a
 * 170-line-drifted copy of the first that still named a design system retired a week
 * earlier, and a review built on it shipped off-register. AGENTS.md is generated
 * (scripts/sync-agents.mjs); this says so the day somebody edits it by hand.
 */
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('AGENTS.md is CLAUDE.md, byte for byte', () => {
  expect(readFileSync('AGENTS.md', 'utf8')).toBe(readFileSync('CLAUDE.md', 'utf8'));
});
