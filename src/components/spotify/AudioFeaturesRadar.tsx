import React from 'react';
import { motion } from 'framer-motion';
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

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-stone-200 rounded-lg shadow-lg p-3">
          <p className="font-ui text-sm font-medium text-stone-900">
            {payload[0].payload.feature}
          </p>
          <p className="text-xs text-stone-600 mt-1">
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
    <Card className={`bg-white border border-stone-200 p-6 shadow-md hover:shadow-lg transition-shadow duration-200 ${className}`}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-[#1DB954]/10 flex items-center justify-center">
          <Activity className="w-5 h-5 text-[#1DB954]" />
        </div>
        <div>
          <h3 className="font-heading text-lg font-medium text-stone-900">
            Audio Personality
          </h3>
          <p className="text-xs text-stone-500">
            Your musical characteristics
          </p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <ResponsiveContainer width="100%" height={300}>
          <RadarChart data={chartData}>
            <PolarGrid stroke="#E5E7EB" strokeWidth={1} />
            <PolarAngleAxis
              dataKey="feature"
              tick={{ fill: '#57534E', fontSize: 12, fontFamily: 'DM Sans' }}
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
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-4 bg-gradient-to-r from-[#1DB954]/5 to-[#1DB954]/10 rounded-lg p-4 border border-[#1DB954]/20"
        >
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-[#1DB954]" />
            <span className="text-xs font-ui font-medium text-stone-600">
              Musical Personality
            </span>
          </div>
          <p className="text-base font-heading font-medium text-stone-900">
            {getPersonalityInsight()}
          </p>
        </motion.div>

        {/* Feature Legend */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          {chartData.map((item, index) => (
            <motion.div
              key={item.feature}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + index * 0.1 }}
              className="flex items-center justify-between bg-stone-50 rounded-lg px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#1DB954]" />
                <span className="text-xs font-ui text-stone-700">
                  {item.feature}
                </span>
              </div>
              <span className="text-xs font-mono text-stone-900 font-medium">
                {item.value.toFixed(0)}%
              </span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </Card>
  );
};
