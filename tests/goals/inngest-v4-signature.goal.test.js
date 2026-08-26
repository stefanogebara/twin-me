/**
 * GOAL: every Inngest function is actually runnable and actually triggered.
 * =========================================================================
 * inngest v4 changed `createFunction` from three arguments to two — the
 * trigger moved INSIDE the options object:
 *
 *   v3:  createFunction({ id }, { event: 'x' }, handler)
 *   v4:  createFunction({ id, triggers: [{ event: 'x' }] }, handler)
 *
 * This repo has depended on `inngest: ^4.0.2` since Inngest was introduced
 * (8d38b4a5) but every call site was written in the v3 form. Under v4 that
 * silently means:
 *
 *   - arg 2 `{ event: ... }` is taken as the HANDLER, so `fn` is an object.
 *     Any run dies with `TypeError: this.userFnToRun is not a function`.
 *   - the real handler (arg 3) is dropped on the floor.
 *   - `rawOptions.triggers` is undefined, so `sanitizeTriggers` yields [] and
 *     NO EVENT EVER MATCHES. Events are accepted and no run is ever created.
 *
 * The functions still register with correct id/name/concurrency/retries, so
 * the Inngest dashboard lists all 13 as Active with the right config — which
 * is why this hid for months behind the ingestion cron's inline fallback.
 *
 * Verified against production 2026-08-26: direct invocation of both
 * profile-enrichment and observation-ingestion-user returned
 * `TypeError: this.userFnToRun is not a function` from
 * inngest/components/execution/engine.js:605, which reads `options.fn["fn"]`.
 *
 * These assertions are behavioural, not textual: they inspect the real
 * objects the serve endpoint would register.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.SUPABASE_URL ||= 'https://inngest-goal-stub.supabase.co';
process.env.SUPABASE_ANON_KEY ||= 'stub-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service';
process.env.VITE_SUPABASE_URL ||= 'https://inngest-goal-stub.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY ||= 'stub-anon';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FUNCTIONS_DIR = path.resolve(__dirname, '../../api/inngest/functions');

const files = readdirSync(FUNCTIONS_DIR).filter(f => f.endsWith('.js'));

/** Every exported InngestFunction across the functions directory. */
const loaded = [];
for (const file of files) {
  const mod = await import(path.join(FUNCTIONS_DIR, file));
  for (const [exportName, value] of Object.entries(mod)) {
    if (value && typeof value === 'object' && value.opts && 'fn' in value) {
      loaded.push({ file, exportName, fn: value });
    }
  }
}

describe('goal: Inngest functions use the v4 createFunction signature', () => {
  it('finds every function module (guard against a silent rename)', () => {
    expect(files.length).toBeGreaterThanOrEqual(13);
    expect(loaded.length).toBeGreaterThanOrEqual(13);
  });

  it('every function has a callable handler', () => {
    // `fn` is an object under the v3 form. engine.js does options.fn["fn"] and
    // calls it — an object there is the production TypeError.
    const broken = loaded
      .filter(f => typeof f.fn.fn !== 'function')
      .map(f => `${f.file}:${f.exportName} — fn is ${typeof f.fn.fn}, not a function`);
    expect(broken).toEqual([]);
  });

  it('every function declares at least one trigger', () => {
    // Empty triggers means the function is registered but no event can ever
    // reach it: events are accepted by Inngest and no run is created.
    const untriggered = loaded
      .filter(f => !Array.isArray(f.fn.opts.triggers) || f.fn.opts.triggers.length === 0)
      .map(f => `${f.file}:${f.exportName} — triggers=${JSON.stringify(f.fn.opts.triggers)}`);
    expect(untriggered).toEqual([]);
  });

  it('every trigger names an event or a cron', () => {
    const malformed = [];
    for (const f of loaded) {
      for (const t of f.fn.opts.triggers ?? []) {
        if (!t || (!t.event && !t.cron)) {
          malformed.push(`${f.file}:${f.exportName} — ${JSON.stringify(t)}`);
        }
      }
    }
    expect(malformed).toEqual([]);
  });

  it('keeps the config that Inngest Cloud already shows (ids survive the migration)', () => {
    // The v3 form still registered ids correctly, so Cloud knows these slugs.
    // Changing them would orphan the registrations rather than repair them.
    const ids = loaded.map(f => f.fn.opts.id).sort();
    expect(ids).toContain('profile-enrichment');
    expect(ids).toContain('observation-ingestion-user');
    expect(new Set(ids).size).toBe(ids.length); // no duplicate ids
  });
});
