#!/usr/bin/env node
/**
 * .env.example, from the code (audit M3-4, 2026-09-19).
 *
 * The file had drifted a long way from what the API and the app read: 109 keys were read
 * and undocumented, 16 documented and never read. This scans api/ and src/ for every
 * `process.env.X` and `import.meta.env.VITE_X`, groups the keys by the part of the code that
 * reads them, keeps the notes and example values already written for a key, marks the four
 * the server refuses to start without, and writes the file. `--check` exits 1 when the
 * committed file is not what the code says (tests/goals/env-example-in-sync.goal.test.js).
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;
const OUT = path.join(ROOT, '.env.example');
/* Set by the platform or the shell, never by a person in .env. */
const PLATFORM = new Set(['NODE_ENV', 'CI', 'HOME', 'PATH', 'TZ', 'VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'LOCALAPPDATA', 'GITHUB_STEP_SUMMARY', 'GITHUB_REPOSITORY', 'GH_TOKEN']);
/* The area a file belongs to, first match wins; the order is the order of the sections. */
const AREAS = [
  ['Core: the server refuses to start without these', () => false],
  ['Supabase', (f) => /database|supabase/i.test(f)],
  ['Auth, sessions and cookies', (f) => /auth|session|cookie|jwt|otp|middleware\/auth/i.test(f)],
  ['Money: the product', (f) => /money|enableBanking|bank|receipt|statement/i.test(f)],
  ['Money: the feeds and the phone', (f) => /capture|inbox|resend|gmail/i.test(f)],
  ['Language models', (f) => /llm|aiModels|openrouter|embedding|chatRouter|model|reflection|twin/i.test(f)],
  ['Platform connections (OAuth)', (f) => /oauth|connector|spotify|google|youtube|discord|github|instagram|outlook|whoop|linkedin|twitter|slack|medium|nango/i.test(f)],
  ['Messaging (WhatsApp, Telegram, voice)', (f) => /whatsapp|telegram|evolution|waha|zapi|kapso|twilio|vapi|presence|sip|voice/i.test(f)],
  ['Billing', (f) => /stripe|billing|subscription/i.test(f)],
  ['Observability and limits', (f) => /sentry|logger|rateLimit|circuit|health|posthog|analytics|budget|cost/i.test(f)],
  ['Push, search and enrichment', (f) => /push|vapid|search|enrich|hunter|hibp|emailrep|pdl|scrapin|brave|perplexity|places/i.test(f)],
  ['Crons and background jobs', (f) => /cron|queue|background|worker|ingestion/i.test(f)],
  ['Frontend (VITE_ keys are public: they ship in the bundle)', (f) => /^src\//.test(f)],
  ['Everything else', () => true],
];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|mjs|ts|tsx)$/.test(name) && !/\.test\.|\.spec\./.test(name)) out.push(p);
  }
  return out;
}

/** Every key the code reads, with the files that read it. */
export function keysInCode(root = ROOT) {
  const keys = new Map();
  for (const file of [...walk(path.join(root, 'api')), ...walk(path.join(root, 'src'))]) {
    const rel = path.relative(root, file);
    const s = fs.readFileSync(file, 'utf8');
    const found = [...s.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g), ...s.matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+)/g)].map((m) => m[1]);
    for (const k of found) { if (PLATFORM.has(k)) continue; if (!keys.has(k)) keys.set(k, new Set()); keys.get(k).add(rel); }
  }
  return keys;
}

/** The four the server exits without, read from server.js itself. */
export function requiredKeys(root = ROOT) {
  const s = fs.readFileSync(path.join(root, 'api/server.js'), 'utf8');
  const m = s.match(/const REQUIRED_ENV_VARS = \[([\s\S]*?)\]/);
  return new Set(m ? [...m[1].matchAll(/'([A-Z0-9_]+)'/g)].map((x) => x[1]) : []);
}

/** The notes and example values a person already wrote, by key, from the current file. */
export function notesInFile(text) {
  const notes = new Map();
  let pending = [];
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const m = line.match(/^#?\s*([A-Z][A-Z0-9_]+)=(.*)$/);
    if (m) { notes.set(m[1], { comment: pending.filter((c) => !/^# ---|^# ===/.test(c)), value: m[2], commented: line.startsWith('#') }); pending = []; continue; }
    if (line.startsWith('#')) pending.push(line); else pending = [];
  }
  return notes;
}

export function render({ keys, required, notes }) {
  const areaOf = (files) => { const f = [...files].sort()[0]; return AREAS.find(([, test]) => test(f))?.[0] || 'Everything else'; };
  const sections = new Map(AREAS.map(([name]) => [name, []]));
  for (const [key, files] of [...keys.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    sections.get(required.has(key) ? AREAS[0][0] : areaOf(files)).push({ key, files: [...files].sort() });
  }
  const lines = [
    '# ===========================================',
    '# TwinMe - Environment Variables',
    '# ===========================================',
    '# Copy this file to .env and fill in your values. NEVER commit .env.',
    '# Written by scripts/env-example.mjs from what api/ and src/ read (M3-4, 2026-09-19);',
    '# run `node scripts/env-example.mjs` after adding a key. Notes above a key are kept.',
    '#',
    '# Do NOT set NODE_ENV here: Vite reads .env during `vite build`, and',
    '# NODE_ENV=development ships development React (StrictMode double effects, no',
    '# dead-code elimination). The dev server gets it from nodemon.json instead.',
    '',
  ];
  for (const [name, entries] of sections) {
    if (!entries.length) continue;
    lines.push(`# --- ${name} ---`);
    for (const { key, files } of entries) {
      const note = notes.get(key);
      if (note?.comment.length) lines.push(...note.comment);
      else lines.push(`# read by ${files.slice(0, 2).map((f) => f.replace(/^api\//, '')).join(', ')}${files.length > 2 ? ` and ${files.length - 2} more` : ''}`);
      const value = note?.value ?? '';
      const commented = required.has(key) ? false : (note ? note.commented : true);
      lines.push(`${commented ? '# ' : ''}${key}=${value}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function generate(root = ROOT) {
  const current = fs.existsSync(path.join(root, '.env.example')) ? fs.readFileSync(path.join(root, '.env.example'), 'utf8') : '';
  return render({ keys: keysInCode(root), required: requiredKeys(root), notes: notesInFile(current) });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const next = generate();
  if (process.argv.includes('--check')) {
    const current = fs.readFileSync(OUT, 'utf8');
    if (current !== next) { console.error('.env.example is not what the code reads. Run: node scripts/env-example.mjs'); process.exit(1); }
    console.log('.env.example is in sync with the code.');
  } else {
    fs.writeFileSync(OUT, next);
    console.log(`.env.example written: ${(next.match(/^#? ?[A-Z][A-Z0-9_]+=/gm) || []).length} keys`);
  }
}
