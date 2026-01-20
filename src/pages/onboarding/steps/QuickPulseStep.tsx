import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, SkipForward } from 'lucide-react';
import { useQuickAssessment, QuestionOption } from '../hooks/useQuickAssessment';
import { cn } from '@/lib/utils';

interface QuickPulseStepProps {
  onComplete: (answers: { questionId: string; trait: 'O' | 'C' | 'E' | 'A' | 'N'; value: number }[]) => void;
  onBack: () => void;
  onSkip: () => void;
}

export const QuickPulseStep: React.FC<QuickPulseStepProps> = ({ onComplete, onBack, onSkip }) => {
  const {
    currentQuestion,
    currentIndex,
    totalQuestions,
    isComplete,
    isLastQuestion,
    progress,
    answerQuestion,
    nextQuestion,
    prevQuestion,
    getSelectedAnswer,
    getAllAnswers,
    hasAnsweredCurrent
  } = useQuickAssessment();

  // Auto-advance after answering
  useEffect(() => {
    if (hasAnsweredCurrent && !isLastQuestion) {
      const timer = setTimeout(nextQuestion, 400);
      return () => clearTimeout(timer);
    }
  }, [hasAnsweredCurrent, isLastQuestion, nextQuestion]);

  // Check if complete
  useEffect(() => {
    if (isComplete) {
      onComplete(getAllAnswers());
    }
  }, [isComplete, onComplete, getAllAnswers]);

  if (!currentQuestion) {
    return null;
  }

  const selectedAnswer = getSelectedAnswer(currentQuestion.id);

  const handleOptionClick = (option: QuestionOption) => {
    answerQuestion(option);
    if (isLastQuestion) {
      setTimeout(() => {
        onComplete(getAllAnswers());
      }, 500);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#232320]">
      {/* Header */}
      <div className="p-6 flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-[rgba(193,192,182,0.5)] hover:text-[#C1C0B6] flex items-center gap-1 transition-colors"
          style={{ fontFamily: 'var(--font-ui)' }}
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </button>

        <span
          className="text-[rgba(193,192,182,0.5)] text-sm"
          style={{ fontFamily: 'var(--font-ui)' }}
        >
          Question {currentIndex + 1} of {totalQuestions}
        </span>

        <button
          onClick={onSkip}
          className="text-[rgba(193,192,182,0.5)] hover:text-[#C1C0B6] flex items-center gap-1 transition-colors"
          style={{ fontFamily: 'var(--font-ui)' }}
        >
          <span className="text-sm">Skip</span>
          <SkipForward className="w-4 h-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-6">
        <div className="h-0.5 bg-[rgba(193,192,182,0.1)] rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-[#C1C0B6]"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentQuestion.id}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              {/* Category badge */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-center"
              >
                <span
                  className="px-3 py-1 bg-[rgba(193,192,182,0.1)] text-[rgba(193,192,182,0.7)] text-xs font-medium rounded-full border border-[rgba(193,192,182,0.1)]"
                  style={{ fontFamily: 'var(--font-ui)' }}
                >
                  {currentQuestion.category}
                </span>
              </motion.div>

              {/* Question */}
              <h2
                className="text-2xl md:text-3xl text-[#C1C0B6] text-center"
                style={{ fontFamily: 'var(--font-heading)', fontWeight: 400 }}
              >
                {currentQuestion.text}
              </h2>

              {/* Options */}
              <div className="space-y-3">
                {currentQuestion.options.map((option, index) => {
                  const isSelected = selectedAnswer?.id === option.id;

                  return (
                    <motion.button
                      key={option.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      onClick={() => handleOptionClick(option)}
                      className={cn(
                        "w-full p-4 rounded-xl text-left transition-all duration-200",
                        "border backdrop-blur-sm",
                        isSelected
                          ? "bg-[rgba(193,192,182,0.15)] border-[rgba(193,192,182,0.4)] text-[#C1C0B6]"
                          : "bg-[rgba(45,45,41,0.5)] border-[rgba(193,192,182,0.1)] text-[rgba(193,192,182,0.7)] hover:bg-[rgba(45,45,41,0.7)] hover:border-[rgba(193,192,182,0.2)]"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all",
                            isSelected
                              ? "border-[#C1C0B6] bg-[#C1C0B6]"
                              : "border-[rgba(193,192,182,0.3)]"
                          )}
                        >
                          {isSelected && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="w-2 h-2 bg-[#232320] rounded-full"
                            />
                          )}
                        </div>
                        <span
                          className="text-sm md:text-base"
                          style={{ fontFamily: 'var(--font-ui)' }}
                        >
                          {option.text}
                        </span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Navigation dots */}
          <div className="flex justify-center gap-1.5 mt-12">
            {Array.from({ length: totalQuestions }).map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  if (i <= currentIndex) {
                    while (currentIndex > i) {
                      prevQuestion();
                    }
                  }
                }}
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  i === currentIndex
                    ? "bg-[#C1C0B6] w-6"
                    : i < currentIndex
                    ? "bg-[rgba(193,192,182,0.4)]"
                    : "bg-[rgba(193,192,182,0.15)]"
                )}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Navigation buttons */}
      <div className="p-6 flex justify-between">
        <button
          onClick={prevQuestion}
          disabled={currentIndex === 0}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
            currentIndex === 0
              ? "text-[rgba(193,192,182,0.2)] cursor-not-allowed"
              : "text-[rgba(193,192,182,0.5)] hover:text-[#C1C0B6] hover:bg-[rgba(193,192,182,0.05)]"
          )}
          style={{ fontFamily: 'var(--font-ui)' }}
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>

        {isLastQuestion && hasAnsweredCurrent && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={() => onComplete(getAllAnswers())}
            className="flex items-center gap-2 px-6 py-2 bg-[#C1C0B6] text-[#232320] rounded-xl font-medium shadow-[0_8px_32px_rgba(0,0,0,0.12)] hover:bg-[#D4D3CC] transition-all duration-300"
            style={{ fontFamily: 'var(--font-ui)' }}
          >
            See Results
            <ChevronRight className="w-4 h-4" />
          </motion.button>
        )}
      </div>
    </div>
  );
};

export default QuickPulseStep;
