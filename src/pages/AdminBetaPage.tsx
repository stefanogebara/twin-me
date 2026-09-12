/**
 * Admin Beta Monitoring Dashboard
 *
 * Read-only view of the beta program: overview metrics, department adoption,
 * and per-user activity. Backed by /api/admin/beta/{overview,users,departments}.
 * In the register: figures are rows, the two tables sit under a section
 * heading on the list's ink rule.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { RefreshCw, ArrowUpDown } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { authFetch, isAbortError } from '@/services/api/apiBase';
import { Page, PageHead, Section, List, Row, Empty } from '@/components/register';
import '@/styles/register-insights.css';

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
// Helpers
// ────────────────────────────────────────────────────────────

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

/** A figure as a row: the value, then what it counts. */
function Metric({ label, value }: { label: string; value: string }) {
  return <Row title={value} line={label} />;
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void }) {
  return (
    <th aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button type="button" onClick={onClick} className="ri-sort">
        {label}
        <ArrowUpDown aria-hidden="true" />
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

  // audit-2026-07-03: the mount effect used to fire fetchAll() with no abort
  // or dedupe, so React 18 StrictMode double-invoked it — 6 admin GETs and
  // duplicate console errors per visit. The effect now passes an AbortSignal
  // and aborts on cleanup; the first StrictMode mount's requests cancel
  // silently (isAbortError) and only the surviving mount loads data.
  const fetchAll = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, usersRes, deptsRes] = await Promise.all([
        authFetch('/admin/beta/overview', { signal }),
        authFetch('/admin/beta/users', { signal }),
        authFetch('/admin/beta/departments', { signal }),
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
      if (isAbortError(err)) return; // StrictMode remount / unmount cleanup — benign
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchAll(controller.signal);
    return () => controller.abort();
  }, [fetchAll]);

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
      <Page>
        <PageHead title="Beta" />
        <p className="rg-empty flex items-center gap-2" role="status">
          <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
          Loading
        </p>
      </Page>
    );
  }

  return (
    <Page>
      <PageHead
        title="Beta"
        line="Usage, proposals and cost per user"
        action={
          <button type="button" onClick={() => fetchAll()} disabled={loading} className="n-btn n-btn--ghost">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
        }
      />

      {error && (
        <p role="alert" className="rg-empty ri-danger" style={{ padding: '0 0 24px' }}>
          {error}
        </p>
      )}

      {/* Overview metrics */}
      <Section title="Overview" line="Cost covers the last 30 days.">
        <List className="rg-compact ri-stats">
          <Metric label="Users" value={formatNumber(overview?.totalUsers)} />
          <Metric label="Active in the last 7 days" value={formatNumber(overview?.activeUsers)} />
          <Metric label="Proposals" value={formatNumber(overview?.proposalsGenerated)} />
          <Metric label="Approval rate" value={formatPercent(overview?.approvalRate)} />
          {overview && (
            <>
              <Metric label="Approved" value={formatNumber(overview.proposalsApproved)} />
              <Metric label="Total cost" value={formatCost(overview.totalCostUSD)} />
              <Metric label="Average cost per user" value={formatCost(overview.avgCostPerUser)} />
            </>
          )}
        </List>
      </Section>

      {/* Departments */}
      <Section title="Departments" line={`${departments.length} with activity`}>
        {departments.length === 0 ? (
          <>
            <List>{null}</List>
            <Empty>No department activity yet.</Empty>
          </>
        ) : (
          <div className="ri-table-wrap">
            <table className="ri-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Users active</th>
                  <th>Proposals</th>
                  <th>Approval</th>
                  <th>Average budget</th>
                  <th>Average spent</th>
                </tr>
              </thead>
              <tbody>
                {departments.map(d => (
                  <tr key={d.department}>
                    <td className="ri-strong capitalize">{d.department}</td>
                    <td>{formatNumber(d.usersActive)}</td>
                    <td>{formatNumber(d.totalProposals)}</td>
                    <td>{formatPercent(d.approvalRate)}</td>
                    <td>{formatCost(d.avgBudget)}</td>
                    <td>{formatCost(d.avgSpent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Users */}
      <Section title="Users" line={`${users.length} ${users.length === 1 ? 'person' : 'people'}`}>
        {users.length === 0 ? (
          <>
            <List>{null}</List>
            <Empty>No beta applications yet.</Empty>
          </>
        ) : (
          <div className="ri-table-wrap">
            <table className="ri-table">
              <thead>
                <tr>
                  <SortHeader label="Email" active={sortKey === 'email'} dir={sortDir} onClick={() => toggleSort('email')} />
                  <SortHeader label="Signed up" active={sortKey === 'signupDate'} dir={sortDir} onClick={() => toggleSort('signupDate')} />
                  <th>Platforms</th>
                  <th>Departments</th>
                  <SortHeader label="Proposals" active={sortKey === 'proposalsReceived'} dir={sortDir} onClick={() => toggleSort('proposalsReceived')} />
                  <SortHeader label="Cost" active={sortKey === 'totalCostUSD'} dir={sortDir} onClick={() => toggleSort('totalCostUSD')} />
                  <SortHeader label="Last active" active={sortKey === 'lastActivity'} dir={sortDir} onClick={() => toggleSort('lastActivity')} />
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map(u => (
                  <tr key={u.id}>
                    <td className="ri-strong">
                      {u.email}
                      {u.name && <span className="ri-sub">{u.name}</span>}
                    </td>
                    <td>{formatDate(u.signupDate)}</td>
                    <td>{formatNumber(u.platformsConnected)}</td>
                    <td>{formatNumber(u.activeDepartments)}</td>
                    <td>
                      {formatNumber(u.proposalsReceived)}
                      {u.proposalsReceived > 0 && <span className="ri-q"> ({u.proposalsApproved} approved)</span>}
                    </td>
                    <td>{formatCost(u.totalCostUSD)}</td>
                    <td>{formatRelative(u.lastActivity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </Page>
  );
}

export default AdminBetaPage;
