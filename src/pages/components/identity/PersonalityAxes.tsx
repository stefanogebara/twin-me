/**
 * PersonalityAxes — ICA Personality Dimensions (TRIBE v2 Phase B)
 * ================================================================
 * Displays the 20 data-driven personality axes extracted via Independent
 * Component Analysis from the user's memory embeddings.
 *
 * Each axis is a behavioral pattern discovered from actual data — more
 * authentic than survey-based personality scores.
 *
 * In the register: a section of rows under the ink rule, each axis a row with
 * its colour as a mark, its description and evidence behind a press. No
 * white-alpha fills (they were white labels on a white page).
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/services/api/apiBase';
import { Section, List, Empty } from '@/components/register';
import ExpandRow from './ExpandRow';

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
  /** Kept for callers; the register has no staggered reveal. */
  delay?: number;
}

const VISIBLE_DEFAULT = 5;

// Marks only, in the register's signature values (register.css): each clears
// 3:1 on the page. A mark is a dot; the label beside it is ink.
const AXIS_MARKS = ['#8179fb', '#668cc2', '#c47833', '#4c9786', '#ba70b6'];

const Dot: React.FC<{ color: string }> = ({ color }) => (
  <span style={{ width: 8, height: 8, borderRadius: 9999, background: color, display: 'block' }} />
);

const PersonalityAxes: React.FC<PersonalityAxesProps> = ({ className = '' }) => {
  const [expandedAxis, setExpandedAxis] = React.useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const { data: axes = [], isLoading } = useQuery({
    queryKey: ['personality', 'ica-axes'],
    queryFn: fetchAxes,
    staleTime: 60 * 60 * 1000, // 1 hour
    retry: 1,
  });

  if (isLoading) {
    return (
      <Section title="Personality dimensions" className={className}>
        <List><li><Empty>Finding the patterns in your data.</Empty></li></List>
      </Section>
    );
  }

  if (axes.length === 0) return null;

  return (
    <Section
      title="Personality dimensions"
      line={`${axes.length} patterns found in your data.`}
      className={className}
    >
      <List>
        {axes.slice(0, showAll ? axes.length : VISIBLE_DEFAULT).map((axis, idx) => {
          const isExpanded = expandedAxis === axis.axis_index;
          const isTop = idx < VISIBLE_DEFAULT;
          const hasMore = !!axis.description || (axis.top_memory_contents?.length ?? 0) > 0;
          return (
            <ExpandRow
              key={axis.axis_index}
              icon={<Dot color={isTop ? AXIS_MARKS[idx % AXIS_MARKS.length] : '#969394'} />}
              title={axis.label}
              open={isExpanded}
              onToggle={() => setExpandedAxis(isExpanded ? null : axis.axis_index)}
              more={hasMore ? (
                <>
                  {axis.description && <p style={{ margin: 0 }}>{axis.description}</p>}
                  {axis.top_memory_contents && axis.top_memory_contents.length > 0 && (
                    <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }} aria-label="Evidence">
                      {axis.top_memory_contents.slice(0, 2).map((mem, midx) => (
                        <li key={midx} style={{ paddingLeft: 10, marginTop: 4, borderLeft: '2px solid var(--rg-rule)' }}>
                          {mem.length > 120 ? mem.slice(0, 120) + '...' : mem}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : null}
            />
          );
        })}
      </List>

      {/* Show more / less toggle */}
      {axes.length > VISIBLE_DEFAULT && (
        <button type="button" className="n-btn n-btn--ghost" style={{ marginTop: 16 }} onClick={() => setShowAll(s => !s)}>
          {showAll ? 'Show fewer' : `Show ${axes.length - VISIBLE_DEFAULT} more`}
        </button>
      )}
    </Section>
  );
};

export default PersonalityAxes;
