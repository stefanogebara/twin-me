/**
 * What kind of work does this account mostly do? Pure, no network, no DB.
 *
 * Extracted from github.js and rewritten 2026-08-13. The old version scored
 * repo names and descriptions against a keyword list and took the top count.
 * It labelled an account with TypeScript 16 / JavaScript 10 / Python 1 as
 * "primarily focused on data science / ML", and every one of the seven repos
 * behind that verdict had matched a single token — `ai`:
 *
 *   restaurant-ai-mcp, pauta-ai, ai-olympics, ai-flight-agent, condoos
 *   ("AI-powered"), instagram-dashboard ("Inner AI"), gauntlet-fixture-hello
 *   ("AI Olympics")
 *
 * Nothing matched pytorch, pandas, sklearn, kaggle or notebook. Three changes
 * follow from that:
 *
 *  1. `ai` and `data` are gone from the ML signals. They are product
 *     vocabulary now — an "ai" in a name says the thing CALLS a model, not
 *     that its author trains one. The tokens kept are ones nobody puts in a
 *     product name by accident (pytorch, sklearn, kaggle, jupyter).
 *  2. Language votes. A repo's primary language is better evidence of what
 *     kind of work it is than a word in its title, and the caller already has
 *     it. Text still outweighs language 2:1, because a description states
 *     intent while a language is ambient.
 *  3. The classifier declines to guess. Below MIN_SCORE, or when the leader
 *     fails to clear the runner-up by MARGIN, it returns null and the caller
 *     falls back to "Active on GitHub with N repositories" — which was always
 *     the honest thing to say about a split portfolio.
 */

/** A description states intent; a language is ambient. Weight accordingly. */
const TEXT_WEIGHT = 2;
const LANGUAGE_WEIGHT = 1;

/** Floor for claiming a focus at all: roughly one repo that matches on both
 *  axes, or three that match only by language. Below this, "primarily" is a
 *  bigger word than the evidence supports. */
const MIN_SCORE = 3;

/** How far ahead the leader must be. At 1.5 a 50/50 split declines to answer,
 *  a 60/40 split still gets a label. */
const MARGIN = 1.5;

/**
 * `languages` is listed only where it genuinely discriminates. Python is
 * deliberately absent from data science / ML: it is just as likely to be
 * Django, FastAPI or a shell replacement, and weak-signal-as-strong-signal is
 * the exact mistake this rewrite exists to undo. Jupyter Notebook and R carry
 * no such ambiguity.
 */
const PROJECT_TYPES = [
  {
    label: 'web development',
    text: /\b(web|frontend|front-end|backend|back-end|api|rest|graphql|server|client|react|vue|angular|svelte|next\.?js|nuxt|express|fastapi|django|rails|node|prisma|supabase|dashboard|crm|checkout|storefront|landing page)\b/i,
    languages: ['JavaScript', 'TypeScript', 'HTML', 'CSS', 'Vue', 'Svelte', 'PHP', 'Ruby'],
  },
  {
    label: 'mobile',
    text: /\b(mobile|android|ios|react[- ]?native|flutter|swiftui|expo)\b/i,
    languages: ['Swift', 'Kotlin', 'Dart', 'Objective-C'],
  },
  {
    label: 'data science / ML',
    text: /\b(ml|machine[- ]?learning|deep[- ]?learning|pytorch|tensorflow|keras|sklearn|scikit|pandas|numpy|kaggle|jupyter|notebook|dataset|regression|classifier|fine[- ]?tuning)\b/i,
    languages: ['Jupyter Notebook', 'R', 'Julia', 'MATLAB'],
  },
  {
    label: 'DevOps / infra',
    // Not bare `ci`, `cd`, `deploy` or `ops`: all four appear constantly in
    // ordinary application descriptions.
    text: /\b(docker|k8s|kubernetes|terraform|ansible|helm|infra|infrastructure|devops|ci[-/ ]?cd|aws|gcp|azure)\b/i,
    languages: ['Dockerfile', 'HCL'],
  },
  {
    label: 'CLI / tooling',
    // Not bare `gen` or `script`, which matched half of everything.
    text: /\b(cli|command[- ]line|tool|toolkit|util|utils|utility|helper|generator|scaffold|automation|bot|plugin|extension)\b/i,
    languages: [],
  },
  {
    label: 'game dev',
    text: /\b(game|gamedev|unity|godot|unreal|shader|roguelike|rpg|fps)\b/i,
    languages: ['GDScript'],
  },
  {
    label: 'open source libs',
    // Not bare `lib` or `package`, which match node_modules chatter.
    text: /\b(library|sdk|framework|npm package|pypi|crate|gem)\b/i,
    languages: [],
  },
];

/**
 * Classify an account's recent repositories into a broad project type.
 *
 * @param {Array<{name?: string, description?: string, language?: string}>} repos
 * @returns {string|null} the dominant label, or null when the evidence is thin
 *   or split — the caller is expected to say nothing about focus in that case.
 */
export function detectGitHubProjectType(repos) {
  if (!Array.isArray(repos) || repos.length === 0) return null;

  const scores = new Map();
  const bump = (label, by) => scores.set(label, (scores.get(label) || 0) + by);

  for (const repo of repos) {
    if (!repo || typeof repo !== 'object') continue;
    const text = `${repo.name ?? ''} ${repo.description ?? ''}`;
    const language = typeof repo.language === 'string' ? repo.language : null;

    for (const type of PROJECT_TYPES) {
      // Once per repo per category — a description that says "react" three
      // times is not three repos' worth of evidence.
      if (type.text.test(text)) bump(type.label, TEXT_WEIGHT);
      if (language && type.languages.includes(language)) bump(type.label, LANGUAGE_WEIGHT);
    }
  }

  // Sort by score, then by label, so the result never depends on Map insertion
  // order (i.e. on the order GitHub happened to return the repos in).
  const ranked = [...scores.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  if (ranked.length === 0) return null;

  const [label, score] = ranked[0];
  const runnerUp = ranked[1]?.[1] ?? 0;

  if (score < MIN_SCORE) return null;
  if (runnerUp > 0 && score < runnerUp * MARGIN) return null;
  return label;
}

export { PROJECT_TYPES, MIN_SCORE, MARGIN };
