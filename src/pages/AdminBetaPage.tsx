/**
 * Admin Beta Monitoring Dashboard
 *
 * Read-only view of the beta program: overview metrics, department adoption,
 * and per-user activity. Backed by /api/admin/beta/{overview,users,departments}.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { RefreshCw, ArrowUpDown } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { authFetch } from '@/services/api/apiBase';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface Overview {
  totalUsers: number;
  activeUsers: number;
  proposalsGenerated: number;
  proposalsApproved: number;
  approvalRate: number;
  totalCostUSD: number;
  avgCostPerUser: number;
}

interface BetaUser {
  id: string;
  userId: string | null;
  email: string;
  name: string | null;
  signupDate: string;
  activatedAt: string | null;
  platformsConnected: number;
  activeDepartments: number;
  proposalsReceived: number;
  proposalsApproved: number;
  totalCostUSD: number;
  lastActivity: string | null;
}

interface DepartmentRow {
  department: string;
  usersActive: number;
  totalProposals: number;
  approvalRate: number;
  avgBudget: number;
  avgSpent: number;
}

type UserSortKey = 'lastActivity' | 'signupDate' | 'proposalsReceived' | 'totalCostUSD' | 'email';

// ────────────────────────────────────────────────────────────
// Constants & helpers
// ────────────────────────────────────────────────────────────

const CARD_STYLE = {
  border: '1px solid var(--border-glass)',
  backgroundColor: 'rgba(255,255,255,0.02)',
} as const;
const TABLE_BORDER = '1px solid var(--border-glass)';
const SECTION_LABEL = 'text-[11px] font-medium tracking-widest uppercase';
const TH_CLASS = 'text-left py-2 px-3 font-medium';
const TH_STYLE = { color: 'var(--text-muted)' } as const;

function formatCost(usd: number | null | undefined): string {
  if (usd == null || Number.isNaN(usd)) return '—';
  if (usd === 0) return '$0';
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(4)}`;
}
function formatNumber(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US');
}
function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return '—'; }
}
function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    if (diffMs < 60000) return 'just now';
    const min = Math.floor(diffMs / 60000);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day}d ago`;
    return `${Math.floor(day / 30)}mo ago`;
  } catch { return '—'; }
}
function formatPercent(p: number | null | undefined): string {
  if (p == null || Number.isNaN(p)) return '—';
  return `${p.toFixed(1)}%`;
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] px-5 py-4" style={CARD_STYLE}>
      <div className={SECTION_LABEL} style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div
        className="mt-2"
        style={{
          fontFamily: "'Instrument Serif', serif",
          fontSize: '40px',
          lineHeight: '1',
          letterSpacing: '-0.02em',
          color: 'var(--foreground)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className={SECTION_LABEL} style={{ color: 'var(--text-muted)' }}>{label}</span>
      {count != null && (
        <span className="text-[11px]" style={{ color: 'var(--text-placeholder)' }}>({count})</span>
      )}
    </div>
  );
}

function SortHeader({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <th className={TH_CLASS} style={TH_STYLE}>
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1 hover:text-white/80 transition-colors"
        style={{ color: active ? 'var(--foreground)' : 'var(--text-muted)' }}
      >
        {label}
        <ArrowUpDown className="w-3 h-3" />
      </button>
    </th>
  );
}

// ────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────

function AdminBetaPage() {
  useDocumentTitle('Beta Admin');

  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<BetaUser[]>([]);
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<UserSortKey>('lastActivity');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, usersRes, deptsRes] = await Promise.all([
        authFetch('/admin/beta/overview'),
        authFetch('/admin/beta/users'),
        authFetch('/admin/beta/departments'),
      ]);

      if (!overviewRes.ok) {
        throw new Error(overviewRes.status === 403 ? 'Admin access required' : `Failed to load overview (${overviewRes.status})`);
      }
      if (!usersRes.ok) throw new Error(`Failed to load users (${usersRes.status})`);
      if (!deptsRes.ok) throw new Error(`Failed to load departments (${deptsRes.status})`);

      const [overviewJson, usersJson, deptsJson] = await Promise.all([
        overviewRes.json(),
        usersRes.json(),
        deptsRes.json(),
      ]);

      setOverview(overviewJson);
      setUsers(usersJson.users || []);
      setDepartments(deptsJson.departments || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const sortedUsers = useMemo(() => {
    const copy = [...users];
    copy.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const av = a[sortKey];
      const bv = b[sortKey];
      // Null-safe: nulls always sort last
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (sortKey === 'lastActivity' || sortKey === 'signupDate') {
        return (new Date(av as string).getTime() - new Date(bv as string).getTime()) * dir;
      }
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return copy;
  }, [users, sortKey, sortDir]);

  const toggleSort = useCallback((key: UserSortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }, [sortKey]);

  if (loading && !overview) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1
            className="tracking-tight"
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: '48px',
              lineHeight: '1',
              letterSpacing: '-0.02em',
              color: 'var(--foreground)',
            }}
          >
            Beta Admin
          </h1>
          <p className="text-[14px] mt-2" style={{ color: 'var(--text-secondary)' }}>
            Monitoring overview — usage, proposals, and cost per user
          </p>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-[100px] text-[13px] font-medium transition-opacity disabled:opacity-50"
          style={{
            backgroundColor: 'rgba(255,255,255,0.08)',
            color: 'var(--foreground)',
            border: '1px solid rgba(255,255,255,0.10)',
          }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div
          className="rounded-[12px] px-4 py-3 mb-6 text-[13px]"
          style={{ backgroundColor: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171' }}
        >
          {error}
        </div>
      )}

      {/* Overview metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Total Users" value={formatNumber(overview?.totalUsers)} />
        <MetricCard label="Active (7d)" value={formatNumber(overview?.activeUsers)} />
        <MetricCard label="Proposals" value={formatNumber(overview?.proposalsGenerated)} />
        <MetricCard label="Approval Rate" value={formatPercent(overview?.approvalRate)} />
      </div>

      {/* Cost row */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-10">
          <MetricCard label="Approved" value={formatNumber(overview.proposalsApproved)} />
          <MetricCard label="Total Cost (30d)" value={formatCost(overview.totalCostUSD)} />
          <MetricCard label="Avg Cost / User" value={formatCost(overview.avgCostPerUser)} />
        </div>
      )}

      {/* Departments */}
      <div className="rounded-[20px] p-5 mb-10" style={CARD_STYLE}>
        <SectionHeader label="Departments" count={departments.length} />
        {departments.length === 0 ? (
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>No department activity yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]" style={{ color: 'var(--foreground)' }}>
              <thead>
                <tr style={{ borderBottom: TABLE_BORDER }}>
                  <th className={TH_CLASS} style={TH_STYLE}>Department</th>
                  <th className={TH_CLASS} style={TH_STYLE}>Users Active</th>
                  <th className={TH_CLASS} style={TH_STYLE}>Proposals</th>
                  <th className={TH_CLASS} style={TH_STYLE}>Approval</th>
                  <th className={TH_CLASS} style={TH_STYLE}>Avg Budget</th>
                  <th className={TH_CLASS} style={TH_STYLE}>Avg Spent</th>
                </tr>
              </thead>
              <tbody>
                {departments.map(d => (
                  <tr key={d.department} style={{ borderBottom: TABLE_BORDER }}>
                    <td className="py-2 px-3 capitalize">{d.department}</td>
                    <td className="py-2 px-3">{formatNumber(d.usersActive)}</td>
                    <td className="py-2 px-3">{formatNumber(d.totalProposals)}</td>
                    <td className="py-2 px-3">{formatPercent(d.approvalRate)}</td>
                    <td className="py-2 px-3">{formatCost(d.avgBudget)}</td>
                    <td className="py-2 px-3">{formatCost(d.avgSpent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Users */}
      <div className="rounded-[20px] p-5" style={CARD_STYLE}>
        <SectionHeader label="Users" count={users.length} />
        {users.length === 0 ? (
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>No beta applications yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]" style={{ color: 'var(--foreground)' }}>
              <thead>
                <tr style={{ borderBottom: TABLE_BORDER }}>
                  <SortHeader label="Email" active={sortKey === 'email'} onClick={() => toggleSort('email')} />
                  <SortHeader label="Signed Up" active={sortKey === 'signupDate'} onClick={() => toggleSort('signupDate')} />
                  <th className={TH_CLASS} style={TH_STYLE}>Platforms</th>
                  <th className={TH_CLASS} style={TH_STYLE}>Depts</th>
                  <SortHeader label="Proposals" active={sortKey === 'proposalsReceived'} onClick={() => toggleSort('proposalsReceived')} />
                  <SortHeader label="Cost" active={sortKey === 'totalCostUSD'} onClick={() => toggleSort('totalCostUSD')} />
                  <SortHeader label="Last Active" active={sortKey === 'lastActivity'} onClick={() => toggleSort('lastActivity')} />
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map(u => (
                  <tr key={u.id} style={{ borderBottom: TABLE_BORDER }}>
                    <td className="py-2 px-3">
                      <div className="flex flex-col">
                        <span>{u.email}</span>
                        {u.name && (
                          <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{u.name}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3" style={{ color: 'var(--text-secondary)' }}>{formatDate(u.signupDate)}</td>
                    <td className="py-2 px-3">{formatNumber(u.platformsConnected)}</td>
                    <td className="py-2 px-3">{formatNumber(u.activeDepartments)}</td>
                    <td className="py-2 px-3">
                      <span>{formatNumber(u.proposalsReceived)}</span>
                      {u.proposalsReceived > 0 && (
                        <span className="text-[12px] ml-1" style={{ color: 'var(--text-muted)' }}>
                          ({u.proposalsApproved} ok)
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3">{formatCost(u.totalCostUSD)}</td>
                    <td className="py-2 px-3" style={{ color: 'var(--text-secondary)' }}>{formatRelative(u.lastActivity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminBetaPage;
