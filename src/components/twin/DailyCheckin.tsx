import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';

// 50 moods organized into categories for easier browsing
interface MoodEntry {
  id: string;
  label: string;
  emoji: string;
}

interface MoodCategory {
  name: string;
  emoji: string;
  moods: MoodEntry[];
}

const MOOD_CATEGORIES: MoodCategory[] = [
  {
    name: 'Energized',
    emoji: '\u26A1',
    moods: [
      { id: 'exhilarated', label: 'Exhilarated', emoji: '\uD83D\uDD25' },
      { id: 'inspired', label: 'Inspired', emoji: '\u2728' },
      { id: 'energized', label: 'Energized', emoji: '\u26A1' },
      { id: 'excited', label: 'Excited', emoji: '\uD83C\uDF89' },
      { id: 'confident', label: 'Confident', emoji: '\uD83D\uDCAA' },
      { id: 'determined', label: 'Determined', emoji: '\uD83C\uDFD4\uFE0F' },
      { id: 'proud', label: 'Proud', emoji: '\uD83E\uDD81' },
    ],
  },
  {
    name: 'Happy',
    emoji: '\uD83D\uDE0C',
    moods: [
      { id: 'content', label: 'Content', emoji: '\uD83D\uDE0C' },
      { id: 'grateful', label: 'Grateful', emoji: '\uD83D\uDE4F' },
      { id: 'peaceful', label: 'Peaceful', emoji: '\uD83D\uDD4A\uFE0F' },
      { id: 'warm', label: 'Warm', emoji: '\u2600\uFE0F' },
      { id: 'optimistic', label: 'Optimistic', emoji: '\uD83C\uDF31' },
      { id: 'loved', label: 'Loved', emoji: '\uD83D\uDC97' },
      { id: 'playful', label: 'Playful', emoji: '\uD83C\uDFAE' },
    ],
  },
  {
    name: 'Focused',
    emoji: '\uD83C\uDFAF',
    moods: [
      { id: 'focused', label: 'Focused', emoji: '\uD83C\uDFAF' },
      { id: 'curious', label: 'Curious', emoji: '\uD83D\uDD0D' },
      { id: 'creative', label: 'Creative', emoji: '\uD83C\uDFA8' },
      { id: 'present', label: 'Present', emoji: '\uD83C\uDF3F' },
    ],
  },
  {
    name: 'Reflective',
    emoji: '\uD83E\uDE9E',
    moods: [
      { id: 'reflective', label: 'Reflective', emoji: '\uD83E\uDE9E' },
      { id: 'pensive', label: 'Pensive', emoji: '\uD83D\uDCAD' },
      { id: 'ambivalent', label: 'Ambivalent', emoji: '\u2696\uFE0F' },
      { id: 'nostalgic', label: 'Nostalgic', emoji: '\uD83D\uDCF8' },
      { id: 'uncertain', label: 'Uncertain', emoji: '\u2753' },
      { id: 'vulnerable', label: 'Vulnerable', emoji: '\uD83C\uDF38' },
    ],
  },
  {
    name: 'Low Energy',
    emoji: '\uD83C\uDF2B\uFE0F',
    moods: [
      { id: 'tired', label: 'Tired', emoji: '\uD83D\uDE34' },
      { id: 'drained', label: 'Drained', emoji: '\uD83E\uDEAB' },
      { id: 'bored', label: 'Bored', emoji: '\uD83D\uDE11' },
      { id: 'numb', label: 'Numb', emoji: '\uD83C\uDF2B\uFE0F' },
      { id: 'detached', label: 'Detached', emoji: '\uD83D\uDD2E' },
      { id: 'indifferent', label: 'Indifferent', emoji: '\uD83D\uDE36' },
    ],
  },
  {
    name: 'Sad',
    emoji: '\uD83D\uDC99',
    moods: [
      { id: 'sad', label: 'Sad', emoji: '\uD83D\uDC99' },
      { id: 'lonely', label: 'Lonely', emoji: '\uD83E\uDEC2' },
      { id: 'melancholy', label: 'Melancholy', emoji: '\uD83C\uDF27\uFE0F' },
      { id: 'disappointed', label: 'Disappointed', emoji: '\uD83D\uDE14' },
      { id: 'heavy', label: 'Heavy', emoji: '\uD83E\uDEA8' },
      { id: 'withdrawn', label: 'Withdrawn', emoji: '\uD83D\uDC1A' },
      { id: 'hopeless', label: 'Hopeless', emoji: '\uD83C\uDF11' },
      { id: 'guilty', label: 'Guilty', emoji: '\uD83D\uDE23' },
    ],
  },
  {
    name: 'Anxious',
    emoji: '\uD83D\uDE30',
    moods: [
      { id: 'anxious', label: 'Anxious', emoji: '\uD83D\uDE30' },
      { id: 'stressed', label: 'Stressed', emoji: '\uD83C\uDF21\uFE0F' },
      { id: 'overwhelmed', label: 'Overwhelmed', emoji: '\uD83C\uDF0A' },
      { id: 'restless', label: 'Restless', emoji: '\uD83C\uDF00' },
      { id: 'scattered', label: 'Scattered', emoji: '\uD83C\uDF2A\uFE0F' },
      { id: 'tense', label: 'Tense', emoji: '\uD83E\uDE22' },
      { id: 'panicked', label: 'Panicked', emoji: '\uD83D\uDEA8' },
    ],
  },
  {
    name: 'Frustrated',
    emoji: '\uD83D\uDE24',
    moods: [
      { id: 'frustrated', label: 'Frustrated', emoji: '\uD83D\uDE24' },
      { id: 'angry', label: 'Angry', emoji: '\uD83D\uDD34' },
      { id: 'irritable', label: 'Irritable', emoji: '\u26A1' },
      { id: 'impatient', label: 'Impatient', emoji: '\u23F0' },
      { id: 'defensive', label: 'Defensive', emoji: '\uD83D\uDEE1\uFE0F' },
    ],
  },
];

// Flat list for lookup after selection
const ALL_MOODS = MOOD_CATEGORIES.flatMap(c => c.moods);

type Mood = MoodEntry;

interface DailyCheckinProps {
  onComplete: () => void;
}

export function DailyCheckin({ onComplete }: DailyCheckinProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const handleSelect = async (mood: Mood) => {
    if (submitting || done) return;

    setSelectedId(mood.id);
    setSubmitting(true);
    setError(null);

    try {
      const res = await authFetch('/checkin', {
        method: 'POST',
        body: JSON.stringify({ mood: mood.label, moodEmoji: mood.emoji }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || 'Failed to save check-in');
      }

      setDone(true);
      setTimeout(onComplete, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSelectedId(null);
      setSubmitting(false);
    }
  };

  const selectedMood = ALL_MOODS.find((m) => m.id === selectedId);

  if (done && selectedMood) {
    return (
      <div className="text-center py-4">
        <div className="text-2xl mb-1">{selectedMood.emoji}</div>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Your twin knows how you're feeling
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
          How are you feeling right now?
        </h3>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Your twin will remember this
        </p>
      </div>

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      <div className="max-h-56 overflow-y-auto pr-1 space-y-1">
        {MOOD_CATEGORIES.map((category) => {
          const isExpanded = expandedCategory === category.name;
          return (
            <div key={category.name}>
              <button
                onClick={() => setExpandedCategory(isExpanded ? null : category.name)}
                disabled={submitting}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-black/4"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <span>{category.emoji}</span>
                  <span>{category.name}</span>
                  <span className="text-[10px] opacity-50">({category.moods.length})</span>
                </span>
                <ChevronDown
                  className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                />
              </button>
              {isExpanded && (
                <div className="flex flex-wrap gap-1.5 px-2 py-1.5">
                  {category.moods.map((mood) => (
                    <button
                      key={mood.id}
                      onClick={() => handleSelect(mood)}
                      disabled={submitting}
                      className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors
                        ${selectedId === mood.id
                          ? 'bg-[#f0e8d9] text-[#3d2f1a] font-medium ring-1 ring-[#C4A265]/50'
                          : 'bg-black/4 hover:bg-black/8 text-[#5C5851]'
                        }
                        ${submitting ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}
                      `}
                    >
                      <span>{mood.emoji}</span>
                      <span>{mood.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
