import React from 'react';
import { GlassPanel } from '@/components/layout/PageLayout';
import { Activity, Moon, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip as RechartsTooltip, AreaChart, Area } from 'recharts';
import type { DayHistory, SleepBreakdown } from './whoopTypes';

interface WhoopChartsProps {
  history7Day?: DayHistory[];
  sleepBreakdown?: SleepBreakdown;
  colors: {
    text: string;
    textSecondary: string;
  };
  theme: string;
}

export const WhoopCharts: React.FC<WhoopChartsProps> = ({
  history7Day,
  sleepBreakdown,
  colors,
  theme,
}) => {
  return (
    <>
      {/* 7-Day Recovery Chart */}
      {history7Day && history7Day.length > 0 && (
        <GlassPanel className="!p-4 mb-6">
          <h3 className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
              style={{ color: colors.textSecondary }}>
            <TrendingUp className="w-4 h-4" />
            Recovery Score (Last 7 Days)
          </h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={history7Day} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <XAxis
                  dataKey="dayName"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: colors.textSecondary, fontSize: 12 }}
                />
                <YAxis
                  domain={[0, 100]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: colors.textSecondary, fontSize: 10 }}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: theme === 'dark' ? '#1c1917' : '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: colors.text }}
                  itemStyle={{ color: colors.text }}
                  formatter={(value: number) => [`${value}%`, 'Recovery']}
                />
                <Bar dataKey="recovery" radius={[4, 4, 0, 0]}>
                  {history7Day.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.recovery >= 67 ? '#4ade80' : entry.recovery >= 34 ? '#fbbf24' : '#f87171'}
                      opacity={index === history7Day.length - 1 ? 1 : 0.7}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>
      )}

      {/* Sleep Phase Breakdown */}
      {sleepBreakdown && (
        <GlassPanel className="!p-4 mb-6">
          <h3 className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
              style={{ color: colors.textSecondary }}>
            <Moon className="w-4 h-4" />
            Last Night's Sleep ({sleepBreakdown.totalHours}h total)
          </h3>
          <div className="space-y-3">
            {/* Deep Sleep */}
            <div className="flex items-center gap-3">
              <span className="text-xs w-16" style={{ color: colors.textSecondary }}>Deep</span>
              <div className="flex-1 h-6 rounded-lg overflow-hidden" style={{ backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.1)' }}>
                <div
                  className="h-full rounded-lg transition-all"
                  style={{
                    width: `${(sleepBreakdown.deepSleep / sleepBreakdown.totalHours) * 100}%`,
                    backgroundColor: '#8b5cf6'
                  }}
                />
              </div>
              <span className="text-sm font-medium w-20 text-right" style={{ color: colors.text }}>
                {sleepBreakdown.deepSleep}h ({Math.round((sleepBreakdown.deepSleep / sleepBreakdown.totalHours) * 100)}%)
              </span>
            </div>
            {/* REM Sleep */}
            <div className="flex items-center gap-3">
              <span className="text-xs w-16" style={{ color: colors.textSecondary }}>REM</span>
              <div className="flex-1 h-6 rounded-lg overflow-hidden" style={{ backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.1)' }}>
                <div
                  className="h-full rounded-lg transition-all"
                  style={{
                    width: `${(sleepBreakdown.remSleep / sleepBreakdown.totalHours) * 100}%`,
                    backgroundColor: '#60a5fa'
                  }}
                />
              </div>
              <span className="text-sm font-medium w-20 text-right" style={{ color: colors.text }}>
                {sleepBreakdown.remSleep}h ({Math.round((sleepBreakdown.remSleep / sleepBreakdown.totalHours) * 100)}%)
              </span>
            </div>
            {/* Light Sleep */}
            <div className="flex items-center gap-3">
              <span className="text-xs w-16" style={{ color: colors.textSecondary }}>Light</span>
              <div className="flex-1 h-6 rounded-lg overflow-hidden" style={{ backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.1)' }}>
                <div
                  className="h-full rounded-lg transition-all"
                  style={{
                    width: `${(sleepBreakdown.lightSleep / sleepBreakdown.totalHours) * 100}%`,
                    backgroundColor: '#a78bfa'
                  }}
                />
              </div>
              <span className="text-sm font-medium w-20 text-right" style={{ color: colors.text }}>
                {sleepBreakdown.lightSleep}h ({Math.round((sleepBreakdown.lightSleep / sleepBreakdown.totalHours) * 100)}%)
              </span>
            </div>
            {/* Awake During */}
            {sleepBreakdown.awakeDuring != null && sleepBreakdown.awakeDuring > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-xs w-16" style={{ color: colors.textSecondary }}>Awake</span>
                <div className="flex-1 h-6 rounded-lg overflow-hidden" style={{ backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.1)' }}>
                  <div
                    className="h-full rounded-lg transition-all"
                    style={{
                      width: `${(sleepBreakdown.awakeDuring / (sleepBreakdown.totalHours + sleepBreakdown.awakeDuring)) * 100}%`,
                      backgroundColor: 'rgba(193, 192, 182, 0.4)'
                    }}
                  />
                </div>
                <span className="text-sm font-medium w-20 text-right" style={{ color: colors.textSecondary }}>
                  {sleepBreakdown.awakeDuring}h
                </span>
              </div>
            )}
          </div>
        </GlassPanel>
      )}

      {/* HRV 7-Day Trend */}
      {history7Day && history7Day.length > 0 && (
        <GlassPanel className="!p-4 mb-6">
          <h3 className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
              style={{ color: colors.textSecondary }}>
            <Activity className="w-4 h-4" />
            HRV Trend (7 Days)
          </h3>
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history7Day} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="hrvGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="dayName"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: colors.textSecondary, fontSize: 10 }}
                />
                <YAxis hide domain={['auto', 'auto']} />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: theme === 'dark' ? '#1c1917' : '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: colors.text }}
                  itemStyle={{ color: colors.text }}
                  formatter={(value: number) => [`${value}ms`, 'HRV']}
                />
                <Area
                  type="monotone"
                  dataKey="hrv"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  fill="url(#hrvGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>
      )}
    </>
  );
};
