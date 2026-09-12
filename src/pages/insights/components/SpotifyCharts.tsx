import React from 'react';
import { Music } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { Section, List, Row } from '@/components/register';
import type { InsightsResponse } from './spotifyTypes';
import { formatRelativeTime, deduplicateTracks } from './spotifyTypes';
import { BarRow, MixBar, HUES } from './InsightsKit';

interface SpotifyChartsProps {
  insights: InsightsResponse;
}

/* SVG presentation attributes do not resolve var(), so the chart takes
   register.css's hex values: --rg-signal (3.3:1 on the page) for the bars,
   --rg-ink-2 for the ticks, --rg-hover for the cursor wash. */
const SIGNAL = '#0096ba';
const INK_2 = '#585254';
const HOVER = 'rgba(37, 31, 33, 0.05)';

const hourLabel = (hour: number) => `${hour % 12 === 0 ? 12 : hour % 12}${hour >= 12 ? 'pm' : 'am'}`;

export const SpotifyCharts: React.FC<SpotifyChartsProps> = ({ insights }) => {
  return (
    <>
      {/* Recent tracks, with when each was played */}
      {insights?.recentTracks && insights.recentTracks.length > 0 && (
        <Section title="Recently played">
          <List>
            {deduplicateTracks(insights.recentTracks).slice(0, 5).map((track) => (
              <Row
                key={`${track.name}-${track.artist}`}
                icon={<Music />}
                title={track.name}
                line={track.artist}
                clip
                action={track.playedAt ? <span className="ri-end">{formatRelativeTime(track.playedAt)}</span> : undefined}
              />
            ))}
          </List>
        </Section>
      )}

      {/* Top artists, a bar each by plays */}
      {insights?.topArtistsWithPlays && insights.topArtistsWithPlays.length > 0 && (
        <Section title="Top artists">
          <List className="rg-compact">
            {insights.topArtistsWithPlays.slice(0, 5).map((artist) => {
              const maxPlays = insights.topArtistsWithPlays![0].plays;
              return (
                <BarRow
                  key={artist.name}
                  title={artist.name}
                  share={(artist.plays / maxPlays) * 100}
                  end={`${artist.plays} plays`}
                />
              );
            })}
          </List>
        </Section>
      )}

      {/* Genre distribution, as parts of one whole */}
      {insights?.topGenres && insights.topGenres.length > 0 && (
        <Section title="Genres" line="Share of your listening.">
          <List>
            <li className="ri-block">
              <MixBar
                parts={insights.topGenres.slice(0, 5).map((genre, index) => ({
                  key: genre.genre,
                  label: `${genre.genre} ${genre.percentage}%`,
                  share: genre.percentage,
                  color: HUES[index % HUES.length],
                }))}
              />
            </li>
          </List>
        </Section>
      )}

      {/* Listening peak hours */}
      {insights?.listeningHours && insights.listeningHours.length > 0 && (
        <Section title="When you listen" line="Plays by hour of the day.">
          <List>
            <li className="ri-block">
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={insights.listeningHours} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
                    <XAxis
                      dataKey="hour"
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      tick={{ fill: INK_2, fontSize: 13 }}
                      tickFormatter={(hour) => (hour % 6 === 0 && hour > 0 ? hourLabel(hour) : '')}
                    />
                    <YAxis hide />
                    <RechartsTooltip
                      cursor={{ fill: HOVER }}
                      contentStyle={{
                        backgroundColor: 'var(--rg-white)',
                        border: '1px solid var(--rg-rule)',
                        borderRadius: 4,
                        boxShadow: 'none',
                        fontSize: 13,
                      }}
                      labelStyle={{ color: 'var(--rg-ink)', fontWeight: 500 }}
                      itemStyle={{ color: 'var(--rg-ink-2)' }}
                      labelFormatter={(hour) => `${hour % 12 === 0 ? 12 : hour % 12}:00 ${hour >= 12 ? 'PM' : 'AM'}`}
                      formatter={(value: number) => [`${value} plays`, 'Activity']}
                    />
                    <Bar dataKey="plays" fill={SIGNAL} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </li>
          </List>
        </Section>
      )}

      {/* Current mood */}
      {insights?.currentMood && (
        <Section title="Your mood">
          <List>
            <Row
              title={insights.currentMood.label}
              line={`Energy ${Math.round((insights.currentMood.energy || 0.5) * 100)}%, positivity ${Math.round((insights.currentMood.valence || 0.5) * 100)}%`}
            />
          </List>
        </Section>
      )}
    </>
  );
};
