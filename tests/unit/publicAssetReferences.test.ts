/**
 * Guard: every absolute /images/... asset referenced from src/ must exist in public/.
 *
 * The auth page shipped a broken TwinMe logo for weeks: CustomAuth.tsx pointed at
 * /images/backgrounds/flower.webp, a file that never existed under that name (the
 * WebP variants were generated as flower-hero.webp). A missing <img> src fails
 * silently in the browser — it renders a 0x0 box, no console error, no build
 * failure — so nothing caught it except looking at the page.
 *
 * This test closes the whole class: it scans source for absolute /images/
 * references and asserts each resolves to a real file on disk.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const SRC = join(REPO_ROOT, 'src');
const PUBLIC = join(REPO_ROOT, 'public');

const SOURCE_EXT = /\.(tsx?|jsx?|css)$/;
/** Absolute public-root image refs, e.g. "/images/backgrounds/flower.png" */
const IMAGE_REF = /["'`(](\/images\/[^"'`)\s]+)["'`)]/g;

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (SOURCE_EXT.test(entry)) acc.push(full);
  }
  return acc;
}

describe('public asset references', () => {
  const files = walk(SRC);

  it('finds source files to scan (guards against a silently empty test)', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  // Explicit timeout: cold-reads every source file under src/. Same failure
  // class as platformConnectionsColumns.test.js — Windows Defender scans each
  // file on first open and full-suite FS contention pushes the scan past the
  // 5s default nondeterministically; the scan itself is deterministic.
  it('every /images/ reference in src resolves to a file in public/', { timeout: 120_000 }, () => {
    const missing: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      for (const match of content.matchAll(IMAGE_REF)) {
        const ref = match[1];
        // Skip template-literal interpolation — not statically resolvable.
        if (ref.includes('${')) continue;
        const onDisk = join(PUBLIC, decodeURIComponent(ref));
        if (!existsSync(onDisk)) {
          missing.push(`${file.replace(REPO_ROOT, '').replace(/\\/g, '/')} -> ${ref}`);
        }
      }
    }

    expect(missing, `Referenced image(s) missing from public/:\n${missing.join('\n')}`).toEqual([]);
  });
});
