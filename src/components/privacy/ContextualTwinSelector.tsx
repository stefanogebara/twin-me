import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';
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
    color: '#78716c', // stone-500
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
    color: '#a8a29e', // stone-400
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
    color: '#57534e', // stone-600
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
  const { theme } = useTheme();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const activeTwin = twins.find((t) => t.id === activeId) || twins[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading text-2xl font-medium text-[hsl(var(--claude-text))] mb-2">
            Contextual Twins
          </h3>
          <p className="text-sm text-stone-600 font-body leading-relaxed">
            Different versions of your soul signature for different audiences
          </p>
        </div>

        {onCreateTwin && (
          <motion.button
            onClick={onCreateTwin}
            className="
              flex items-center gap-2 px-4 py-2.5 rounded-xl
              bg-[hsl(var(--claude-accent))] text-white
              hover:bg-[hsl(var(--claude-accent))]/90
              font-ui font-medium text-sm
              shadow-md hover:shadow-lg
              transition-all duration-200
            "
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Plus className="w-4 h-4" />
            Create Twin
          </motion.button>
        )}
      </div>

      {/* Active Twin Preview */}
      <motion.div
        layout
        className="p-6 rounded-xl border"
        style={{
          backgroundColor: theme === 'dark' ? '#2D2D29' : '#FFFFFF',
          borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(0, 0, 0, 0.1)',
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="p-2.5 rounded-lg"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : '#F5F5F4',
            }}
          >
            <div style={{ color: activeTwin.color }}>
              {activeTwin.icon}
            </div>
          </div>
          <div className="flex-1">
            <h4 className="font-heading text-lg font-medium text-[hsl(var(--claude-text))] mb-1">
              Currently Active: {activeTwin.name}
            </h4>
            <p className="text-sm text-stone-600 font-body">
              {activeTwin.description}
            </p>
          </div>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-100 text-green-700"
          >
            <Check className="w-4 h-4" />
            <span className="text-sm font-medium font-ui">Active</span>
          </motion.div>
        </div>

        {/* Revelation Levels Visualization */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          {Object.entries(activeTwin.clusterLevels).map(([cluster, level]) => (
            <div key={cluster} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium capitalize font-ui" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
                  {cluster}
                </span>
                <span className="text-xs font-bold" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
                  {level}%
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : '#e7e5e4' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: activeTwin.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${level}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Twin Selection Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {twins.map((twin) => {
          const isActive = twin.id === activeId;
          const isHovered = hoveredId === twin.id;

          return (
            <motion.div
              key={twin.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.2 }}
              onMouseEnter={() => setHoveredId(twin.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => !isActive && onSelectTwin(twin.id)}
              className="relative p-5 rounded-xl border cursor-pointer transition-all duration-200"
              style={{
                backgroundColor: theme === 'dark' ? '#2D2D29' : '#FFFFFF',
                borderColor: isActive ? '#D97706' : theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(0, 0, 0, 0.1)',
                borderWidth: isActive ? '2px' : '1px',
              }}
            >
              <div className="relative">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="p-2.5 rounded-lg"
                      style={{
                        backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : '#F5F5F4',
                      }}
                    >
                      <div style={{ color: twin.color }}>
                        {twin.icon}
                      </div>
                    </div>
                    <div>
                      <h5 className="font-heading text-base font-medium text-[hsl(var(--claude-text))] mb-0.5">
                        {twin.name}
                      </h5>
                      {twin.isDefault && (
                        <span className="text-xs text-stone-500 font-ui">
                          Default preset
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {isHovered && !twin.isDefault && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-1"
                    >
                      {onEditTwin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditTwin(twin.id);
                          }}
                          className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"
                          title="Edit twin"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-stone-600" />
                        </button>
                      )}
                      {onDeleteTwin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteTwin(twin.id);
                          }}
                          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                          title="Delete twin"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-600" />
                        </button>
                      )}
                    </motion.div>
                  )}
                </div>

                <p className="text-sm text-stone-600 font-body leading-relaxed mb-4">
                  {twin.description}
                </p>

                {/* Mini Level Indicators */}
                <div className="flex gap-2">
                  {Object.entries(twin.clusterLevels).map(([cluster, level]) => (
                    <div
                      key={cluster}
                      className="flex-1 h-1.5 rounded-full overflow-hidden"
                      title={`${cluster}: ${level}%`}
                      style={{ backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : '#e7e5e4' }}
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
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-3 right-3 p-1.5 rounded-full bg-green-500 text-white shadow-md"
                  >
                    <Check className="w-3 h-3" />
                  </motion.div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Info Banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 rounded-xl bg-blue-50 border border-blue-200"
      >
        <p className="text-sm text-blue-900 font-body leading-relaxed">
          <strong className="font-medium">Pro tip:</strong> Switch between twins
          based on your context. Your digital twin will automatically adjust what
          it reveals about you to match the selected audience.
        </p>
      </motion.div>
    </div>
  );
};
