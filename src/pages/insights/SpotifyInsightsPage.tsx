/**
 * Spotify Insights Page
 *
 * What your listening says about you: the twin's reflection first, then the
 * music it read (recent tracks, top artists, genres, hours), then patterns
 * and past observations. The register's page kit: sections of rows.
 */

import React from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePlatformInsights } from '@/hooks/usePlatformInsights';
import { Page } from '@/components/register';
import { TwinReflection } from './components/TwinReflection';
import { EvidenceSection } from './components/EvidenceSection';
import { useNavigate } from 'react-router-dom';
import type { InsightsResponse } from './components/spotifyTypes';
import { SpotifySkeleton } from './components/SpotifySkeleton';
import { SpotifyCharts } from './components/SpotifyCharts';
import { SpotifyEmptyState } from './components/SpotifyEmptyState';
import { RefreshingIndicator } from './components/RefreshingIndicator';
import { InsightsGenerationError } from './components/InsightsGenerationError';
import { InsightsPageHeader } from './components/InsightsPageHeader';
import { InsightsError, PatternsSection, HistorySection, PendingReflection } from './components/InsightsKit';

const TITLE = 'Your music';

const SpotifyInsightsPage: React.FC = () => {
  useDocumentTitle('Spotify Insights');

  const navigate = useNavigate();
  const { insights, loading, generating, isRefreshing, error, generationError, refresh } =
    usePlatformInsights<InsightsResponse>('spotify', 'Please sign in to see your musical soul');

  // Loading / generating: show the skeleton while the twin's reflection is
  // generated in the background (cold cache) rather than a misleading empty
  // state. With previous insights on screen (refresh), keep them rendered and
  // show the inline refreshing indicator instead (audit-2026-06-10).
  if ((loading || generating) && !insights) {
    return <SpotifySkeleton />;
  }

  // Generation failed with nothing to show — inline retry, not a connect CTA.
  if (generationError && !insights) {
    return <InsightsGenerationError title={TITLE} message={generationError} onRetry={refresh} retrying={isRefreshing} />;
  }

  // Error state
  if (error) {
    return (
      <InsightsError
        title={TITLE}
        message={error}
        actionLabel={isRefreshing ? 'Retrying...' : 'Try again'}
        onAction={refresh}
        busy={isRefreshing}
      />
    );
  }

  const hasMusic = Boolean(insights?.recentTracks?.length || insights?.topArtistsWithPlays?.length);

  return (
    <Page>
      <InsightsPageHeader
        title={TITLE}
        line="What your listening says about you"
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
          {/* Evidence - collapsible rows under the reflection */}
          {insights?.evidence && insights.evidence.length > 0 && (
            <EvidenceSection evidence={insights.evidence} crossPlatformContext={insights.crossPlatformContext} />
          )}
        </TwinReflection>
      ) : hasMusic ? (
        <PendingReflection what="listening" />
      ) : null}

      {/* Recent tracks, top artists, genres, listening hours, current mood */}
      {insights && <SpotifyCharts insights={insights} />}

      <PatternsSection patterns={insights?.patterns} />
      <HistorySection history={insights?.history} />

      {/* Empty State - show when no reflection AND no music data */}
      {!insights?.reflection?.text && !hasMusic && (
        <SpotifyEmptyState navigate={navigate} notConnected={insights?.notConnected === true} />
      )}
    </Page>
  );
};

export default SpotifyInsightsPage;
