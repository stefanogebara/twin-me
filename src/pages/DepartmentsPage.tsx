/**
 * DepartmentsPage
 *
 * SoulOS Department Dashboard — clean settings-panel aesthetic.
 * Compact department list, horizontal template strip, pending proposals.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { departmentsAPI } from '@/services/api/departmentsAPI';
import type { Department, Proposal, ActivityItem } from '@/services/api/departmentsAPI';
import { getTemplates, applyTemplate as applyTemplateAPI } from '@/services/api/templatesAPI';
import type { Template } from '@/services/api/templatesAPI';
import DepartmentCard from './components/departments/DepartmentCard';
import DepartmentOnboarding from './components/departments/DepartmentOnboarding';
import ProposalCard from './components/departments/ProposalCard';
import TemplateCard from './components/departments/TemplateCard';
import ActivityFeed from './components/departments/ActivityFeed';
import InboxSummary from './components/departments/InboxSummary';
import { Loader2, Inbox, RefreshCw } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

// ── Default department configs (used when backend isn't wired yet) ───────

const DEFAULT_DEPARTMENTS: Department[] = [
  {
    name: 'communications',
    config: { name: 'Communications', description: 'Drafts and sends emails in your voice', icon: 'Mail', color: '#3B82F6' },
    autonomyLevel: 0,
    budget: { spent: 0, total: 0.15 },
    actionsThisWeek: 0,
    isEnabled: false,
  },
  {
    name: 'scheduling',
    config: { name: 'Scheduling', description: 'Optimizes your calendar and suggests focus time', icon: 'Calendar', color: '#8B5CF6' },
    autonomyLevel: 0,
    budget: { spent: 0, total: 0.10 },
    actionsThisWeek: 0,
    isEnabled: false,
  },
  {
    name: 'health',
    config: { name: 'Health', description: 'Analyzes recovery, sleep, and strain patterns', icon: 'HeartPulse', color: '#EF4444' },
    autonomyLevel: 0,
    budget: { spent: 0, total: 0.05 },
    actionsThisWeek: 0,
    isEnabled: false,
  },
  {
    name: 'content',
    config: { name: 'Content', description: 'Creates posts and drafts in your style', icon: 'PenLine', color: '#F59E0B' },
    autonomyLevel: 0,
    budget: { spent: 0, total: 0.10 },
    actionsThisWeek: 0,
    isEnabled: false,
  },
  {
    name: 'finance',
    config: { name: 'Finance', description: 'Tracks spending patterns and budget alerts', icon: 'Wallet', color: '#10B981' },
    autonomyLevel: 0,
    budget: { spent: 0, total: 0.05 },
    actionsThisWeek: 0,
    isEnabled: false,
  },
  {
    name: 'research',
    config: { name: 'Research', description: 'Deep research on topics you care about', icon: 'Search', color: '#6366F1' },
    autonomyLevel: 0,
    budget: { spent: 0, total: 0.10 },
    actionsThisWeek: 0,
    isEnabled: false,
  },
  {
    name: 'social',
    config: { name: 'Social', description: 'Maintains relationships and suggests catch-ups', icon: 'Users', color: '#EC4899' },
    autonomyLevel: 0,
    budget: { spent: 0, total: 0.05 },
    actionsThisWeek: 0,
    isEnabled: false,
  },
];

const QUERY_KEYS = {
  departments: ['departments'] as const,
  proposals: ['departments', 'proposals'] as const,
  templates: ['templates'] as const,
  activity: ['departments', 'activity'] as const,
};

const DepartmentsPage: React.FC = () => {
  useDocumentTitle('Departments');
  const queryClient = useQueryClient();
  const isDemoMode = localStorage.getItem('demo_mode') === 'true';

  // Local optimistic state for department changes
  const [localDepts, setLocalDepts] = useState<Department[] | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [heartbeatLoading, setHeartbeatLoading] = useState(false);
  const [showAllProposals, setShowAllProposals] = useState(false);

  const {
    data: remoteDepts,
    isLoading: loadingDepts,
  } = useQuery({
    queryKey: QUERY_KEYS.departments,
    queryFn: () => departmentsAPI.getDepartments(),
    staleTime: 30_000,
    enabled: !isDemoMode,
    initialData: isDemoMode ? DEFAULT_DEPARTMENTS : undefined,
  });

  const {
    data: proposals = [],
    isLoading: loadingProposals,
  } = useQuery({
    queryKey: QUERY_KEYS.proposals,
    queryFn: () => departmentsAPI.getProposals(),
    staleTime: 30_000,
    enabled: !isDemoMode,
    initialData: isDemoMode ? [] : undefined,
  });

  const {
    data: templates = [],
  } = useQuery({
    queryKey: QUERY_KEYS.templates,
    queryFn: () => getTemplates(),
    staleTime: 60_000,
    enabled: !isDemoMode,
    initialData: isDemoMode ? [] : undefined,
  });

  const {
    data: activityItems = [],
  } = useQuery({
    queryKey: QUERY_KEYS.activity,
    queryFn: () => departmentsAPI.getActivity(50),
    staleTime: 30_000,
    enabled: !isDemoMode,
    initialData: isDemoMode ? [] : undefined,
  });

  // Use local state if available (optimistic updates), otherwise remote
  const departments = localDepts ?? remoteDepts ?? DEFAULT_DEPARTMENTS;

  const isLoading = isDemoMode ? false : (loadingDepts && loadingProposals);

  // ── Group proposals by department ─────────────────────────────────────
  const VISIBLE_LIMIT = 10;
  const groupedProposals = useMemo(() => {
    const groups: Record<string, typeof proposals> = {};
    for (const p of proposals) {
      const dept = p.department || 'general';
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(p);
    }
    return groups;
  }, [proposals]);

  // ── Budget totals ──────────────────────────────────────────────────────

  const totalBudget = departments.reduce((acc, d) => ({
    spent: acc.spent + d.budget.spent,
    total: acc.total + d.budget.total,
  }), { spent: 0, total: 0 });

  const budgetPercent = totalBudget.total > 0
    ? Math.min((totalBudget.spent / totalBudget.total) * 100, 100)
    : 0;

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleAutonomyChange = useCallback(async (name: string, level: number) => {
    setLocalDepts((prev) => {
      const base = prev ?? departments;
      return base.map((d) =>
        d.name === name ? { ...d, autonomyLevel: level } : d
      );
    });

    try {
      const result = await departmentsAPI.updateAutonomy(name, level);
      if (result?.scopeUpgradeRequired) {
        toast(result.message || 'Additional permissions needed. Please reconnect in Settings.', {
          action: {
            label: 'Go to Settings',
            onClick: () => window.location.href = result.reconnectUrl || '/settings',
          },
        });
      }
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.departments });
    } catch (err) {
      toast.error('Failed to update autonomy level.');
      setLocalDepts(null);
    }
  }, [departments, queryClient]);

  const handleToggle = useCallback(async (name: string, enabled: boolean) => {
    setLocalDepts((prev) => {
      const base = prev ?? departments;
      return base.map((d) =>
        d.name === name ? { ...d, isEnabled: enabled } : d
      );
    });

    try {
      await departmentsAPI.toggleDepartment(name, enabled);
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.departments });
    } catch (err) {
      toast.error('Failed to toggle department.');
      setLocalDepts(null);
    }
  }, [departments, queryClient]);

  const handleApproveProposal = useCallback(async (id: string) => {
    setActionLoadingId(id);
    try {
      const response = await departmentsAPI.approveProposal(id);
      const proposal = proposals.find(p => p.id === id);
      const dept = proposal?.department || 'Department';
      toast.success(response?.result ? `${dept}: Action completed` : `${dept}: Approved`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.proposals }),
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.departments }),
      ]);
    } catch (err) {
      toast.error('Failed to approve proposal.');
    } finally {
      setActionLoadingId(null);
    }
  }, [queryClient, proposals]);

  const handleRejectProposal = useCallback(async (id: string) => {
    setActionLoadingId(id);
    try {
      await departmentsAPI.rejectProposal(id);
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.proposals });
    } catch (err) {
      toast.error('Failed to reject proposal.');
    } finally {
      setActionLoadingId(null);
    }
  }, [queryClient]);

  const handleApplyTemplate = useCallback(async (templateId: string) => {
    try {
      await applyTemplateAPI(templateId);
      setActiveTemplateId(templateId);
      setLocalDepts(null);
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.departments });
      toast.success('Template applied successfully.');
    } catch (err) {
      toast.error('Failed to apply template.');
    }
  }, [queryClient]);

  const handleHeartbeat = useCallback(async () => {
    setHeartbeatLoading(true);
    try {
      const result = await departmentsAPI.triggerHeartbeat();
      if (result.skipped) {
        toast('No new proposals — not enough data yet');
      } else if (result.count && result.count > 0) {
        toast(`Generated ${result.count} proposal${result.count > 1 ? 's' : ''}`);
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.proposals });
      } else {
        toast('No new proposals — not enough data yet');
      }
    } catch (err) {
      toast.error('Heartbeat check failed');
    } finally {
      setHeartbeatLoading(false);
    }
  }, [queryClient]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">

      {/* Header */}
      <div className="flex items-baseline justify-between mb-2">
        <h1
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontStyle: 'italic',
            fontSize: '28px',
            fontWeight: 400,
            color: 'var(--foreground)',
            letterSpacing: '-0.02em',
          }}
        >
          Departments
        </h1>
        {!isDemoMode && (
          <button
            onClick={handleHeartbeat}
            disabled={heartbeatLoading}
            className="flex items-center gap-1.5 text-[12px] transition-colors cursor-pointer"
            style={{
              color: 'rgba(255,255,255,0.4)',
              fontFamily: "'Inter', sans-serif",
              background: 'none',
              border: 'none',
              padding: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
          >
            {heartbeatLoading
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <RefreshCw className="w-3 h-3" />
            }
            Check now
          </button>
        )}
      </div>
      <p
        className="text-sm mb-8"
        style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}
      >
        Your AI team, working for you
      </p>

      {/* Total monthly budget bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span
            className="text-[11px] font-medium tracking-[0.12em] uppercase"
            style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}
          >
            Monthly Budget
          </span>
          <span
            className="text-[11px]"
            style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}
          >
            ${totalBudget.spent.toFixed(2)} / ${totalBudget.total.toFixed(2)}
          </span>
        </div>
        <div
          className="h-[4px] rounded-full overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${budgetPercent}%`,
              backgroundColor:
                budgetPercent < 50
                  ? 'rgba(34,197,94,0.5)'
                  : budgetPercent < 80
                    ? 'rgba(245,158,11,0.5)'
                    : 'rgba(239,68,68,0.5)',
            }}
          />
        </div>
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }} className="mb-8" />

      {/* Onboarding banner — shown when all departments are at autonomy 0 */}
      {!isLoading && departments.every(d => d.autonomyLevel === 0) && (
        <DepartmentOnboarding
          onSelectTemplate={handleApplyTemplate}
          visible={departments.every(d => d.autonomyLevel === 0)}
        />
      )}

      {/* Life Operating Systems — compact horizontal strip */}
      {!isLoading && templates.length > 0 && (
        <section className="mb-10">
          <h2
            className="text-[11px] font-medium tracking-[0.12em] uppercase mb-3"
            style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}
          >
            Life Operating Systems
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:-mx-6 sm:px-6 scrollbar-thin">
            {templates.map((t: Template) => (
              <TemplateCard
                key={t.id}
                id={t.id}
                name={t.name}
                description={t.description}
                tagline={t.tagline}
                icon={t.icon}
                color={t.color}
                departmentCount={t.departmentCount}
                totalBudget={t.totalBudget}
                isActive={activeTemplateId === t.id}
                onApply={handleApplyTemplate}
              />
            ))}
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }} className="mt-6 mb-2" />
        </section>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'rgba(255,255,255,0.2)' }} />
        </div>
      )}

      {/* Department list */}
      {!isLoading && (
        <section className="mb-10">
          <h2
            className="text-[11px] font-medium tracking-[0.12em] uppercase block mb-3"
            style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif", lineHeight: 'normal' }}
          >
            Your Departments
          </h2>
          <div className="flex flex-col gap-2">
            {departments.map((dept) => (
              <DepartmentCard
                key={dept.name}
                name={dept.name}
                config={dept.config}
                autonomyLevel={dept.autonomyLevel}
                budget={dept.budget}
                actionsThisWeek={dept.actionsThisWeek}
                isEnabled={dept.isEnabled}
                stats={dept.stats}
                expandedContent={dept.name === 'communications' ? <InboxSummary /> : undefined}
                onAutonomyChange={(level) => handleAutonomyChange(dept.name, level)}
                onToggle={(enabled) => handleToggle(dept.name, enabled)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Recent activity */}
      {!isLoading && (
        <section className="mb-10">
          <h2
            className="text-[11px] font-medium tracking-[0.12em] uppercase block mb-3"
            style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif", lineHeight: 'normal' }}
          >
            Recent Activity
          </h2>
          <ActivityFeed items={activityItems} />
        </section>
      )}

      {/* Pending proposals */}
      {!isLoading && (
        <section>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }} className="mb-6" />
          <h2
            className="text-[11px] font-medium tracking-[0.12em] uppercase block mb-3"
            style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif", lineHeight: 'normal' }}
          >
            Pending Proposals
          </h2>
          {proposals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-3">
              <Inbox className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.08)' }} />
              <p
                className="text-[13px] text-center"
                style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Inter', sans-serif" }}
              >
                No pending proposals
              </p>
            </div>
          ) : (
            <div
              className="rounded-[16px] px-4 py-3"
              style={{
                background: 'rgba(255,255,255,0.06)',
                backdropFilter: 'blur(42px)',
                WebkitBackdropFilter: 'blur(42px)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {(() => {
                let rendered = 0;
                return Object.entries(groupedProposals).map(([deptKey, deptProposals]) => {
                  const deptConfig = departments.find(d => d.name === deptKey);
                  const deptColor = deptConfig?.config?.color || deptProposals[0]?.departmentColor || '#6366F1';
                  const visible = showAllProposals ? deptProposals : deptProposals.filter(() => {
                    if (rendered >= VISIBLE_LIMIT) return false;
                    rendered++;
                    return true;
                  });
                  if (visible.length === 0) return null;
                  return (
                    <div key={deptKey} className="mb-2 last:mb-0">
                      <div className="flex items-center gap-2 pt-2 pb-1">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: deptColor }} />
                        <span className="text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: deptColor }}>
                          {deptKey} ({deptProposals.length})
                        </span>
                      </div>
                      {visible.map((proposal) => (
                        <ProposalCard
                          key={proposal.id}
                          id={proposal.id}
                          department={proposal.department}
                          departmentColor={proposal.departmentColor}
                          description={proposal.description}
                          estimatedCost={proposal.estimatedCost}
                          createdAt={proposal.createdAt}
                          onApprove={handleApproveProposal}
                          onReject={handleRejectProposal}
                        />
                      ))}
                    </div>
                  );
                });
              })()}
              {!showAllProposals && proposals.length > VISIBLE_LIMIT && (
                <button
                  onClick={() => setShowAllProposals(true)}
                  className="w-full text-center py-2 mt-1 text-[11px] font-medium transition-opacity hover:opacity-80"
                  style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}
                >
                  Show {proposals.length - VISIBLE_LIMIT} more
                </button>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default DepartmentsPage;
