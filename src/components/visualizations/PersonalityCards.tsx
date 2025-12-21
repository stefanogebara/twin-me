/**
 * Personality Cards - Friendly Visual Design
 * Replaces the serious pentagon chart with a warm, approachable card-based design
 */

import { motion } from 'framer-motion';
import { Heart, Sparkles, Target, Zap, Palette, TrendingUp } from 'lucide-react';
import { RadarDataPoint } from '@/utils/dataTransformers';

interface PersonalityCardsProps {
  data: RadarDataPoint[];
  className?: string;
}

const traitConfig = {
  Openness: {
    icon: Palette,
    color: '#8B5CF6', // Purple
    gradient: 'from-purple-500/20 to-purple-600/20',
    description: 'Your curiosity & creativity'
  },
  Conscientiousness: {
    icon: Target,
    color: '#3B82F6', // Blue
    gradient: 'from-blue-500/20 to-blue-600/20',
    description: 'Your organization & planning'
  },
  Extraversion: {
    icon: Zap,
    color: '#F59E0B', // Amber
    gradient: 'from-stone-500/20 to-stone-600/20',
    description: 'Your social energy'
  },
  Agreeableness: {
    icon: Heart,
    color: '#EC4899', // Pink
    gradient: 'from-pink-500/20 to-pink-600/20',
    description: 'Your compassion & trust'
  },
  Neuroticism: {
    icon: TrendingUp,
    color: '#10B981', // Green
    gradient: 'from-green-500/20 to-green-600/20',
    description: 'Your emotional awareness'
  }
};

export function PersonalityCards({ data, className = '' }: PersonalityCardsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`bg-white rounded-xl border border-stone-200 p-6 ${className}`}
    >
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-6 h-6 text-[#D97706]" />
          <h3 className="text-2xl font-heading font-semibold text-slate-900">
            Your Personality Profile
          </h3>
        </div>
        <p className="text-sm text-slate-600">
          AI-powered insights from your digital footprint—visualized in a way that's easy to understand
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.map((trait, index) => {
          const config = traitConfig[trait.trait as keyof typeof traitConfig];
          if (!config) return null;

          const Icon = config.icon;
          const percentage = trait.value;
          const level = percentage >= 75 ? 'High' : percentage >= 40 ? 'Moderate' : 'Low';

          return (
            <motion.div
              key={trait.trait}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className={`bg-gradient-to-br ${config.gradient} rounded-xl p-5 border border-stone-200 hover:shadow-lg transition-all duration-300`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: `${config.color}20` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: config.color }} />
                  </div>
                  <div>
                    <h4 className="text-base font-semibold text-slate-900">
                      {trait.trait}
                    </h4>
                    <p className="text-xs text-slate-600">
                      {config.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-700">
                    {level} Level
                  </span>
                  <span className="text-sm font-bold" style={{ color: config.color }}>
                    {percentage}%
                  </span>
                </div>
                <div className="h-2 bg-white/80 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 1, delay: index * 0.1 + 0.3 }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: config.color }}
                  />
                </div>
              </div>

              {/* Friendly Interpretation */}
              <p className="text-xs text-slate-600 leading-relaxed">
                {getTraitInterpretation(trait.trait, percentage)}
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* Bottom Insight */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.8 }}
        className="mt-6 p-4 bg-gradient-to-r from-stone-50 to-amber-50 rounded-xl border border-orange-200"
      >
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
          <div>
            <h5 className="text-sm font-semibold text-orange-900 mb-1">
              What This Means for You
            </h5>
            <p className="text-xs text-orange-800 leading-relaxed">
              These traits combine to create your unique personality profile. Understanding them helps your AI twin
              communicate and act more like you—capturing your authentic style and preferences.
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Get friendly, personalized interpretation for each trait level
 */
function getTraitInterpretation(trait: string, value: number): string {
  const interpretations: Record<string, { high: string; moderate: string; low: string }> = {
    Openness: {
      high: "You love exploring new ideas, trying creative approaches, and embracing change. You're curious about the world!",
      moderate: "You balance tradition with innovation—open to new experiences while appreciating familiar routines.",
      low: "You prefer proven methods and familiar patterns. Stability and consistency are important to you."
    },
    Conscientiousness: {
      high: "You're organized, detail-oriented, and reliable. You like having a plan and following through on commitments.",
      moderate: "You can be flexible when needed but appreciate structure. You balance spontaneity with organization.",
      low: "You go with the flow and adapt easily. Rigid schedules aren't your style—you prefer flexibility."
    },
    Extraversion: {
      high: "You energize by being around people! Social interaction, conversations, and group activities fuel you.",
      moderate: "You enjoy social time but also value alone time. You're comfortable in both settings.",
      low: "You recharge with quiet time and prefer deep one-on-one conversations over large groups."
    },
    Agreeableness: {
      high: "You're warm, empathetic, and cooperative. Building harmony and helping others comes naturally to you.",
      moderate: "You're friendly and considerate while also standing your ground when needed.",
      low: "You're direct and speak your mind. You prioritize honesty and aren't afraid of healthy conflict."
    },
    Neuroticism: {
      high: "You're emotionally aware and sensitive to your environment. You process feelings deeply.",
      moderate: "You experience a balanced range of emotions and handle stress fairly well.",
      low: "You're calm under pressure and don't worry much. You tend to stay emotionally stable."
    }
  };

  const level = value >= 75 ? 'high' : value >= 40 ? 'moderate' : 'low';
  return interpretations[trait]?.[level] || '';
}
