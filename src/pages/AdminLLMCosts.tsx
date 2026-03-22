import React, { useEffect, useState, useCallback } from 'react';
import {
  DollarSign,
  Phone,
  Zap,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

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
  const cls = TIER_COLORS[tier] || 'bg-gray-700/20 text-gray-400 border-gray-500/30';
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

const CARD_STYLE = {
  border: '1px solid rgba(255,255,255,0.06)',
  backgroundColor: 'rgba(255,255,255,0.02)',
} as const;

const AdminLLMCosts: React.FC = () => {
  useDocumentTitle('LLM Cost Monitor');
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

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const apiUrl = import.meta.env.VITE_API_URL || '';

      const [summaryRes, dailyRes, realtimeRes, userRes] = await Promise.all([
        fetch(`${apiUrl}/admin/llm-costs`, { headers }),
        fetch(`${apiUrl}/admin/llm-costs/daily`, { headers }),
        fetch(`${apiUrl}/admin/llm-costs/realtime`, { headers }),
        fetch(`${apiUrl}/admin/llm-costs/by-user`, { headers }),
      ]);

      if (!summaryRes.ok || !dailyRes.ok || !realtimeRes.ok) {
        throw new Error('Failed to fetch cost data');
      }

      const [summaryData, dailyData, realtimeData, userData] = await Promise.all([
        summaryRes.json(),
        dailyRes.json(),
        realtimeRes.json(),
        userRes.ok ? userRes.json() : null,
      ]);

      setSummary(summaryData);
      setDaily(dailyData);
      setRealtime(realtimeData);
      setUserCosts(userData);
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

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const avgLatency = realtime && realtime.calls.length > 0
    ? realtime.calls.reduce((sum, c) => sum + (c.latency_ms || 0), 0) / realtime.calls.length
    : 0;

  const sortedCalls = realtime
    ? [...realtime.calls].sort((a, b) => {
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

  const tableBorder = '1px solid rgba(255,255,255,0.06)';

  if (loading) {
    return (
      <div className="max-w-[960px] mx-auto px-6 py-16">
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'rgba(255,255,255,0.2)' }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[960px] mx-auto px-6 py-16">
        <h1
          className="mb-6"
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontStyle: 'italic',
            fontSize: '28px',
            fontWeight: 400,
            color: 'var(--foreground)',
            letterSpacing: '-0.02em',
          }}
        >
          LLM Cost Monitor
        </h1>
        <div className="p-5 rounded-lg text-center" style={CARD_STYLE}>
          <p className="text-sm mb-4" style={{ color: '#fca5a5' }}>{error}</p>
          <button
            onClick={() => { setLoading(true); fetchData(); }}
            className="px-4 py-2 rounded-lg text-sm transition-opacity hover:opacity-70"
            style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[960px] mx-auto px-6 py-16">
      {/* Header */}
      <h1
        className="mb-2"
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontStyle: 'italic',
          fontSize: '28px',
          fontWeight: 400,
          color: 'var(--foreground)',
          letterSpacing: '-0.02em',
        }}
      >
        LLM Cost Monitor
      </h1>
      <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}>
        {summary?.period_days || 30}-day overview
      </p>

      {/* Controls */}
      <div className="flex items-center justify-between mb-8">
        <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
          Last updated: {lastRefresh.toLocaleTimeString()}
        </p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Auto-refresh</span>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`w-10 h-5 rounded-full transition-colors relative ${autoRefresh ? 'bg-green-500' : 'bg-gray-600'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${autoRefresh ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </label>
          <button
            onClick={() => { setLoading(true); fetchData(); }}
            className="p-1.5 rounded-lg transition-opacity hover:opacity-60"
            style={{ color: 'rgba(255,255,255,0.25)' }}
            title="Refresh now"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} className="mb-8" />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        {[
          { icon: DollarSign, color: '#10b77f', label: 'Total Cost', value: `$${(summary?.total_cost_usd || 0).toFixed(4)}`, sub: `${summary?.period_days || 30}-day period` },
          { icon: Phone, color: '#3B82F6', label: 'Total Calls', value: formatNumber(summary?.total_calls || 0), sub: 'API requests' },
          { icon: Zap, color: '#8B5CF6', label: 'Cache Hit Rate', value: `${(summary?.cache_hit_rate || 0).toFixed(1)}%`, sub: 'Prompt caching' },
          { icon: Clock, color: '#F59E0B', label: 'Avg Latency', value: avgLatency > 0 ? `${Math.round(avgLatency)}ms` : '--', sub: 'Recent calls' },
          { icon: DollarSign, color: '#06B6D4', label: 'Daily Avg', value: `$${(summary?.daily_average_usd || 0).toFixed(4)}`, sub: 'Per day average' },
          { icon: TrendingUp, color: '#EF4444', label: 'Monthly Projection', value: `$${(summary?.monthly_projection_usd || 0).toFixed(2)}`, sub: 'At current rate' },
        ].map(({ icon: Icon, color, label, value, sub }) => (
          <div key={label} className="p-5 rounded-lg" style={CARD_STYLE}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}15` }}>
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
              <span className="text-[11px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</span>
            </div>
            <p className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>{value}</p>
            <p className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{sub}</p>
          </div>
        ))}
      </div>

      {/* Cost Breakdown Table */}
      {summary && summary.breakdown.length > 0 && (
        <div className="mb-10">
          <span className="text-[11px] font-medium tracking-widest uppercase block mb-4" style={{ color: '#10b77f' }}>
            Cost Breakdown
          </span>
          <div className="rounded-lg overflow-hidden" style={CARD_STYLE}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: tableBorder }}>
                    {['Tier', 'Model', 'Service', 'Calls', 'In Tokens', 'Out Tokens', 'Cost', 'Cache'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.breakdown.map((row, i) => (
                    <tr key={i} style={{ borderBottom: i < summary.breakdown.length - 1 ? tableBorder : undefined }}>
                      <td className="px-4 py-3">{tierBadge(row.tier)}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--foreground)' }}>{row.model}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--foreground)' }}>{row.service_name}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--foreground)' }}>{row.call_count}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{formatNumber(row.total_input_tokens)}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{formatNumber(row.total_output_tokens)}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--foreground)' }}>{formatCost(row.total_cost_usd)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{row.cache_hits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Per-User Cost */}
      {userCosts && userCosts.users.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4" style={{ color: '#10b77f' }} />
            <span className="text-[11px] font-medium tracking-widest uppercase" style={{ color: '#10b77f' }}>Cost by User</span>
          </div>
          <div className="rounded-lg overflow-hidden" style={CARD_STYLE}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: tableBorder }}>
                    {['User', 'Calls', 'Tokens', 'Chat', 'Analysis', 'Extraction', 'Total'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {userCosts.users.map((user, i) => (
                    <tr key={user.user_id} style={{ borderBottom: i < userCosts.users.length - 1 ? tableBorder : undefined }}>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--foreground)' }}>{user.email}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--foreground)' }}>{user.call_count}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{formatNumber(user.total_tokens)}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{user.by_tier.chat ? formatCost(user.by_tier.chat.cost_usd) : '--'}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{user.by_tier.analysis ? formatCost(user.by_tier.analysis.cost_usd) : '--'}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{user.by_tier.extraction ? formatCost(user.by_tier.extraction.cost_usd) : '--'}</td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: 'var(--foreground)' }}>{formatCost(user.total_cost_usd)}</td>
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
        <div className="mb-10">
          <span className="text-[11px] font-medium tracking-widest uppercase block mb-4" style={{ color: '#10b77f' }}>Daily Costs</span>
          <div className="rounded-lg overflow-hidden" style={CARD_STYLE}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: tableBorder }}>
                    {['Date', 'Calls', 'Cost', 'Cache Hits', 'By Tier'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {daily.daily.map((row, i) => (
                    <tr key={row.day} style={{ borderBottom: i < daily.daily.length - 1 ? tableBorder : undefined }}>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--foreground)' }}>{row.day}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--foreground)' }}>{row.calls}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--foreground)' }}>{formatCost(row.cost_usd)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{row.cache_hits}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(row.by_tier).map(([tier, data]) => (
                            <span key={tier} className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
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
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[11px] font-medium tracking-widest uppercase" style={{ color: '#10b77f' }}>Recent Calls</span>
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>({realtime.count})</span>
          </div>
          <div className="rounded-lg overflow-hidden" style={CARD_STYLE}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: tableBorder }}>
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}><SortButton label="Time" field="created_at" /></th>
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}><SortButton label="Tier" field="tier" /></th>
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}><SortButton label="Service" field="service_name" /></th>
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}><SortButton label="Model" field="model" /></th>
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>Tokens</th>
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>Cached</th>
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}><SortButton label="Cost" field="cost_usd" /></th>
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}><SortButton label="Latency" field="latency_ms" /></th>
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>Cache</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCalls.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        No recent calls
                      </td>
                    </tr>
                  ) : (
                    sortedCalls.map((call, i) => (
                      <tr key={call.id} style={{ borderBottom: i < sortedCalls.length - 1 ? tableBorder : undefined }}>
                        <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{formatTimestamp(call.created_at)}</td>
                        <td className="px-4 py-2.5">{tierBadge(call.tier)}</td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--foreground)' }}>{call.service_name}</td>
                        <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--foreground)' }}>{call.model}</td>
                        <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{formatNumber(call.input_tokens)} / {formatNumber(call.output_tokens)}</td>
                        <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{call.cached_tokens > 0 ? formatNumber(call.cached_tokens) : '--'}</td>
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
