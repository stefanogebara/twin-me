import React from 'react';
import { Brain, Sparkles, TrendingUp } from 'lucide-react';
import { GlassPanel } from '@/components/layout/PageLayout';
import { useBrainThemeColors } from './BrainTheme';

export const UnderstandingSection: React.FC = () => {
  const { textColor, textSecondary } = useBrainThemeColors();

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <GlassPanel className="!p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
            backgroundColor: 'rgba(78, 205, 196, 0.1)'
          }}>
            <Brain className="w-5 h-5" style={{ color: '#4ECDC4' }} />
          </div>
          <h4 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: textColor }}>
            Intrinsic vs Extrinsic
          </h4>
        </div>
        <p className="text-sm" style={{ color: textSecondary }}>
          <span style={{ color: '#4ECDC4' }}>Intrinsic data</span> is directly from your activity (songs played, events attended).{' '}
          <span style={{ color: '#FF6B6B' }}>Extrinsic data</span> is what these patterns reveal about your personality.
        </p>
      </GlassPanel>

      <GlassPanel className="!p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
            backgroundColor: 'rgba(150, 206, 180, 0.1)'
          }}>
            <TrendingUp className="w-5 h-5" style={{ color: '#96CEB4' }} />
          </div>
          <h4 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: textColor }}>
            Confidence Levels
          </h4>
        </div>
        <p className="text-sm" style={{ color: textSecondary }}>
          Confidence is calculated from data frequency, consistency across time, and correlation with other verified traits. Higher confidence = more data points supporting this insight.
        </p>
      </GlassPanel>

      <GlassPanel className="!p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
            backgroundColor: 'rgba(221, 160, 221, 0.1)'
          }}>
            <Sparkles className="w-5 h-5" style={{ color: '#DDA0DD' }} />
          </div>
          <h4 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: textColor }}>
            3D Exploration
          </h4>
        </div>
        <p className="text-sm" style={{ color: textSecondary }}>
          Nodes closer together share stronger connections. Particle streams show active relationships. Click any node to dive deeper into what your AI twin has learned about you.
        </p>
      </GlassPanel>
    </div>
  );
};
