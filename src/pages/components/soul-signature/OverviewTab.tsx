import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Lightbulb, Users, Zap, Sun, Compass, Target, Heart, Waves } from 'lucide-react';
import { GlassPanel } from '../../../components/layout/PageLayout';
import { PersonalityScores, SoulSignature, ThemeColors } from './types';

const iconMap: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  sun: Sun,
  compass: Compass,
  target: Target,
  heart: Heart,
  wave: Waves,
};

interface OverviewTabProps {
  soulSignature: SoulSignature | null;
  personalityScores: PersonalityScores | null;
  generating: boolean;
  onGenerateSoulSignature: () => void;
  colors: ThemeColors;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  soulSignature,
  personalityScores,
  generating,
  onGenerateSoulSignature,
  colors
}) => {
  const { textColor, textSecondary } = colors;
  const IconComponent = soulSignature ? iconMap[soulSignature.icon_type] || Sparkles : Sparkles;

  return (
    <>
      {soulSignature ? (
        <motion.div
          className="rounded-2xl md:rounded-3xl overflow-hidden mb-6"
          style={{
            backgroundColor: colors.cardBg,
            border: colors.cardBorder,
            boxShadow: colors.cardShadow
          }}
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        >
          <div className="p-6 md:p-8">
            <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6 mb-6">
              <motion.div
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: 'rgba(193, 192, 182, 0.1)',
                  border: '1px solid rgba(193, 192, 182, 0.2)'
                }}
                initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ duration: 0.6, delay: 0.2, ease: [0.4, 0, 0.2, 1] }}
              >
                <IconComponent className="w-8 h-8 sm:w-10 sm:h-10" style={{ color: '#C1C0B6' }} />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.3, ease: [0.4, 0, 0.2, 1] }}
              >
                <h2
                  className="text-3xl sm:text-4xl mb-2"
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 400,
                    color: textColor
                  }}
                >
                  {soulSignature.archetype_name}
                </h2>
                <p className="text-lg italic" style={{ color: textSecondary }}>
                  {soulSignature.archetype_subtitle}
                </p>
              </motion.div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <motion.div className="p-4 rounded-xl" style={{
                backgroundColor: 'rgba(193, 192, 182, 0.08)',
                border: '1px solid rgba(193, 192, 182, 0.15)'
              }}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.4, ease: [0.4, 0, 0.2, 1] }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(193, 192, 182, 0.15)' }}>
                    <Lightbulb className="w-4 h-4" style={{ color: '#C1C0B6' }} />
                  </div>
                  <span className="text-xs uppercase tracking-wider font-medium" style={{ color: textColor }}>Core Drive</span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: textSecondary }}>
                  {soulSignature.defining_traits[0]?.trait || 'Curiosity'} shapes your choices{soulSignature.defining_traits[0]?.evidence ? `, reflected in ${soulSignature.defining_traits[0].evidence.toLowerCase()}` : ''}
                </p>
              </motion.div>

              <motion.div className="p-4 rounded-xl" style={{
                backgroundColor: 'rgba(193, 192, 182, 0.08)',
                border: '1px solid rgba(193, 192, 182, 0.15)'
              }}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.5, ease: [0.4, 0, 0.2, 1] }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(193, 192, 182, 0.15)' }}>
                    <Users className="w-4 h-4" style={{ color: '#C1C0B6' }} />
                  </div>
                  <span className="text-xs uppercase tracking-wider font-medium" style={{ color: textColor }}>Social Style</span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: textSecondary }}>
                  {personalityScores && personalityScores.extraversion > 60
                    ? 'You thrive in social settings and draw energy from connecting with others'
                    : 'You value deep connections over many, preferring meaningful one-on-one interactions'}
                </p>
              </motion.div>

              <motion.div className="p-4 rounded-xl" style={{
                backgroundColor: 'rgba(193, 192, 182, 0.08)',
                border: '1px solid rgba(193, 192, 182, 0.15)'
              }}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.6, ease: [0.4, 0, 0.2, 1] }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(193, 192, 182, 0.15)' }}>
                    <Zap className="w-4 h-4" style={{ color: '#C1C0B6' }} />
                  </div>
                  <span className="text-xs uppercase tracking-wider font-medium" style={{ color: textColor }}>Creative Pattern</span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: textSecondary }}>
                  {soulSignature.defining_traits[2]?.trait || 'Creative expression'} is key - {soulSignature.defining_traits[2]?.evidence.toLowerCase() || 'you explore diverse artistic interests'}
                </p>
              </motion.div>
            </div>

            {soulSignature.narrative && (
              <motion.div
                className="mt-6 p-5 rounded-xl"
                style={{
                  backgroundColor: 'rgba(193, 192, 182, 0.06)',
                  border: '1px solid rgba(193, 192, 182, 0.12)'
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.7 }}
              >
                <p className="text-sm leading-relaxed" style={{ color: textSecondary }}>
                  {soulSignature.narrative}
                </p>
              </motion.div>
            )}
          </div>
        </motion.div>
      ) : (
        <GlassPanel className="mb-6 text-center py-12">
          <img src="/icons/3d/sparkle.png" alt="Soul Signature" className="w-20 h-20 mx-auto mb-4 opacity-60" loading="lazy" />
          <h3
            className="text-xl mb-2"
            style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: textColor }}
          >
            No Soul Signature Yet
          </h3>
          <p className="mb-6" style={{ color: textSecondary }}>
            Connect your platforms and generate your unique soul signature
          </p>
          <button
            onClick={onGenerateSoulSignature}
            disabled={generating}
            className="px-6 py-3 rounded-xl font-medium transition-all duration-200 disabled:opacity-50 hover:scale-[1.02]"
            style={{ background: 'linear-gradient(135deg, var(--accent-vibrant), var(--accent-vibrant-hover))', color: '#1a1a17', boxShadow: '0 2px 12px var(--accent-vibrant-glow)' }}
          >
            {generating ? 'Generating...' : 'Generate Soul Signature'}
          </button>
        </GlassPanel>
      )}
    </>
  );
};
