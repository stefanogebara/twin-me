import React from 'react';

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
}) => {
  return (
    <div
      className="mb-6"
    >
      <p
        className="text-lg mb-4"
        style={{
          fontFamily: 'var(--font-heading)',
          color: 'var(--text-narrative)',
        }}
      >
        {question.question}
      </p>
      <div className="flex flex-wrap gap-2">
        {question.options.map((option) => {
          const isSelected = selectedAnswer === option;
          return (
            <button
              key={option}
              onClick={() => onAnswer(question.id, option)}
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
    </div>
  );
};

export default QuickQuestionCard;
