import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const SUPABASE_CLI_VERSION = '2.84.2';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const sqlFilePath = path.join(__dirname, 'supa-security-regression.sql');
const npxCommand = 'npx';

for (const envFileName of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  const envFilePath = path.join(repoRoot, envFileName);
  if (fs.existsSync(envFilePath)) {
    dotenv.config({ path: envFilePath, override: true, quiet: true });
  }
}

function runCommand(label, args) {
  console.log(`\n==> ${label}`);
  console.log(`${npxCommand} ${args.join(' ')}`);

  const result = spawnSync(`${npxCommand} ${args.join(' ')}`, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env,
    shell: true,
  });

  const stdout = result.stdout?.trim() ?? '';
  const stderr = result.stderr?.trim() ?? '';

  if (stdout) {
    console.log(stdout);
  }

  if (result.status !== 0) {
    if (stderr) {
      console.error(stderr);
    }

    if (!stdout && !stderr && result.error) {
      console.error(result.error.message);
    }

    const help = [
      'Supabase regression run failed.',
      'Make sure the project is linked and the Supabase CLI is authenticated.',
      'If the temp login role hits a circuit breaker, export SUPABASE_DB_PASSWORD and retry.',
    ].join(' ');

    throw new Error(help);
  }

  return stdout;
}

function normalizeFindings(parsed) {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (Array.isArray(parsed?.issues)) {
    return parsed.issues;
  }

  if (Array.isArray(parsed?.result)) {
    return parsed.result;
  }

  if (Array.isArray(parsed?.data)) {
    return parsed.data;
  }

  if (parsed && typeof parsed === 'object') {
    return [parsed];
  }

  return [];
}

function parseAdvisorOutput(stdout) {
  const trimmed = stdout.trim();

  if (!trimmed || /^No issues found$/i.test(trimmed)) {
    return [];
  }

  try {
    return normalizeFindings(JSON.parse(trimmed));
  } catch {
    return [{ raw: trimmed }];
  }
}

function failIfFindings(findings, heading) {
  if (!findings.length) {
    return;
  }

  const rendered = findings
    .map((finding) => JSON.stringify(finding, null, 2))
    .join('\n');

  throw new Error(`${heading}\n${rendered}`);
}

function main() {
  runCommand('SQL assertions', [
    `supabase@${SUPABASE_CLI_VERSION}`,
    'db',
    'query',
    '--linked',
    '-f',
    sqlFilePath,
    '-o',
    'json',
  ]);

  const securityFindings = parseAdvisorOutput(
    runCommand('Supabase security advisor', [
      `supabase@${SUPABASE_CLI_VERSION}`,
      'db',
      'advisors',
      '--linked',
      '--type',
      'security',
      '-o',
      'json',
    ])
  );
  failIfFindings(securityFindings, 'Security advisor returned findings.');

  const performanceFindings = parseAdvisorOutput(
    runCommand('Supabase performance advisor', [
      `supabase@${SUPABASE_CLI_VERSION}`,
      'db',
      'advisors',
      '--linked',
      '--type',
      'performance',
      '-o',
      'json',
    ])
  );

  const duplicatePolicyFindings = performanceFindings.filter((finding) => {
    const haystack = JSON.stringify(finding).toLowerCase();
    return haystack.includes('multiple_permissive_policies') || haystack.includes('multiple permissive');
  });
  failIfFindings(
    duplicatePolicyFindings,
    'Performance advisor still reports duplicate permissive RLS policies.'
  );

  console.log('\nSupabase DB security regression checks passed.');
}

try {
  main();
} catch (error) {
  console.error(`\n${error.message}`);
  process.exit(1);
}
