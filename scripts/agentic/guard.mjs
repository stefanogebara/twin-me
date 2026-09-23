/**
 * The shadow rule, as code: nothing the loop writes may touch the ledger's tables, the bank
 * feed, or the schema (docs/roadmap/PROGRESS.md, M2-6). A change to any of these paths makes
 * the implement stage stop and say so, whatever the plan asked for.
 */
export const FORBIDDEN = [
  /^database\//,
  /^api\/_app\/services\/money\/(ledger|ingestion|store|transactionRepository|figureScoreStore|feeds\/)/,
  /^api\/_app\/routes\/cron-money-/,
  /^\.github\/workflows\//,
  /^\.env/,
  /^scripts\/money\/(merge-|rescore-)/,
];

/** The changed paths that the loop may not touch, or an empty list. */
export function forbiddenPaths(paths = []) {
  return paths.filter((p) => FORBIDDEN.some((re) => re.test(p)));
}

/** The tools the implement stage may use: edits, reads, and the tests. Never git, never the network. */
export const IMPLEMENT_TOOLS = ['Edit', 'Write', 'Read', 'Grep', 'Glob', 'Bash(npx vitest run:*)', 'Bash(npx eslint:*)', 'Bash(npx tsc:*)', 'Bash(node scripts/ci/check-baselines.mjs:*)'];
export const INSPECT_TOOLS = ['Read', 'Grep', 'Glob', 'Bash(git diff:*)', 'Bash(git log:*)', 'Bash(npx vitest run:*)'];
