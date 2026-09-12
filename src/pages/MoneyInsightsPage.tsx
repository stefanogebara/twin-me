/**
 * MoneyInsightsPage — Financial-Emotional Twin Demo Surface
 * =======================================================================
 * Cross-domain signals in a single narrative read (post bank-aggregator
 * removal, replan-2026-06-12 — brokerage/investment sections retired):
 *
 *   1. Subscriptions audit with first-charge emotional context — the
 *      "I signed up for this gym on a low-recovery Sunday, never used it"
 *      insight a plain spending tracker cannot say
 *   2. Stress-spend timeline — daily outflow overlaid with the stress
 *      signal that drove it
 *
 * Designed as a read-only surface in the register, as src/pages/money/* are:
 * a page title, sections of rows under the ink rule, empty states as one quiet
 * line. Action / detail flows still live on /money. From /money you can click
 * "See your insights" to land here; from here a back link returns.
 */

import React, { useEffect, useState } from 'react';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  getRecurringSubscriptions,
  getTimelineAnalysis,
  type RecurringSubscription,
  type TimelineDay,
} from '@/services/api/transactionsAPI';
import { StressSpendTimeline } from './components/money/StressSpendTimeline';
import { Page, PageHead, Section, List, Row, Empty } from '@/components/register';
import '@/styles/register-public.css';
import '@/styles/register-settings.css';

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
        // getRecurringSubscriptions returns a { success:false } envelope on a
        // backend error rather than throwing — so without this check the page
        // silently rendered an empty "no charges detected" state on a real 500.
        // Surface it instead (audit-2026-07-03 error-ux).
        if (!subsRes.success) {
          setError(subsRes.error || 'Failed to load insights');
          return;
        }
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

  const moneyLink = (
    <button type="button" onClick={() => navigate('/money')} className="rs-link">Money</button>
  );

  return (
    <Page className="rs">
      <button
        type="button"
        onClick={() => navigate('/money')}
        className="n-btn n-btn--ghost"
        style={{ marginBottom: 40 }}
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Back to Money
      </button>

      <PageHead
        title="Your money, with context."
        line="Every charge next to how you were doing that day."
      />

      {/* Subscriptions audit with first-charge emotional context. */}
      <Section
        title="What you pay every month"
        line={subs.length > 0 && subsSynthesis
          ? subsSynthesis
          : 'From your statements, with how you were doing when each began.'}
      >
        <List label="Monthly charges" className="rg-figures">
          {loading && subs.length === 0 ? (
            <li><Empty>Loading</Empty></li>
          ) : subs.length === 0 ? (
            <li><Empty>No monthly charges yet. Add a statement on {moneyLink}.</Empty></li>
          ) : (
            <>
              {/* Coaching callout removed (2026-05-22): the "Worth flagging the
                  next time you feel the urge to subscribe to something at
                  midnight" line was a value judgment the surface shouldn't make
                  on the user's behalf — signing up to Cursor under deadline
                  pressure is leverage, not impulse. The neutral count is now
                  carried by the synthesis line above (subsSynthesis). */}
              {subs.map(s => {
                const dateStr = fmtDate(s.firstChargeDate);
                const parts: string[] = [`${s.chargeCount} charges`];
                if (dateStr) parts.push(`first on ${dateStr}`);
                if (s.firstChargeContext) parts.push(s.firstChargeContext);
                return (
                  <Row
                    key={`${s.merchant}-${s.firstChargeDate}`}
                    title={s.merchant}
                    line={parts.join(' · ')}
                    clip
                    action={
                      <span>
                        <span className="rs-figure">{fmtCurrency(s.monthlyAvg, s.currency)}</span>
                        <span className="rs-quiet"> a month</span>
                      </span>
                    }
                  />
                );
              })}
              <li className="rg-row rg-row--plain" style={{ minHeight: 'var(--rg-row-sub)', padding: 12 }}>
                <span className="rg-row-text"><span className="rg-row-title">In total</span></span>
                <span className="rg-row-action">
                  <span className="rs-figure">{fmtCurrency(subsTotalMonthly, subsCurrency)}</span>
                  <span className="rs-quiet">a month</span>
                </span>
              </li>
            </>
          )}
        </List>
      </Section>

      {/* Stress-spend timeline: under the ink rule, no box. */}
      <Section title="When stress drives spending" line="What you spent each day, and how stressed you were.">
        {timeline.length === 0 && !loading ? (
          <List label="Daily pattern">
            <li><Empty>No spending history yet. Add a statement on {moneyLink} to see the pattern.</Empty></li>
          </List>
        ) : (
          <div className="rs-chart">
            <StressSpendTimeline days={timeline} currency={subsCurrency} />
          </div>
        )}
      </Section>

      {error ? (
        <p className="rs-bad" role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: 'var(--rg-section-phone) 0 0' }}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </Page>
  );
};

export default MoneyInsightsPage;
