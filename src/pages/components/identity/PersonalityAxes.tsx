/**
 * PersonalityAxes — ICA Personality Dimensions (TRIBE v2 Phase B)
 * ================================================================
 * Displays the 20 data-driven personality axes extracted via Independent
 * Component Analysis from the user's memory embeddings.
 *
 * Each axis is a behavioral pattern discovered from actual data — more
 * authentic than survey-based personality scores.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Brain, ChevronRight, Loader2 } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';

interface PersonalityAxis {
  axis_index: number;
  label: string;
  description: string;
  variance_explained: number;
  top_memory_contents?: string[];
}

async function fetchAxes(): Promise<PersonalityAxis[]> {
  const res = await authFetch('/tribe/ica-axes');
  if (!res.ok) return [];
  const json = await res.json();
  const axes = json.data?.axes || json.data || [];
  return axes.filter((a: PersonalityAxis) => a.label && !a.label.startsWith('Axis '));
}

interface PersonalityAxesProps {
  className?: string;
  delay?: number;
}

const PersonalityAxes: React.FC<PersonalityAxesProps> = ({ className = '', delay = 0.38 }) => {
  const [expandedAxis, setExpandedAxis] = React.useState<number | null>(null);

  const { data: axes = [], isLoading } = useQuery({
    queryKey: ['personality', 'ica-axes'],
    queryFn: fetchAxes,
    staleTime: 60 * 60 * 1000, // 1 hour
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className={`mb-20 ${className}`}>
        <div className="flex items-center gap-2 mb-4">
          <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'rgba(255,255,255,0.3)' }} />
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}>
            Analyzing personality dimensions...
          </span>
        </div>
      </div>
    );
  }

  if (axes.length === 0) return null;

  // Color palette — muted, sophisticated
  const axisColors = [
    'rgba(199,146,234,0.7)', // lavender
    'rgba(130,170,255,0.7)', // periwinkle
    'rgba(255,183,130,0.7)', // peach
    'rgba(120,200,170,0.7)', // sage
    'rgba(255,140,160,0.7)', // rose
    'rgba(170,200,130,0.7)', // moss
    'rgba(200,160,120,0.7)', // copper
    'rgba(140,180,220,0.7)', // steel blue
    'rgba(220,170,200,0.7)', // mauve
    'rgba(180,220,160,0.7)', // lime
  ];

  return (
    <motion.div
      className={`mb-20 ${className}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
    >
      {/* Section label */}
      <div className="flex items-center gap-2 mb-4">
        <Brain className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.25)' }} />
        <span
          className="text-[11px] uppercase tracking-[0.12em] font-medium"
          style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
        >
          Personality Dimensions
        </span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full"
          style={{ color: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)' }}
        >
          ICA
        </span>
      </div>

      {/* Subtitle */}
      <p
        className="text-sm mb-5"
        style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}
      >
        {axes.length} behavioral patterns discovered from your data
      </p>

      {/* Axes grid */}
      <div className="space-y-2">
        {axes.slice(0, 12).map((axis, idx) => {
          const isExpanded = expandedAxis === axis.axis_index;
          const color = axisColors[idx % axisColors.length];

          return (
            <motion.div
              key={axis.axis_index}
              layout
              className="cursor-pointer group"
              onClick={() => setExpandedAxis(isExpanded ? null : axis.axis_index)}
            >
              <div
                className="px-5 py-4 rounded-[20px] transition-all duration-200"
                style={{
                  background: isExpanded ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${isExpanded ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.10)'}`,
                }}
              >
                {/* Axis header */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    className="text-sm font-medium flex-1"
                    style={{
                      color: 'var(--foreground)',
                      fontFamily: "'Inter', sans-serif",
                      opacity: 0.85,
                    }}
                  >
                    {axis.label}
                  </span>
                  <ChevronRight
                    className="w-3.5 h-3.5 transition-transform duration-200 flex-shrink-0"
                    style={{
                      color: 'rgba(255,255,255,0.2)',
                      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    }}
                  />
                </div>

                {/* Expanded description */}
                {isExpanded && axis.description && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-2 ml-5"
                  >
                    <p
                      className="text-xs leading-relaxed"
                      style={{ color: 'rgba(255,255,255,0.45)', fontFamily: "'Inter', sans-serif" }}
                    >
                      {axis.description}
                    </p>
                    {axis.top_memory_contents && axis.top_memory_contents.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.2)' }}>
                          Evidence
                        </span>
                        {axis.top_memory_contents.slice(0, 3).map((mem, midx) => (
                          <p
                            key={midx}
                            className="text-[11px] pl-2"
                            style={{
                              color: 'rgba(255,255,255,0.3)',
                              fontFamily: "'Inter', sans-serif",
                              borderLeft: `2px solid ${color}`,
                            }}
                          >
                            {mem.length > 120 ? mem.slice(0, 120) + '...' : mem}
                          </p>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Show more indicator */}
      {axes.length > 12 && (
        <p
          className="text-xs mt-3 text-center"
          style={{ color: 'rgba(255,255,255,0.2)', fontFamily: "'Inter', sans-serif" }}
        >
          +{axes.length - 12} more dimensions
        </p>
      )}
    </motion.div>
  );
};

export default PersonalityAxes;
