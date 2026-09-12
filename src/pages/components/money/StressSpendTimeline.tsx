/**
 * StressSpendTimeline — the visual proof of "WHY you spend, not just WHAT".
 * Dual-axis chart: daily spend (bars) overlaid with average stress score (line).
 * Spikes that coincide = stress-driven purchases.
 *
 * In the register: ink words, the ember signature only as the stress stroke and
 * its marks, no tinted banner, a white tooltip with a hairline.
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
  /**
   * The window the `days` data was queried with — keeps the banner copy in
   * sync with the caller's actual request (audit-2026-07-03: every window
   * label on /money must come from ONE value).
   */
  windowDays?: number;
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
      background: 'var(--rg-white)',
      border: '1px solid var(--rg-rule)',
      borderRadius: 4,
      padding: '10px 12px',
      fontFamily: 'var(--rg-sans)',
      fontSize: 13,
      lineHeight: '19.5px',
      color: 'var(--rg-ink)',
      fontVariantNumeric: 'tabular-nums',
    }}>
      <div style={{ color: 'var(--rg-ink-2)' }}>{formatDay(label)}</div>
      <div style={{ fontWeight: 500 }}>{formatSpend(spend, currency)} spent</div>
      {stress !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="rs-key" style={{ background: SVG_STROKE }} aria-hidden="true" />
          Stress {Math.round(stress)}%{stress >= STRESS_THRESHOLD * 100 ? ', high' : ''}
        </div>
      )}
    </div>
  );
}

// Recharts writes these to SVG presentation attributes, where var() does NOT
// resolve — the same rule that silently broke the share card's canvas fonts.
// So the chart keeps literal values: register.css's hex written out.
// --rg-ember #c47833 = 196 120 51 (the stress stroke, 3.3:1 on the page),
// --rg-ink-3 #6c6867 (axis words, 5.3:1). If the palette moves, these move
// with it.
const EMBER_RGB = '196, 120, 51';
const SVG_STROKE = `rgb(${EMBER_RGB})`;
const SVG_STROKE_FAINT = `rgba(${EMBER_RGB}, 0.5)`;
const SVG_TICK = '#6c6867';
const SVG_DOT = `rgb(${EMBER_RGB})`;

export function StressSpendTimeline({ days, currency = 'BRL', windowDays = 30 }: Props) {
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
    return <p className="rs-quiet">Not enough data to draw the chart yet.</p>;
  }

  // Count days where both stress and spend are elevated
  const correlatedDays = chartData.filter(
    (d) => (d.stress_pct ?? 0) >= STRESS_THRESHOLD * 100 && d.spend > maxSpend * 0.4
  ).length;

  return (
    <div style={{ fontFamily: 'var(--rg-sans)' }}>
      {correlatedDays > 0 && (
        <p style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px', color: 'var(--rg-ink)', fontWeight: 500 }}>
          <span className="rs-mark" style={{ background: 'var(--rg-ember)' }} aria-hidden="true" />
          {correlatedDays} {correlatedDays === 1 ? 'day' : 'days'} in the last {windowDays} with high stress and high spending.
        </p>
      )}

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eae9ea" vertical={false} />

          <XAxis
            dataKey="date"
            tickFormatter={formatDay}
            tick={{ fill: SVG_TICK, fontSize: 12 }}
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
            tick={{ fill: SVG_TICK, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />

          {/* Right Y: spend */}
          <YAxis
            yAxisId="spend"
            orientation="right"
            tickFormatter={(v: number) => formatSpend(v, currency)}
            tick={{ fill: SVG_TICK, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={56}
          />

          <Tooltip content={<CustomTooltip currency={currency} />} />

          {/* Stress threshold reference line */}
          <ReferenceLine
            yAxisId="stress"
            y={STRESS_THRESHOLD * 100}
            stroke={SVG_STROKE_FAINT}
            strokeDasharray="4 4"
          />

          {/* Daily spend bars */}
          <Bar
            yAxisId="spend"
            dataKey="spend"
            className="stress-spend-bar"
            radius={[2, 2, 0, 0]}
            maxBarSize={28}
          />

          {/* Stress score line */}
          <Line
            yAxisId="stress"
            dataKey="stress_pct"
            stroke={SVG_STROKE}
            strokeWidth={2}
            dot={false}
            connectNulls
            activeDot={{ r: 4, fill: SVG_DOT, strokeWidth: 0 }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <ul className="rs-legend">
        <li>
          <span className="rs-key" style={{ height: 10, width: 10, borderRadius: 2, background: 'var(--text-muted)' }} aria-hidden="true" />
          Daily spending
        </li>
        <li>
          <span className="rs-key" style={{ background: 'var(--rg-ember)' }} aria-hidden="true" />
          Stress
        </li>
        <li>
          <span className="rs-key" style={{ height: 0, borderTop: '2px dashed var(--rg-ember)' }} aria-hidden="true" />
          High stress, from 60%
        </li>
      </ul>
    </div>
  );
}
