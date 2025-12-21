import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LucideIcon, ChevronDown, Eye, Sparkles, Clock } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import * as Slider from '@radix-ui/react-slider';

export interface LifeCluster {
  id: string;
  name: string;
  category: 'personal' | 'professional' | 'creative';
  icon: LucideIcon;
  dataPoints: number;
  revealLevel: number; // 0-100
  description: string;
  preview: string[]; // What's revealed at current level
  lastUpdated?: Date;
  quality?: number; // 0-100 data quality score
}

interface ClusterCardProps {
  cluster: LifeCluster;
  onRevealChange: (id: string, level: number) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

const getIntensityColor = (level: number, theme: string) => {
  // Clean, minimal colors - no flashy gradients
  if (level === 0) return theme === 'dark' ? '#57534e' : '#d6d3d1';
  if (level <= 33) return theme === 'dark' ? '#78716c' : '#a8a29e';
  if (level <= 66) return theme === 'dark' ? '#a8a29e' : '#78716c';
  return '#D97706'; // Claude accent color
};

const getIntensityLabel = (level: number) => {
  if (level === 0) return 'Hidden';
  if (level <= 25) return 'Minimal';
  if (level <= 50) return 'Moderate';
  if (level <= 75) return 'High';
  return 'Full';
};

export const ClusterCard: React.FC<ClusterCardProps> = ({
  cluster,
  onRevealChange,
  isExpanded = false,
  onToggleExpand,
}) => {
  const { theme } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const Icon = cluster.icon;

  const handleSliderChange = (values: number[]) => {
    onRevealChange(cluster.id, values[0]);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative overflow-hidden rounded-xl border transition-all duration-200"
      style={{
        backgroundColor: theme === 'dark' ? '#2D2D29' : '#FFFFFF',
        borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(0, 0, 0, 0.1)',
      }}
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 flex-1">
            <div
              className="p-2.5 rounded-lg"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : '#F5F5F4',
              }}
            >
              <Icon className="w-5 h-5" style={{ color: theme === 'dark' ? '#C1C0B6' : '#57534e' }} />
            </div>

            <div className="flex-1">
              <h3 className="font-heading text-lg font-medium text-[hsl(var(--claude-text))] mb-1">
                {cluster.name}
              </h3>
              <div className="flex items-center gap-2 text-xs text-stone-500">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  {cluster.dataPoints} moments
                </span>
                {cluster.quality && (
                  <span className="flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-stone-300" />
                    {cluster.quality}% quality
                  </span>
                )}
              </div>
            </div>
          </div>

          {onToggleExpand && (
            <motion.button
              onClick={onToggleExpand}
              className="p-2 rounded-lg hover:bg-stone-100 transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <motion.div
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.3 }}
              >
                <ChevronDown className="w-4 h-4 text-stone-600" />
              </motion.div>
            </motion.button>
          )}
        </div>

        {/* Description */}
        <p className="text-sm text-stone-600 font-body mb-6 leading-relaxed">
          {cluster.description}
        </p>

        {/* Intensity Slider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-ui font-medium" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
              Reveal Level
            </label>
            <span
              className="text-2xl font-heading font-medium tabular-nums"
              style={{ color: getIntensityColor(cluster.revealLevel, theme) }}
            >
              {cluster.revealLevel}%
            </span>
          </div>

          {/* Custom Slider with Radix UI */}
          <Slider.Root
            className="relative flex items-center select-none touch-none w-full h-8"
            value={[cluster.revealLevel]}
            onValueChange={handleSliderChange}
            onPointerDown={() => setIsDragging(true)}
            onPointerUp={() => setIsDragging(false)}
            max={100}
            step={5}
            aria-label={`${cluster.name} revelation level`}
          >
            <Slider.Track
              className="relative grow rounded-full h-2"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : '#e7e5e4',
              }}
            >
              <Slider.Range
                className="absolute h-full rounded-full transition-all duration-300"
                style={{
                  backgroundColor: getIntensityColor(cluster.revealLevel, theme),
                }}
              />
            </Slider.Track>
            <Slider.Thumb
              className="block w-6 h-6 bg-white rounded-full shadow-md border-2 transition-all duration-200 cursor-grab active:cursor-grabbing focus:outline-none"
              style={{
                borderColor: isDragging ? '#D97706' : theme === 'dark' ? 'rgba(193, 192, 182, 0.3)' : '#d6d3d1',
              }}
            />
          </Slider.Root>

          {/* Percentage Markers */}
          <div className="flex justify-between text-xs text-stone-400 px-1">
            <span>0%</span>
            <span>25%</span>
            <span>50%</span>
            <span>75%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Preview Section */}
        <AnimatePresence>
          {cluster.preview && cluster.preview.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-6 pt-6 border-t border-stone-200"
            >
              <div className="flex items-center gap-2 mb-3">
                <Eye className="w-4 h-4 text-stone-500" />
                <span className="text-xs font-medium text-stone-700 font-ui">
                  What's revealed at this level
                </span>
              </div>
              <div className="space-y-2">
                {cluster.preview.slice(0, 3).map((item, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-start gap-2 text-sm text-stone-600 font-body"
                  >
                    <span className="text-[hsl(var(--claude-accent))] mt-1">•</span>
                    <span>{item}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expanded Details */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-6 pt-6 border-t border-stone-200"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-stone-500 font-ui">Category</p>
                  <p className="text-sm font-medium text-stone-700 capitalize">
                    {cluster.category}
                  </p>
                </div>
                {cluster.lastUpdated && (
                  <div className="space-y-1">
                    <p className="text-xs text-stone-500 font-ui flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Last Updated
                    </p>
                    <p className="text-sm font-medium text-stone-700">
                      {cluster.lastUpdated.toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
