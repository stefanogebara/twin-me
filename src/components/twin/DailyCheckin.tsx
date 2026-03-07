import { useState } from 'react';
import { motion } from 'framer-motion';
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
    emoji: '⚡',
    moods: [
      { id: 'exhilarated', label: 'Exhilarated', emoji: '🔥' },
      { id: 'inspired', label: 'Inspired', emoji: '✨' },
      { id: 'energized', label: 'Energized', emoji: '⚡' },
      { id: 'excited', label: 'Excited', emoji: '🎉' },
      { id: 'confident', label: 'Confident', emoji: '💪' },
      { id: 'determined', label: 'Determined', emoji: '🏔️' },
      { id: 'proud', label: 'Proud', emoji: '🦁' },
    ],
  },
  {
    name: 'Happy',
    emoji: '😌',
    moods: [
      { id: 'content', label: 'Content', emoji: '😌' },
      { id: 'grateful', label: 'Grateful', emoji: '🙏' },
      { id: 'peaceful', label: 'Peaceful', emoji: '🕊️' },
      { id: 'warm', label: 'Warm', emoji: '☀️' },
      { id: 'optimistic', label: 'Optimistic', emoji: '🌱' },
      { id: 'loved', label: 'Loved', emoji: '💗' },
      { id: 'playful', label: 'Playful', emoji: '🎮' },
    ],
  },
  {
    name: 'Focused',
    emoji: '🎯',
    moods: [
      { id: 'focused', label: 'Focused', emoji: '🎯' },
      { id: 'curious', label: 'Curious', emoji: '🔍' },
      { id: 'creative', label: 'Creative', emoji: '🎨' },
      { id: 'present', label: 'Present', emoji: '🌿' },
    ],
  },
  {
    name: 'Reflective',
    emoji: '🪞',
    moods: [
      { id: 'reflective', label: 'Reflective', emoji: '🪞' },
      { id: 'pensive', label: 'Pensive', emoji: '💭' },
      { id: 'ambivalent', label: 'Ambivalent', emoji: '⚖️' },
      { id: 'nostalgic', label: 'Nostalgic', emoji: '📸' },
      { id: 'uncertain', label: 'Uncertain', emoji: '❓' },
      { id: 'vulnerable', label: 'Vulnerable', emoji: '🌸' },
    ],
  },
  {
    name: 'Low Energy',
    emoji: '🌫️',
    moods: [
      { id: 'tired', label: 'Tired', emoji: '😴' },
      { id: 'drained', label: 'Drained', emoji: '🪫' },
      { id: 'bored', label: 'Bored', emoji: '😑' },
      { id: 'numb', label: 'Numb', emoji: '🌫️' },
      { id: 'detached', label: 'Detached', emoji: '🔮' },
      { id: 'indifferent', label: 'Indifferent', emoji: '😶' },
    ],
  },
  {
    name: 'Sad',
    emoji: '💙',
    moods: [
      { id: 'sad', label: 'Sad', emoji: '💙' },
      { id: 'lonely', label: 'Lonely', emoji: '🫂' },
      { id: 'melancholy', label: 'Melancholy', emoji: '🌧️' },
      { id: 'disappointed', label: 'Disappointed', emoji: '😔' },
      { id: 'heavy', label: 'Heavy', emoji: '🪨' },
      { id: 'withdrawn', label: 'Withdrawn', emoji: '🐚' },
      { id: 'hopeless', label: 'Hopeless', emoji: '🌑' },
      { id: 'guilty', label: 'Guilty', emoji: '😣' },
    ],
  },
  {
    name: 'Anxious',
    emoji: '😰',
    moods: [
      { id: 'anxious', label: 'Anxious', emoji: '😰' },
      { id: 'stressed', label: 'Stressed', emoji: '🌡️' },
      { id: 'overwhelmed', label: 'Overwhelmed', emoji: '🌊' },
      { id: 'restless', label: 'Restless', emoji: '🌀' },
      { id: 'scattered', label: 'Scattered', emoji: '🌪️' },
      { id: 'tense', label: 'Tense', emoji: '🪢' },
      { id: 'panicked', label: 'Panicked', emoji: '🚨' },
    ],
  },
  {
    name: 'Frustrated',
    emoji: '😤',
    moods: [
      { id: 'frustrated', label: 'Frustrated', emoji: '😤' },
      { id: 'angry', label: 'Angry', emoji: '🔴' },
      { id: 'irritable', label: 'Irritable', emoji: '⚡' },
      { id: 'impatient', label: 'Impatient', emoji: '⏰' },
      { id: 'defensive', label: 'Defensive', emoji: '🛡️' },
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
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="text-center py-4"
      >
        <div className="text-2xl mb-1">{selectedMood.emoji}</div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Your twin knows how you're feeling
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
          How are you feeling right now?
        </h3>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
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
                style={{ color: 'var(--text-secondary)' }}
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
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-wrap gap-1.5 px-2 py-1.5"
                >
                  {category.moods.map((mood) => (
                    <motion.button
                      key={mood.id}
                      whileHover={{ scale: submitting ? 1 : 1.05 }}
                      whileTap={{ scale: submitting ? 1 : 0.95 }}
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
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
