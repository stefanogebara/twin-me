import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Two retired values that were swept out of src/ and must not come back.
 *
 * Both were invisible to every other guard we have. The phantom-token test
 * only catches `var(--x)` names that resolve to nothing; the bridge-precedence
 * test only compares selector specificity. A hard-coded hex or font stack
 * resolves perfectly — it is just the WRONG value, and no amount of token
 * plumbing can reach past it.
 *
 * 1. #10b77f — a spearmint green from a pre-Claura era, still sitting in 113
 *    places across 46 files after the Nocturne flip: status dots, spinners,
 *    empty states, the error boundary's primary button. It belongs to no
 *    palette this product has had in a year. Verdigris is its replacement.
 *
 * 2. 'Geist' as a literal font stack — 160 inline `fontFamily` strings in 34
 *    files, each leading with a face Nocturne does not use. This one actually
 *    rendered: Geist was loaded, and it measures ~3% narrower than Inter, so
 *    those surfaces were visibly set in the wrong UI face. The token
 *    (--font-ui) is the only correct spelling.
 *
 * Fonts and colours belong in the token layer. If you need a new one, add it
 * to nocturne.css and reference it — do not paste a value.
 */

const SRC = join(__dirname, '..', '..', 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(full);
  }
  return out;
}

/** Token definitions are the one place a raw value is allowed to live. */
const TOKEN_FILES = /styles[\\/](nocturne|nocturne-bridge|claura)\.css$|index\.css$/;

const files = walk(SRC).filter((f) => !TOKEN_FILES.test(f));

describe('retired values stay retired', () => {
  it('the pre-Claura spearmint #10b77f appears nowhere', () => {
    const offenders = files.filter((f) => /#10b77f/i.test(readFileSync(f, 'utf8')));
    expect(
      offenders.map((f) => f.slice(SRC.length + 1)),
      'Use var(--n-verdigris). #10b77f is not in any TwinMe palette.',
    ).toEqual([]);
  });

  it("no component hard-codes a 'Geist' font stack", () => {
    const offenders = files.filter((f) => /['"]Geist['"]/.test(readFileSync(f, 'utf8')));
    expect(
      offenders.map((f) => f.slice(SRC.length + 1)),
      "Use var(--font-ui). Geist is loaded but is not a Nocturne voice — Inter is.",
    ).toEqual([]);
  });

  it('the scan is actually reading files (guards against a silent empty walk)', () => {
    expect(files.length).toBeGreaterThan(200);
  });
});
