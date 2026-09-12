import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { RefreshCw, ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { API_URL, getAccessToken } from '@/services/api/apiBase';
import { Page, PageHead, Section, List, Row } from '@/components/register';
import '@/styles/register-insights.css';

/**
 * Admin: LLM cost monitor. In the register: figures are rows, the daily
 * spend is one chart in a list item, and every breakdown is a table under a
 * section heading on the list's ink rule. Tiers and departments are
 * signature marks (a swatch, a bar), never coloured text.
 */

// ========================================================================
// Types
// ========================================================================

interface CostBreakdownItem {
  tier: string;
  model: string;
  service_name: string;
  call_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  cache_hits: number;
}

interface TierSummary {
  calls: number;
  cost_usd: number;
}

interface CostSummary {
  period_days: number;
  total_calls: number;
  total_cost_usd: number;
  daily_average_usd: number;
  monthly_projection_usd: number;
  cache_hit_rate: number;
  by_tier: Record<string, TierSummary>;
  breakdown: CostBreakdownItem[];
}

interface UserCost {
  user_id: string;
  email: string;
  call_count: number;
  total_cost_usd: number;
  total_tokens: number;
  by_tier: Record<string, TierSummary>;
}

interface UserCostData {
  period_days: number;
  users: UserCost[];
}

interface DailyTierBreakdown {
  calls: number;
  cost_usd: number;
}

interface DailyEntry {
  day: string;
  calls: number;
  cost_usd: number;
  cache_hits: number;
  by_tier: Record<string, DailyTierBreakdown>;
}

interface DailyData {
  period_days: number;
  daily: DailyEntry[];
}

interface RealtimeCall {
  id: string;
  user_id: string;
  service_name: string;
  model: string;
  tier: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cost_usd: number;
  cache_hit: boolean;
  latency_ms: number;
  created_at: string;
}

interface RealtimeData {
  count: number;
  calls: RealtimeCall[];
}

interface DepartmentBudgetItem {
  department: string;
  monthly_budget_usd: number;
  spent_this_month_usd: number;
  remaining_usd: number;
}

type PeriodOption = { label: string; days: number };
type SortKey = 'created_at' | 'cost_usd' | 'latency_ms' | 'tier' | 'model' | 'service_name';

// ========================================================================
// Constants
// ========================================================================

const PERIOD_OPTIONS: PeriodOption[] = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: 'All', days: 365 },
];

/* Each tier and department is a signature hue (register.css, 3.3:1 on the
   page): a swatch or a bar, never text. */
const TIER_HUES: Record<string, string> = {
  chat: 'var(--rg-iris)',
  analysis: 'var(--rg-ember)',
  extraction: 'var(--rg-verdigris)',
};

const DEPT_HUES: Record<string, string> = {
  memory: 'var(--rg-iris)',
  wellbeing: 'var(--rg-periwinkle)',
  growth: 'var(--rg-ember)',
  schedule: 'var(--rg-signal)',
  social: 'var(--rg-orchid)',
  privacy: 'var(--rg-mark)',
  creativity: 'var(--rg-verdigris)',
};

// ========================================================================
// Helpers
// ========================================================================

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function Swatch({ color }: { color: string }) {
  return <span className="ri-swatch" style={{ background: color }} aria-hidden="true" />;
}

function tierBadge(tier: string) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Swatch color={TIER_HUES[tier] || 'var(--rg-mark)'} />
      {capitalize(tier)}
    </span>
  );
}

function formatCost(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(4)}`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatPercent(value: number, total: number): string {
  if (total === 0) return '0%';
  return `${((value / total) * 100).toFixed(1)}%`;
}

/** Shorten model IDs: "anthropic/claude-sonnet-4.6" -> "claude-sonnet-4.6" */
function shortModel(model: string): string {
  const parts = model.split('/');
  return parts.length > 1 ? parts[parts.length - 1] : model;
}

// ========================================================================
// Sub-components
// ========================================================================

/** A thin data bar in a table cell: a signature fill on the field track. */
function PercentBar({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <span className="ri-bar" style={{ width: 96, marginTop: 7 }} aria-hidden="true">
      <i className="transition-all duration-500" style={{ width: `${Math.min(100, Math.max(pct, 0.5))}%`, background: color }} />
    </span>
  );
}

/** Daily cost trend: one stacked bar a day, a tier per signature mark. */
function DailyTrendChart({ daily }: { daily: DailyEntry[] }) {
  if (daily.length === 0) return null;

  // Sort chronologically and take last 30 entries max
  const sorted = [...daily]
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-30);

  const maxCost = Math.max(...sorted.map(d => d.cost_usd), 0.001);

  return (
    <Section title="Daily spend" line="Stacked by tier.">
      <List>
        <li className="ri-block">
          {/* Bar chart */}
          <div className="flex items-end gap-[3px]" style={{ height: '140px' }}>
            {sorted.map((entry) => {
              const height = maxCost > 0 ? (entry.cost_usd / maxCost) * 100 : 0;
              // Stack tiers
              const chatCost = entry.by_tier?.chat?.cost_usd || 0;
              const analysisCost = entry.by_tier?.analysis?.cost_usd || 0;
              const extractionCost = entry.by_tier?.extraction?.cost_usd || 0;
              const totalDayCost = entry.cost_usd || 0.001;

              return (
                <div
                  key={entry.day}
                  className="flex-1 flex flex-col justify-end group relative"
                  style={{ minWidth: '6px', height: '100%' }}
                >
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                    <div className="ri-tip">
                      <div style={{ fontWeight: 500 }}>{entry.day}</div>
                      <div className="ri-q">
                        {formatCost(entry.cost_usd)} / {entry.calls} calls
                      </div>
                    </div>
                  </div>
                  {/* Stacked bar: a 1px page gap between tiers keeps the marks apart */}
                  <div
                    className="w-full flex flex-col gap-px overflow-hidden transition-all duration-300"
                    style={{ height: `${Math.max(height, 1)}%`, borderRadius: '2px 2px 0 0' }}
                  >
                    {chatCost > 0 && (
                      <div style={{ flexGrow: chatCost / totalDayCost, background: TIER_HUES.chat }} />
                    )}
                    {analysisCost > 0 && (
                      <div style={{ flexGrow: analysisCost / totalDayCost, background: TIER_HUES.analysis }} />
                    )}
                    {extractionCost > 0 && (
                      <div style={{ flexGrow: extractionCost / totalDayCost, background: TIER_HUES.extraction }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {/* X-axis labels (first, middle, last) */}
          <div className="flex justify-between ri-q ri-figures" style={{ margin: '8px 0 12px' }}>
            <span>{sorted[0]?.day.slice(5)}</span>
            {sorted.length > 2 && <span>{sorted[Math.floor(sorted.length / 2)]?.day.slice(5)}</span>}
            <span>{sorted[sorted.length - 1]?.day.slice(5)}</span>
          </div>
          {/* Legend */}
          <ul className="ri-legend">
            {Object.entries(TIER_HUES).map(([tier, color]) => (
              <li key={tier}>
                <Swatch color={color} />
                {capitalize(tier)}
              </li>
            ))}
          </ul>
        </li>
      </List>
    </Section>
  );
}

// ========================================================================
// Main Component
// ========================================================================

const AdminLLMCosts: React.FC = () => {
  useDocumentTitle('LLM Cost Monitor');

  const [selectedPeriod, setSelectedPeriod] = useState<number>(30);
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [daily, setDaily] = useState<DailyData | null>(null);
  const [realtime, setRealtime] = useState<RealtimeData | null>(null);
  const [userCosts, setUserCosts] = useState<UserCostData | null>(null);
  const [deptBudgets, setDeptBudgets] = useState<DepartmentBudgetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortAsc, setSortAsc] = useState(false);

  // ---- Data fetching ----

  const fetchData = useCallback(async (days: number) => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const apiUrl = API_URL;

      const [summaryRes, dailyRes, realtimeRes, userRes, deptBudgetRes] = await Promise.all([
        fetch(`${apiUrl}/admin/llm-costs?days=${days}`, { headers }),
        fetch(`${apiUrl}/admin/llm-costs/daily?days=${days}`, { headers }),
        fetch(`${apiUrl}/admin/llm-costs/realtime?limit=50`, { headers }),
        fetch(`${apiUrl}/admin/llm-costs/by-user?days=${days}`, { headers }),
        fetch(`${apiUrl}/departments/budgets`, { headers }),
      ]);

      if (!summaryRes.ok) {
        const body = await summaryRes.text();
        throw new Error(`Failed to fetch cost data (${summaryRes.status}): ${body}`);
      }

      // The department-budgets panel is load-bearing on this admin page, so a
      // failed budgets fetch must not silently degrade to an empty section —
      // surface it via the catch/error banner (audit-2026-07-03 error-ux).
      if (!deptBudgetRes.ok) {
        throw new Error(`Failed to fetch department budgets (${deptBudgetRes.status})`);
      }

      const [summaryData, dailyData, realtimeData, userData, deptBudgetData] = await Promise.all([
        summaryRes.json(),
        dailyRes.ok ? dailyRes.json() : null,
        realtimeRes.ok ? realtimeRes.json() : null,
        userRes.ok ? userRes.json() : null,
        deptBudgetRes.json(),
      ]);

      setSummary(summaryData);
      setDaily(dailyData);
      setRealtime(realtimeData);
      setUserCosts(userData);
      setDeptBudgets(deptBudgetData?.budgets ?? []);
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData(selectedPeriod);
  }, [fetchData, selectedPeriod]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => fetchData(selectedPeriod), 30_000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData, selectedPeriod]);

  // ---- Derived data ----

  const avgLatency = useMemo(() => {
    if (!realtime || realtime.calls.length === 0) return 0;
    return realtime.calls.reduce((sum, c) => sum + (c.latency_ms || 0), 0) / realtime.calls.length;
  }, [realtime]);

  /** Cost grouped by service_name */
  const costByService = useMemo(() => {
    if (!summary) return [];
    const map: Record<string, { cost: number; calls: number; inputTokens: number; outputTokens: number }> = {};
    for (const row of summary.breakdown) {
      const svc = row.service_name || 'unknown';
      if (!map[svc]) map[svc] = { cost: 0, calls: 0, inputTokens: 0, outputTokens: 0 };
      map[svc].cost += row.total_cost_usd;
      map[svc].calls += row.call_count;
      map[svc].inputTokens += row.total_input_tokens;
      map[svc].outputTokens += row.total_output_tokens;
    }
    return Object.entries(map)
      .map(([service, stats]) => ({ service, ...stats }))
      .sort((a, b) => b.cost - a.cost);
  }, [summary]);

  /** Cost grouped by model */
  const costByModel = useMemo(() => {
    if (!summary) return [];
    const map: Record<string, { cost: number; calls: number; inputTokens: number; outputTokens: number }> = {};
    for (const row of summary.breakdown) {
      const model = row.model || 'unknown';
      if (!map[model]) map[model] = { cost: 0, calls: 0, inputTokens: 0, outputTokens: 0 };
      map[model].cost += row.total_cost_usd;
      map[model].calls += row.call_count;
      map[model].inputTokens += row.total_input_tokens;
      map[model].outputTokens += row.total_output_tokens;
    }
    return Object.entries(map)
      .map(([model, stats]) => ({ model, ...stats }))
      .sort((a, b) => b.cost - a.cost);
  }, [summary]);

  const totalServiceCost = useMemo(() => costByService.reduce((s, r) => s + r.cost, 0), [costByService]);
  const totalModelCost = useMemo(() => costByModel.reduce((s, r) => s + r.cost, 0), [costByModel]);

  /** Average cost per user per month */
  const avgCostPerUserPerMonth = useMemo(() => {
    if (!userCosts || userCosts.users.length === 0 || !summary) return 0;
    const realUsers = userCosts.users.filter(u => u.user_id !== 'system');
    if (realUsers.length === 0) return 0;
    const monthlyTotal = summary.daily_average_usd * 30;
    return monthlyTotal / realUsers.length;
  }, [userCosts, summary]);

  // ---- Sort for realtime table ----

  const sortedCalls = useMemo(() => {
    if (!realtime) return [];
    return [...realtime.calls].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'created_at': cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break;
        case 'cost_usd': cmp = a.cost_usd - b.cost_usd; break;
        case 'latency_ms': cmp = (a.latency_ms || 0) - (b.latency_ms || 0); break;
        case 'tier': cmp = a.tier.localeCompare(b.tier); break;
        case 'model': cmp = a.model.localeCompare(b.model); break;
        case 'service_name': cmp = a.service_name.localeCompare(b.service_name); break;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [realtime, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const SortHeader: React.FC<{ label: string; field: SortKey }> = ({ label, field }) => (
    <th aria-sort={sortKey === field ? (sortAsc ? 'ascending' : 'descending') : undefined}>
      <button type="button" onClick={() => handleSort(field)} className="ri-sort">
        {label}
        {sortKey === field ? (
          sortAsc ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />
        ) : (
          <ArrowUpDown aria-hidden="true" />
        )}
      </button>
    </th>
  );

  const refreshNow = () => { setLoading(true); fetchData(selectedPeriod); };

  // ---- Render states ----

  if (loading) {
    return (
      <Page>
        <PageHead title="LLM costs" />
        <p className="rg-empty flex items-center gap-2" role="status">
          <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
          Loading
        </p>
      </Page>
    );
  }

  if (error) {
    return (
      <Page>
        <PageHead title="LLM costs" />
        <List className="pb-stack">
          <Row
            title={<span className="ri-danger">{error}</span>}
            action={
              <button type="button" onClick={refreshNow} className="n-btn n-btn--ghost">
                Retry
              </button>
            }
          />
        </List>
      </Page>
    );
  }

  const realUserCount = userCosts?.users.filter(u => u.user_id !== 'system').length || 0;
  const totalBudget = deptBudgets.reduce((s, d) => s + d.monthly_budget_usd, 0);
  const totalSpent = deptBudgets.reduce((s, d) => s + d.spent_this_month_usd, 0);

  return (
    <Page>
      <PageHead
        title="LLM costs"
        line="AI spend across services and users"
        action={
          <button type="button" onClick={refreshNow} className="rg-iconbtn" title="Refresh now" aria-label="Refresh now">
            <RefreshCw aria-hidden="true" />
          </button>
        }
      />

      {/* Controls: the period, when it last updated, auto refresh */}
      <div className="ri-toolbar">
        <div className="ri-actions" role="group" aria-label="Period">
          {PERIOD_OPTIONS.map(({ label, days }) => (
            <button
              key={days}
              type="button"
              onClick={() => setSelectedPeriod(days)}
              className="ri-choice"
              aria-pressed={selectedPeriod === days}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ri-actions" style={{ gap: 12 }}>
          <span className="ri-q">Updated {lastRefresh.toLocaleTimeString()}</span>
          <span className="inline-flex items-center gap-2">
            <span id="llm-auto-label">Auto refresh</span>
            <button
              type="button"
              role="switch"
              aria-checked={autoRefresh}
              aria-labelledby="llm-auto-label"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="ri-switch"
            />
          </span>
        </div>
      </div>

      {/* Summary */}
      <Section title="Spend" line={`Over ${summary?.period_days || selectedPeriod} days.`}>
        <List className="ri-compact ri-stats">
          <Row title={formatCost(summary?.total_cost_usd || 0)} line="Total spend" />
          <Row title={`$${(summary?.monthly_projection_usd || 0).toFixed(2)}`} line="Monthly projection at this rate" />
          <Row title={`$${avgCostPerUserPerMonth.toFixed(2)}`} line={`Per user per month, ${realUserCount} users`} />
          <Row title={`${(summary?.cache_hit_rate || 0).toFixed(1)}%`} line="Cache hit rate" />
          <Row title={formatCost(summary?.daily_average_usd || 0)} line="Daily average" />
          <Row title={avgLatency > 0 ? `${Math.round(avgLatency)}ms` : '--'} line="Average latency" />
          <Row title={formatNumber(summary?.total_calls || 0)} line="Calls" />
        </List>
      </Section>

      {/* Daily trend */}
      {daily && daily.daily.length > 0 && <DailyTrendChart daily={daily.daily} />}

      {/* Cost by service */}
      {costByService.length > 0 && (
        <Section title="By service">
          <div className="ri-table-wrap">
            <table className="ri-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Calls</th>
                  <th>Input tokens</th>
                  <th>Output tokens</th>
                  <th>Cost</th>
                  <th>Share</th>
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {costByService.map((row) => (
                  <tr key={row.service}>
                    <td className="ri-strong">{row.service}</td>
                    <td>{formatNumber(row.calls)}</td>
                    <td>{formatNumber(row.inputTokens)}</td>
                    <td>{formatNumber(row.outputTokens)}</td>
                    <td className="ri-strong">{formatCost(row.cost)}</td>
                    <td>{formatPercent(row.cost, totalServiceCost)}</td>
                    <td><PercentBar value={row.cost} total={totalServiceCost} color="var(--rg-signal)" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Cost by model */}
      {costByModel.length > 0 && (
        <Section title="By model">
          <div className="ri-table-wrap">
            <table className="ri-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Calls</th>
                  <th>Input tokens</th>
                  <th>Output tokens</th>
                  <th>Cost</th>
                  <th>Share</th>
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {costByModel.map((row) => (
                  <tr key={row.model}>
                    <td className="ri-strong">{shortModel(row.model)}</td>
                    <td>{formatNumber(row.calls)}</td>
                    <td>{formatNumber(row.inputTokens)}</td>
                    <td>{formatNumber(row.outputTokens)}</td>
                    <td className="ri-strong">{formatCost(row.cost)}</td>
                    <td>{formatPercent(row.cost, totalModelCost)}</td>
                    <td><PercentBar value={row.cost} total={totalModelCost} color="var(--rg-signal)" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Top users by cost */}
      {userCosts && userCosts.users.length > 0 && (
        <Section title="Top users by cost">
          <div className="ri-table-wrap">
            <table className="ri-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Calls</th>
                  <th>Tokens</th>
                  <th>Chat</th>
                  <th>Analysis</th>
                  <th>Extraction</th>
                  <th>Per call</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {userCosts.users.map((user) => (
                  <tr key={user.user_id}>
                    <td className="ri-strong">{user.email}</td>
                    <td>{formatNumber(user.call_count)}</td>
                    <td>{formatNumber(user.total_tokens)}</td>
                    <td>{user.by_tier.chat ? formatCost(user.by_tier.chat.cost_usd) : '--'}</td>
                    <td>{user.by_tier.analysis ? formatCost(user.by_tier.analysis.cost_usd) : '--'}</td>
                    <td>{user.by_tier.extraction ? formatCost(user.by_tier.extraction.cost_usd) : '--'}</td>
                    <td>{user.call_count > 0 ? formatCost(user.total_cost_usd / user.call_count) : '--'}</td>
                    <td className="ri-strong">{formatCost(user.total_cost_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Department spending */}
      {deptBudgets.length > 0 && (
        <Section title="Departments" line="This month against each budget.">
          <div className="ri-table-wrap">
            <table className="ri-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Budget</th>
                  <th>Spent</th>
                  <th>Remaining</th>
                  <th>Used</th>
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {deptBudgets.map((dept) => {
                  const pctUsed = dept.monthly_budget_usd > 0
                    ? (dept.spent_this_month_usd / dept.monthly_budget_usd) * 100
                    : 0;
                  const barColor = DEPT_HUES[dept.department] || 'var(--rg-mark)';

                  return (
                    <tr key={dept.department}>
                      <td className="ri-strong">
                        <span className="inline-flex items-center gap-2">
                          <Swatch color={barColor} />
                          {capitalize(dept.department)}
                        </span>
                      </td>
                      <td>{formatCost(dept.monthly_budget_usd)}</td>
                      <td className="ri-strong">{formatCost(dept.spent_this_month_usd)}</td>
                      <td>{formatCost(dept.remaining_usd)}</td>
                      <td>{pctUsed.toFixed(1)}%</td>
                      <td><PercentBar value={dept.spent_this_month_usd} total={dept.monthly_budget_usd} color={barColor} /></td>
                    </tr>
                  );
                })}
                {/* Total row */}
                <tr>
                  <td className="ri-strong">Total</td>
                  <td className="ri-strong">{formatCost(totalBudget)}</td>
                  <td className="ri-strong">{formatCost(totalSpent)}</td>
                  <td className="ri-strong">{formatCost(deptBudgets.reduce((s, d) => s + d.remaining_usd, 0))}</td>
                  <td className="ri-strong">{totalBudget > 0 ? `${((totalSpent / totalBudget) * 100).toFixed(1)}%` : '0%'}</td>
                  <td><PercentBar value={totalSpent} total={totalBudget} color="var(--rg-ink)" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Tier breakdown */}
      {summary && Object.keys(summary.by_tier).length > 0 && (
        <Section title="By tier">
          <List className="ri-compact ri-stats">
            {Object.entries(summary.by_tier).map(([tier, data]) => (
              <Row
                key={tier}
                icon={<Swatch color={TIER_HUES[tier] || 'var(--rg-mark)'} />}
                title={`${capitalize(tier)}: ${formatCost(data.cost_usd)}`}
                line={`${formatNumber(data.calls)} calls${summary.total_cost_usd > 0 ? `, ${formatPercent(data.cost_usd, summary.total_cost_usd)} of total` : ''}`}
              />
            ))}
          </List>
        </Section>
      )}

      {/* Recent calls */}
      {realtime && (
        <Section title="Recent calls" line={`The last ${realtime.count}.`}>
          <div className="ri-table-wrap">
            <table className="ri-table">
              <thead>
                <tr>
                  <SortHeader label="Time" field="created_at" />
                  <SortHeader label="Tier" field="tier" />
                  <SortHeader label="Service" field="service_name" />
                  <SortHeader label="Model" field="model" />
                  <th>Tokens</th>
                  <SortHeader label="Cost" field="cost_usd" />
                  <SortHeader label="Latency" field="latency_ms" />
                  <th>Cache</th>
                </tr>
              </thead>
              <tbody>
                {sortedCalls.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="ri-q">No recent calls</td>
                  </tr>
                ) : (
                  sortedCalls.map((call) => (
                    <tr key={call.id}>
                      <td>{formatTimestamp(call.created_at)}</td>
                      <td>{tierBadge(call.tier)}</td>
                      <td className="ri-strong">{call.service_name}</td>
                      <td>{shortModel(call.model)}</td>
                      <td>
                        {formatNumber(call.input_tokens)}/{formatNumber(call.output_tokens)}
                        {call.cached_tokens > 0 && <span className="ri-q"> ({formatNumber(call.cached_tokens)} cached)</span>}
                      </td>
                      <td className="ri-strong">{formatCost(call.cost_usd)}</td>
                      <td>{call.latency_ms ? `${call.latency_ms}ms` : '--'}</td>
                      <td>{call.cache_hit ? <span className="ri-ok">Hit</span> : <span className="ri-q">Miss</span>}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </Page>
  );
};

export default AdminLLMCosts;
