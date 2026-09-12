/**
 * Web Browsing Insights Page
 *
 * "What you read" - the twin's reflection on your browsing, then what it
 * read: interests, searches, reading habits, domains, topics, recent pages.
 * The register's page kit: sections of rows.
 */

import React from 'react';
import { usePlatformInsights } from '@/hooks/usePlatformInsights';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Page, Section, List, Row } from '@/components/register';
import { TwinReflection } from './components/TwinReflection';
import { EvidenceSection } from './components/EvidenceSection';
import { WebBrowsingSkeleton } from './components/WebBrowsingSkeleton';
import { WebBrowsingErrorState } from './components/WebBrowsingErrorState';
import { WebBrowsingCharts } from './components/WebBrowsingCharts';
import { RefreshingIndicator } from './components/RefreshingIndicator';
import { InsightsGenerationError } from './components/InsightsGenerationError';
import { InsightsPageHeader } from './components/InsightsPageHeader';
import { HistorySection, InsightsNotice, PatternsSection } from './components/InsightsKit';
import type { InsightsResponse } from './components/webBrowsingTypes';
import { Layout } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const TITLE = 'What you read';

const WebBrowsingInsightsPage: React.FC = () => {
  useDocumentTitle('Web Browsing Insights');

  const navigate = useNavigate();

  const { insights, loading, generating, isRefreshing, error, generationError, refresh } =
    usePlatformInsights<InsightsResponse>('web', 'Please sign in to see your digital life insights');

  // Keep previous insights rendered during a refresh (audit-2026-06-10);
  // the skeleton is only for the no-data cold start.
  if ((loading || generating) && !insights) {
    return <WebBrowsingSkeleton />;
  }

  // Generation failed with nothing to show — inline retry, not a connect CTA.
  if (generationError && !insights) {
    return <InsightsGenerationError title={TITLE} message={generationError} onRetry={refresh} retrying={isRefreshing} />;
  }

  if (error) {
    return <WebBrowsingErrorState navigate={navigate} />;
  }

  return (
    <Page>
      <InsightsPageHeader
        title={TITLE}
        line="What your browsing says about you"
        onBack={() => navigate('/identity')}
        onRefresh={refresh}
        isRefreshing={isRefreshing}
      />

      <RefreshingIndicator visible={isRefreshing} />

      {/* Extension install row (a button: keyboard parity comes with it) */}
      {!insights?.hasExtensionData && (
        <Section>
          <List>
            <Row
              icon={<Layout />}
              title="Install the browser extension"
              line="Your twin reads what you browse and search through it."
              onClick={() => navigate('/get-started')}
            />
          </List>
        </Section>
      )}

      {/* Primary Reflection */}
      {insights?.reflection && (
        <TwinReflection
          reflection={insights.reflection.text}
          timestamp={insights.reflection.generatedAt}
          confidence={insights.reflection.confidence}
          isNew={true}
        >
          {insights?.evidence && insights.evidence.length > 0 && <EvidenceSection evidence={insights.evidence} />}
        </TwinReflection>
      )}

      {/* Charts & data */}
      {insights && <WebBrowsingCharts insights={insights} />}

      <PatternsSection patterns={insights?.patterns} />
      <HistorySection history={insights?.history} />

      {/* Empty State */}
      {!insights?.reflection && (
        <InsightsNotice
          notConnected={false}
          platform="Browsing"
          connectLine=""
          title="Your twin is exploring"
          line="Patterns show up as your browsing data flows in."
          onConnect={() => navigate('/get-started')}
        />
      )}
    </Page>
  );
};

export default WebBrowsingInsightsPage;
