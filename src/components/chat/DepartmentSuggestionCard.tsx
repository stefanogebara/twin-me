/**
 * DepartmentSuggestionCard
 *
 * Compact inline card rendered when the twin suggests a department action
 * via [DEPT_SUGGEST: department="x" action="y"] tags in its response.
 * Shows department color dot, action description, and an Approve button
 * that fires a proposal creation via the departments API.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';

const DEPARTMENT_COLORS: Record<string, string> = {
  communications: '#3B82F6',
  scheduling: '#8B5CF6',
  health: '#EF4444',
  content: '#F59E0B',
  finance: '#10B981',
  research: '#6366F1',
  social: '#EC4899',
};

export interface DepartmentSuggestion {
  department: string;
  action: string;
  fullMatch: string;
}

type SuggestionState = 'idle' | 'submitting' | 'approved' | 'error';

interface DepartmentSuggestionCardProps {
  suggestion: DepartmentSuggestion;
  onApprove: (department: string, action: string) => Promise<void>;
}

export function DepartmentSuggestionCard({ suggestion, onApprove }: DepartmentSuggestionCardProps) {
  const [state, setState] = useState<SuggestionState>('idle');

  const color = DEPARTMENT_COLORS[suggestion.department] || '#6366F1';
  const displayName = suggestion.department.charAt(0).toUpperCase() + suggestion.department.slice(1);

  const handleApprove = async () => {
    setState('submitting');
    try {
      await onApprove(suggestion.department, suggestion.action);
      setState('approved');
    } catch {
      setState('error');
      // Reset to idle after a moment so user can retry
      setTimeout(() => setState('idle'), 2000);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="rounded-[16px] px-3.5 py-2.5 my-2 max-w-[400px] flex items-center gap-3"
      style={{
        backgroundColor: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderLeft: `2px solid ${color}`,
      }}
    >
      {/* Department dot + label + action */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <div
            className="w-[5px] h-[5px] rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <span
            className="text-[10px] font-medium uppercase tracking-[0.06em]"
            style={{
              color,
              fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
            }}
          >
            {displayName}
          </span>
        </div>
        <p
          className="text-[12px] leading-snug truncate"
          style={{
            color: '#D1D5DB',
            fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
          }}
          title={suggestion.action}
        >
          {suggestion.action}
        </p>
      </div>

      {/* Approve button / status */}
      <div className="flex-shrink-0">
        {state === 'idle' && (
          <button
            onClick={handleApprove}
            className="px-2.5 py-1 rounded-[100px] text-[11px] font-medium transition-all duration-150 ease-out hover:opacity-90 active:scale-[0.97]"
            style={{
              backgroundColor: '#F5F5F4',
              color: '#110f0f',
              fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
            }}
          >
            Approve
          </button>
        )}

        {state === 'submitting' && (
          <Loader2
            className="w-3.5 h-3.5 animate-spin"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          />
        )}

        {state === 'approved' && (
          <div className="flex items-center gap-1">
            <Check className="w-3.5 h-3.5" style={{ color: '#10b77f' }} />
            <span
              className="text-[10px] font-medium"
              style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
            >
              Sent
            </span>
          </div>
        )}

        {state === 'error' && (
          <span
            className="text-[10px] font-medium"
            style={{ color: 'rgba(239,68,68,0.7)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
          >
            Failed
          </span>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Parse [DEPT_SUGGEST: department="x" action="y"] tags from twin response text.
 * Returns an array of suggestions and the cleaned text with tags removed.
 */
export function parseDepartmentSuggestions(text: string): {
  suggestions: DepartmentSuggestion[];
  cleanText: string;
} {
  const regex = /\[DEPT_SUGGEST:\s*department\s*=\s*"(\w+)"\s+action\s*=\s*"([^"]+)"\s*\]/g;
  const suggestions: DepartmentSuggestion[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    suggestions.push({
      department: match[1],
      action: match[2],
      fullMatch: match[0],
    });
  }

  // Strip all matched tags from the visible text
  let cleanText = text;
  for (const s of suggestions) {
    cleanText = cleanText.replace(s.fullMatch, '');
  }
  // Clean up any triple+ newlines left behind
  cleanText = cleanText.replace(/\n{3,}/g, '\n\n').trim();

  return { suggestions, cleanText };
}
