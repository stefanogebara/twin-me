/**
 * DepartmentWidget
 *
 * Compact dashboard card showing SoulOS department status dots,
 * pending proposal count, and quick-approve actions.
 */

import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutGrid, Check } from 'lucide-react';
import { toast } from 'sonner';
import { departmentsAPI } from '@/services/api/departmentsAPI';
import type { Department, Proposal } from '@/services/api/departmentsAPI';
import { useState, useCallback } from 'react';

const LABEL_STYLE = 'text-[11px] uppercase tracking-[0.15em] font-medium mb-4';

const DEFAULT_DEPT_COLOR = 'rgba(255,255,255,0.15)';
const DISABLED_COLOR = 'rgba(255,255,255,0.08)';

// Fallback departments for demo mode or when API isn't wired
const FALLBACK_DEPARTMENTS: Department[] = [
  { name: 'memory', config: { name: 'Memory', description: '', icon: 'Brain', color: '#8B5CF6' }, autonomyLevel: 2, budget: { spent: 0.04, total: 0.15 }, actionsThisWeek: 12, isEnabled: true },
  { name: 'wellbeing', config: { name: 'Wellbeing', description: '', icon: 'Heart', color: '#EC4899' }, autonomyLevel: 1, budget: { spent: 0.02, total: 0.10 }, actionsThisWeek: 5, isEnabled: true },
  { name: 'growth', config: { name: 'Growth', description: '', icon: 'TrendingUp', color: '#10B981' }, autonomyLevel: 2, budget: { spent: 0.03, total: 0.12 }, actionsThisWeek: 8, isEnabled: true },
  { name: 'schedule', config: { name: 'Schedule', description: '', icon: 'Calendar', color: '#3B82F6' }, autonomyLevel: 1, budget: { spent: 0.01, total: 0.08 }, actionsThisWeek: 3, isEnabled: true },
  { name: 'social', config: { name: 'Social', description: '', icon: 'Users', color: '#F59E0B' }, autonomyLevel: 0, budget: { spent: 0, total: 0.10 }, actionsThisWeek: 0, isEnabled: false },
  { name: 'privacy', config: { name: 'Privacy', description: '', icon: 'Shield', color: '#14B8A6' }, autonomyLevel: 3, budget: { spent: 0.01, total: 0.05 }, actionsThisWeek: 2, isEnabled: true },
  { name: 'creativity', config: { name: 'Creativity', description: '', icon: 'Lightbulb', color: '#F97316' }, autonomyLevel: 1, budget: { spent: 0.02, total: 0.10 }, actionsThisWeek: 4, isEnabled: true },
];

export function DepartmentWidget() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isDemoMode = localStorage.getItem('demo_mode') === 'true';

  const [approvingId, setApprovingId] = useState<string | null>(null);

  const { data: departments = FALLBACK_DEPARTMENTS } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => departmentsAPI.getDepartments(),
    staleTime: 30_000,
    enabled: !isDemoMode,
    initialData: isDemoMode ? FALLBACK_DEPARTMENTS : undefined,
  });

  const { data: proposals = [] } = useQuery<Proposal[]>({
    queryKey: ['departments', 'proposals'],
    queryFn: () => departmentsAPI.getProposals(),
    staleTime: 30_000,
    enabled: !isDemoMode,
    initialData: isDemoMode ? [] : undefined,
  });

  const handleApprove = useCallback(async (id: string) => {
    setApprovingId(id);
    try {
      await departmentsAPI.approveProposal(id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['departments', 'proposals'] }),
        queryClient.invalidateQueries({ queryKey: ['departments'] }),
      ]);
    } catch {
      toast.error('Failed to approve proposal.');
    } finally {
      setApprovingId(null);
    }
  }, [queryClient]);

  const pendingCount = proposals.length;

  return (
    <section className="mb-10 pb-10" style={{ borderBottom: '1px solid var(--glass-surface-border)' }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className={LABEL_STYLE} style={{ color: 'var(--text-muted)', marginBottom: 0 }}>
          YOUR AI TEAM
        </h2>
        <button
          onClick={() => navigate('/departments')}
          className="text-[11px] font-medium transition-all duration-150 ease-out hover:brightness-150 active:scale-[0.97]"
          style={{
            color: 'var(--text-secondary)',
            fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          View all
        </button>
      </div>

      <div
        className="rounded-[20px] px-5 py-4"
        style={{
          background: 'rgba(255,255,255,0.06)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {/* Department status dots */}
        <div className="flex items-center gap-3 mb-3">
          <LayoutGrid
            className="w-4 h-4 flex-shrink-0"
            style={{ color: 'rgba(255,255,255,0.35)' }}
          />
          <div className="flex items-center gap-2">
            {departments.map((dept) => (
              <div
                key={dept.name}
                title={`${dept.config.name}${dept.isEnabled ? '' : ' (off)'}`}
                className="w-2.5 h-2.5 rounded-full transition-colors duration-200"
                style={{
                  backgroundColor: dept.isEnabled
                    ? (dept.config.color || DEFAULT_DEPT_COLOR)
                    : DISABLED_COLOR,
                }}
              />
            ))}
          </div>
          {pendingCount > 0 && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: 'rgba(255,132,0,0.15)',
                color: '#ff8400',
                fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
              }}
            >
              {pendingCount} pending
            </span>
          )}
        </div>

        {/* Pending proposals (compact) */}
        {proposals.length > 0 ? (
          <div className="space-y-2">
            {proposals.slice(0, 3).map((proposal) => (
              <div
                key={proposal.id}
                className="flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: proposal.departmentColor || DEFAULT_DEPT_COLOR }}
                  />
                  <p
                    className="text-xs truncate"
                    style={{
                      color: 'rgba(255,255,255,0.55)',
                      fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
                    }}
                  >
                    {proposal.description}
                  </p>
                </div>
                <button
                  onClick={() => handleApprove(proposal.id)}
                  disabled={approvingId === proposal.id}
                  className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium transition-all duration-150 ease-out hover:opacity-80 active:scale-[0.97] flex-shrink-0 disabled:opacity-40"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    color: 'var(--foreground)',
                    border: 'none',
                    cursor: approvingId === proposal.id ? 'wait' : 'pointer',
                    fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
                  }}
                >
                  <Check className="w-3 h-3" />
                  Approve
                </button>
              </div>
            ))}
            {proposals.length > 3 && (
              <button
                onClick={() => navigate('/departments')}
                className="text-[10px] transition-all duration-150 ease-out hover:brightness-150"
                style={{
                  color: 'rgba(255,255,255,0.35)',
                  fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                +{proposals.length - 3} more proposals
              </button>
            )}
          </div>
        ) : (
          <p
            className="text-xs"
            style={{
              color: 'rgba(255,255,255,0.3)',
              fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
            }}
          >
            All quiet. Your departments are watching.
          </p>
        )}
      </div>
    </section>
  );
}
