import React, { useState, useEffect } from 'react';
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
        onComplete?.();
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
          style={{ backgroundColor: 'rgba(232, 213, 183, 0.6)' }}
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

  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;

  const handleSelect = (option: string) => {
    if (!currentQuestion) return;

    const newAnswers = { ...answers, [currentQuestion.id]: option };
    setAnswers(newAnswers);
    onAnswer(currentQuestion.id, option, currentQuestion.domain);

    // Advance to next question after a brief pause
    if (currentIndex < totalQuestions - 1) {
      setTimeout(() => {
        setCurrentIndex(prev => prev + 1);
        setTypingDone(false);
      }, 400);
    } else {
      // All answered
      setTimeout(() => onAllAnswered(), 500);
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
                ? 'rgba(232, 213, 183, 0.6)'
                : i === currentIndex
                  ? '#E8D5B7'
                  : 'rgba(232, 213, 183, 0.15)',
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
          <span style={{ color: 'rgba(232, 213, 183, 0.4)' }}>
            {DOMAIN_ICONS[currentQuestion.domain] || DOMAIN_ICONS.motivation}
          </span>
          <span
            className="text-xs uppercase tracking-widest"
            style={{
              color: 'rgba(232, 213, 183, 0.35)',
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
            color: 'rgba(232, 213, 183, 0.9)',
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
                      ? 'rgba(232, 213, 183, 0.2)'
                      : 'rgba(232, 213, 183, 0.05)',
                    border: isSelected
                      ? '1px solid rgba(232, 213, 183, 0.5)'
                      : '1px solid rgba(232, 213, 183, 0.15)',
                    color: isSelected
                      ? '#E8D5B7'
                      : 'rgba(232, 213, 183, 0.7)',
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  {option}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PersonalizedQuestions;
