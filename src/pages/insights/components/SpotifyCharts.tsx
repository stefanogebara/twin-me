import React from 'react';
import { Music, Clock, Disc3, Users, BarChart3, PieChart } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip as RechartsTooltip, PieChart as RechartsPie, Pie } from 'recharts';
import type { InsightsResponse } from './spotifyTypes';
import { formatRelativeTime, deduplicateTracks } from './spotifyTypes';

interface SpotifyChartsProps {
  insights: InsightsResponse;
  colors: {
    text: string;
    textSecondary: string;
    spotifyGreen: string;
    spotifyBg: string;
  };
}

export const SpotifyCharts: React.FC<SpotifyChartsProps> = ({
  insights,
  colors,
}) => {
  return (
    <>
      {/* Recent Tracks Section - With Timestamps */}
      {insights?.recentTracks && insights.recentTracks.length > 0 && (
        <div className="mb-6">
          <span
            className="text-[11px] font-medium tracking-widest uppercase block mb-4"
            style={{ color: '#10b77f' }}
          >
            Recently Playing
          </span>
          <div className="space-y-2">
            {deduplicateTracks(insights.recentTracks).slice(0, 5).map((track) => (
              <div key={`${track.name}-${track.artist}`} className="py-3" style={{ borderBottom: '1px solid var(--border-glass)' }}>
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded flex items-center justify-center text-lg"
                    style={{ backgroundColor: colors.spotifyBg }}
                  >
                    <Music className="w-5 h-5" style={{ color: colors.spotifyGreen }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="font-medium truncate"
                        style={{ color: colors.text }}
                      >
                        {track.name}
                      </span>
                    </div>
                    <span
                      className="text-sm truncate block"
                      style={{ color: colors.textSecondary }}
                    >
                      {track.artist}
                    </span>
                  </div>
                  {track.playedAt && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Clock className="w-3 h-3" style={{ color: colors.textSecondary }} />
                      <span className="text-xs" style={{ color: colors.textSecondary }}>
                        {formatRelativeTime(track.playedAt)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Artists with Play Count Bars */}
      {insights?.topArtistsWithPlays && insights.topArtistsWithPlays.length > 0 && (
        <div className="p-4 rounded-[20px] mb-6" style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(42px)', WebkitBackdropFilter: 'blur(42px)' }}>
          <span
            className="text-[11px] font-medium tracking-widest uppercase block mb-4"
            style={{ color: '#10b77f' }}
          >
            Top Artists
          </span>
          <div className="space-y-3">
            {insights.topArtistsWithPlays.slice(0, 5).map((artist, index) => {
              const maxPlays = insights.topArtistsWithPlays![0].plays;
              const barWidth = (artist.plays / maxPlays) * 100;
              return (
                <div key={artist.name} className="flex items-center gap-3">
                  <span
                    className="text-sm w-28 truncate"
                    style={{ color: colors.text }}
                  >
                    {artist.name}
                  </span>
                  <div className="flex-1 h-5 rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--glass-surface-bg)' }}>
                    <div
                      className="h-full rounded-lg transition-all"
                      style={{
                        width: `${barWidth}%`,
                        backgroundColor: colors.spotifyGreen,
                        opacity: 1 - (index * 0.12)
                      }}
                    />
                  </div>
                  <span
                    className="text-sm font-medium w-16 text-right"
                    style={{ color: colors.textSecondary }}
                  >
                    {artist.plays} plays
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Genre Distribution */}
      {insights?.topGenres && insights.topGenres.length > 0 && (
        <div className="p-4 rounded-[20px] mb-6" style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(42px)', WebkitBackdropFilter: 'blur(42px)' }}>
          <span
            className="text-[11px] font-medium tracking-widest uppercase block mb-4"
            style={{ color: '#10b77f' }}
          >
            Genre Distribution
          </span>
          <div className="flex items-center gap-6">
            <div className="w-32 h-32">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPie>
                  <Pie
                    data={insights.topGenres}
                    dataKey="percentage"
                    nameKey="genre"
                    cx="50%"
                    cy="50%"
                    innerRadius={25}
                    outerRadius={50}
                    paddingAngle={2}
                  >
                    {insights.topGenres.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={[colors.spotifyGreen, '#4ade80', '#60a5fa', '#a78bfa', '#fbbf24'][index % 5]}
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: 'rgba(10,15,10,0.9)',
                      border: '1px solid var(--glass-surface-border)',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: colors.text }}
                    itemStyle={{ color: colors.text }}
                    formatter={(value: number) => [`${value}%`, 'Share']}
                  />
                </RechartsPie>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-2">
              {insights.topGenres.slice(0, 5).map((genre, index) => (
                <div key={genre.genre} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: [colors.spotifyGreen, '#4ade80', '#60a5fa', '#a78bfa', '#fbbf24'][index % 5] }}
                  />
                  <span className="text-sm" style={{ color: colors.text }}>
                    {genre.genre}
                  </span>
                  <span className="text-xs ml-auto" style={{ color: colors.textSecondary }}>
                    {genre.percentage}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Listening Peak Hours */}
      {insights?.listeningHours && insights.listeningHours.length > 0 && (
        <div className="p-4 rounded-[20px] mb-6" style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(42px)', WebkitBackdropFilter: 'blur(42px)' }}>
          <span
            className="text-[11px] font-medium tracking-widest uppercase block mb-4"
            style={{ color: '#10b77f' }}
          >
            Your Peak Listening Hours
          </span>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={insights.listeningHours} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <XAxis
                  dataKey="hour"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: colors.textSecondary, fontSize: 10 }}
                  tickFormatter={(hour) => hour % 3 === 0 ? `${hour > 12 ? hour - 12 : hour}${hour >= 12 ? 'pm' : 'am'}` : ''}
                />
                <YAxis hide />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: 'rgba(10,15,10,0.9)',
                    border: '1px solid var(--glass-surface-border)',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: colors.text }}
                  itemStyle={{ color: colors.text }}
                  labelFormatter={(hour) => `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'}`}
                  formatter={(value: number) => [`${value} plays`, 'Activity']}
                />
                <Bar dataKey="plays" radius={[3, 3, 0, 0]}>
                  {insights.listeningHours.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={colors.spotifyGreen}
                      opacity={entry.plays > 20 ? 1 : 0.5 + (entry.plays / 50)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Current Mood - Visual indicator */}
      {insights?.currentMood && (
        <div className="p-4 rounded-[20px] mb-6" style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(42px)', WebkitBackdropFilter: 'blur(42px)' }}>
          <div className="flex items-center justify-between">
            <div>
              <span
                className="text-xs uppercase tracking-wider"
                style={{ color: colors.textSecondary }}
              >
                Current Musical Mood
              </span>
              <div
                className="text-lg font-medium mt-1"
                style={{ color: colors.text }}
              >
                {insights.currentMood.label}
              </div>
            </div>
            <div className="flex gap-4">
              <div className="text-center">
                <div
                  className="text-xs mb-1"
                  style={{ color: colors.textSecondary }}
                >
                  Energy
                </div>
                <div
                  className="w-12 h-2 rounded-full overflow-hidden"
                  style={{ backgroundColor: 'var(--glass-surface-bg)' }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(insights.currentMood.energy || 0.5) * 100}%`,
                      backgroundColor: colors.spotifyGreen
                    }}
                  />
                </div>
              </div>
              <div className="text-center">
                <div
                  className="text-xs mb-1"
                  style={{ color: colors.textSecondary }}
                >
                  Positivity
                </div>
                <div
                  className="w-12 h-2 rounded-full overflow-hidden"
                  style={{ backgroundColor: 'var(--glass-surface-bg)' }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(insights.currentMood.valence || 0.5) * 100}%`,
                      backgroundColor: '#fbbf24'
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
