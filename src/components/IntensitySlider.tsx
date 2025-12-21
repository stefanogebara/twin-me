import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Slider } from '@/components/ui/slider';
import { Eye, EyeOff, Lock, Users, Globe, Heart, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IntensitySliderProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
  description?: string;
  showThermometer?: boolean;
  disabled?: boolean;
  className?: string;
  clusterId?: string;
}

// Privacy level definitions with icons and colors
const PRIVACY_LEVELS = [
  {
    threshold: 0,
    label: 'Hidden',
    icon: Lock,
    color: '#6B7280',
    bgColor: 'bg-gray-500',
    description: 'Completely private - not shared with anyone'
  },
  {
    threshold: 25,
    label: 'Intimate',
    icon: Heart,
    color: '#EC4899',
    bgColor: 'bg-pink-500',
    description: 'Only closest friends and family'
  },
  {
    threshold: 50,
    label: 'Friends',
    icon: Users,
    color: '#8B5CF6',
    bgColor: 'bg-purple-500',
    description: 'Friends and trusted connections'
  },
  {
    threshold: 75,
    label: 'Professional',
    icon: Eye,
    color: '#3B82F6',
    bgColor: 'bg-blue-500',
    description: 'Professional network and colleagues'
  },
  {
    threshold: 100,
    label: 'Public',
    icon: Globe,
    color: '#10B981',
    bgColor: 'bg-green-500',
    description: 'Visible to everyone'
  }
];

// Get the current privacy level based on value
const getPrivacyLevel = (value: number) => {
  return [...PRIVACY_LEVELS].reverse().find(level => value >= level.threshold) || PRIVACY_LEVELS[0];
};

// Get gradient color based on value
const getGradientColor = (value: number): string => {
  if (value === 0) return '#6B7280';
  if (value <= 25) return `linear-gradient(135deg, #6B7280 ${(25-value)*4}%, #EC4899 ${value*4}%)`;
  if (value <= 50) return `linear-gradient(135deg, #EC4899 ${(50-value)*4}%, #8B5CF6 ${(value-25)*4}%)`;
  if (value <= 75) return `linear-gradient(135deg, #8B5CF6 ${(75-value)*4}%, #3B82F6 ${(value-50)*4}%)`;
  if (value < 100) return `linear-gradient(135deg, #3B82F6 ${(100-value)*4}%, #10B981 ${(value-75)*4}%)`;
  return '#10B981';
};

export const IntensitySlider: React.FC<IntensitySliderProps> = ({
  value,
  onChange,
  label,
  description,
  showThermometer = true,
  disabled = false,
  className,
  clusterId
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const currentLevel = getPrivacyLevel(value);
  const LevelIcon = currentLevel.icon;

  const handleChange = (newValue: number[]) => {
    onChange(newValue[0]);
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* Label and Current Level */}
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h4 className="text-sm font-medium text-stone-900">{label}</h4>
          {description && (
            <p className="text-xs text-stone-500 mt-0.5">{description}</p>
          )}
        </div>

        <motion.div
          className="flex items-center gap-2"
          whileHover={{ scale: 1.05 }}
          transition={{ type: "spring", stiffness: 400, damping: 10 }}
        >
          <div
            className={cn(
              "p-1.5 rounded-lg transition-all duration-300",
              currentLevel.bgColor,
              "bg-opacity-10"
            )}
          >
            <LevelIcon
              className="w-4 h-4 transition-all duration-300"
              style={{ color: currentLevel.color }}
            />
          </div>
          <span
            className="text-sm font-medium transition-all duration-300"
            style={{ color: currentLevel.color }}
          >
            {currentLevel.label}
          </span>
        </motion.div>
      </div>

      {/* Thermometer Visualization */}
      {showThermometer && (
        <div className="relative">
          {/* Background track */}
          <div className="h-3 bg-gray-100 rounded-full border border-gray-200 overflow-hidden">
            {/* Filled portion with gradient */}
            <motion.div
              className="h-full rounded-full relative overflow-hidden"
              initial={{ width: `${value}%` }}
              animate={{ width: `${value}%` }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              style={{
                background: getGradientColor(value)
              }}
            >
              {/* Shimmer effect */}
              <motion.div
                className="absolute inset-0 opacity-30"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)'
                }}
                animate={{
                  x: ['-100%', '200%']
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "linear"
                }}
              />

              {/* Pulse effect when dragging */}
              <AnimatePresence>
                {isDragging && (
                  <motion.div
                    className="absolute right-0 top-0 bottom-0 w-1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                    style={{ backgroundColor: currentLevel.color }}
                  />
                )}
              </AnimatePresence>
            </motion.div>
          </div>

          {/* Milestone markers */}
          <div className="absolute top-0 left-0 right-0 flex justify-between px-1 -mt-1">
            {PRIVACY_LEVELS.map((level, index) => {
              const isActive = value >= level.threshold;
              const Icon = level.icon;

              return (
                <motion.div
                  key={level.threshold}
                  className="relative"
                  style={{
                    left: index === 0 ? '0' : index === PRIVACY_LEVELS.length - 1 ? 'auto' : `${level.threshold}%`,
                    right: index === PRIVACY_LEVELS.length - 1 ? '0' : 'auto'
                  }}
                  whileHover={{ scale: 1.2 }}
                  onHoverStart={() => setShowTooltip(true)}
                  onHoverEnd={() => setShowTooltip(false)}
                >
                  <div
                    className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-300",
                      isActive
                        ? "bg-white border-current shadow-md"
                        : "bg-gray-100 border-gray-300"
                    )}
                    style={{
                      borderColor: isActive ? level.color : undefined,
                      color: isActive ? level.color : '#9CA3AF'
                    }}
                  >
                    <Icon className="w-3 h-3" />
                  </div>

                  {/* Tooltip */}
                  <AnimatePresence>
                    {showTooltip && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-stone-900 text-white text-xs rounded whitespace-nowrap z-10"
                      >
                        {level.label}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-4 border-transparent border-t-stone-900" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Slider Control */}
      <div className="relative pt-6">
        <Slider
          value={[value]}
          onValueChange={handleChange}
          min={0}
          max={100}
          step={1}
          disabled={disabled}
          className="cursor-pointer"
          onPointerDown={() => setIsDragging(true)}
          onPointerUp={() => setIsDragging(false)}
        />

        {/* Value indicator */}
        <motion.div
          className="absolute -top-1 px-2 py-0.5 bg-stone-900 text-white text-xs rounded shadow-lg pointer-events-none"
          style={{
            left: `calc(${value}% - 16px)`
          }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{
            opacity: isDragging ? 1 : 0,
            scale: isDragging ? 1 : 0.8
          }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          {value}%
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-4 border-transparent border-t-stone-900" />
        </motion.div>
      </div>

      {/* Level Description */}
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        className="overflow-hidden"
      >
        <div className="flex items-start gap-2 p-3 rounded-lg bg-stone-50 border border-stone-200">
          <Sparkles className="w-4 h-4 text-stone-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-stone-600 leading-relaxed">
            {currentLevel.description}
          </p>
        </div>
      </motion.div>
    </div>
  );
};
