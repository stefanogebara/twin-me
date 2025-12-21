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
      // Small delay before completing
      setTimeout(() => {
        onComplete(getAllAnswers());
      }, 500);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-stone-950 via-violet-950/20 to-stone-950">
      {/* Header */}
      <div className="p-6 flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-white/60 hover:text-white flex items-center gap-1 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </button>

        <span className="text-white/60 text-sm">
          Question {currentIndex + 1} of {totalQuestions}
        </span>

        <button
          onClick={onSkip}
          className="text-white/60 hover:text-white flex items-center gap-1 transition-colors"
        >
          <span className="text-sm">Skip</span>
          <SkipForward className="w-4 h-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-6">
        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-violet-500 to-pink-500"
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
                <span className="px-3 py-1 bg-violet-500/20 text-violet-300 text-xs font-medium rounded-full">
                  {currentQuestion.category}
                </span>
              </motion.div>

              {/* Question */}
              <h2 className="text-2xl md:text-3xl text-white text-center font-heading" style={{ fontWeight: 400 }}>
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
                          ? "bg-gradient-to-r from-violet-500/30 to-pink-500/30 border-violet-500 text-white"
                          : "bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:border-white/20"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all",
                            isSelected
                              ? "border-violet-400 bg-violet-500"
                              : "border-white/30"
                          )}
                        >
                          {isSelected && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="w-2 h-2 bg-white rounded-full"
                            />
                          )}
                        </div>
                        <span className="text-sm md:text-base">{option.text}</span>
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
                  // Only allow going back to answered questions
                  if (i <= currentIndex) {
                    while (currentIndex > i) {
                      prevQuestion();
                    }
                  }
                }}
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  i === currentIndex
                    ? "bg-violet-500 w-6"
                    : i < currentIndex
                    ? "bg-violet-500/50"
                    : "bg-white/20"
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
              ? "text-white/20 cursor-not-allowed"
              : "text-white/60 hover:text-white hover:bg-white/10"
          )}
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>

        {isLastQuestion && hasAnsweredCurrent && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={() => onComplete(getAllAnswers())}
            className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-violet-600 to-pink-600 text-white rounded-lg font-medium"
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
