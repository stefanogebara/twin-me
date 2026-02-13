import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';
import { PageLayout } from '@/components/layout/PageLayout';
import {
  DollarSign,
  Phone,
  Zap,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
} from 'lucide-react';

// --- Type definitions ---

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

interface CostSummary {
  period_days: number;
  total_calls: number;
  total_cost_usd: number;
  cache_hit_rate: number;
  breakdown: CostBreakdownItem[];
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

// --- Helpers ---

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

function tierBadge(tier: string) {
  const cls = TIER_COLORS[tier] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${TIER_DOT_COLORS[tier] || 'bg-gray-400'}`} />
      {tier}
    </span>
  );
}

function formatCost(usd: number): string {
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

type SortKey = 'created_at' | 'cost_usd' | 'latency_ms' | 'tier' | 'model' | 'service_name';

// --- Component ---

const AdminLLMCosts: React.FC = () => {
  const { theme } = useTheme();

  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [daily, setDaily] = useState<DailyData | null>(null);
  const [realtime, setRealtime] = useState<RealtimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Sorting for realtime table
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortAsc, setSortAsc] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [summaryRes, dailyRes, realtimeRes] = await Promise.all([
        fetch('/api/admin/llm-costs'),
        fetch('/api/admin/llm-costs/daily'),
        fetch('/api/admin/llm-costs/realtime'),
      ]);

      if (!summaryRes.ok || !dailyRes.ok || !realtimeRes.ok) {
        throw new Error('Failed to fetch cost data');
      }

      const [summaryData, dailyData, realtimeData] = await Promise.all([
        summaryRes.json(),
        dailyRes.json(),
        realtimeRes.json(),
      ]);

      setSummary(summaryData);
      setDaily(dailyData);
      setRealtime(realtimeData);
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      console.error('Failed to fetch LLM cost data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  // Compute average latency from realtime calls
  const avgLatency = realtime && realtime.calls.length > 0
    ? realtime.calls.reduce((sum, c) => sum + (c.latency_ms || 0), 0) / realtime.calls.length
    : 0;

  // Sort realtime calls
  const sortedCalls = realtime
    ? [...realtime.calls].sort((a, b) => {
        let cmp = 0;
        switch (sortKey) {
          case 'created_at':
            cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            break;
          case 'cost_usd':
            cmp = a.cost_usd - b.cost_usd;
            break;
          case 'latency_ms':
            cmp = (a.latency_ms || 0) - (b.latency_ms || 0);
            break;
          case 'tier':
            cmp = a.tier.localeCompare(b.tier);
            break;
          case 'model':
            cmp = a.model.localeCompare(b.model);
            break;
          case 'service_name':
            cmp = a.service_name.localeCompare(b.service_name);
            break;
        }
        return sortAsc ? cmp : -cmp;
      })
    : [];

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

  // Style helpers
  const cardBg = theme === 'dark' ? 'rgba(45, 45, 41, 0.6)' : 'rgba(255, 255, 255, 0.8)';
  const cardBorder = theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)';
  const textPrimary = theme === 'dark' ? '#C1C0B6' : '#0c0a09';
  const textMuted = theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c';
  const tableBg = theme === 'dark' ? 'rgba(35, 35, 32, 0.8)' : 'rgba(250, 250, 250, 0.9)';
  const rowHover = theme === 'dark' ? 'rgba(193, 192, 182, 0.05)' : 'rgba(0, 0, 0, 0.02)';

  if (loading) {
    return (
      <PageLayout title="LLM Cost Monitor" subtitle="Loading cost data...">
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin" style={{ color: textMuted }} />
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout title="LLM Cost Monitor" subtitle="Admin cost tracking dashboard">
        <div
          className="p-6 rounded-2xl text-center"
          style={{ backgroundColor: cardBg, border: cardBorder }}
        >
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => { setLoading(true); fetchData(); }}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.12)' : 'rgba(0, 0, 0, 0.06)',
              color: textPrimary,
            }}
          >
            Retry
          </button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="LLM Cost Monitor" subtitle={`${summary?.period_days || 30}-day overview`}>
      {/* Header Controls */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-xs" style={{ color: textMuted }}>
          Last updated: {lastRefresh.toLocaleTimeString()}
        </p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs" style={{ color: textMuted }}>Auto-refresh</span>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`w-10 h-5 rounded-full transition-colors relative ${
                autoRefresh ? 'bg-green-500' : (theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300')
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  autoRefresh ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>
          <button
            onClick={() => { setLoading(true); fetchData(); }}
            className="p-2 rounded-lg transition-colors hover:opacity-80"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(0, 0, 0, 0.04)',
            }}
            title="Refresh now"
          >
            <RefreshCw className="w-4 h-4" style={{ color: textMuted }} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
      >
        {/* Total Cost */}
        <div className="p-5 rounded-2xl" style={{ backgroundColor: cardBg, border: cardBorder }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-500/10">
              <DollarSign className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Total Cost</span>
          </div>
          <p className="text-2xl font-semibold" style={{ color: textPrimary }}>
            ${(summary?.total_cost_usd || 0).toFixed(4)}
          </p>
          <p className="text-xs mt-1" style={{ color: textMuted }}>
            {summary?.period_days || 30}-day period
          </p>
        </div>

        {/* Total Calls */}
        <div className="p-5 rounded-2xl" style={{ backgroundColor: cardBg, border: cardBorder }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-500/10">
              <Phone className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Total Calls</span>
          </div>
          <p className="text-2xl font-semibold" style={{ color: textPrimary }}>
            {formatNumber(summary?.total_calls || 0)}
          </p>
          <p className="text-xs mt-1" style={{ color: textMuted }}>
            API requests
          </p>
        </div>

        {/* Cache Hit Rate */}
        <div className="p-5 rounded-2xl" style={{ backgroundColor: cardBg, border: cardBorder }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-purple-500/10">
              <Zap className="w-5 h-5 text-purple-400" />
            </div>
            <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Cache Hit Rate</span>
          </div>
          <p className="text-2xl font-semibold" style={{ color: textPrimary }}>
            {(summary?.cache_hit_rate || 0).toFixed(1)}%
          </p>
          <p className="text-xs mt-1" style={{ color: textMuted }}>
            Prompt caching
          </p>
        </div>

        {/* Average Latency */}
        <div className="p-5 rounded-2xl" style={{ backgroundColor: cardBg, border: cardBorder }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-500/10">
              <Clock className="w-5 h-5 text-amber-400" />
            </div>
            <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Avg Latency</span>
          </div>
          <p className="text-2xl font-semibold" style={{ color: textPrimary }}>
            {avgLatency > 0 ? `${Math.round(avgLatency)}ms` : '--'}
          </p>
          <p className="text-xs mt-1" style={{ color: textMuted }}>
            Recent calls
          </p>
        </div>
      </motion.div>

      {/* Breakdown by Tier/Model/Service */}
      {summary && summary.breakdown.length > 0 && (
        <div className="mb-8">
          <h2
            className="text-lg mb-4"
            style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: textPrimary }}
          >
            Cost Breakdown
          </h2>
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: tableBg, border: cardBorder }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: cardBorder }}>
                    {['Tier', 'Model', 'Service', 'Calls', 'Input Tokens', 'Output Tokens', 'Cost', 'Cache Hits'].map(h => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs uppercase tracking-wider font-medium"
                        style={{ color: textMuted }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.breakdown.map((row, i) => (
                    <tr
                      key={i}
                      className="transition-colors"
                      style={{ borderBottom: i < summary.breakdown.length - 1 ? cardBorder : undefined }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = rowHover)}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td className="px-4 py-3">{tierBadge(row.tier)}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: textPrimary }}>{row.model}</td>
                      <td className="px-4 py-3" style={{ color: textPrimary }}>{row.service_name}</td>
                      <td className="px-4 py-3" style={{ color: textPrimary }}>{row.call_count}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: textMuted }}>{formatNumber(row.total_input_tokens)}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: textMuted }}>{formatNumber(row.total_output_tokens)}</td>
                      <td className="px-4 py-3 font-mono" style={{ color: textPrimary }}>{formatCost(row.total_cost_usd)}</td>
                      <td className="px-4 py-3" style={{ color: textMuted }}>{row.cache_hits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Daily Costs */}
      {daily && daily.daily.length > 0 && (
        <div className="mb-8">
          <h2
            className="text-lg mb-4"
            style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: textPrimary }}
          >
            Daily Costs
          </h2>
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: tableBg, border: cardBorder }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: cardBorder }}>
                    {['Date', 'Calls', 'Cost', 'Cache Hits', 'By Tier'].map(h => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs uppercase tracking-wider font-medium"
                        style={{ color: textMuted }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {daily.daily.map((row, i) => (
                    <tr
                      key={row.day}
                      className="transition-colors"
                      style={{ borderBottom: i < daily.daily.length - 1 ? cardBorder : undefined }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = rowHover)}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: textPrimary }}>{row.day}</td>
                      <td className="px-4 py-3" style={{ color: textPrimary }}>{row.calls}</td>
                      <td className="px-4 py-3 font-mono" style={{ color: textPrimary }}>{formatCost(row.cost_usd)}</td>
                      <td className="px-4 py-3" style={{ color: textMuted }}>{row.cache_hits}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(row.by_tier).map(([tier, data]) => (
                            <span key={tier} className="text-xs" style={{ color: textMuted }}>
                              {tierBadge(tier)}
                              <span className="ml-1">{data.calls} / {formatCost(data.cost_usd)}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Real-time Call Log */}
      {realtime && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-lg"
              style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: textPrimary }}
            >
              Recent Calls
              <span className="ml-2 text-sm font-normal" style={{ color: textMuted }}>
                ({realtime.count})
              </span>
            </h2>
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: tableBg, border: cardBorder }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: cardBorder }}>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-wider font-medium" style={{ color: textMuted }}>
                      <SortButton label="Time" field="created_at" />
                    </th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-wider font-medium" style={{ color: textMuted }}>
                      <SortButton label="Tier" field="tier" />
                    </th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-wider font-medium" style={{ color: textMuted }}>
                      <SortButton label="Service" field="service_name" />
                    </th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-wider font-medium" style={{ color: textMuted }}>
                      <SortButton label="Model" field="model" />
                    </th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-wider font-medium" style={{ color: textMuted }}>
                      Tokens (In/Out)
                    </th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-wider font-medium" style={{ color: textMuted }}>
                      Cached
                    </th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-wider font-medium" style={{ color: textMuted }}>
                      <SortButton label="Cost" field="cost_usd" />
                    </th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-wider font-medium" style={{ color: textMuted }}>
                      <SortButton label="Latency" field="latency_ms" />
                    </th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-wider font-medium" style={{ color: textMuted }}>
                      Cache
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCalls.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center" style={{ color: textMuted }}>
                        No recent calls
                      </td>
                    </tr>
                  ) : (
                    sortedCalls.map((call, i) => (
                      <tr
                        key={call.id}
                        className="transition-colors"
                        style={{ borderBottom: i < sortedCalls.length - 1 ? cardBorder : undefined }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = rowHover)}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <td className="px-4 py-2.5 font-mono text-xs" style={{ color: textMuted }}>
                          {formatTimestamp(call.created_at)}
                        </td>
                        <td className="px-4 py-2.5">{tierBadge(call.tier)}</td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: textPrimary }}>{call.service_name}</td>
                        <td className="px-4 py-2.5 font-mono text-xs" style={{ color: textPrimary }}>{call.model}</td>
                        <td className="px-4 py-2.5 font-mono text-xs" style={{ color: textMuted }}>
                          {formatNumber(call.input_tokens)} / {formatNumber(call.output_tokens)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs" style={{ color: textMuted }}>
                          {call.cached_tokens > 0 ? formatNumber(call.cached_tokens) : '--'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs" style={{ color: textPrimary }}>
                          {formatCost(call.cost_usd)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs" style={{ color: textMuted }}>
                          {call.latency_ms ? `${call.latency_ms}ms` : '--'}
                        </td>
                        <td className="px-4 py-2.5">
                          {call.cache_hit ? (
                            <span className="text-green-400 text-xs">HIT</span>
                          ) : (
                            <span className="text-xs" style={{ color: textMuted }}>MISS</span>
                          )}
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
    </PageLayout>
  );
};

export default AdminLLMCosts;
