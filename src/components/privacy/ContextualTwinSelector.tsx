import React, { useState } from 'react';
import {
  Briefcase,
  Users,
  Heart,
  Globe,
  Plus,
  Check,
  Edit2,
  Trash2,
} from 'lucide-react';

export interface ContextualTwin {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  clusterLevels: Record<string, number>; // clusterId -> reveal level
  color: string;
  isActive: boolean;
  isDefault?: boolean;
}

interface ContextualTwinSelectorProps {
  twins: ContextualTwin[];
  activeId: string;
  onSelectTwin: (id: string) => void;
  onCreateTwin?: () => void;
  onEditTwin?: (id: string) => void;
  onDeleteTwin?: (id: string) => void;
}

const defaultTwins: ContextualTwin[] = [
  {
    id: 'professional',
    name: 'Professional Twin',
    description: 'For work contexts, networking, and career opportunities',
    icon: <Briefcase className="w-5 h-5" />,
    clusterLevels: {
      personal: 20,
      professional: 85,
      creative: 45,
    },
    color: '#D97706', // Claude accent
    isActive: false,
    isDefault: true,
  },
  {
    id: 'social',
    name: 'Social Twin',
    description: 'For friends, social media, and casual interactions',
    icon: <Users className="w-5 h-5" />,
    clusterLevels: {
      personal: 70,
      professional: 35,
      creative: 80,
    },
    color: 'rgba(255,255,255,0.3)',
    isActive: false,
    isDefault: true,
  },
  {
    id: 'dating',
    name: 'Dating Twin',
    description: 'For dating apps and romantic connections',
    icon: <Heart className="w-5 h-5" />,
    clusterLevels: {
      personal: 85,
      professional: 25,
      creative: 90,
    },
    color: 'rgba(255,255,255,0.3)',
    isActive: false,
    isDefault: true,
  },
  {
    id: 'public',
    name: 'Public Twin',
    description: 'Minimal visibility for general public interactions',
    icon: <Globe className="w-5 h-5" />,
    clusterLevels: {
      personal: 15,
      professional: 50,
      creative: 30,
    },
    color: 'rgba(255,255,255,0.4)',
    isActive: false,
    isDefault: true,
  },
];

export const ContextualTwinSelector: React.FC<ContextualTwinSelectorProps> = ({
  twins = defaultTwins,
  activeId,
  onSelectTwin,
  onCreateTwin,
  onEditTwin,
  onDeleteTwin,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const activeTwin = twins.find((t) => t.id === activeId) || twins[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-medium text-[var(--claude-text)] mb-2" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
            Contextual Twins
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed" style={{ fontFamily: "'Inter', sans-serif" }}>
            Different versions of your soul signature for different audiences
          </p>
        </div>

        {onCreateTwin && (
          <button
            onClick={onCreateTwin}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm shadow-md hover:shadow-lg transition-all duration-200"
            style={{ backgroundColor: '#10b77f', color: '#0a0f0a', fontFamily: "'Inter', sans-serif" }}
          >
            <Plus className="w-4 h-4" />
            Create Twin
          </button>
        )}
      </div>

      {/* Active Twin Preview */}
      <div
        className="rounded-lg p-6"
        style={{
          border: '1px solid rgba(255,255,255,0.06)',
          backgroundColor: 'rgba(255,255,255,0.02)',
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="p-2.5 rounded-lg"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
            }}
          >
            <div style={{ color: activeTwin.color }}>
              {activeTwin.icon}
            </div>
          </div>
          <div className="flex-1">
            <h4 className="text-lg font-medium text-[var(--claude-text)] mb-1" style={{ fontFamily: "'Inter', sans-serif" }}>
              Currently Active: {activeTwin.name}
            </h4>
            <p className="text-sm text-muted-foreground" style={{ fontFamily: "'Inter', sans-serif" }}>
              {activeTwin.description}
            </p>
          </div>
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-900/20 text-green-400"
          >
            <Check className="w-4 h-4" />
            <span className="text-sm font-medium" style={{ fontFamily: "'Inter', sans-serif" }}>Active</span>
          </div>
        </div>

        {/* Revelation Levels Visualization */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          {Object.entries(activeTwin.clusterLevels).map(([cluster, level]) => (
            <div key={cluster} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium capitalize" style={{ color: 'var(--foreground)', fontFamily: "'Inter', sans-serif" }}>
                  {cluster}
                </span>
                <span className="text-xs font-bold" style={{ color: 'var(--foreground)' }}>
                  {level}%
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255, 255, 255, 0.10)' }}>
                <div
                  className="h-full rounded-full transition-all duration-600"
                  style={{ backgroundColor: activeTwin.color, width: `${level}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Twin Selection Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {twins.map((twin) => {
          const isActive = twin.id === activeId;
          const isHovered = hoveredId === twin.id;

          return (
            <div
              key={twin.id}
              onMouseEnter={() => setHoveredId(twin.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => !isActive && onSelectTwin(twin.id)}
              className={`rounded-lg relative p-5 cursor-pointer transition-all duration-200 ${isActive ? '!border-2 !border-amber-600' : ''}`}
              style={{
                border: isActive ? undefined : '1px solid rgba(255,255,255,0.06)',
                backgroundColor: 'rgba(255,255,255,0.02)',
              }}
            >
              <div className="relative">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="p-2.5 rounded-lg"
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      }}
                    >
                      <div style={{ color: twin.color }}>
                        {twin.icon}
                      </div>
                    </div>
                    <div>
                      <h5 className="text-base font-medium text-[var(--claude-text)] mb-0.5" style={{ fontFamily: "'Inter', sans-serif" }}>
                        {twin.name}
                      </h5>
                      {twin.isDefault && (
                        <span className="text-xs text-muted-foreground" style={{ fontFamily: "'Inter', sans-serif" }}>
                          Default preset
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {isHovered && !twin.isDefault && (
                    <div className="flex items-center gap-1">
                      {onEditTwin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditTwin(twin.id);
                          }}
                          className="p-1.5 rounded-lg hover:bg-white/12 transition-colors"
                          title="Edit twin"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      )}
                      {onDeleteTwin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteTwin(twin.id);
                          }}
                          className="p-1.5 rounded-lg hover:bg-red-900/20 transition-colors"
                          title="Delete twin"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <p className="text-sm text-muted-foreground leading-relaxed mb-4" style={{ fontFamily: "'Inter', sans-serif" }}>
                  {twin.description}
                </p>

                {/* Mini Level Indicators */}
                <div className="flex gap-2">
                  {Object.entries(twin.clusterLevels).map(([cluster, level]) => (
                    <div
                      key={cluster}
                      className="flex-1 h-1.5 rounded-full overflow-hidden"
                      title={`${cluster}: ${level}%`}
                      style={{ backgroundColor: 'rgba(255, 255, 255, 0.10)' }}
                    >
                      <div
                        className="h-full"
                        style={{
                          width: `${level}%`,
                          backgroundColor: twin.color,
                        }}
                      />
                    </div>
                  ))}
                </div>

                {/* Active Indicator */}
                {isActive && (
                  <div className="absolute top-3 right-3 p-1.5 rounded-full bg-green-500 text-white shadow-md">
                    <Check className="w-3 h-3" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Info Banner */}
      <div className="p-4 rounded-xl bg-blue-900/20 border border-blue-800/30">
        <p className="text-sm text-blue-900 leading-relaxed" style={{ fontFamily: "'Inter', sans-serif" }}>
          <strong className="font-medium">Pro tip:</strong> Switch between twins
          based on your context. Your digital twin will automatically adjust what
          it reveals about you to match the selected audience.
        </p>
      </div>
    </div>
  );
};
