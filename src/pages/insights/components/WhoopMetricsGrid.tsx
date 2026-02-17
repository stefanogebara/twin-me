import React from 'react';
import { motion } from 'framer-motion';
import { GlassPanel } from '@/components/layout/PageLayout';
import { Heart, Zap, Activity, Gauge, Moon, TrendingUp, Clock, Droplets, Thermometer, Wind, Brain } from 'lucide-react';
import type { BodyMetrics, SleepBreakdown } from './whoopTypes';

interface WhoopMetricsGridProps {
  metrics: BodyMetrics;
  sleepBreakdown?: SleepBreakdown;
  colors: {
    text: string;
    textSecondary: string;
    whoopTeal: string;
  };
  theme: string;
}

export const WhoopMetricsGrid: React.FC<WhoopMetricsGridProps> = ({
  metrics,
  sleepBreakdown,
  colors,
  theme,
}) => {
  return (
    <motion.div
      className="mb-6"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.2, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {/* Recovery */}
        <GlassPanel className="!p-4">
          <div className="flex items-center gap-2 mb-2">
            <Heart className="w-4 h-4" style={{ color: colors.whoopTeal }} />
            <span className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
              Recovery
            </span>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-medium" style={{ color: colors.text }}>
              {metrics.recovery}%
            </span>
            <span className="text-xs mb-1" style={{
              color: metrics.recovery! >= 67 ? '#4ade80' :
                metrics.recovery! >= 34 ? '#fbbf24' : '#f87171'
            }}>
              {metrics.recovery! >= 67 ? 'Green' :
                metrics.recovery! >= 34 ? 'Yellow' : 'Red'}
            </span>
          </div>
          {metrics.recoveryUpdatedAt && (
            <div className="flex items-center gap-1 mt-2">
              <Clock className="w-3 h-3" style={{ color: colors.textSecondary }} />
              <span className="text-xs" style={{ color: colors.textSecondary }}>
                {metrics.recoveryUpdatedAt}
              </span>
            </div>
          )}
        </GlassPanel>

        {/* Strain */}
        <GlassPanel className="!p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4" style={{ color: '#fbbf24' }} />
            <span className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
              Strain
            </span>
          </div>
          <div className="text-2xl font-medium" style={{ color: colors.text }}>
            {metrics.strain?.toFixed(1)}
          </div>
          {metrics.strainUpdatedAt && (
            <div className="flex items-center gap-1 mt-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs" style={{ color: '#4ade80' }}>
                {metrics.strainUpdatedAt}
              </span>
            </div>
          )}
        </GlassPanel>

        {/* HRV */}
        <GlassPanel className="!p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4" style={{ color: '#a78bfa' }} />
            <span className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
              HRV
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-medium" style={{ color: colors.text }}>
              {metrics.hrv}
            </span>
            <span className="text-sm" style={{ color: colors.textSecondary }}>ms</span>
          </div>
          {metrics.hrvUpdatedAt && (
            <div className="flex items-center gap-1 mt-2">
              <Clock className="w-3 h-3" style={{ color: colors.textSecondary }} />
              <span className="text-xs" style={{ color: colors.textSecondary }}>
                {metrics.hrvUpdatedAt}
              </span>
            </div>
          )}
        </GlassPanel>

        {/* Resting HR */}
        <GlassPanel className="!p-4">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="w-4 h-4" style={{ color: '#f472b6' }} />
            <span className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
              Resting HR
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-medium" style={{ color: colors.text }}>
              {metrics.restingHR}
            </span>
            <span className="text-sm" style={{ color: colors.textSecondary }}>BPM</span>
          </div>
        </GlassPanel>

        {/* Sleep Hours */}
        {sleepBreakdown && (
          <GlassPanel className="!p-4">
            <div className="flex items-center gap-2 mb-2">
              <Moon className="w-4 h-4" style={{ color: '#60a5fa' }} />
              <span className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                Sleep
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-medium" style={{ color: colors.text }}>
                {(metrics as any)?.sleepHours || sleepBreakdown.totalHours}
              </span>
              <span className="text-sm" style={{ color: colors.textSecondary }}>hours</span>
            </div>
            {sleepBreakdown.wakeTime && (
              <div className="flex items-center gap-1 mt-2">
                <Clock className="w-3 h-3" style={{ color: colors.textSecondary }} />
                <span className="text-xs" style={{ color: colors.textSecondary }}>
                  Woke {sleepBreakdown.wakeTime}
                </span>
              </div>
            )}
          </GlassPanel>
        )}

        {/* Sleep Efficiency */}
        {sleepBreakdown && (
          <GlassPanel className="!p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4" style={{ color: '#4ade80' }} />
              <span className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                Efficiency
              </span>
            </div>
            <div className="text-2xl font-medium" style={{ color: colors.text }}>
              {Math.round(sleepBreakdown.efficiency)}%
            </div>
          </GlassPanel>
        )}
      </div>

      {/* New Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
        {/* Blood Oxygen (SpO2) */}
        {metrics.spo2 && (
          <GlassPanel className="!p-4">
            <div className="flex items-center gap-2 mb-2">
              <Droplets className="w-4 h-4" style={{ color: '#60a5fa' }} />
              <span className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                Blood O₂
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-medium" style={{ color: colors.text }}>
                {metrics.spo2}
              </span>
              <span className="text-sm" style={{ color: colors.textSecondary }}>%</span>
            </div>
            <span className="text-xs" style={{
              color: metrics.spo2 >= 95 ? '#4ade80' :
                     metrics.spo2 >= 90 ? '#fbbf24' : '#f87171'
            }}>
              {metrics.spo2 >= 95 ? 'Normal' :
               metrics.spo2 >= 90 ? 'Borderline' : 'Low'}
            </span>
          </GlassPanel>
        )}

        {/* Skin Temperature */}
        {metrics.skinTemp && (
          <GlassPanel className="!p-4">
            <div className="flex items-center gap-2 mb-2">
              <Thermometer className="w-4 h-4" style={{ color: '#fb923c' }} />
              <span className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                Skin Temp
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-medium" style={{ color: colors.text }}>
                {metrics.skinTemp.toFixed(1)}
              </span>
              <span className="text-sm" style={{ color: colors.textSecondary }}>°C</span>
            </div>
          </GlassPanel>
        )}

        {/* Respiratory Rate */}
        {metrics.respiratoryRate && (
          <GlassPanel className="!p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wind className="w-4 h-4" style={{ color: '#2dd4bf' }} />
              <span className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                Breathing
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-medium" style={{ color: colors.text }}>
                {metrics.respiratoryRate}
              </span>
              <span className="text-sm" style={{ color: colors.textSecondary }}>/min</span>
            </div>
          </GlassPanel>
        )}

        {/* Stress Level (Calculated) */}
        {metrics.stressLevel && (
          <GlassPanel className="!p-4">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-4 h-4" style={{ color: '#c084fc' }} />
              <span className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                Stress
              </span>
            </div>
            <div className="text-xl font-medium" style={{
              color: metrics.stressLevel === 'Low' ? '#4ade80' :
                     metrics.stressLevel === 'Moderate' ? '#fbbf24' :
                     metrics.stressLevel === 'High' ? '#fb923c' : '#f87171'
            }}>
              {metrics.stressLevel}
            </div>
            <span className="text-xs" style={{ color: colors.textSecondary }}>
              Based on HRV & recovery
            </span>
          </GlassPanel>
        )}
      </div>
    </motion.div>
  );
};
