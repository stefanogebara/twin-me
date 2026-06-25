/**
 * StressSpendTimeline — the visual proof of "WHY you spend, not just WHAT".
 * Dual-axis chart: daily spend (bars) overlaid with average stress score (line).
 * Spikes that coincide = stress-driven purchases.
 */

import React, { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { TimelineDay } from '@/services/api/transactionsAPI';

interface Props {
  days: TimelineDay[];
  currency?: string;
}

const STRESS_THRESHOLD = 0.6;

function formatDay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
}

function formatSpend(value: number, currency: string): string {
  const locale = currency === 'BRL' ? 'pt-BR' : currency === 'EUR' ? 'es-ES' : 'en-GB';
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  currency: string;
}

function CustomTooltip({ active, payload, label, currency }: CustomTooltipProps) {
  if (!active || !payload?.length || !label) return null;

  const spendEntry = payload.find((p) => p.name === 'spend');
  const stressEntry = payload.find((p) => p.name === 'stress_pct');
  const spend = spendEntry?.value ?? 0;
  const stress = stressEntry?.value ?? null;

  return (
    <div style={{
      background: 'rgba(19,18,26,0.95)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 12,
      padding: '10px 14px',
      fontFamily: "'Geist','Inter',sans-serif",
      fontSize: 13,
    }}>
      <div style={{ color: 'rgba(255,255,255,0.55)', marginBottom: 6, fontSize: 11 }}>{formatDay(label)}</div>
      <div style={{ color: '#F5F5F4', marginBottom: 4 }}>
        {formatSpend(spend, currency)} spent
      </div>
      {stress !== null && (
        <div style={{ color: stress >= STRESS_THRESHOLD * 100 ? 'rgba(232,160,80,0.95)' : 'rgba(134,239,172,0.85)' }}>
          stress {Math.round(stress)}%
        </div>
      )}
    </div>
  );
}

export function StressSpendTimeline({ days, currency = 'BRL' }: Props) {
  const chartData = useMemo(() =>
    days.map((d) => ({
      date: d.day,
      spend: d.spend,
      stress_pct: d.stress_avg !== null ? Math.round(d.stress_avg * 100) : null,
      stress_shop_count: d.stress_shop_count,
    })),
    [days]
  );

  const maxSpend = useMemo(() => Math.max(...days.map((d) => d.spend), 1), [days]);

  if (days.length === 0) {
    return (
      <div style={{
        padding: '40px 24px',
        textAlign: 'center',
        color: 'rgba(255, 255, 255, 0.55)',
        fontFamily: "'Geist','Inter',sans-serif",
        fontSize: 14,
      }}>
        Not enough data to draw the timeline chart yet.
      </div>
    );
  }

  // Count days where both stress and spend are elevated
  const correlatedDays = chartData.filter(
    (d) => (d.stress_pct ?? 0) >= STRESS_THRESHOLD * 100 && d.spend > maxSpend * 0.4
  ).length;

  return (
    <div style={{ fontFamily: "'Geist','Inter',sans-serif" }}>
      {correlatedDays > 0 && (
        <div style={{
          marginBottom: 16,
          padding: '10px 14px',
          background: 'rgba(217,119,6,0.1)',
          border: '1px solid rgba(217,119,6,0.2)',
          borderRadius: 10,
          fontSize: 13,
          color: 'rgba(232,160,80,0.95)',
        }}>
          {correlatedDays} {correlatedDays === 1 ? 'day' : 'days'} where high stress and high spending coincided in the last 30 days.
        </div>
      )}

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />

          <XAxis
            dataKey="date"
            tickFormatter={formatDay}
            tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval={Math.floor(chartData.length / 5)}
          />

          {/* Left Y: stress % */}
          <YAxis
            yAxisId="stress"
            orientation="left"
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: 'rgba(232,160,80,0.6)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={36}
          />

          {/* Right Y: spend */}
          <YAxis
            yAxisId="spend"
            orientation="right"
            tickFormatter={(v: number) => formatSpend(v, currency)}
            tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={64}
          />

          <Tooltip content={<CustomTooltip currency={currency} />} />

          {/* Stress threshold reference line */}
          <ReferenceLine
            yAxisId="stress"
            y={STRESS_THRESHOLD * 100}
            stroke="rgba(217,119,6,0.3)"
            strokeDasharray="4 4"
          />

          {/* Daily spend bars */}
          <Bar
            yAxisId="spend"
            dataKey="spend"
            fill="rgba(255,255,255,0.12)"
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          />

          {/* Stress score line */}
          <Line
            yAxisId="stress"
            dataKey="stress_pct"
            stroke="rgba(232,160,80,0.85)"
            strokeWidth={2}
            dot={false}
            connectNulls
            activeDot={{ r: 4, fill: 'rgba(232,160,80,0.95)', strokeWidth: 0 }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div style={{ display: 'flex', gap: 20, marginTop: 12, fontSize: 11, color: 'rgba(255, 255, 255, 0.55)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(255,255,255,0.18)', display: 'inline-block' }} />
          Daily spending
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 16, height: 2, background: 'rgba(232,160,80,0.85)', display: 'inline-block', borderRadius: 1 }} />
          Stress level
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 16, height: 0, borderTop: '1px dashed rgba(217,119,6,0.8)', display: 'inline-block' }} />
          Stress threshold (60%)
        </span>
      </div>
    </div>
  );
}
