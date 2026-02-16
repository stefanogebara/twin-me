import React from 'react';
import { motion } from 'framer-motion';

interface QuickQuestion {
  id: string;
  question: string;
  options: string[];
}

export const QUICK_QUESTIONS: QuickQuestion[] = [
  {
    id: 'saturday',
    question: "It's Saturday morning, you...",
    options: ['Sleep in', 'Go for a run', 'Start a project', 'Brunch with friends'],
  },
  {
    id: 'learning',
    question: 'You learn best by...',
    options: ['Doing it myself', 'Reading about it', 'Watching someone', 'Teaching others'],
  },
  {
    id: 'workspace',
    question: 'Your dream workspace...',
    options: ['Cozy home office', 'Busy coffee shop', 'Quiet library', 'Open-plan team'],
  },
];

interface QuickQuestionCardProps {
  question: QuickQuestion;
  selectedAnswer: string | null;
  onAnswer: (questionId: string, answer: string) => void;
  index: number;
}

const QuickQuestionCard: React.FC<QuickQuestionCardProps> = ({
  question,
  selectedAnswer,
  onAnswer,
  index,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: index * 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="mb-6"
    >
      <p
        className="text-lg mb-4"
        style={{
          fontFamily: 'var(--font-heading)',
          color: 'rgba(232, 213, 183, 0.9)',
        }}
      >
        {question.question}
      </p>
      <div className="flex flex-wrap gap-2">
        {question.options.map((option) => {
          const isSelected = selectedAnswer === option;
          return (
            <motion.button
              key={option}
              onClick={() => onAnswer(question.id, option)}
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
      </div>
    </motion.div>
  );
};

export default QuickQuestionCard;
