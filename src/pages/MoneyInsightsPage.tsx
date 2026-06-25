/**
 * MoneyInsightsPage — Financial-Emotional Twin Demo Surface
 * =======================================================================
 * Cross-domain signals in a single narrative read (post bank-aggregator
 * removal, replan-2026-06-12 — brokerage/investment sections retired):
 *
 *   1. Subscriptions audit with first-charge emotional context — the
 *      "I signed up for this gym on a low-recovery Sunday, never used it"
 *      insight ChatGPT Personal Finance cannot say
 *   2. Stress-spend timeline — daily outflow overlaid with the stress
 *      signal that drove it
 *
 * Designed as a polished read-only surface. Action / detail flows still
 * live on /money. From /money you can click "See your insights" to land
 * here; from here a back link returns to the control surface.
 */

import React, { useEffect, useState } from 'react';
import { ArrowLeft, AlertCircle, Loader2, Repeat, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  getRecurringSubscriptions,
  getTimelineAnalysis,
  type RecurringSubscription,
  type TimelineDay,
} from '@/services/api/transactionsAPI';
import { StressSpendTimeline } from './components/money/StressSpendTimeline';

function fmtCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: amount >= 100 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    // Strip any time component so "2025-05-19" and full ISO timestamps both
    // anchor at noon UTC. Avoids the "Invalid Date" path that the old
    // `iso + 'T12:00:00Z'` produced when iso already had a time portion.
    const dateOnly = String(iso).slice(0, 10);
    const d = new Date(dateOnly + 'T12:00:00Z');
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

const MoneyInsightsPage: React.FC = () => {
  useDocumentTitle('Money Insights');
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState<RecurringSubscription[]>([]);
  const [subsSynthesis, setSubsSynthesis] = useState<string>('');
  const [subsCurrency, setSubsCurrency] = useState<string>('USD');
  const [subsTotalMonthly, setSubsTotalMonthly] = useState<number>(0);
  const [timeline, setTimeline] = useState<TimelineDay[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [subsRes, days] = await Promise.all([
          getRecurringSubscriptions({ limit: 12 }),
          getTimelineAnalysis(),
        ]);
        if (cancelled) return;
        setSubs(subsRes.subscriptions || []);
        setSubsSynthesis(subsRes.synthesis || '');
        setSubsCurrency(subsRes.currency || 'USD');
        setSubsTotalMonthly(subsRes.totalMonthly || 0);
        setTimeline(days || []);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load insights');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-full px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-6xl mx-auto">
      {/* Hero */}
      <button
        onClick={() => navigate('/money')}
        className="inline-flex items-center gap-2 text-[var(--text-narrative-muted)] hover:text-[var(--text-narrative-secondary)] text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Money
      </button>

      <header className="mb-10">
        <h1 className="text-heading text-[40px] sm:text-[48px] leading-[1.05] tracking-[-0.96px] text-[var(--text-narrative)]">
          Your money, with context.
        </h1>
        <p className="mt-4 max-w-2xl text-[var(--text-narrative-secondary)] text-[15.5px] leading-[1.55]">
          ChatGPT shows you what you spent. Your twin shows you why — joining every
          charge with the recovery, stress, and mood you carried into that decision.
        </p>
      </header>

      {/* Subscriptions audit with first-charge emotional context. */}
      <Section
        icon={<Repeat className="h-4 w-4" />}
        eyebrow="Recurring charges"
        title="What you're paying for, every month"
        subtitle={subsSynthesis || 'Detected from your transaction history. Each subscription is tagged with the emotional state on the day you first signed up.'}
      >
        {loading && subs.length === 0 ? (
          <SkeletonRow />
        ) : subs.length === 0 ? (
          <EmptyHint>
            No recurring charges detected yet. Upload a statement or link WhatsApp on
            <button onClick={() => navigate('/money')} className="text-[var(--accent-vibrant)] hover:underline ml-1">Money</button> to start tracking.
          </EmptyHint>
        ) : (
          <>
            {/* Coaching callout removed (2026-05-22): the "Worth flagging the
                next time you feel the urge to subscribe to something at
                midnight" line was a value judgment the surface shouldn't make
                on the user's behalf — signing up to Cursor under deadline
                pressure is leverage, not impulse. The neutral count is now
                carried by the synthesis line above (subsSynthesis). */}
            <ul className="space-y-2">
              {subs.map(s => (
                <li
                  key={`${s.merchant}-${s.firstChargeDate}`}
                  className="rounded-[14px] border border-[var(--glass-surface-border)] bg-[var(--glass-surface-bg)] backdrop-blur-[42px] px-4 py-3 flex items-start justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[var(--text-narrative)] text-[14px] font-medium truncate">
                        {s.merchant}
                      </span>
                      <span className="text-[11px] text-[var(--text-narrative-muted)]">
                        {s.chargeCount} charges
                      </span>
                    </div>
                    {(() => {
                      const dateStr = fmtDate(s.firstChargeDate);
                      const parts: string[] = [];
                      if (dateStr) parts.push(`First charge ${dateStr}`);
                      if (s.firstChargeContext) parts.push(s.firstChargeContext);
                      return parts.length ? (
                        <p className="mt-1 text-[12.5px] text-[var(--text-narrative-muted)] truncate">
                          {parts.join(' · ')}
                        </p>
                      ) : null;
                    })()}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[var(--text-narrative)] text-[14px] tabular-nums">
                      {fmtCurrency(s.monthlyAvg, s.currency)}
                    </div>
                    <div className="text-[11px] text-[var(--text-narrative-muted)]">per month</div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 text-[12.5px] text-[var(--text-narrative-muted)]">
              Total monthly: <span className="text-[var(--text-narrative-secondary)] tabular-nums">{fmtCurrency(subsTotalMonthly, subsCurrency)}</span>
            </div>
          </>
        )}
      </Section>

      {/* Stress-spend timeline. */}
      <Section
        icon={<TrendingUp className="h-4 w-4" />}
        eyebrow="Daily pattern"
        title="When stress drives spending"
        subtitle="Daily outflow overlaid with the average computed stress score across all your transactions that day."
      >
        <div className="rounded-[20px] border border-[var(--glass-surface-border)] bg-[var(--glass-surface-bg)] backdrop-blur-[42px] p-4">
          {timeline.length === 0 && !loading ? (
            <EmptyHint>
              No spending history yet. Upload a statement or link WhatsApp on
              <button onClick={() => navigate('/money')} className="text-[var(--accent-vibrant)] hover:underline ml-1">Money</button> to see the daily pattern.
            </EmptyHint>
          ) : (
            <StressSpendTimeline days={timeline} currency={subsCurrency} />
          )}
        </div>
      </Section>

      {error ? (
        <div className="mt-8 rounded-[14px] border border-[rgba(220,38,38,0.3)] bg-[rgba(220,38,38,0.05)] px-4 py-3 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-[13.5px] text-[var(--text-narrative-secondary)]">{error}</p>
        </div>
      ) : null}
    </div>
  );
};

interface SectionProps {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ icon, eyebrow, title, subtitle, children }) => (
  <section className="mb-12">
    <div className="mb-4 flex items-center gap-2 text-[var(--text-narrative-muted)]">
      {icon}
      <span className="text-[11px] uppercase tracking-[0.08em]">{eyebrow}</span>
    </div>
    <h2 className="text-heading text-[24px] sm:text-[28px] leading-[1.15] tracking-[-0.56px] text-[var(--text-narrative)] mb-2">
      {title}
    </h2>
    {subtitle ? (
      <p className="text-[var(--text-narrative-secondary)] text-[14px] leading-[1.55] mb-5 max-w-3xl">
        {subtitle}
      </p>
    ) : null}
    {children}
  </section>
);

const SkeletonRow: React.FC = () => (
  <div className="flex items-center gap-3 text-[var(--text-narrative-muted)] text-[13px]">
    <Loader2 className="h-4 w-4 animate-spin" />
    Loading…
  </div>
);

const EmptyHint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-[14px] border border-dashed border-[var(--glass-surface-border)] px-4 py-5 text-[13.5px] text-[var(--text-narrative-muted)] leading-[1.55]">
    {children}
  </div>
);

export default MoneyInsightsPage;
