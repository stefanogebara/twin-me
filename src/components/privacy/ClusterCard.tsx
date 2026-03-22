import React, { useState } from 'react';
import { LucideIcon, ChevronDown, Eye, Sparkles, Clock } from 'lucide-react';
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

const getIntensityColor = (level: number) => {
  // Clean, minimal colors - no flashy gradients
  if (level === 0) return '#d6d3d1';
  if (level <= 33) return '#a8a29e';
  if (level <= 66) return '#78716c';
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
  const [isDragging, setIsDragging] = useState(false);
  const Icon = cluster.icon;

  const handleSliderChange = (values: number[]) => {
    onRevealChange(cluster.id, values[0]);
  };

  return (
    <div
      className="rounded-lg relative overflow-hidden transition-all duration-200"
      style={{
        border: '1px solid rgba(255,255,255,0.06)',
        backgroundColor: 'rgba(255,255,255,0.02)',
      }}
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 flex-1">
            <div
              className="p-2.5 rounded-lg"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
              }}
            >
              <Icon className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.4)' }} />
            </div>

            <div className="flex-1">
              <h3 className="text-lg font-medium text-[var(--foreground)] mb-1" style={{ fontFamily: "'Inter', sans-serif" }}>
                {cluster.name}
              </h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  {cluster.dataPoints} moments
                </span>
                {cluster.quality && (
                  <span className="flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-white/15" />
                    {cluster.quality}% quality
                  </span>
                )}
              </div>
            </div>
          </div>

          {onToggleExpand && (
            <button
              onClick={onToggleExpand}
              className="p-2 rounded-lg hover:bg-white/12 transition-colors"
            >
              <div
                style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }}
              >
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </div>
            </button>
          )}
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed" style={{ fontFamily: "'Inter', sans-serif" }}>
          {cluster.description}
        </p>

        {/* Intensity Slider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium" style={{ color: 'var(--foreground)', fontFamily: "'Inter', sans-serif" }}>
              Reveal Level
            </label>
            <span
              className="text-2xl font-medium tabular-nums"
              style={{ color: getIntensityColor(cluster.revealLevel), fontFamily: "'Inter', sans-serif" }}
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
                backgroundColor: 'rgba(255, 255, 255, 0.10)',
              }}
            >
              <Slider.Range
                className="absolute h-full rounded-full transition-all duration-300"
                style={{
                  backgroundColor: getIntensityColor(cluster.revealLevel),
                }}
              />
            </Slider.Track>
            <Slider.Thumb
              className="block w-6 h-6 bg-white rounded-full shadow-md border-2 transition-all duration-200 cursor-grab active:cursor-grabbing focus:outline-none"
              style={{
                borderColor: isDragging ? '#D97706' : '#d6d3d1',
              }}
            />
          </Slider.Root>

          {/* Percentage Markers */}
          <div className="flex justify-between text-xs text-muted-foreground px-1">
            <span>0%</span>
            <span>25%</span>
            <span>50%</span>
            <span>75%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Preview Section */}
        {cluster.preview && cluster.preview.length > 0 && (
          <div className="mt-6 pt-6 border-t border-white/10">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground" style={{ fontFamily: "'Inter', sans-serif" }}>
                What's revealed at this level
              </span>
            </div>
            <div className="space-y-2">
              {cluster.preview.slice(0, 3).map((item, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  <span className="text-[var(--accent-vibrant)] mt-1">•</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expanded Details */}
        {isExpanded && (
          <div className="mt-6 pt-6 border-t border-white/10">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground" style={{ fontFamily: "'Inter', sans-serif" }}>Category</p>
                <p className="text-sm font-medium text-muted-foreground capitalize">
                  {cluster.category}
                </p>
              </div>
              {cluster.lastUpdated && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1" style={{ fontFamily: "'Inter', sans-serif" }}>
                    <Clock className="w-3 h-3" />
                    Last Updated
                  </p>
                  <p className="text-sm font-medium text-muted-foreground">
                    {cluster.lastUpdated.toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
