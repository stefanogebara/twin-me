import React, { useState, useEffect, useRef } from 'react';
import { Brain, Heart, Palette, Users, Flame } from 'lucide-react';
import type { PersonalizedQuestion as QuestionType } from '@/services/enrichmentService';

const DOMAIN_ICONS: Record<string, React.ReactNode> = {
  motivation: <Flame className="w-4 h-4" />,
  lifestyle: <Heart className="w-4 h-4" />,
  personality: <Brain className="w-4 h-4" />,
  cultural: <Palette className="w-4 h-4" />,
  social: <Users className="w-4 h-4" />,
};

interface PersonalizedQuestionProps {
  questions: QuestionType[];
  onAnswer: (questionId: string, answer: string, domain: string) => void;
  onAllAnswered: () => void;
}

const TypewriterText: React.FC<{ text: string; onComplete?: () => void }> = ({ text, onComplete }) => {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  // Latest-callback ref: callers pass inline arrows, so putting onComplete in
  // the dep array would restart the animation on every parent re-render.
  // The ref keeps the effect keyed on `text` only while still invoking the
  // freshest callback at completion (audit-2026-07-03).
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
        onCompleteRef.current?.();
      }
    }, 30);
    return () => clearInterval(interval);
  }, [text]);

  return (
    <span>
      {displayed}
      {!done && (
        <span
          className="inline-block w-0.5 h-5 ml-0.5 align-middle animate-pulse"
          style={{ backgroundColor: 'var(--text-secondary)' }}
        />
      )}
    </span>
  );
};

const PersonalizedQuestions: React.FC<PersonalizedQuestionProps> = ({
  questions,
  onAnswer,
  onAllAnswered,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [typingDone, setTypingDone] = useState(false);
  const [reaction, setReaction] = useState<string | null>(null);

  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;

  const handleSelect = (option: string) => {
    if (!currentQuestion) return;
    if (reaction) return; // answer locked while the twin is reacting

    const newAnswers = { ...answers, [currentQuestion.id]: option };
    setAnswers(newAnswers);
    onAnswer(currentQuestion.id, option, currentQuestion.domain);

    // Sequencing 2026-08 (the Cofounder ratio): when the LLM supplied a
    // per-option reaction, the twin answers back before the next question —
    // every input visibly teaches it something. Longer dwell so it reads.
    const optionIdx = currentQuestion.options.indexOf(option);
    const twinReaction = currentQuestion.reactions?.[optionIdx] ?? null;
    setReaction(twinReaction);
    const dwell = twinReaction ? 2400 : 400;

    if (currentIndex < totalQuestions - 1) {
      setTimeout(() => {
        setCurrentIndex(prev => prev + 1);
        setTypingDone(false);
        setReaction(null);
      }, dwell);
    } else {
      // All answered
      setTimeout(() => onAllAnswered(), twinReaction ? 2400 : 500);
    }
  };

  if (!currentQuestion) return null;

  return (
    <div className="w-full">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {questions.map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width: i === currentIndex ? 10 : 6,
              height: i === currentIndex ? 10 : 6,
              backgroundColor: i < currentIndex
                ? 'var(--text-secondary)'
                : i === currentIndex
                  ? 'var(--text-primary)'
                  : 'rgba(255,255,255,0.14)',
            }}
          />
        ))}
      </div>

      {/* Question card */}
      <div
        key={currentQuestion.id}
        className="mb-6"
      >
        {/* Domain icon + label */}
        <div className="flex items-center gap-2 mb-4">
          <span style={{ color: 'var(--text-muted)' }}>
            {DOMAIN_ICONS[currentQuestion.domain] || DOMAIN_ICONS.motivation}
          </span>
          <span
            className="text-xs uppercase tracking-widest"
            style={{
              color: 'var(--text-muted)',
              fontFamily: "'Inter', sans-serif",
              letterSpacing: '0.15em',
            }}
          >
            {currentQuestion.domain}
          </span>
        </div>

        {/* Question text with typewriter */}
        <p
          className="text-lg md:text-xl mb-6 min-h-[3rem]"
          style={{
            fontFamily: 'var(--font-heading)',
            color: 'var(--text-narrative)',
            lineHeight: 1.4,
          }}
        >
          <TypewriterText
            text={currentQuestion.text}
            onComplete={() => setTypingDone(true)}
          />
        </p>

        {/* Answer options */}
        {typingDone && (
          <div
            className="flex flex-wrap gap-2"
          >
            {currentQuestion.options.map((option) => {
              const isSelected = answers[currentQuestion.id] === option;
              return (
                <button
                  key={option}
                  onClick={() => handleSelect(option)}
                  className="px-5 py-2.5 rounded-full text-sm transition-all duration-200"
                  style={{
                    backgroundColor: isSelected
                      ? 'rgba(255,255,255,0.16)'
                      : 'rgba(255,255,255,0.05)',
                    border: isSelected
                      ? '1px solid var(--text-muted)'
                      : '1px solid rgba(255,255,255,0.14)',
                    color: isSelected
                      ? 'var(--text-primary)'
                      : 'var(--text-secondary)',
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  {option}
                </button>
              );
            })}
          </div>
        )}

        {/* Twin reaction beat — the answer taught it something */}
        {reaction && (
          <p
            className="mt-5 text-[15px] animate-in fade-in duration-300"
            style={{
              fontFamily: 'var(--font-heading)',
              fontStyle: 'italic',
              color: 'var(--text-narrative)',
              lineHeight: 1.5,
            }}
          >
            {reaction}
          </p>
        )}
      </div>
    </div>
  );
};

export default PersonalizedQuestions;
