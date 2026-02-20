import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
          <motion.div
            key={i}
            initial={{ scale: 0 }}
            animate={{
              scale: 1,
              backgroundColor: i < currentIndex
                ? 'rgba(232, 213, 183, 0.6)'
                : i === currentIndex
                  ? '#E8D5B7'
                  : 'rgba(232, 213, 183, 0.15)',
            }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
            className="rounded-full"
            style={{
              width: i === currentIndex ? 10 : 6,
              height: i === currentIndex ? 10 : 6,
              transition: 'width 0.3s, height 0.3s',
            }}
          />
        ))}
      </div>

      {/* Question card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQuestion.id}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
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
                fontFamily: 'var(--font-body)',
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
          <AnimatePresence>
            {typingDone && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="flex flex-wrap gap-2"
              >
                {currentQuestion.options.map((option, optIdx) => {
                  const isSelected = answers[currentQuestion.id] === option;
                  return (
                    <motion.button
                      key={option}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: optIdx * 0.08, duration: 0.3 }}
                      onClick={() => handleSelect(option)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.97 }}
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
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      {option}
                    </motion.button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default PersonalizedQuestions;
