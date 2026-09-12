/**
 * Discord Insights Page
 *
 * "Your communities" - the twin's reflection on what your Discord server
 * memberships say about you, then the servers and what they are about.
 * The register's page kit: sections of rows.
 */

import React from 'react';
import { usePlatformInsights } from '@/hooks/usePlatformInsights';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Page, Section, List, Row } from '@/components/register';
import { TwinReflection } from './components/TwinReflection';
import { EvidenceSection } from './components/EvidenceSection';
import { InsightsPageHeader } from './components/InsightsPageHeader';
import { RefreshingIndicator } from './components/RefreshingIndicator';
import { InsightsGenerationError } from './components/InsightsGenerationError';
import {
  BarRow,
  HistorySection,
  InsightsError,
  InsightsNotice,
  InsightsSkeleton,
  PatternsSection,
  PendingReflection,
} from './components/InsightsKit';
import { useNavigate } from 'react-router-dom';

interface Reflection {
  id: string | null;
  text: string;
  generatedAt: string;
  expiresAt: string | null;
  confidence: 'high' | 'medium' | 'low';
  themes: string[];
}

interface Pattern {
  id: string;
  text: string;
  occurrences: 'often' | 'sometimes' | 'noticed';
}

interface HistoryItem {
  id: string;
  text: string;
  generatedAt: string;
}

interface EvidenceItem {
  id: string;
  observation: string;
  dataPoints: string[];
  confidence: 'high' | 'medium' | 'low';
}

interface DiscordServer {
  name: string;
  category: string;
}

interface CategoryBreakdown {
  category: string;
  count: number;
  percentage: number;
}

interface InsightsResponse {
  success: boolean;
  reflection: Reflection;
  patterns: Pattern[];
  history: HistoryItem[];
  evidence?: EvidenceItem[];
  discordServers?: DiscordServer[];
  discordTotalServers?: number;
  discordCategoryBreakdown?: CategoryBreakdown[];
  // True when the user hasn't connected the platform — the backend then returns
  // `reflection` as a plain string placeholder, not a Reflection object (audit-2026-06-10).
  notConnected?: boolean;
}

const TITLE = 'Your communities';

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const DiscordInsightsPage: React.FC = () => {
  useDocumentTitle('Discord Insights');

  const navigate = useNavigate();

  const { insights, loading, generating, isRefreshing, error, generationError, refresh } =
    usePlatformInsights<InsightsResponse>('discord', 'Please sign in to see your community insights');

  // Keep previous insights rendered during a refresh (audit-2026-06-10);
  // the skeleton is only for the no-data cold start.
  if ((loading || generating) && !insights) {
    return <InsightsSkeleton />;
  }

  // Generation failed with nothing to show — inline retry, not a connect CTA.
  if (generationError && !insights) {
    return <InsightsGenerationError title={TITLE} message={generationError} onRetry={refresh} retrying={isRefreshing} />;
  }

  if (error) {
    return (
      <InsightsError title={TITLE} message={error} actionLabel="Connect Discord" onAction={() => navigate('/get-started')} />
    );
  }

  const serverCount = insights?.discordTotalServers ?? insights?.discordServers?.length ?? 0;

  return (
    <Page>
      <InsightsPageHeader
        title={TITLE}
        line="What your servers say about you"
        onBack={() => navigate('/identity')}
        onRefresh={refresh}
        isRefreshing={isRefreshing}
      />

      <RefreshingIndicator visible={isRefreshing} />

      {/* Primary Reflection */}
      {insights?.reflection?.text ? (
        <TwinReflection
          reflection={insights.reflection.text}
          timestamp={insights.reflection.generatedAt}
          confidence={insights.reflection.confidence}
          isNew={true}
        >
          {insights?.evidence && insights.evidence.length > 0 && <EvidenceSection evidence={insights.evidence} />}
        </TwinReflection>
      ) : insights?.discordServers?.length ? (
        <PendingReflection what="communities" />
      ) : null}

      {/* Your servers */}
      {insights?.discordServers && insights.discordServers.length > 0 && (
        <Section title="Your servers" line={`${serverCount} ${serverCount === 1 ? 'server' : 'servers'}`}>
          <List className="rg-compact">
            {insights.discordServers.map((server, i) => (
              <Row key={i} title={server.name} line={capitalize(server.category)} />
            ))}
          </List>
        </Section>
      )}

      {/* What the servers are about, a bar each by share */}
      {insights?.discordCategoryBreakdown && insights.discordCategoryBreakdown.length > 0 && (
        <Section title="What they are about">
          <List className="rg-compact">
            {insights.discordCategoryBreakdown.map((item, i) => (
              <BarRow
                key={i}
                title={capitalize(item.category)}
                share={item.percentage}
                end={`${item.count} ${item.count === 1 ? 'server' : 'servers'}`}
              />
            ))}
          </List>
        </Section>
      )}

      <PatternsSection patterns={insights?.patterns} />
      <HistorySection history={insights?.history} />

      {/* Empty State */}
      {!insights?.reflection?.text && !insights?.discordServers?.length && (
        <InsightsNotice
          notConnected={insights?.notConnected === true}
          platform="Discord"
          connectLine="Your twin will notice what your communities say about you."
          title="Your twin is listening in"
          line="Patterns show up as your server activity syncs."
          onConnect={() => navigate('/get-started')}
        />
      )}
    </Page>
  );
};

export default DiscordInsightsPage;
