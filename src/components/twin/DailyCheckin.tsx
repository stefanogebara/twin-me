import { useState } from 'react';
import { motion } from 'framer-motion';
import { authFetch } from '@/services/api/apiBase';

// 50 moods across the full emotional spectrum, organized by valence/arousal quadrant
const MOODS = [
  // High energy positive
  { id: 'exhilarated', label: 'Exhilarated', emoji: '🔥' },
  { id: 'inspired', label: 'Inspired', emoji: '✨' },
  { id: 'energized', label: 'Energized', emoji: '⚡' },
  { id: 'excited', label: 'Excited', emoji: '🎉' },
  { id: 'confident', label: 'Confident', emoji: '💪' },
  // Positive calm
  { id: 'content', label: 'Content', emoji: '😌' },
  { id: 'grateful', label: 'Grateful', emoji: '🙏' },
  { id: 'peaceful', label: 'Peaceful', emoji: '🕊️' },
  { id: 'focused', label: 'Focused', emoji: '🎯' },
  { id: 'curious', label: 'Curious', emoji: '🔍' },
  { id: 'playful', label: 'Playful', emoji: '🎮' },
  { id: 'creative', label: 'Creative', emoji: '🎨' },
  { id: 'present', label: 'Present', emoji: '🌿' },
  { id: 'warm', label: 'Warm', emoji: '☀️' },
  { id: 'optimistic', label: 'Optimistic', emoji: '🌱' },
  // Neutral / Mixed
  { id: 'reflective', label: 'Reflective', emoji: '🪞' },
  { id: 'pensive', label: 'Pensive', emoji: '💭' },
  { id: 'ambivalent', label: 'Ambivalent', emoji: '⚖️' },
  { id: 'nostalgic', label: 'Nostalgic', emoji: '📸' },
  { id: 'numb', label: 'Numb', emoji: '🌫️' },
  { id: 'detached', label: 'Detached', emoji: '🔮' },
  { id: 'indifferent', label: 'Indifferent', emoji: '😶' },
  { id: 'restless', label: 'Restless', emoji: '🌀' },
  { id: 'scattered', label: 'Scattered', emoji: '🌪️' },
  { id: 'uncertain', label: 'Uncertain', emoji: '❓' },
  // Low energy negative
  { id: 'tired', label: 'Tired', emoji: '😴' },
  { id: 'drained', label: 'Drained', emoji: '🪫' },
  { id: 'bored', label: 'Bored', emoji: '😑' },
  { id: 'lonely', label: 'Lonely', emoji: '🫂' },
  { id: 'melancholy', label: 'Melancholy', emoji: '🌧️' },
  { id: 'sad', label: 'Sad', emoji: '💙' },
  { id: 'disappointed', label: 'Disappointed', emoji: '😔' },
  { id: 'heavy', label: 'Heavy', emoji: '🪨' },
  { id: 'withdrawn', label: 'Withdrawn', emoji: '🐚' },
  { id: 'hopeless', label: 'Hopeless', emoji: '🌑' },
  // High energy negative
  { id: 'anxious', label: 'Anxious', emoji: '😰' },
  { id: 'stressed', label: 'Stressed', emoji: '🌡️' },
  { id: 'overwhelmed', label: 'Overwhelmed', emoji: '🌊' },
  { id: 'frustrated', label: 'Frustrated', emoji: '😤' },
  { id: 'angry', label: 'Angry', emoji: '🔴' },
  { id: 'irritable', label: 'Irritable', emoji: '⚡' },
  { id: 'impatient', label: 'Impatient', emoji: '⏰' },
  { id: 'defensive', label: 'Defensive', emoji: '🛡️' },
  { id: 'tense', label: 'Tense', emoji: '🪢' },
  { id: 'panicked', label: 'Panicked', emoji: '🚨' },
  // Vivid / specific states
  { id: 'vulnerable', label: 'Vulnerable', emoji: '🌸' },
  { id: 'determined', label: 'Determined', emoji: '🏔️' },
  { id: 'proud', label: 'Proud', emoji: '🦁' },
  { id: 'guilty', label: 'Guilty', emoji: '😣' },
  { id: 'loved', label: 'Loved', emoji: '💗' },
] as const;

type Mood = typeof MOODS[number];

interface DailyCheckinProps {
  onComplete: () => void;
}

export function DailyCheckin({ onComplete }: DailyCheckinProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const selectedMood = MOODS.find((m) => m.id === selectedId);

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

      <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
        {MOODS.map((mood) => (
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
      </div>
    </div>
  );
}
