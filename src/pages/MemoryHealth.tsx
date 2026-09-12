/**
 * Memory Health Dashboard
 * Shows the quality and composition of the user's memory stream.
 * In the register: figures are rows, the composition is one bar of signature
 * marks, importance is a row per kind with a thin data bar.
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/services/api/apiBase';
import { TwinReadinessScore } from '@/components/twin/TwinReadinessScore';
import { RefreshCw } from 'lucide-react';
import { toSecondPerson } from '@/lib/utils';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Page, PageHead, Section, List, Row } from '@/components/register';
import { BarRow, MixBar } from '@/pages/insights/components/InsightsKit';

interface MemoryHealthData {
  totalCount: number;
  composition: Record<string, number>;
  avgImportanceByType: Record<string, number>;
  retrievalCoverage: number;
  stalePct: number;
  staleCount: number;
  expertBreakdown: Record<string, number>;
  forgettingPreview: {
    wouldArchiveConversation: number;
    wouldArchivePlatformData: number;
    wouldDecayFact: number;
  };
  topMemories: Array<{
    id: string;
    type: string;
    excerpt: string;
    importance: number;
    retrievalCount: number;
    agedays: number;
  }>;
  readiness?: {
    score: number;
    label: string;
    breakdown?: { volume: number; diversity: number; reflection: number };
  };
}

/* Each kind of memory as a signature hue (register.css, 3.3:1 on the page):
   marks in the composition bar only, never text. */
const TYPE_HUES: Record<string, string> = {
  fact: 'var(--rg-ember)',
  reflection: 'var(--rg-iris)',
  conversation: 'var(--rg-orchid)',
  platform_data: 'var(--rg-verdigris)',
  observation: 'var(--rg-periwinkle)',
};

const TYPE_LABELS: Record<string, string> = {
  fact: 'Facts',
  reflection: 'Reflections',
  conversation: 'Conversations',
  platform_data: 'Platform data',
  observation: 'Observations',
};

const EXPERT_LABELS: Record<string, string> = {
  personality_psychologist: 'Personality',
  lifestyle_analyst: 'Lifestyle',
  cultural_identity: 'Cultural identity',
  social_dynamics: 'Social dynamics',
  motivation_analyst: 'Motivation',
  music_psychologist: 'Music and mood',
  social_analyst: 'Social patterns',
  productivity_analyst: 'Productivity',
  media_sociologist: 'Media and culture',
  health_behaviorist: 'Health behavior',
  cultural_analyst: 'Cultural analysis',
  Unknown: 'General',
  unknown: 'General',
};

export default function MemoryHealth() {
  useDocumentTitle('Memory Health');
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading, error } = useQuery<MemoryHealthData>({
    queryKey: ['memory-health', refreshKey],
    queryFn: async () => {
      const res = await authFetch('/memory-health');
      if (!res.ok) {
        // Parse the backend error body so the real reason (not a generic
        // string) reaches the UI's error state (audit-2026-07-03 error-ux).
        let message = `Failed to load memory health (${res.status})`;
        try {
          const body = await res.json();
          if (body?.error) message = body.error;
        } catch {
          // Non-JSON error body — keep the status-tagged fallback.
        }
        throw new Error(message);
      }
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const pieData = data
    ? Object.entries(data.composition).map(([type, count]) => ({
        name: TYPE_LABELS[type] || type,
        value: count,
        type,
      }))
    : [];
  const compositionTotal = pieData.reduce((s, d) => s + d.value, 0) || 1;

  const importanceData = data
    ? Object.entries(data.avgImportanceByType).map(([type, avg]) => ({
        name: TYPE_LABELS[type] || type,
        avg,
        type,
      }))
    : [];

  return (
    <Page>
      <PageHead
        title="Memory health"
        line={data ? `${data.totalCount.toLocaleString('en-US')} memories` : 'Quality of your twin\'s memory stream'}
        action={
          <button
            type="button"
            onClick={() => setRefreshKey(k => k + 1)}
            className="rg-iconbtn"
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw aria-hidden="true" />
          </button>
        }
      />

      {error && (
        <p role="alert" className="rg-empty ri-danger" style={{ padding: '0 0 24px' }}>
          {error instanceof Error && error.message
            ? error.message
            : "We couldn't load your memory health data right now. Tap refresh to try again."}
        </p>
      )}

      {isLoading && (
        <p className="rg-empty flex items-center gap-2" role="status">
          <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
          Loading
        </p>
      )}

      {data && (
        <>
          {/* Twin readiness */}
          {data.readiness !== undefined && (
            <Section>
              <List>
                <li className="ri-block">
                  <TwinReadinessScore
                    score={data.readiness.score}
                    label={data.readiness.label}
                    breakdown={data.readiness.breakdown}
                  />
                </li>
              </List>
            </Section>
          )}

          {/* Quality indicators */}
          <Section title="Quality">
            <List className="ri-compact ri-stats">
              <Row title={`${(data.retrievalCoverage * 100).toFixed(1)}%`} line="Used at least once" />
              <Row
                title={`${(data.stalePct * 100).toFixed(1)}%`}
                line={`Stale: ${data.staleCount.toLocaleString('en-US')} older than 90 days`}
              />
              <Row
                title={importanceData.length > 0 ? (importanceData.reduce((s, d) => s + d.avg, 0) / importanceData.length).toFixed(1) : '—'}
                line="Average importance, 1 to 10"
              />
              <Row title={String(Object.keys(data.expertBreakdown).length)} line="Reflection experts active" />
            </List>
          </Section>

          {/* Composition, as parts of one whole */}
          {pieData.length > 0 && (
            <Section title="Composition" line="Memories by kind.">
              <List>
                <li className="ri-block">
                  <MixBar
                    parts={pieData.map(d => ({
                      key: d.type,
                      label: `${d.name} ${d.value.toLocaleString('en-US')}`,
                      share: (d.value / compositionTotal) * 100,
                      color: TYPE_HUES[d.type] || 'var(--rg-mark)',
                    }))}
                  />
                </li>
              </List>
            </Section>
          )}

          {/* Average importance by kind, a bar each out of 10 */}
          {importanceData.length > 0 && (
            <Section title="Importance" line="Average by kind, out of 10.">
              <List className="ri-compact">
                {importanceData.map(entry => (
                  <BarRow key={entry.type} title={entry.name} share={entry.avg * 10} end={entry.avg.toFixed(1)} />
                ))}
              </List>
            </Section>
          )}

          {/* Expert breakdown */}
          {Object.keys(data.expertBreakdown).length > 0 && (
            <Section title="Reflections by expert">
              <List className="ri-compact ri-stats">
                {Object.entries(data.expertBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, count]) => (
                    <Row key={name} title={EXPERT_LABELS[name] ?? name} action={<span className="ri-end">{count}</span>} />
                  ))}
              </List>
            </Section>
          )}

          {/* Forgetting preview */}
          <Section title="Next forgetting run" line="What the weekly run would archive or fade.">
            <List>
              <Row
                title={`${data.forgettingPreview.wouldArchiveConversation} conversations`}
                line="Archived: older than 30 days, importance 3 or less"
              />
              <Row
                title={`${data.forgettingPreview.wouldArchivePlatformData} platform records`}
                line="Archived: older than 14 days, never used"
              />
              <Row
                title={`${data.forgettingPreview.wouldDecayFact} facts`}
                line="Faded by 20%: older than 90 days, importance 5 or less"
              />
            </List>
          </Section>

          {/* Top memories */}
          <Section title="Most important memories">
            <List>
              {data.topMemories.map(m => (
                <Row
                  key={m.id}
                  icon={<span style={{ fontWeight: 500, color: 'var(--rg-ink)' }}>{m.importance}</span>}
                  title={`${toSecondPerson(m.excerpt)}${m.excerpt.length >= 120 ? '…' : ''}`}
                  line={`${TYPE_LABELS[m.type] || m.type} · used ${m.retrievalCount} times · ${m.agedays} days old`}
                />
              ))}
            </List>
          </Section>
        </>
      )}
    </Page>
  );
}
