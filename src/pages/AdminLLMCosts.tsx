import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  DollarSign,
  Zap,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  TrendingUp,
  Users,
  BarChart3,
  Cpu,
  Layers,
} from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { getAccessToken } from '@/services/api/apiBase';

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

type PeriodOption = { label: string; days: number };
type SortKey = 'created_at' | 'cost_usd' | 'latency_ms' | 'tier' | 'model' | 'service_name';

// ========================================================================
// Constants
// ========================================================================

const PERIOD_OPTIONS: PeriodOption[] = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: 'All', days: 365 },
];

const TIER_COLORS: Record<string, string> = {
  chat: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  analysis: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  extraction: 'bg-green-500/20 text-green-400 border-green-500/30',
};

const TIER_DOT_COLORS: Record<string, string> = {
  chat: 'bg-blue-400',
  analysis: 'bg-yellow-400',
  extraction: 'bg-green-400',
};

const TIER_BAR_COLORS: Record<string, string> = {
  chat: '#3B82F6',
  analysis: '#EAB308',
  extraction: '#22C55E',
};

const CARD_STYLE = {
  border: '1px solid var(--border-glass)',
  backgroundColor: 'rgba(255,255,255,0.02)',
} as const;

const TABLE_BORDER = '1px solid var(--border-glass)';

// ========================================================================
// Helpers
// ========================================================================

function tierBadge(tier: string) {
  const cls = TIER_COLORS[tier] || 'bg-gray-700/20 text-gray-400 border-gray-500/30';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${TIER_DOT_COLORS[tier] || 'bg-gray-400'}`} />
      {tier}
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

/** Horizontal percentage bar */
function PercentBar({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.max(pct, 0.5)}%`, backgroundColor: color }}
      />
    </div>
  );
}

/** Daily cost trend with CSS bar chart */
function DailyTrendChart({ daily }: { daily: DailyEntry[] }) {
  if (daily.length === 0) return null;

  // Sort chronologically and take last 30 entries max
  const sorted = [...daily]
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-30);

  const maxCost = Math.max(...sorted.map(d => d.cost_usd), 0.001);

  return (
    <div className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4" style={{ color: '#10b77f' }} />
        <span className="text-[11px] font-medium tracking-widest uppercase" style={{ color: '#10b77f' }}>
          Daily Spend Trend
        </span>
      </div>
      <div className="rounded-lg p-5" style={CARD_STYLE}>
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
                  <div
                    className="rounded-lg px-3 py-2 text-xs whitespace-nowrap"
                    style={{
                      backgroundColor: 'rgba(30,28,36,0.95)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--foreground)',
                    }}
                  >
                    <div className="font-mono font-semibold">{entry.day}</div>
                    <div style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {formatCost(entry.cost_usd)} / {entry.calls} calls
                    </div>
                  </div>
                </div>
                {/* Stacked bar */}
                <div
                  className="w-full rounded-t-[2px] overflow-hidden transition-all duration-300"
                  style={{ height: `${Math.max(height, 1)}%` }}
                >
                  {extractionCost > 0 && (
                    <div
                      style={{
                        height: `${(extractionCost / totalDayCost) * 100}%`,
                        backgroundColor: TIER_BAR_COLORS.extraction,
                        opacity: 0.7,
                      }}
                    />
                  )}
                  {analysisCost > 0 && (
                    <div
                      style={{
                        height: `${(analysisCost / totalDayCost) * 100}%`,
                        backgroundColor: TIER_BAR_COLORS.analysis,
                        opacity: 0.7,
                      }}
                    />
                  )}
                  {chatCost > 0 && (
                    <div
                      style={{
                        height: `${(chatCost / totalDayCost) * 100}%`,
                        backgroundColor: TIER_BAR_COLORS.chat,
                        opacity: 0.7,
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {/* X-axis labels (show first, middle, last) */}
        <div className="flex justify-between mt-2">
          <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>
            {sorted[0]?.day.slice(5)}
          </span>
          {sorted.length > 2 && (
            <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>
              {sorted[Math.floor(sorted.length / 2)]?.day.slice(5)}
            </span>
          )}
          <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>
            {sorted[sorted.length - 1]?.day.slice(5)}
          </span>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 mt-3">
          {Object.entries(TIER_BAR_COLORS).map(([tier, color]) => (
            <div key={tier} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color, opacity: 0.7 }} />
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{tier}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortAsc, setSortAsc] = useState(false);

  // ---- Data fetching ----

  const fetchData = useCallback(async (days: number) => {
    try {
      const token = getAccessToken() || localStorage.getItem('auth_token');
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const apiUrl = import.meta.env.VITE_API_URL || '';

      const [summaryRes, dailyRes, realtimeRes, userRes] = await Promise.all([
        fetch(`${apiUrl}/admin/llm-costs?days=${days}`, { headers }),
        fetch(`${apiUrl}/admin/llm-costs/daily?days=${days}`, { headers }),
        fetch(`${apiUrl}/admin/llm-costs/realtime?limit=50`, { headers }),
        fetch(`${apiUrl}/admin/llm-costs/by-user?days=${days}`, { headers }),
      ]);

      if (!summaryRes.ok) {
        const body = await summaryRes.text();
        throw new Error(`Failed to fetch cost data (${summaryRes.status}): ${body}`);
      }

      const [summaryData, dailyData, realtimeData, userData] = await Promise.all([
        summaryRes.json(),
        dailyRes.ok ? dailyRes.json() : null,
        realtimeRes.ok ? realtimeRes.json() : null,
        userRes.ok ? userRes.json() : null,
      ]);

      setSummary(summaryData);
      setDaily(dailyData);
      setRealtime(realtimeData);
      setUserCosts(userData);
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

  const SortButton: React.FC<{ label: string; field: SortKey }> = ({ label, field }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 hover:opacity-80 transition-opacity"
    >
      {label}
      {sortKey === field ? (
        sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-40" />
      )}
    </button>
  );

  // ---- Render states ----

  if (loading) {
    return (
      <div className="max-w-[1060px] mx-auto px-6 py-16">
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'rgba(255,255,255,0.2)' }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[1060px] mx-auto px-6 py-16">
        <h1
          className="mb-6"
          style={{
            fontSize: '28px',
            fontWeight: 600,
            color: 'var(--foreground)',
            letterSpacing: '-0.02em',
          }}
        >
          LLM Cost Monitor
        </h1>
        <div className="p-5 rounded-lg text-center" style={CARD_STYLE}>
          <p className="text-sm mb-4" style={{ color: '#fca5a5' }}>{error}</p>
          <button
            onClick={() => { setLoading(true); fetchData(selectedPeriod); }}
            className="px-4 py-2 rounded-lg text-sm transition-opacity hover:opacity-70"
            style={{ border: '1px solid var(--border)', color: 'rgba(255,255,255,0.5)' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1060px] mx-auto px-6 py-16">
      {/* ================================================================ */}
      {/* Header                                                          */}
      {/* ================================================================ */}
      <h1
        className="mb-2"
        style={{
          fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
          fontSize: '28px',
          fontWeight: 600,
          color: 'var(--foreground)',
          letterSpacing: '-0.02em',
        }}
      >
        LLM Cost Monitor
      </h1>
      <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}>
        AI spending analytics across all services and users
      </p>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        {/* Period selector */}
        <div className="flex items-center gap-1 rounded-full p-0.5" style={{ border: '1px solid var(--border-glass)' }}>
          {PERIOD_OPTIONS.map(({ label, days }) => (
            <button
              key={days}
              onClick={() => setSelectedPeriod(days)}
              className="px-3.5 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                backgroundColor: selectedPeriod === days ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: selectedPeriod === days ? 'var(--foreground)' : 'rgba(255,255,255,0.35)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Updated {lastRefresh.toLocaleTimeString()}
          </p>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Auto</span>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`w-9 h-5 rounded-full transition-colors relative ${autoRefresh ? 'bg-green-500' : 'bg-gray-600'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${autoRefresh ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </label>
          <button
            onClick={() => { setLoading(true); fetchData(selectedPeriod); }}
            className="p-1.5 rounded-lg transition-opacity hover:opacity-60"
            style={{ color: 'rgba(255,255,255,0.25)' }}
            title="Refresh now"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border-glass)' }} className="mb-8" />

      {/* ================================================================ */}
      {/* Summary Cards                                                   */}
      {/* ================================================================ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {[
          {
            icon: DollarSign,
            color: '#10b77f',
            label: 'Total Spend',
            value: formatCost(summary?.total_cost_usd || 0),
            sub: `${summary?.period_days || selectedPeriod}-day period`,
          },
          {
            icon: TrendingUp,
            color: '#EF4444',
            label: 'Monthly Projection',
            value: `$${(summary?.monthly_projection_usd || 0).toFixed(2)}`,
            sub: 'At current rate',
          },
          {
            icon: Users,
            color: '#8B5CF6',
            label: 'Avg / User / Mo',
            value: `$${avgCostPerUserPerMonth.toFixed(2)}`,
            sub: `${userCosts?.users.filter(u => u.user_id !== 'system').length || 0} users`,
          },
          {
            icon: Zap,
            color: '#06B6D4',
            label: 'Cache Hit Rate',
            value: `${(summary?.cache_hit_rate || 0).toFixed(1)}%`,
            sub: `${formatNumber(summary?.total_calls || 0)} total calls`,
          },
        ].map(({ icon: Icon, color, label, value, sub }) => (
          <div key={label} className="p-5 rounded-lg" style={CARD_STYLE}>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}15` }}>
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              <span className="text-[11px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</span>
            </div>
            <p className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>{value}</p>
            <p className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{sub}</p>
          </div>
        ))}
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        {[
          { label: 'Daily Avg', value: formatCost(summary?.daily_average_usd || 0) },
          { label: 'Avg Latency', value: avgLatency > 0 ? `${Math.round(avgLatency)}ms` : '--' },
          { label: 'Total Calls', value: formatNumber(summary?.total_calls || 0) },
        ].map(({ label, value }) => (
          <div key={label} className="p-4 rounded-lg text-center" style={CARD_STYLE}>
            <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</p>
            <p className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>{value}</p>
          </div>
        ))}
      </div>

      {/* ================================================================ */}
      {/* Daily Trend Chart                                               */}
      {/* ================================================================ */}
      {daily && daily.daily.length > 0 && (
        <DailyTrendChart daily={daily.daily} />
      )}

      {/* ================================================================ */}
      {/* Cost by Service                                                 */}
      {/* ================================================================ */}
      {costByService.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-4 h-4" style={{ color: '#10b77f' }} />
            <span className="text-[11px] font-medium tracking-widest uppercase" style={{ color: '#10b77f' }}>
              Cost by Service
            </span>
          </div>
          <div className="rounded-lg overflow-hidden" style={CARD_STYLE}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: TABLE_BORDER }}>
                    {['Service', 'Calls', 'Input Tokens', 'Output Tokens', 'Cost', '%', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {costByService.map((row, i) => (
                    <tr key={row.service} style={{ borderBottom: i < costByService.length - 1 ? TABLE_BORDER : undefined }}>
                      <td className="px-4 py-3 text-xs font-medium" style={{ color: 'var(--foreground)' }}>{row.service}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--foreground)' }}>{formatNumber(row.calls)}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{formatNumber(row.inputTokens)}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{formatNumber(row.outputTokens)}</td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: 'var(--foreground)' }}>{formatCost(row.cost)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{formatPercent(row.cost, totalServiceCost)}</td>
                      <td className="px-4 py-3 w-24">
                        <PercentBar value={row.cost} total={totalServiceCost} color="#10b77f" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Cost by Model                                                   */}
      {/* ================================================================ */}
      {costByModel.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="w-4 h-4" style={{ color: '#10b77f' }} />
            <span className="text-[11px] font-medium tracking-widest uppercase" style={{ color: '#10b77f' }}>
              Cost by Model
            </span>
          </div>
          <div className="rounded-lg overflow-hidden" style={CARD_STYLE}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: TABLE_BORDER }}>
                    {['Model', 'Calls', 'Input Tokens', 'Output Tokens', 'Cost', '%', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {costByModel.map((row, i) => (
                    <tr key={row.model} style={{ borderBottom: i < costByModel.length - 1 ? TABLE_BORDER : undefined }}>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--foreground)' }}>{shortModel(row.model)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--foreground)' }}>{formatNumber(row.calls)}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{formatNumber(row.inputTokens)}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{formatNumber(row.outputTokens)}</td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: 'var(--foreground)' }}>{formatCost(row.cost)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{formatPercent(row.cost, totalModelCost)}</td>
                      <td className="px-4 py-3 w-24">
                        <PercentBar value={row.cost} total={totalModelCost} color="#8B5CF6" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Top Users by Cost                                               */}
      {/* ================================================================ */}
      {userCosts && userCosts.users.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4" style={{ color: '#10b77f' }} />
            <span className="text-[11px] font-medium tracking-widest uppercase" style={{ color: '#10b77f' }}>Top Users by Cost</span>
          </div>
          <div className="rounded-lg overflow-hidden" style={CARD_STYLE}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: TABLE_BORDER }}>
                    {['User', 'Calls', 'Tokens', 'Chat', 'Analysis', 'Extraction', 'Avg/Call', 'Total'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {userCosts.users.map((user, i) => (
                    <tr key={user.user_id} style={{ borderBottom: i < userCosts.users.length - 1 ? TABLE_BORDER : undefined }}>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--foreground)' }}>{user.email}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--foreground)' }}>{formatNumber(user.call_count)}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{formatNumber(user.total_tokens)}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        {user.by_tier.chat ? formatCost(user.by_tier.chat.cost_usd) : '--'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        {user.by_tier.analysis ? formatCost(user.by_tier.analysis.cost_usd) : '--'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        {user.by_tier.extraction ? formatCost(user.by_tier.extraction.cost_usd) : '--'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        {user.call_count > 0 ? formatCost(user.total_cost_usd / user.call_count) : '--'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: 'var(--foreground)' }}>
                        {formatCost(user.total_cost_usd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Tier Breakdown                                                  */}
      {/* ================================================================ */}
      {summary && Object.keys(summary.by_tier).length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4" style={{ color: '#10b77f' }} />
            <span className="text-[11px] font-medium tracking-widest uppercase" style={{ color: '#10b77f' }}>By Tier</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Object.entries(summary.by_tier).map(([tier, data]) => (
              <div key={tier} className="p-4 rounded-lg" style={CARD_STYLE}>
                <div className="mb-2">{tierBadge(tier)}</div>
                <p className="text-xl font-semibold mb-1" style={{ color: 'var(--foreground)' }}>{formatCost(data.cost_usd)}</p>
                <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  {formatNumber(data.calls)} calls
                  {summary.total_cost_usd > 0 && (
                    <span> / {formatPercent(data.cost_usd, summary.total_cost_usd)} of total</span>
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Recent Calls (Realtime Log)                                     */}
      {/* ================================================================ */}
      {realtime && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4" style={{ color: '#10b77f' }} />
            <span className="text-[11px] font-medium tracking-widest uppercase" style={{ color: '#10b77f' }}>Recent Calls</span>
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>({realtime.count})</span>
          </div>
          <div className="rounded-lg overflow-hidden" style={CARD_STYLE}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: TABLE_BORDER }}>
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}><SortButton label="Time" field="created_at" /></th>
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}><SortButton label="Tier" field="tier" /></th>
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}><SortButton label="Service" field="service_name" /></th>
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}><SortButton label="Model" field="model" /></th>
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>Tokens</th>
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}><SortButton label="Cost" field="cost_usd" /></th>
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}><SortButton label="Latency" field="latency_ms" /></th>
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>Cache</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCalls.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        No recent calls
                      </td>
                    </tr>
                  ) : (
                    sortedCalls.map((call, i) => (
                      <tr key={call.id} style={{ borderBottom: i < sortedCalls.length - 1 ? TABLE_BORDER : undefined }}>
                        <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{formatTimestamp(call.created_at)}</td>
                        <td className="px-4 py-2.5">{tierBadge(call.tier)}</td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--foreground)' }}>{call.service_name}</td>
                        <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--foreground)' }}>{shortModel(call.model)}</td>
                        <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                          {formatNumber(call.input_tokens)}/{formatNumber(call.output_tokens)}
                          {call.cached_tokens > 0 && (
                            <span style={{ color: '#22C55E' }}> ({formatNumber(call.cached_tokens)}c)</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--foreground)' }}>{formatCost(call.cost_usd)}</td>
                        <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{call.latency_ms ? `${call.latency_ms}ms` : '--'}</td>
                        <td className="px-4 py-2.5">
                          {call.cache_hit
                            ? <span className="text-green-400 text-xs">HIT</span>
                            : <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>MISS</span>
                          }
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLLMCosts;
