import React from 'react';
import { Globe, Search, BarChart3, BookOpen, Clock, Layout } from 'lucide-react';
import { CATEGORY_COLORS } from './webBrowsingTypes';
import type { InsightsResponse } from './webBrowsingTypes';

interface WebBrowsingChartsProps {
  insights: InsightsResponse;
  colors: {
    text: string;
    textSecondary: string;
    webAccent: string;
    webBg: string;
  };
  theme?: string;
}

export const WebBrowsingCharts: React.FC<WebBrowsingChartsProps> = ({
  insights,
  colors,
}) => {
  return (
    <>
      {/* Interest Categories */}
      {insights?.webTopCategories && insights.webTopCategories.length > 0 && (
        <div className="p-4 rounded-lg mb-6" style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
          <span
            className="text-[11px] font-medium tracking-widest uppercase block mb-4"
            style={{ color: '#10b77f' }}
          >
            Your Interest Universe
          </span>
          <div className="space-y-3">
            {insights.webTopCategories.slice(0, 8).map((cat, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium" style={{ color: colors.text }}>
                    {cat.category}
                  </span>
                  <span className="text-xs" style={{ color: colors.textSecondary }}>
                    {cat.percentage}%
                  </span>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ backgroundColor: 'var(--glass-surface-bg)' }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${cat.percentage}%`,
                      backgroundColor: CATEGORY_COLORS[cat.category] || CATEGORY_COLORS.Other
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* What You Search For */}
      {insights?.webRecentSearches && insights.webRecentSearches.length > 0 && (
        <div className="p-4 rounded-lg mb-6" style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
          <span
            className="text-[11px] font-medium tracking-widest uppercase block mb-4"
            style={{ color: '#10b77f' }}
          >
            What You Search For
          </span>
          <div className="flex flex-wrap gap-2">
            {insights.webRecentSearches.slice(0, 12).map((query, index) => (
              <span
                key={index}
                className="px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: colors.webBg,
                  color: colors.webAccent
                }}
              >
                {query}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Reading Profile */}
      {insights?.webReadingProfile && (
        <div className="p-4 rounded-lg mb-6" style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
          <span
            className="text-[11px] font-medium tracking-widest uppercase block mb-4"
            style={{ color: '#10b77f' }}
          >
            Your Reading Profile
          </span>
          <div className="grid grid-cols-2 gap-4">
            {insights.webReadingProfile.dominantBehavior && (
              <div className="text-center p-3 rounded-lg" style={{ backgroundColor: colors.webBg }}>
                <p className="text-lg font-medium capitalize" style={{ color: colors.webAccent }}>
                  {insights.webReadingProfile.dominantBehavior.replace('_', ' ')}
                </p>
                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Reading Style</p>
              </div>
            )}
            {insights.webReadingProfile.avgTimeOnPage != null && (
              <div className="text-center p-3 rounded-lg" style={{ backgroundColor: colors.webBg }}>
                <p className="text-lg font-medium" style={{ color: colors.webAccent }}>
                  {insights.webReadingProfile.avgTimeOnPage < 60
                    ? `${insights.webReadingProfile.avgTimeOnPage}s`
                    : `${Math.floor(insights.webReadingProfile.avgTimeOnPage / 60)}m ${insights.webReadingProfile.avgTimeOnPage % 60}s`
                  }
                </p>
                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Avg. Time per Page</p>
              </div>
            )}
            {insights.webReadingProfile.avgEngagement != null && (
              <div className="text-center p-3 rounded-lg" style={{ backgroundColor: colors.webBg }}>
                <p className="text-lg font-medium" style={{ color: colors.webAccent }}>
                  {insights.webReadingProfile.avgEngagement}/100
                </p>
                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Engagement Score</p>
              </div>
            )}
            {insights.webTotalPageVisits != null && insights.webTotalPageVisits > 0 && (
              <div className="text-center p-3 rounded-lg" style={{ backgroundColor: colors.webBg }}>
                <p className="text-lg font-medium" style={{ color: colors.webAccent }}>
                  {insights.webTotalPageVisits}
                </p>
                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Pages Tracked</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Digital Landscape - Top Domains */}
      {insights?.webTopDomains && insights.webTopDomains.length > 0 && (
        <div className="p-4 rounded-lg mb-6" style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
          <span
            className="text-[11px] font-medium tracking-widest uppercase block mb-4"
            style={{ color: '#10b77f' }}
          >
            Your Digital Landscape
          </span>
          <div className="flex flex-wrap gap-2">
            {insights.webTopDomains.slice(0, 15).map((item, index) => {
              const size = Math.max(0.7, Math.min(1.2, item.count / (insights.webTopDomains![0]?.count || 1)));
              return (
                <span
                  key={index}
                  className="px-3 py-1.5 rounded-lg text-sm"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    color: colors.text,
                    fontSize: `${size}rem`,
                    borderLeft: `3px solid ${colors.webAccent}`,
                    opacity: 0.6 + (item.count / (insights.webTopDomains![0]?.count || 1)) * 0.4
                  }}
                >
                  {item.domain.replace(/^www\./, '')}
                  <span className="text-xs ml-1" style={{ color: colors.textSecondary }}>
                    ({item.count})
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Topics */}
      {insights?.webTopTopics && insights.webTopTopics.length > 0 && (
        <div className="p-4 rounded-lg mb-6" style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
          <span
            className="text-[11px] font-medium tracking-widest uppercase block mb-4"
            style={{ color: '#10b77f' }}
          >
            Topics That Draw You In
          </span>
          <div className="flex flex-wrap gap-2">
            {insights.webTopTopics.slice(0, 15).map((topic, index) => (
              <span
                key={index}
                className="px-2.5 py-1 rounded-md text-xs"
                style={{
                  backgroundColor: 'rgba(99, 102, 241, 0.08)',
                  color: colors.text,
                  opacity: 1 - (index * 0.03)
                }}
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {insights?.webRecentActivity && insights.webRecentActivity.length > 0 && (
        <div className="p-4 rounded-lg mb-6" style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
          <span
            className="text-[11px] font-medium tracking-widest uppercase block mb-4"
            style={{ color: '#10b77f' }}
          >
            Recent Browsing
          </span>
          <div className="space-y-3">
            {insights.webRecentActivity.slice(0, 8).map((item, index) => (
              <div key={index} className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: colors.webBg }}
                >
                  <Globe className="w-5 h-5" style={{ color: colors.webAccent }} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block" style={{ color: colors.text }}>
                    {item.title || item.domain || 'Unknown page'}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.domain && (
                      <span className="text-xs" style={{ color: colors.textSecondary }}>
                        {item.domain.replace(/^www\./, '')}
                      </span>
                    )}
                    {item.category && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: CATEGORY_COLORS[item.category]
                            ? `${CATEGORY_COLORS[item.category]}20`
                            : 'rgba(107,114,128,0.1)',
                          color: CATEGORY_COLORS[item.category] || '#6b7280'
                        }}
                      >
                        {item.category}
                      </span>
                    )}
                    {item.timeOnPage != null && item.timeOnPage > 0 && (
                      <span className="text-xs" style={{ color: colors.textSecondary }}>
                        {item.timeOnPage < 60 ? `${item.timeOnPage}s` : `${Math.floor(item.timeOnPage / 60)}m`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
