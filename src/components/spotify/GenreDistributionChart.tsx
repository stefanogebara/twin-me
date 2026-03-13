import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Disc3 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { SpotifyGenre } from '@/hooks/useSpotifyInsights';

interface GenreDistributionChartProps {
  genres: SpotifyGenre[];
  className?: string;
}

// Color palette for genres
const GENRE_COLORS = [
  '#1DB954', // Spotify Green
  '#D97706', // Orange
  '#8B5CF6', // Purple
  '#EF4444', // Red
  '#3B82F6', // Blue
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#EC4899', // Pink
];

export const GenreDistributionChart: React.FC<GenreDistributionChartProps> = ({
  genres,
  className = ''
}) => {
  // Prepare data for chart - take top 5 genres
  const chartData = genres.slice(0, 5).map((genre, index) => ({
    name: genre.genre,
    value: genre.percentage,
    count: genre.count,
    color: GENRE_COLORS[index % GENRE_COLORS.length],
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Recharts tooltip props have dynamic shape
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div
          className="rounded-lg p-3"
          style={{
            backgroundColor: 'rgba(10,15,10,0.9)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: 'rgba(255,255,255,0.8)'
          }}
        >
          <p className="text-sm font-medium" style={{ fontFamily: "'Inter', sans-serif" }}>
            {payload[0].name}
          </p>
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {payload[0].value.toFixed(1)}% ({payload[0].payload.count} tracks)
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className={`p-6 ${className}`}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-[#1DB954]/10 flex items-center justify-center">
          <Disc3 className="w-5 h-5 text-[#1DB954]" />
        </div>
        <div>
          <h3 className="text-lg font-medium" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--foreground)' }}>
            Genre Distribution
          </h3>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Your musical palette
          </p>
        </div>
      </div>

      {chartData.length > 0 ? (
        <div>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
                animationBegin={200}
                animationDuration={800}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="mt-4 space-y-2">
            {chartData.map((genre) => (
              <div
                key={genre.name}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: genre.color }}
                  />
                  <span className="text-sm truncate" style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(255,255,255,0.3)' }}>
                    {genre.name}
                  </span>
                </div>
                <span className="text-sm font-mono flex-shrink-0 ml-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {genre.value.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <Disc3 className="w-12 h-12 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.3)' }} />
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
            No genre data available yet
          </p>
        </div>
      )}
    </Card>
  );
};
