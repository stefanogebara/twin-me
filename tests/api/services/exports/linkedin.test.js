import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import { detectLinkedInExport, parseLinkedInExport } from '../../../../api/services/exports/parsers/linkedin.js';
import { buildLinkedInZip } from './fixtures.js';
import { detectLinkedInExportIntent, formatLinkedInExport } from '../../../../api/services/exports/chat/linkedin.js';

describe('linkedin export parser', () => {
  const zip = new AdmZip(buildLinkedInZip());

  it('detects linkedin zip', async () => {
    expect(await detectLinkedInExport(zip)).toBe(true);
  });

  it('parses connection counts and top companies', async () => {
    const { aggregates } = await parseLinkedInExport(zip);
    expect(aggregates.totals.connections).toBe(3);
    expect(aggregates.totals.skills).toBe(3);
    expect(aggregates.totals.shares).toBe(2);
    const acme = aggregates.top_network_companies.find((c) => c.company === 'Acme');
    expect(acme?.count).toBe(2);
  });

  it('aggregates reaction types and dedups searches', async () => {
    const { aggregates } = await parseLinkedInExport(zip);
    expect(aggregates.reaction_type_breakdown.LIKE).toBe(2);
    expect(aggregates.reaction_type_breakdown.PRAISE).toBe(1);
    const ml = aggregates.top_search_topics.find((s) => s.query === 'machine learning');
    expect(ml?.count).toBe(2);
  });

  it('observations include connection summary', async () => {
    const { observations } = await parseLinkedInExport(zip);
    expect(observations.join(' ')).toMatch(/3 connections/);
  });
});

describe('linkedin export chat glue', () => {
  it('detects intent on common phrasings', () => {
    expect(detectLinkedInExportIntent('what does my linkedin network look like').kind).toBe('export');
    expect(detectLinkedInExportIntent('my linkedin posting cadence').kind).toBe('export');
    expect(detectLinkedInExportIntent('what did I eat for lunch').kind).toBe(null);
  });

  it('formats aggregates into a directive line', () => {
    const aggregates = {
      totals: { connections: 200, skills: 12, shares: 8, shares_last_90d: 3, reactions: 50, searches: 20 },
      top_network_companies: [{ company: 'Acme', count: 30 }],
      reaction_type_breakdown: { LIKE: 40, PRAISE: 10 },
    };
    const out = formatLinkedInExport(aggregates);
    expect(out).toContain('200 connections');
    expect(out).toContain('Acme (30)');
    expect(out).toContain('like 40');
  });
});
