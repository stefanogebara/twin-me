/**
 * DepartmentWidget
 *
 * Compact dashboard card showing SoulOS department status dots,
 * pending proposal count, and quick-approve actions.
 */

import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { departmentsAPI } from '@/services/api/departmentsAPI';
import type { Department, Proposal } from '@/services/api/departmentsAPI';
import { useState, useCallback } from 'react';

const LABEL_STYLE = 'text-[11px] uppercase tracking-[0.12em] font-medium mb-4';

const DEFAULT_DEPT_COLOR = 'var(--surface-solid)';
const DISABLED_COLOR = 'var(--secondary)';

export function DepartmentWidget() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [approvingId, setApprovingId] = useState<string | null>(null);

  // audit-2026-06-10: no hardcoded fallback departments — loading shows a
  // skeleton and errors are surfaced inline, never fake status chips.
  const {
    data: departments = [],
    isLoading: departmentsLoading,
    isError: departmentsError,
    refetch: refetchDepartments,
  } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => departmentsAPI.getDepartments(),
    staleTime: 30_000,
  });

  const { data: proposals = [] } = useQuery<Proposal[]>({
    queryKey: ['departments', 'proposals'],
    queryFn: () => departmentsAPI.getProposals(),
    staleTime: 30_000,
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
    <section className="mb-10 pb-10" style={{ borderBottom: '1px solid var(--border-glass)' }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className={LABEL_STYLE} style={{ color: 'var(--text-secondary)', marginBottom: 0 }}>
          YOUR AI TEAM
        </h2>
      </div>

      <div className="claura-glass rounded-[20px] px-5 py-4">
        {/* Department status chips */}
        {departmentsLoading ? (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-[22px] w-24 rounded-full bg-[var(--surface)] animate-pulse"
              />
            ))}
          </div>
        ) : departmentsError ? (
          <div className="flex items-center justify-between gap-3 mb-4">
            <p
              className="text-xs"
              style={{
                color: 'var(--text-secondary)',
                fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
              }}
            >
              Could not load your AI team.
            </p>
            <button
              onClick={() => refetchDepartments()}
              className="px-2 py-1 rounded-full text-[10px] font-medium transition-all duration-150 ease-out hover:opacity-80 active:scale-[0.97] flex-shrink-0"
              style={{
                backgroundColor: 'var(--surface)',
                color: 'var(--foreground)',
                border: 'none',
                cursor: 'pointer',
                fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
              }}
            >
              Retry
            </button>
          </div>
        ) : (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {departments.map((dept) => (
            <div
              key={dept.name}
              className="flex items-center gap-1.5 px-2 py-1 rounded-full"
              style={{
                // color-mix instead of hex-alpha suffixes: config.color may be a
                // hex, DEFAULT_DEPT_COLOR is a CSS var — suffixing breaks the var.
                background: dept.isEnabled
                  ? `color-mix(in srgb, ${dept.config.color || DEFAULT_DEPT_COLOR} 9%, transparent)`
                  : 'var(--surface)',
                border: `1px solid ${dept.isEnabled ? `color-mix(in srgb, ${dept.config.color || DEFAULT_DEPT_COLOR} 19%, transparent)` : 'var(--border-glass)'}`,
              }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: dept.isEnabled
                    ? (dept.config.color || DEFAULT_DEPT_COLOR)
                    : DISABLED_COLOR,
                }}
              />
              <span
                className="text-[10px] font-medium leading-none"
                style={{
                  color: dept.isEnabled ? 'var(--text-secondary)' : 'var(--text-muted)',
                  fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
                }}
              >
                {dept.config.name}
              </span>
            </div>
          ))}
          {pendingCount > 0 && (
            <span
              className="text-[10px] font-medium px-2 py-1 rounded-full"
              style={{
                backgroundColor: 'var(--surface-solid)',
                color: 'var(--text-secondary)',
                fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
              }}
            >
              {pendingCount} pending
            </span>
          )}
        </div>
        )}

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
                      color: 'var(--text-secondary)',
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
                    backgroundColor: 'var(--surface)',
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
              <span
                className="text-[10px]"
                style={{
                  color: 'var(--text-secondary)',
                  fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
                }}
              >
                +{proposals.length - 3} more proposals
              </span>
            )}
          </div>
        ) : !departmentsLoading && !departmentsError ? (
          <p
            className="text-xs"
            style={{
              color: 'var(--text-secondary)',
              fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
            }}
          >
            All quiet. Your departments are watching.
          </p>
        ) : null}
      </div>
    </section>
  );
}
