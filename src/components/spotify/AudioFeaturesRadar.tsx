import React from 'react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip
} from 'recharts';
import { Activity } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { SpotifyAudioFeatures } from '@/hooks/useSpotifyInsights';

interface AudioFeaturesRadarProps {
  audioFeatures: SpotifyAudioFeatures;
  className?: string;
}

export const AudioFeaturesRadar: React.FC<AudioFeaturesRadarProps> = ({
  audioFeatures,
  className = ''
}) => {
  // Transform audio features to chart data
  const chartData = [
    {
      feature: 'Energy',
      value: audioFeatures.averageEnergy * 100,
      fullMark: 100,
      description: 'Intensity and activity'
    },
    {
      feature: 'Valence',
      value: audioFeatures.averageValence * 100,
      fullMark: 100,
      description: 'Musical positivity'
    },
    {
      feature: 'Dance',
      value: audioFeatures.averageDanceability * 100,
      fullMark: 100,
      description: 'How suitable for dancing'
    },
    {
      feature: 'Acoustic',
      value: audioFeatures.averageAcousticness * 100,
      fullMark: 100,
      description: 'Acoustic vs electronic'
    },
    {
      feature: 'Instrumental',
      value: audioFeatures.averageInstrumentalness * 100,
      fullMark: 100,
      description: 'Vocal vs instrumental'
    }
  ];

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
            {payload[0].payload.feature}
          </p>
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {payload[0].payload.description}
          </p>
          <p className="text-xs font-mono text-[#1DB954] mt-2">
            {payload[0].value.toFixed(1)}%
          </p>
        </div>
      );
    }
    return null;
  };

  // Get personality interpretation based on audio features
  const getPersonalityInsight = (): string => {
    const { averageEnergy, averageValence, averageDanceability, averageAcousticness } = audioFeatures;

    if (averageEnergy > 0.7 && averageDanceability > 0.7) {
      return 'High-energy party enthusiast';
    } else if (averageValence > 0.7 && averageDanceability > 0.6) {
      return 'Upbeat and positive listener';
    } else if (averageAcousticness > 0.6 && averageEnergy < 0.5) {
      return 'Mellow and contemplative';
    } else if (averageEnergy > 0.6 && averageValence < 0.5) {
      return 'Intense and dramatic';
    } else if (averageDanceability > 0.7) {
      return 'Rhythm-focused groove lover';
    } else {
      return 'Balanced and diverse taste';
    }
  };

  return (
    <Card className={`p-6 ${className}`}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-[#1DB954]/10 flex items-center justify-center">
          <Activity className="w-5 h-5 text-[#1DB954]" />
        </div>
        <div>
          <h3 className="text-lg font-medium" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--foreground)' }}>
            Audio Personality
          </h3>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Your musical characteristics
          </p>
        </div>
      </div>

      <div>
        <ResponsiveContainer width="100%" height={300}>
          <RadarChart data={chartData}>
            <PolarGrid stroke="#E5E7EB" strokeWidth={1} />
            <PolarAngleAxis
              dataKey="feature"
              tick={{ fill: '#57534E', fontSize: 12, fontFamily: "'Inter', sans-serif" }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{ fill: '#A8A29E', fontSize: 10 }}
            />
            <Radar
              name="Features"
              dataKey="value"
              stroke="#1DB954"
              fill="#1DB954"
              fillOpacity={0.35}
              strokeWidth={2}
              animationBegin={200}
              animationDuration={800}
            />
            <Tooltip content={<CustomTooltip />} />
          </RadarChart>
        </ResponsiveContainer>

        {/* Personality Insight Badge */}
        <div
          className="mt-4 bg-gradient-to-r from-[#1DB954]/5 to-[#1DB954]/10 rounded-lg p-4 border border-[#1DB954]/20"
        >
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-[#1DB954]" />
            <span className="text-[11px] font-medium tracking-widest uppercase" style={{ color: '#10b77f' }}>
              Musical Personality
            </span>
          </div>
          <p className="text-base font-medium" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--foreground)' }}>
            {getPersonalityInsight()}
          </p>
        </div>

        {/* Feature Legend */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          {chartData.map((item) => (
            <div
              key={item.feature}
              className="flex items-center justify-between rounded-lg px-3 py-2"
              style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#1DB954]" />
                <span className="text-xs" style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(255,255,255,0.3)' }}>
                  {item.feature}
                </span>
              </div>
              <span className="text-xs font-mono font-medium" style={{ color: 'var(--foreground)' }}>
                {item.value.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};
