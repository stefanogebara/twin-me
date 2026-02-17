import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, ChevronRight } from 'lucide-react';
import { Clay3DIcon } from '@/components/Clay3DIcon';

type AssessmentMode = 'quick_pulse' | 'deep' | 'full';

interface AssessmentIntroProps {
  colors: Record<string, string>;
  onStartAssessment: (mode: AssessmentMode) => void;
}

export function AssessmentIntro({ colors, onStartAssessment }: AssessmentIntroProps) {
  return (
    <motion.div
      key="intro"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="text-center"
    >
      <div className="flex justify-center mb-6">
        <div
          className="p-4 rounded-2xl"
          style={{
            backgroundColor: colors.accentBg,
            border: `1px solid ${colors.border}`
          }}
        >
          <Clay3DIcon name="brain" size={48} />
        </div>
      </div>

      <h1
        className="text-3xl md:text-4xl mb-4"
        style={{ color: colors.text, fontFamily: 'var(--font-heading)', fontWeight: 500 }}
      >
        Discover Your Soul Signature
      </h1>

      <p className="text-lg max-w-xl mx-auto mb-8" style={{ color: colors.textSecondary }}>
        Answer questions honestly to uncover your unique personality archetype.
        There are no right or wrong answers - just be yourself.
      </p>

      <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto">
        {/* Quick Pulse */}
        <button
          onClick={() => onStartAssessment('quick_pulse')}
          className="group p-6 rounded-2xl transition-all text-left hover:scale-[1.02]"
          style={{
            backgroundColor: colors.cardBg,
            border: `1px solid ${colors.border}`
          }}
        >
          <div className="flex items-center gap-3 mb-3">
            <Sparkles className="w-5 h-5" style={{ color: colors.accent }} />
            <span
              className="text-xs font-medium uppercase tracking-wider"
              style={{ color: colors.accent }}
            >
              Quick Pulse
            </span>
          </div>
          <h3 className="text-lg mb-2" style={{ color: colors.text, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
            2-minute snapshot
          </h3>
          <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
            15 key questions for a quick personality profile. Perfect for getting started.
          </p>
          <div
            className="flex items-center text-sm transition-colors"
            style={{ color: colors.textSecondary }}
          >
            Start now <ChevronRight className="w-4 h-4 ml-1" />
          </div>
        </button>

        {/* Full Assessment */}
        <button
          onClick={() => onStartAssessment('full')}
          className="group p-6 rounded-2xl transition-all text-left hover:scale-[1.02]"
          style={{
            backgroundColor: colors.cardBg,
            border: `1px solid ${colors.border}`
          }}
        >
          <div className="flex items-center gap-3 mb-3">
            <Clay3DIcon name="brain" size={20} />
            <span
              className="text-xs font-medium uppercase tracking-wider"
              style={{ color: colors.accent }}
            >
              Deep Dive
            </span>
          </div>
          <h3 className="text-lg mb-2" style={{ color: colors.text, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
            10-minute complete profile
          </h3>
          <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
            60 comprehensive questions for the most accurate personality insights.
          </p>
          <div
            className="flex items-center text-sm transition-colors"
            style={{ color: colors.textSecondary }}
          >
            Start now <ChevronRight className="w-4 h-4 ml-1" />
          </div>
        </button>
      </div>
    </motion.div>
  );
}
