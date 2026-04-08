/**
 * DepartmentsPage
 *
 * SoulOS Department Dashboard — control room for your AI team.
 * Shows all 7 departments with autonomy controls, budget bars,
 * and pending proposals.
 */

import React, { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { departmentsAPI } from '@/services/api/departmentsAPI';
import type { Department, Proposal } from '@/services/api/departmentsAPI';
import { getTemplates, applyTemplate as applyTemplateAPI } from '@/services/api/templatesAPI';
import type { Template } from '@/services/api/templatesAPI';
import DepartmentCard from './components/departments/DepartmentCard';
import ProposalCard from './components/departments/ProposalCard';
import TemplateCard from './components/departments/TemplateCard';
import { Loader2, Inbox } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

// ── Default department configs (used when backend isn't wired yet) ───────

const DEFAULT_DEPARTMENTS: Department[] = [
  {
    name: 'memory',
    config: { name: 'Memory', description: 'Organizes and retrieves your memories', icon: 'Brain', color: '#8B5CF6' },
    autonomyLevel: 2,
    budget: { spent: 0.04, total: 0.15 },
    actionsThisWeek: 12,
    isEnabled: true,
  },
  {
    name: 'wellbeing',
    config: { name: 'Wellbeing', description: 'Monitors health patterns and recovery', icon: 'Heart', color: '#EC4899' },
    autonomyLevel: 1,
    budget: { spent: 0.02, total: 0.10 },
    actionsThisWeek: 5,
    isEnabled: true,
  },
  {
    name: 'growth',
    config: { name: 'Growth', description: 'Tracks goals and personal development', icon: 'TrendingUp', color: '#10B981' },
    autonomyLevel: 2,
    budget: { spent: 0.03, total: 0.12 },
    actionsThisWeek: 8,
    isEnabled: true,
  },
  {
    name: 'schedule',
    config: { name: 'Schedule', description: 'Manages your time and calendar insights', icon: 'Calendar', color: '#3B82F6' },
    autonomyLevel: 1,
    budget: { spent: 0.01, total: 0.08 },
    actionsThisWeek: 3,
    isEnabled: true,
  },
  {
    name: 'social',
    config: { name: 'Social', description: 'Analyzes relationships and communication', icon: 'Users', color: '#F59E0B' },
    autonomyLevel: 0,
    budget: { spent: 0.00, total: 0.10 },
    actionsThisWeek: 0,
    isEnabled: false,
  },
  {
    name: 'privacy',
    config: { name: 'Privacy', description: 'Guards your data boundaries', icon: 'Shield', color: '#14B8A6' },
    autonomyLevel: 3,
    budget: { spent: 0.01, total: 0.05 },
    actionsThisWeek: 2,
    isEnabled: true,
  },
  {
    name: 'creativity',
    config: { name: 'Creativity', description: 'Surfaces ideas and inspiration patterns', icon: 'Lightbulb', color: '#F97316' },
    autonomyLevel: 1,
    budget: { spent: 0.02, total: 0.10 },
    actionsThisWeek: 4,
    isEnabled: true,
  },
];

const QUERY_KEYS = {
  departments: ['departments'] as const,
  proposals: ['departments', 'proposals'] as const,
  templates: ['templates'] as const,
};

const DepartmentsPage: React.FC = () => {
  useDocumentTitle('Departments');
  const queryClient = useQueryClient();
  const isDemoMode = localStorage.getItem('demo_mode') === 'true';

  // Local optimistic state for department changes
  const [localDepts, setLocalDepts] = useState<Department[] | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

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

  // Use local state if available (optimistic updates), otherwise remote
  const departments = localDepts ?? remoteDepts ?? DEFAULT_DEPARTMENTS;

  const isLoading = isDemoMode ? false : (loadingDepts && loadingProposals);

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
    // Optimistic update
    setLocalDepts((prev) => {
      const base = prev ?? departments;
      return base.map((d) =>
        d.name === name ? { ...d, autonomyLevel: level } : d
      );
    });

    try {
      await departmentsAPI.updateAutonomy(name, level);
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.departments });
    } catch (err) {
      toast.error('Failed to update autonomy level.');
      // Revert
      setLocalDepts(null);
    }
  }, [departments, queryClient]);

  const handleToggle = useCallback(async (name: string, enabled: boolean) => {
    // Optimistic update
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
      await departmentsAPI.approveProposal(id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.proposals }),
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.departments }),
      ]);
    } catch (err) {
      toast.error('Failed to approve proposal.');
    } finally {
      setActionLoadingId(null);
    }
  }, [queryClient]);

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
      // Refresh departments to reflect the new autonomy + budget settings
      setLocalDepts(null);
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.departments });
      toast.success('Template applied successfully.');
    } catch (err) {
      toast.error('Failed to apply template.');
    }
  }, [queryClient]);

  return (
    <div className="max-w-[880px] mx-auto px-4 sm:px-6 py-10 sm:py-16">

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
        Departments
      </h1>
      <p
        className="text-sm mb-8"
        style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}
      >
        Your AI team, working for you
      </p>

      {/* Total monthly budget bar */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-1.5">
          <span
            className="text-[11px] font-medium tracking-wide uppercase"
            style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
          >
            Monthly Budget
          </span>
          <span
            className="text-[11px]"
            style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif" }}
          >
            ${totalBudget.spent.toFixed(2)} / ${totalBudget.total.toFixed(2)}
          </span>
        </div>
        <div
          className="h-1.5 rounded-full overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${budgetPercent}%`,
              backgroundColor:
                budgetPercent < 50
                  ? 'rgba(34,197,94,0.7)'
                  : budgetPercent < 80
                    ? 'rgba(245,158,11,0.7)'
                    : 'rgba(239,68,68,0.7)',
            }}
          />
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border-glass)' }} className="mb-8" />

      {/* Life Operating Systems */}
      {!isLoading && templates.length > 0 && (
        <section className="mb-10">
          <h2
            className="mb-1"
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontStyle: 'italic',
              fontSize: '20px',
              fontWeight: 400,
              color: 'var(--foreground)',
              letterSpacing: '-0.02em',
            }}
          >
            Life Operating Systems
          </h2>
          <p
            className="text-[12px] mb-5"
            style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}
          >
            Pre-configured department setups for common workflows
          </p>
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:-mx-6 sm:px-6 scrollbar-thin">
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
          <div style={{ borderTop: '1px solid var(--border-glass)' }} className="mt-6 mb-2" />
        </section>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'rgba(255,255,255,0.2)' }} />
        </div>
      )}

      {/* Department grid */}
      {!isLoading && (
        <section className="mb-12">
          <h2
            className="text-[11px] font-medium tracking-widest uppercase block mb-4"
            style={{ color: 'var(--accent-vibrant)', fontFamily: 'Inter, sans-serif', fontSize: '11px', lineHeight: 'normal' }}
          >
            Your Departments
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {departments.map((dept) => (
              <DepartmentCard
                key={dept.name}
                name={dept.name}
                config={dept.config}
                autonomyLevel={dept.autonomyLevel}
                budget={dept.budget}
                actionsThisWeek={dept.actionsThisWeek}
                isEnabled={dept.isEnabled}
                onAutonomyChange={(level) => handleAutonomyChange(dept.name, level)}
                onToggle={(enabled) => handleToggle(dept.name, enabled)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Pending proposals */}
      {!isLoading && (
        <section>
          <div style={{ borderTop: '1px solid var(--border-glass)' }} className="mb-6" />
          <h2
            className="text-[11px] font-medium tracking-widest uppercase block mb-4"
            style={{ color: 'var(--accent-vibrant)', fontFamily: 'Inter, sans-serif', fontSize: '11px', lineHeight: 'normal' }}
          >
            Pending Proposals
          </h2>
          <div
            className="rounded-[20px] px-4 sm:px-5 py-4"
            style={{
              background: 'rgba(255,255,255,0.06)',
              backdropFilter: 'blur(42px)',
              WebkitBackdropFilter: 'blur(42px)',
              border: '1px solid rgba(255,255,255,0.10)',
            }}
          >
            {proposals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-3">
                <Inbox className="w-6 h-6" style={{ color: 'rgba(255,255,255,0.12)' }} />
                <p
                  className="text-sm text-center"
                  style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}
                >
                  No pending proposals. Your departments are waiting for data.
                </p>
              </div>
            ) : (
              <div>
                {proposals.map((proposal) => (
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
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default DepartmentsPage;
