/**
 * Goal: every workflow under .github/workflows parses as YAML (2026-09-20). The nightly was
 * invalid for two days over an unquoted "shadow: money" in a step name, so GitHub ran it with
 * no jobs and nothing said so.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';

const DIR = new URL('../../.github/workflows/', import.meta.url).pathname;

describe('the workflows parse', () => {
  for (const name of readdirSync(DIR).filter((n) => /\.ya?ml$/.test(n))) {
    it(`${name} is valid YAML with jobs`, () => {
      const doc = parse(readFileSync(`${DIR}${name}`, 'utf8'));
      expect(doc && typeof doc === 'object').toBe(true);
      expect(Object.keys(doc.jobs || {}).length).toBeGreaterThan(0);
      for (const [job, def] of Object.entries(doc.jobs)) for (const step of def.steps || []) expect(step && (step.run || step.uses), `${name} ${job} has a step with neither run nor uses`).toBeTruthy();
    });
  }
});
