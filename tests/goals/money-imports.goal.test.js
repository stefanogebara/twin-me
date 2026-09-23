/**
 * The money core can be loaded a module at a time.
 *
 * Two import cycles -- store.js <-> calendar.js and store.js <-> predictions.js -- meant that
 * importing store.js on its own never returned, which on 2026-09-19 killed two diagnostic
 * scripts and is why every test of a store.js consumer mocks the whole module. This walks
 * every module in api/_app/services/money and gives each two seconds to import. The three that
 * hung until M2-1 (factsRepository.js and forecastService.js, 2026-09-19) are gone from the
 * list below; a module goes back on it only with a Decisions entry in docs/roadmap/PROGRESS.md.
 */
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

process.env.SUPABASE_URL ||= 'https://ci-stub.supabase.co';
process.env.SUPABASE_ANON_KEY ||= 'ci-stub-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'ci-stub-service';
process.env.JWT_SECRET ||= 'goals-only';

/** Known to hang until M2-1 lands. A module leaves this list when it imports alone. */
const KNOWN_CYCLIC = new Set([]);
const DIR = 'api/_app/services/money';
const modules = readdirSync(DIR).filter((f) => f.endsWith('.js'));

const importWithin = (file, ms) => Promise.race([
  import(`../../${DIR}/${file}`).then(() => 'loaded'),
  new Promise((resolve) => setTimeout(() => resolve('hung'), ms)),
]);

describe('the money core imports a module at a time', () => {
  it('has modules to check', () => { expect(modules.length).toBeGreaterThan(30); });
  for (const file of modules) {
    if (KNOWN_CYCLIC.has(file)) {
      it.todo(`${file} imports alone (blocked on M2-1: the store.js cycles)`);
      continue;
    }
    it(`${file} imports within two seconds`, async () => {
      expect(await importWithin(file, 2000)).toBe('loaded');
    }, 5000);
  }
});
