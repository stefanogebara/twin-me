/**
 * Goal: no function on the money pages is longer than 250 lines (audit M2-2, 2026-09-19).
 * MoneyForAccount was 1,190 lines; the reads, the actions and the three views are files now.
 * A top-level function or component is measured from its first line to its closing brace.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../src/pages/money/', import.meta.url).pathname;
const LIMIT = 250;
/* The ones that were already over the line when the page was split; all three left the list on 2026-09-19. Each may only shrink;
   a new one may not appear. Splitting them is M2-2b in docs/roadmap/PROGRESS.md. */
const STILL_LONG = {};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Every top-level function, with how many lines it spans. */
export function functionSpans(source) {
  const lines = source.split('\n');
  const spans = [];
  let openAt = null; let name = null;
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i];
    const m = openAt === null && l.match(/^(?:export )?(?:default )?(?:async )?function (\w+)|^(?:export )?const (\w+) = (?:async )?(?:\([^)]*\)|\w+) =>|^(?:export )?const (\w+) = (?:React\.)?(?:memo|forwardRef)\(/);
    if (m && /\{\s*$|\(\s*$|=> \{$/.test(l.replace(/\/\/.*$/, '').trimEnd()) || (m && !/[;]$/.test(l))) {
      if (m && !/\}\s*;?\s*$/.test(l)) { openAt = i; name = m[1] || m[2] || m[3]; continue; }
    }
    if (openAt !== null && /^\}\)?;?$/.test(l)) { spans.push({ name, lines: i - openAt + 1 }); openAt = null; }
  }
  return spans;
}

describe('the money pages stay readable', () => {
  it('has no function longer than 250 lines, and the three that still are only shrink', () => {
    const long = [];
    const seen = {};
    for (const file of walk(ROOT)) {
      for (const f of functionSpans(readFileSync(file, 'utf8'))) {
        const id = `${file.replace(ROOT, '')}:${f.name}`;
        if (id in STILL_LONG) { seen[id] = f.lines; if (f.lines > STILL_LONG[id]) long.push(`${id} grew to ${f.lines}`); }
        else if (f.lines > LIMIT) long.push(`${id} (${f.lines})`);
      }
    }
    expect(long).toEqual([]);
    for (const [id, lines] of Object.entries(seen)) if (lines <= LIMIT) long.push(`${id} is ${lines} lines now: take it out of STILL_LONG`);
    expect(long).toEqual([]);
  });
  it('measures a function from its first line to its closing brace', () => {
    expect(functionSpans('function a() {\n  x();\n}\nexport default function B({ p }: P) {\n  return (\n    <div />\n  );\n}\nconst c = () => 1;\n')).toEqual([{ name: 'a', lines: 3 }, { name: 'B', lines: 5 }]);
  });
});
