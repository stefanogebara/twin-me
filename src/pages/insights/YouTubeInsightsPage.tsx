/**
 * YouTube Insights Page
 *
 * "What you watch" - the twin's reflection on your YouTube patterns, then
 * what it read: watch history and searches (extension), subscriptions,
 * categories, likes. The register's page kit: sections of rows.
 */

import React from 'react';
import { usePlatformInsights } from '@/hooks/usePlatformInsights';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Page, Section, List, Row } from '@/components/register';
import { TwinReflection } from './components/TwinReflection';
import { EvidenceSection } from './components/EvidenceSection';
import { Video, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { RefreshingIndicator } from './components/RefreshingIndicator';
import { InsightsGenerationError } from './components/InsightsGenerationError';
import { InsightsPageHeader } from './components/InsightsPageHeader';
import {
  BarRow,
  HistorySection,
  HUES,
  InsightsError,
  InsightsNotice,
  InsightsSkeleton,
  MixBar,
  PatternsSection,
} from './components/InsightsKit';

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

interface YouTubeChannel {
  name: string;
  description?: string;
}

interface LikedVideo {
  title: string;
  channel: string;
  publishedAt?: string;
}

interface ContentCategory {
  category: string;
  percentage: number;
}

interface WatchHistoryItem {
  title?: string;
  videoId?: string;
  watchDuration?: number;
  watchPercentage?: number;
  completed?: boolean;
  timestamp?: string;
}

interface InsightsResponse {
  success: boolean;
  reflection: Reflection;
  patterns: Pattern[];
  history: HistoryItem[];
  evidence?: EvidenceItem[];
  youtubeChannels?: YouTubeChannel[];
  youtubeChannelNames?: string[];
  youtubeRecentLiked?: LikedVideo[];
  youtubeContentCategories?: ContentCategory[];
  youtubeSubscriptionCount?: number;
  youtubeLikedVideoCount?: number;
  youtubeLearningRatio?: number | null;
  youtubeWatchHistory?: WatchHistoryItem[];
  youtubeSearchQueries?: string[];
  hasExtensionData?: boolean;
  // When true, the backend returned a plain-string `reflection` placeholder and
  // the user has not connected YouTube (audit-2026-06-10).
  notConnected?: boolean;
  error?: string;
}

const TITLE = 'What you watch';

const duration = (seconds: number) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

const YouTubeInsightsPage: React.FC = () => {
  const navigate = useNavigate();

  useDocumentTitle('YouTube Insights');

  const { insights, loading, generating, isRefreshing, error, generationError, refresh } =
    usePlatformInsights<InsightsResponse>('youtube', 'Please sign in to see your content world');

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
      <InsightsError title={TITLE} message={error} actionLabel="Connect YouTube" onAction={() => navigate('/get-started')} />
    );
  }

  const hasCategories = Boolean(insights?.youtubeContentCategories && insights.youtubeContentCategories.length > 0);
  const hasRatio = insights?.youtubeLearningRatio != null;

  return (
    <Page>
      <InsightsPageHeader
        title={TITLE}
        line="What your viewing says about you"
        onBack={() => navigate('/identity')}
        onRefresh={refresh}
        isRefreshing={isRefreshing}
      />

      <RefreshingIndicator visible={isRefreshing} />

      {/* Extension install row */}
      {!insights?.hasExtensionData && (
        <Section>
          <List>
            <Row
              icon={<Download />}
              title="Install the browser extension"
              line="It adds the watch history and searches YouTube keeps to itself."
              onClick={() => navigate('/get-started')}
            />
          </List>
        </Section>
      )}

      {/* Primary Reflection — check .text, not object truthiness: the backend
          returns `reflection` as a plain STRING for notConnected/fallback
          responses, which would render a blank section (audit-2026-06-10) */}
      {insights?.reflection?.text && (
        <TwinReflection
          reflection={insights.reflection.text}
          timestamp={insights.reflection.generatedAt}
          confidence={insights.reflection.confidence}
          isNew={true}
        >
          {insights?.evidence && insights.evidence.length > 0 && <EvidenceSection evidence={insights.evidence} />}
        </TwinReflection>
      )}

      {/* Recent watch history (extension data): how much of each you watched */}
      {insights?.youtubeWatchHistory && insights.youtubeWatchHistory.length > 0 && (
        <Section title="Watched lately">
          <List className="ri-compact">
            {insights.youtubeWatchHistory.slice(0, 8).map((item, index) => {
              const title = item.title || item.videoId || 'Unknown video';
              const time = item.watchDuration != null && item.watchDuration > 0 ? duration(item.watchDuration) : null;
              return item.watchPercentage != null ? (
                <BarRow
                  key={index}
                  title={title}
                  share={item.watchPercentage}
                  end={[`${item.watchPercentage}%`, time].filter(Boolean).join(' · ')}
                />
              ) : (
                <Row key={index} title={title} action={time ? <span className="ri-end">{time}</span> : undefined} />
              );
            })}
          </List>
        </Section>
      )}

      {/* Search interests (extension data) */}
      {insights?.youtubeSearchQueries && insights.youtubeSearchQueries.length > 0 && (
        <Section title="What you search for">
          <List>
            <li className="ri-block">
              <p className="ri-prose">{insights.youtubeSearchQueries.slice(0, 10).join(' · ')}</p>
            </li>
          </List>
        </Section>
      )}

      {/* Top subscriptions */}
      {insights?.youtubeChannels && insights.youtubeChannels.length > 0 && (
        <Section title="Top subscriptions">
          <List>
            {insights.youtubeChannels.slice(0, 8).map((channel, index) => (
              <Row
                key={index}
                icon={<span style={{ fontWeight: 500 }}>{(channel.name || '?')[0].toUpperCase()}</span>}
                title={channel.name}
                line={channel.description}
                clip
              />
            ))}
          </List>
        </Section>
      )}

      {/* Content categories, then learning against entertainment */}
      {(hasCategories || hasRatio) && (
        <Section title="Categories" line="Share of what you watch.">
          <List>
            {hasCategories && (
              <li className="ri-block">
                <MixBar
                  parts={insights!.youtubeContentCategories!.slice(0, 6).map((cat, index) => ({
                    key: cat.category,
                    label: `${cat.category} ${cat.percentage}%`,
                    share: cat.percentage,
                    color: HUES[index % HUES.length],
                  }))}
                />
              </li>
            )}
            {hasRatio && (
              <li className="ri-block">
                <span className="rg-row-title">Learning and entertainment</span>
                <MixBar
                  parts={[
                    { key: 'learning', label: `Learning ${insights!.youtubeLearningRatio}%`, share: insights!.youtubeLearningRatio!, color: 'var(--rg-verdigris)' },
                    { key: 'entertainment', label: `Entertainment ${100 - insights!.youtubeLearningRatio!}%`, share: 100 - insights!.youtubeLearningRatio!, color: 'var(--rg-ember)' },
                  ]}
                />
              </li>
            )}
          </List>
        </Section>
      )}

      {/* Recently liked videos */}
      {insights?.youtubeRecentLiked && insights.youtubeRecentLiked.length > 0 && (
        <Section title="Recently liked">
          <List>
            {insights.youtubeRecentLiked.slice(0, 5).map((video, index) => (
              <Row key={index} icon={<Video />} title={video.title} line={video.channel} clip />
            ))}
          </List>
        </Section>
      )}

      <PatternsSection patterns={insights?.patterns} />
      <HistorySection history={insights?.history} />

      {/* Empty State */}
      {!insights?.reflection?.text && (
        <InsightsNotice
          notConnected={insights?.notConnected === true}
          platform="YouTube"
          connectLine="Your twin will notice patterns in what you watch."
          title="Your twin is exploring"
          line="Patterns show up as your viewing syncs."
          onConnect={() => navigate('/get-started')}
        />
      )}
    </Page>
  );
};

export default YouTubeInsightsPage;
