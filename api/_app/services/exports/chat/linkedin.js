/**
 * Chat-side glue for LinkedIn GDPR export.
 */

import { makeExportRun, makeExportLearn } from '../chatAdapter.js';

const NOUNS = [/\blinkedin\b/i, /\bconnections?\b/i, /\bnetwork\b/i, /\bcareer\b/i];

const PHRASES = [
  /\b(my )?linkedin (activity|history|network|profile|engagement|stats?|posts?|connections?)\b/i,
  /\b(top|most common) (companies?|positions?|roles?|titles?) (in (my )?network|on linkedin)\b/i,
  /\bwhat (do I|am I) (do |post |share )?on linkedin\b/i,
  /\bhow many linkedin (connections?|posts?)\b/i,
  /\b(my )?linkedin (reaction|search|posting) (style|cadence|patterns?|topics?)\b/i,
];

function any(patterns, text) {
  return patterns.some((re) => re.test(text));
}

export function detectLinkedInExportIntent(message) {
  const text = String(message ?? '').trim();
  if (text.length === 0) return { kind: null };
  if (any(PHRASES, text) && any(NOUNS, text)) return { kind: 'export' };
  if (any(PHRASES, text)) return { kind: 'export' };
  return { kind: null };
}

export function formatLinkedInExport(a) {
  if (!a || !a.totals) return null;
  const t = a.totals;
  const parts = [];

  if (t.connections > 0) {
    parts.push(
      `LinkedIn (from data export): ${t.connections} connections, ${t.skills} skills, ${t.shares} total posts (${t.shares_last_90d} in last 90 days), ${t.reactions} reactions, ${t.searches} searches.`
    );
  }

  if ((a.top_network_companies ?? []).length > 0) {
    const named = a.top_network_companies
      .slice(0, 5)
      .map((c) => `${c.company} (${c.count})`)
      .join(', ');
    parts.push(`Top companies in network: ${named}.`);
  }

  if (a.reaction_type_breakdown && Object.keys(a.reaction_type_breakdown).length > 0) {
    const breakdown = Object.entries(a.reaction_type_breakdown)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 3)
      .map(([k, v]) => `${k.toLowerCase()} ${v}`)
      .join(', ');
    parts.push(`Reaction mix: ${breakdown}.`);
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

export const linkedinExportRun = makeExportRun({
  platform: 'linkedin_export',
  formatAggregates: formatLinkedInExport,
});

export const linkedinExportLearn = makeExportLearn({
  platform: 'linkedin_export',
  sourceKey: 'linkedin_export',
});
