/**
 * Personality Cards - Friendly Visual Design
 * Replaces the serious pentagon chart with a warm, approachable card-based design
 */

import { Heart, Sparkles, Target, Zap, Palette, TrendingUp } from 'lucide-react';
import { RadarDataPoint } from '@/utils/dataTransformers';

interface PersonalityCardsProps {
  data: RadarDataPoint[];
  className?: string;
}

const traitConfig = {
  Openness: {
    icon: Palette,
    color: '#8B5CF6',
    gradient: 'from-purple-500/20 to-purple-600/20',
    description: 'Your curiosity & creativity'
  },
  Conscientiousness: {
    icon: Target,
    color: '#3B82F6',
    gradient: 'from-blue-500/20 to-blue-600/20',
    description: 'Your organization & planning'
  },
  Extraversion: {
    icon: Zap,
    color: '#F59E0B',
    gradient: 'from-stone-500/20 to-stone-600/20',
    description: 'Your social energy'
  },
  Agreeableness: {
    icon: Heart,
    color: '#EC4899',
    gradient: 'from-pink-500/20 to-pink-600/20',
    description: 'Your compassion & trust'
  },
  Neuroticism: {
    icon: TrendingUp,
    color: '#10B981',
    gradient: 'from-green-500/20 to-green-600/20',
    description: 'Your emotional awareness'
  }
};

export function PersonalityCards({ data, className = '' }: PersonalityCardsProps) {
  return (
    <div
      className={`rounded-lg p-6 ${className}`}
      style={{
        border: '1px solid var(--border-glass)',
        backgroundColor: 'rgba(255,255,255,0.02)',
      }}
    >
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-6 h-6 text-[#D97706]" />
          <h3 className="text-2xl font-semibold text-foreground" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
            Your Personality Profile
          </h3>
        </div>
        <p className="text-sm text-muted-foreground">
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
          const isLastOdd = data.length % 2 !== 0 && index === data.length - 1;

          return (
            <div
              key={trait.trait}
              className={`bg-gradient-to-br ${config.gradient} rounded-xl p-5 border border-white/10 hover:shadow-lg transition-all duration-300${isLastOdd ? ' md:col-span-2' : ''}`}
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
                    <h4 className="text-base font-semibold text-foreground">
                      {trait.trait}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {config.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {level} Level
                  </span>
                  <span className="text-sm font-bold" style={{ color: config.color }}>
                    {percentage}%
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{ backgroundColor: config.color, width: `${percentage}%` }}
                  />
                </div>
              </div>

              {/* Friendly Interpretation */}
              <p className="text-xs text-muted-foreground leading-relaxed">
                {getTraitInterpretation(trait.trait, percentage)}
              </p>
            </div>
          );
        })}
      </div>

      {/* Bottom Insight */}
      <div className="mt-6 p-4 bg-gradient-to-r from-amber-900/15 to-orange-900/10 rounded-xl border border-amber-800/20">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <h5 className="text-sm font-semibold text-amber-300 mb-1">
              What This Means for You
            </h5>
            <p className="text-xs text-amber-200/70 leading-relaxed">
              These traits combine to create your unique personality profile. Understanding them helps your AI twin
              communicate and act more like you—capturing your authentic style and preferences.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

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
