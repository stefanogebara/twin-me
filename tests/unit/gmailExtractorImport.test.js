/**
 * Regression pin: dataExtractionService's GmailExtractor stub dynamically
 * imports fetchGmailObservations. If the import specifier points at a module
 * that does not actually export that name, the destructure yields undefined
 * and every gmail extraction job dies with "fetchGmailObservations is not a
 * function" (observed live 2026-07-14, platform_connections.last_sync_error).
 *
 * Static source scan (goal-canary style): no app imports, no env needed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICES_DIR = resolve(__dirname, '../../api/services');
const SERVICE_FILE = resolve(SERVICES_DIR, 'dataExtractionService.js');

describe('dataExtractionService gmail dynamic import', () => {
  it('every dynamic import of fetchGmailObservations targets a module that exports it', () => {
    const src = readFileSync(SERVICE_FILE, 'utf8');

    const importRe =
      /const\s*\{\s*fetchGmailObservations\s*\}\s*=\s*await\s+import\('([^']+)'\)/g;
    const specifiers = [...src.matchAll(importRe)].map((m) => m[1]);

    // The stub currently uses exactly one such import; if it is refactored away
    // entirely this pin has nothing left to protect.
    expect(specifiers.length).toBeGreaterThan(0);

    for (const spec of specifiers) {
      const targetSrc = readFileSync(resolve(SERVICES_DIR, spec), 'utf8');
      const exportsName =
        /export\s*(?:async\s+)?function\s+fetchGmailObservations\b/.test(targetSrc) ||
        /export\s*\{[^}]*\bfetchGmailObservations\b[^}]*\}/.test(targetSrc);
      expect(exportsName, `${spec} does not export fetchGmailObservations`).toBe(true);
    }
  });
});
