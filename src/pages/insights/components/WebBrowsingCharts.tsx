import React from 'react';
import { Globe } from 'lucide-react';
import { Section, List, Row } from '@/components/register';
import type { InsightsResponse } from './webBrowsingTypes';
import { BarRow } from './InsightsKit';
import { StatCard } from './TwinReflection';

interface WebBrowsingChartsProps {
  insights: InsightsResponse;
}

const seconds = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);

export const WebBrowsingCharts: React.FC<WebBrowsingChartsProps> = ({ insights }) => {
  const profile = insights?.webReadingProfile;
  const topDomainCount = insights?.webTopDomains?.[0]?.count || 1;

  return (
    <>
      {/* Interest categories, a bar each by share */}
      {insights?.webTopCategories && insights.webTopCategories.length > 0 && (
        <Section title="Your interests" line="Share of the pages you visit.">
          <List className="rg-compact">
            {insights.webTopCategories.slice(0, 8).map((cat, index) => (
              <BarRow key={index} title={cat.category} share={cat.percentage} end={`${cat.percentage}%`} />
            ))}
          </List>
        </Section>
      )}

      {/* What you search for */}
      {insights?.webRecentSearches && insights.webRecentSearches.length > 0 && (
        <Section title="What you search for">
          <List>
            <li className="ri-block">
              <p className="ri-prose">{insights.webRecentSearches.slice(0, 12).join(' · ')}</p>
            </li>
          </List>
        </Section>
      )}

      {/* Reading profile, one figure a row */}
      {profile && (
        <Section title="How you read">
          <List className="rg-compact ri-stats">
            {profile.dominantBehavior && (
              <StatCard label="Reading style" value={profile.dominantBehavior.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())} />
            )}
            {profile.avgTimeOnPage != null && (
              <StatCard label="Time per page" value={seconds(profile.avgTimeOnPage)} />
            )}
            {profile.avgEngagement != null && (
              <StatCard label="Engagement" value={`${profile.avgEngagement} of 100`} />
            )}
            {insights.webTotalPageVisits != null && insights.webTotalPageVisits > 0 && (
              <StatCard label="Pages tracked" value={String(insights.webTotalPageVisits)} />
            )}
          </List>
        </Section>
      )}

      {/* Top domains, a bar each by visits */}
      {insights?.webTopDomains && insights.webTopDomains.length > 0 && (
        <Section title="Where you go">
          <List className="rg-compact">
            {insights.webTopDomains.slice(0, 15).map((item, index) => (
              <BarRow
                key={index}
                title={item.domain.replace(/^www\./, '')}
                share={(item.count / topDomainCount) * 100}
                end={`${item.count} visits`}
              />
            ))}
          </List>
        </Section>
      )}

      {/* Top topics */}
      {insights?.webTopTopics && insights.webTopTopics.length > 0 && (
        <Section title="Topics that draw you in">
          <List>
            <li className="ri-block">
              <p className="ri-prose">{insights.webTopTopics.slice(0, 15).join(' · ')}</p>
            </li>
          </List>
        </Section>
      )}

      {/* Recent activity */}
      {insights?.webRecentActivity && insights.webRecentActivity.length > 0 && (
        <Section title="Recent browsing">
          <List>
            {insights.webRecentActivity.slice(0, 8).map((item, index) => (
              <Row
                key={index}
                icon={<Globe />}
                title={item.title || item.domain || 'Unknown page'}
                line={[
                  item.domain ? item.domain.replace(/^www\./, '') : null,
                  item.category || null,
                  item.timeOnPage != null && item.timeOnPage > 0
                    ? item.timeOnPage < 60 ? `${item.timeOnPage}s` : `${Math.floor(item.timeOnPage / 60)}m`
                    : null,
                ].filter(Boolean).join(' · ')}
                clip
              />
            ))}
          </List>
        </Section>
      )}
    </>
  );
};
