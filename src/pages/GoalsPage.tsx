import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  Goal,
  fetchGoals,
  fetchGoalSuggestions,
  generateGoalSuggestions,
  acceptGoal,
  dismissGoal,
  completeGoal,
  createGoal,
} from '@/services/api/goalsAPI';

function timeLeft(endDate?: string): string {
  if (!endDate) return '';
  const days = Math.ceil((new Date(endDate).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return 'ended';
  if (days === 0) return 'ends today';
  return `${days}d left`;
}

function ProgressBar({ current = 0, target = 1 }: { current?: number; target?: number }) {
  const pct = Math.min(100, Math.round((current / Math.max(target, 1)) * 100));
  return (
    <div className="h-[3px] rounded-full overflow-hidden mt-2" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: 'rgba(255,255,255,0.40)' }}
      />
    </div>
  );
}

function ActiveGoalCard({ goal, onComplete }: { goal: Goal; onComplete: (id: string) => void }) {
  const [loading, setLoading] = useState(false);

  async function handleComplete() {
    setLoading(true);
    try { await onComplete(goal.id); } finally { setLoading(false); }
  }

  return (
    <div
      className="px-5 py-4 rounded-[20px]"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(42px)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-snug" style={{ color: 'var(--foreground)', fontFamily: "'Geist', 'Inter', sans-serif" }}>
            {goal.title}
          </p>
          {goal.description && (
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}>
              {goal.description}
            </p>
          )}
          {goal.target_value != null && (
            <ProgressBar current={goal.current_value} target={goal.target_value} />
          )}
          <div className="flex items-center gap-3 mt-2">
            {goal.streak_days != null && goal.streak_days > 0 && (
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}>
                {goal.streak_days}d streak
              </span>
            )}
            {goal.end_date && (
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}>
                {timeLeft(goal.end_date)}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={handleComplete}
          disabled={loading}
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-150 hover:opacity-70 active:scale-90 disabled:opacity-40"
          style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}
          aria-label="Mark complete"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function SuggestionCard({
  goal,
  onAccept,
  onDismiss,
}: {
  goal: Goal;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleAccept() {
    setLoading(true);
    try { await onAccept(goal.id); } finally { setLoading(false); }
  }

  async function handleDismiss() {
    setLoading(true);
    try { await onDismiss(goal.id); } finally { setLoading(false); }
  }

  return (
    <div
      className="px-5 py-4 rounded-[20px]"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(42px)',
      }}
    >
      <p className="text-[10px] uppercase tracking-widest mb-2 font-medium" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}>
        Suggested by your twin
      </p>
      <p className="text-sm font-medium leading-snug" style={{ color: 'var(--foreground)', fontFamily: "'Geist', 'Inter', sans-serif" }}>
        {goal.title}
      </p>
      {goal.description && (
        <p className="text-xs mt-1 leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}>
          {goal.description}
        </p>
      )}
      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={handleAccept}
          disabled={loading}
          className="px-3 py-1.5 rounded-[100px] text-xs font-medium transition-all duration-150 hover:opacity-80 active:scale-[0.97] disabled:opacity-40"
          style={{ background: 'var(--foreground)', color: '#110f0f', fontFamily: "'Inter', sans-serif" }}
        >
          Accept
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={loading}
          className="px-3 py-1.5 rounded-[100px] text-xs font-medium transition-all duration-150 hover:opacity-70 active:scale-[0.97] disabled:opacity-40"
          style={{ border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)', fontFamily: "'Inter', sans-serif" }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.15em',
  fontWeight: 500,
  color: 'var(--text-muted)',
  marginBottom: 12,
  fontFamily: "'Geist', 'Inter', sans-serif",
};

export default function GoalsPage() {
  useDocumentTitle('Goals');
  const navigate = useNavigate();
  const { user, isSignedIn } = useAuth();

  const [active, setActive] = useState<Goal[]>([]);
  const [suggestions, setSuggestions] = useState<Goal[]>([]);
  const [completed, setCompleted] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingSuggestions, setGeneratingSuggestions] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [hasTriedGeneration, setHasTriedGeneration] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const load = useCallback(async () => {
    if (!isSignedIn) return;
    setLoading(true);
    try {
      const [activeGoals, suggestedGoals, completedGoals] = await Promise.all([
        fetchGoals('active'),
        fetchGoalSuggestions(),
        fetchGoals('completed'),
      ]);
      setActive(activeGoals);
      setSuggestions(suggestedGoals);
      setCompleted(completedGoals.slice(0, 5));
    } catch (err) {
      console.error('Failed to load goals:', err);
    } finally {
      setLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => { load(); }, [load]);

  // Auto-trigger suggestion generation when the user lands on a dead page:
  // no active goals AND no pending suggestions. Runs once per mount.
  useEffect(() => {
    if (loading || !isSignedIn || hasTriedGeneration) return;
    if (active.length > 0 || suggestions.length > 0) return;

    let cancelled = false;
    setHasTriedGeneration(true);
    setGeneratingSuggestions(true);
    setSuggestionsError(null);
    generateGoalSuggestions()
      .then(fresh => {
        if (cancelled) return;
        setSuggestions(fresh);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Failed to generate goal suggestions:', err);
        setSuggestionsError(
          "I'm still learning your patterns. Connect more platforms or come back in a few days.",
        );
      })
      .finally(() => {
        if (!cancelled) setGeneratingSuggestions(false);
      });

    return () => { cancelled = true; };
  }, [loading, isSignedIn, hasTriedGeneration, active.length, suggestions.length]);

  async function handleComplete(id: string) {
    await completeGoal(id);
    await load();
  }

  async function handleAccept(id: string) {
    await acceptGoal(id);
    await load();
  }

  async function handleDismiss(id: string) {
    await dismissGoal(id);
    setSuggestions(prev => prev.filter(g => g.id !== id));
  }

  async function handleAdd() {
    const title = addTitle.trim();
    if (!title) return;
    setAdding(true);
    try {
      await createGoal(title);
      setAddTitle('');
      setShowAddForm(false);
      await load();
    } catch (err) {
      console.error('Failed to create goal:', err);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="max-w-[720px] mx-auto px-4 sm:px-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-2 pt-6 mb-8">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-lg transition-all duration-150 hover:opacity-70 active:scale-90 lg:hidden"
          style={{ color: 'rgba(255,255,255,0.35)' }}
          aria-label="Go back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 28, letterSpacing: '-0.02em', color: 'var(--foreground)', lineHeight: 1.2 }}>
          Goals
        </h1>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded-[20px] animate-pulse" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }} />
          ))}
        </div>
      ) : (
        <div className="space-y-10">
          {/* Suggestions */}
          {suggestions.length > 0 && (
            <section>
              <p style={LABEL_STYLE}>From your twin</p>
              <div className="space-y-3">
                {suggestions.map(g => (
                  <SuggestionCard key={g.id} goal={g} onAccept={handleAccept} onDismiss={handleDismiss} />
                ))}
              </div>
            </section>
          )}

          {/* Generating-suggestions shimmer (only when we have no data to show yet) */}
          {generatingSuggestions && suggestions.length === 0 && active.length === 0 && (
            <section>
              <p style={LABEL_STYLE}>From your twin</p>
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div
                    key={i}
                    className="px-5 py-4 rounded-[20px] animate-pulse"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      backdropFilter: 'blur(42px)',
                    }}
                  >
                    <div className="h-2 w-24 rounded-full mb-3" style={{ background: 'rgba(255,255,255,0.08)' }} />
                    <div className="h-3 w-3/4 rounded-full mb-2" style={{ background: 'rgba(255,255,255,0.10)' }} />
                    <div className="h-3 w-1/2 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Twin-voice empty state (only when nothing to show and we've tried) */}
          {!generatingSuggestions
            && suggestions.length === 0
            && active.length === 0
            && hasTriedGeneration && (
            <section>
              <div
                className="px-5 py-6 rounded-[20px]"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  backdropFilter: 'blur(42px)',
                }}
              >
                <p
                  className="text-sm leading-relaxed"
                  style={{
                    color: 'rgba(245,245,244,0.9)',
                    fontFamily: "'Instrument Serif', Georgia, serif",
                    fontSize: 18,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {suggestionsError
                    ?? "I'm still learning your patterns. Connect more platforms or come back in a few days, and I'll suggest goals that actually fit you."}
                </p>
                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => navigate('/connect')}
                    className="px-3 py-2 rounded-[100px] text-xs font-medium transition-all duration-150 hover:opacity-80 active:scale-[0.97]"
                    style={{ background: '#F5F5F4', color: '#110f0f', fontFamily: "'Inter', sans-serif" }}
                  >
                    Connect more platforms
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(true)}
                    className="px-3 py-2 rounded-[100px] text-xs font-medium transition-all duration-150 hover:opacity-70 active:scale-[0.97]"
                    style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif" }}
                  >
                    Add your own
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Active goals */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <p style={{ ...LABEL_STYLE, marginBottom: 0 }}>Active</p>
              <button
                type="button"
                onClick={() => setShowAddForm(v => !v)}
                className="flex items-center gap-1 text-xs font-medium transition-all duration-150 hover:opacity-70"
                style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>

            {showAddForm && (
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={addTitle}
                  onChange={e => setAddTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder="Goal title..."
                  autoFocus
                  className="flex-1 text-sm px-3 py-2 rounded-[6px] outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    color: 'var(--foreground)',
                    fontFamily: "'Inter', sans-serif",
                  }}
                />
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={adding || !addTitle.trim()}
                  className="px-3 py-2 rounded-[100px] text-xs font-medium transition-all duration-150 hover:opacity-80 disabled:opacity-40"
                  style={{ background: 'var(--foreground)', color: '#110f0f', fontFamily: "'Inter', sans-serif" }}
                >
                  {adding ? '...' : 'Add'}
                </button>
              </div>
            )}

            {active.length === 0 ? (
              // Suppress the terse text empty-state when either the shimmer
              // or the twin-voice empty card is already rendered above.
              suggestions.length === 0 && (generatingSuggestions || hasTriedGeneration) ? null : (
                <p className="text-sm py-4" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}>
                  No active goals yet. Accept a suggestion above or add one yourself.
                </p>
              )
            ) : (
              <div className="space-y-3">
                {active.map(g => (
                  <ActiveGoalCard key={g.id} goal={g} onComplete={handleComplete} />
                ))}
              </div>
            )}
          </section>

          {/* Completed */}
          {completed.length > 0 && (
            <section>
              <p style={LABEL_STYLE}>Completed</p>
              <div className="space-y-2">
                {completed.map(g => (
                  <div key={g.id} className="px-4 py-3 rounded-[12px] flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }} />
                    <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Geist', 'Inter', sans-serif", textDecoration: 'line-through' }}>
                      {g.title}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
