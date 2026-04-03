import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, Check, SkipForward } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';
import { useAuth } from '@/contexts/AuthContext';
import { usePlatformStatus } from '@/hooks/usePlatformStatus';
import { CATEGORY_TOOLTIPS, CATEGORY_STARTERS } from './SoulInterviewHelpers';

interface ExtractedFact {
  text: string;
  visible: boolean;
}

interface SoulInterviewProps {
  onClose: () => void;
  onComplete: () => void;
}

export function SoulInterview({ onClose, onComplete }: SoulInterviewProps) {
  const { user } = useAuth();
  const { connectedProviders } = usePlatformStatus(user?.id);

  const [question, setQuestion] = useState('');
  const [category, setCategory] = useState('');
  const [categoryLabel, setCategoryLabel] = useState('');
  const [answer, setAnswer] = useState('');
  const [answeredCategories, setAnsweredCategories] = useState<string[]>([]);
  const [totalAvailable, setTotalAvailable] = useState(10);
  const [remaining, setRemaining] = useState(10);

  const [isLoadingQuestion, setIsLoadingQuestion] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [extractedFacts, setExtractedFacts] = useState<ExtractedFact[]>([]);
  const [showFacts, setShowFacts] = useState(false);

  const [isDone, setIsDone] = useState(false);
  const [summary, setSummary] = useState('');
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchNextQuestion = useCallback(async (answered: string[]) => {
    setIsLoadingQuestion(true);
    setShowFacts(false);
    setExtractedFacts([]);
    setAnswer('');

    try {
      const res = await authFetch('/interview/question', {
        method: 'POST',
        body: JSON.stringify({
          answeredCategories: answered,
          connectedPlatforms: connectedProviders || [],
        }),
      });
      const data = await res.json();

      if (data.done) {
        setIsDone(true);
        fetchSummary();
        return;
      }

      setQuestion(data.question);
      setCategory(data.category);
      setCategoryLabel(data.categoryLabel);
      setRemaining(data.remaining);
      setTotalAvailable(data.totalAvailable);
    } catch (err) {
      console.error('Failed to fetch question:', err);
    } finally {
      setIsLoadingQuestion(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [connectedProviders]);

  const fetchSummary = async () => {
    setIsLoadingSummary(true);
    try {
      const res = await authFetch('/interview/complete', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.summary) setSummary(data.summary);
      }
    } catch {
      // Non-fatal
    } finally {
      setIsLoadingSummary(false);
    }
  };

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const res = await authFetch('/interview/status');
        const data = await res.json();
        if (data.answeredCategories?.length > 0) {
          setAnsweredCategories(data.answeredCategories);
          fetchNextQuestion(data.answeredCategories);
        } else {
          fetchNextQuestion([]);
        }
      } catch {
        fetchNextQuestion([]);
      }
    };
    loadStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (!answer.trim() || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const res = await authFetch('/interview/answer', {
        method: 'POST',
        body: JSON.stringify({ category, question, answer: answer.trim() }),
      });
      const data = await res.json();

      if (data.facts) {
        setExtractedFacts(data.facts.map((f: string) => ({ text: f, visible: false })));
        setShowFacts(true);

        for (let i = 0; i < data.facts.length; i++) {
          await new Promise(r => setTimeout(r, 400));
          setExtractedFacts(prev =>
            prev.map((f, idx) => idx === i ? { ...f, visible: true } : f)
          );
        }

        await new Promise(r => setTimeout(r, 1500));
      }

      const newAnswered = [...answeredCategories, category];
      setAnsweredCategories(newAnswered);
      fetchNextQuestion(newAnswered);
    } catch (err) {
      console.error('Failed to submit answer:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    const newAnswered = [...answeredCategories, category];
    setAnsweredCategories(newAnswered);
    fetchNextQuestion(newAnswered);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const questionNumber = totalAvailable - remaining;
  const totalQuestions = totalAvailable;

  // ─── Completion Screen ───
  if (isDone) {
    return createPortal(
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 flex flex-col"
        style={{ backgroundColor: 'var(--background)', zIndex: 9999 }}
      >
        <div className="flex justify-end p-6">
          <button
            onClick={onClose}
            className="p-2 rounded-full transition-colors hover:bg-[rgba(255,255,255,0.05)]"
          >
            <X className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.3)' }} />
          </button>
        </div>

        <div className="flex-shrink-0 pb-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col items-center"
          >
            <img
              src="/images/backgrounds/flower-hero.png"
              alt="TwinMe"
              className="w-10 h-10 object-contain mb-4 opacity-80"
            />
            <h2
              className="text-[32px] sm:text-[40px]"
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontStyle: 'italic',
                color: 'rgba(245,245,244,0.9)',
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
              }}
            >
              Your soul, captured
            </h2>
          </motion.div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 sm:px-8">
          <div className="max-w-[520px] mx-auto">
            {isLoadingSummary ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-4 h-4 border-[1.5px] border-[rgba(255,255,255,0.2)] border-t-transparent rounded-full animate-spin" />
                <span className="ml-3 text-[13px]" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}>
                  Synthesizing your portrait...
                </span>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <p
                  className="text-[16px] leading-[1.75] whitespace-pre-line"
                  style={{
                    color: 'rgba(245,245,244,0.7)',
                    fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
                    fontWeight: 400,
                  }}
                >
                  {summary || 'Your twin has absorbed everything you shared. The more you talk, the deeper it understands you.'}
                </p>
              </motion.div>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 py-8 flex justify-center">
          <button
            onClick={() => { onComplete(); onClose(); }}
            className="px-6 py-2.5 rounded-full text-[14px] font-medium transition-all duration-150 active:scale-[0.97]"
            style={{
              background: 'rgba(255,255,255,0.9)',
              color: '#0C0B10',
              fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
            }}
          >
            Start chatting with your twin
          </button>
        </div>
      </motion.div>,
      document.body
    );
  }

  // ─── Interview Question Screen ───
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 flex flex-col"
      style={{ backgroundColor: 'var(--background)', zIndex: 9999 }}
    >
      {/* Top bar — progress + close */}
      <div className="flex items-center justify-between px-6 sm:px-8 py-5">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Step indicator */}
          <span
            className="text-[13px] font-medium flex-shrink-0"
            style={{ color: 'rgba(255,255,255,0.50)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
          >
            {questionNumber + 1} of {totalQuestions}
          </span>

          {/* Progress bar */}
          <div className="flex-1 max-w-[200px] h-[3px] bg-[rgba(255,255,255,0.08)] rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'rgba(255,255,255,0.45)' }}
              initial={{ width: 0 }}
              animate={{ width: `${((questionNumber + 1) / totalQuestions) * 100}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-full transition-colors hover:bg-[rgba(255,255,255,0.05)] flex-shrink-0 ml-4"
        >
          <X className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.3)' }} />
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col px-6 sm:px-8 max-w-[640px] mx-auto w-full overflow-y-auto">
        <AnimatePresence mode="wait">
          {showFacts ? (
            /* ── Extracted facts view ── */
            <motion.div
              key="facts"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex-1 flex flex-col justify-center w-full py-12"
            >
              <p
                className="text-[11px] uppercase tracking-[0.1em] mb-6"
                style={{ color: 'rgba(255,255,255,0.30)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif", fontWeight: 500 }}
              >
                Learned about you
              </p>
              <div className="space-y-1">
                {extractedFacts.map((fact, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: fact.visible ? 1 : 0, x: fact.visible ? 0 : -8 }}
                    className="flex items-start gap-3 py-3"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <Check className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#10b981' }} />
                    <span
                      className="text-[14px] leading-relaxed"
                      style={{ color: 'rgba(245,245,244,0.65)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
                    >
                      {fact.text}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : (
            /* ── Question view ── */
            <motion.div
              key={`q-${category}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col justify-center w-full py-8"
            >
              {isLoadingQuestion ? (
                <div className="flex items-center justify-center py-24">
                  <div className="w-4 h-4 border-[1.5px] border-[rgba(255,255,255,0.15)] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* Category label */}
                  <span
                    className="text-[11px] uppercase tracking-[0.1em] mb-4"
                    style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif", fontWeight: 500 }}
                  >
                    {categoryLabel}
                  </span>

                  {/* Question — left-aligned, readable */}
                  <h2
                    className="mb-8 text-[22px] sm:text-[26px] leading-[1.4]"
                    style={{
                      fontFamily: "'Instrument Serif', Georgia, serif",
                      fontStyle: 'italic',
                      color: 'rgba(245,245,244,0.90)',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {question}
                  </h2>

                  {/* Helper tooltip — Cofounder-style hint */}
                  <div className="flex justify-center mb-3">
                    <span
                      className="text-[11px] px-3 py-1.5 rounded-full"
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.08)',
                        color: 'rgba(255,255,255,0.40)',
                        fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
                      }}
                    >
                      {CATEGORY_TOOLTIPS[category] || 'Take your time with this one'}
                    </span>
                  </div>

                  {/* Answer textarea */}
                  <div
                    className="rounded-2xl overflow-hidden"
                    style={{
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(255,255,255,0.03)',
                    }}
                  >
                    <textarea
                      ref={textareaRef}
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={CATEGORY_STARTERS[category] || "Type your answer here..."}
                      className="w-full bg-transparent px-5 py-4 text-[15px] leading-relaxed resize-none outline-none min-h-[100px] max-h-[200px]"
                      style={{
                        color: 'rgba(245,245,244,0.85)',
                        fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
                        fontWeight: 400,
                      }}
                      disabled={isSubmitting}
                    />
                    <div className="flex items-center justify-end px-4 pb-3 gap-2">
                      <button
                        onClick={handleSubmit}
                        disabled={!answer.trim() || isSubmitting}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[13px] font-medium transition-all duration-150 active:scale-[0.95]"
                        style={{
                          background: answer.trim() ? '#F5F5F4' : 'rgba(255,255,255,0.06)',
                          color: answer.trim() ? '#0C0B10' : 'rgba(255,255,255,0.25)',
                          fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
                        }}
                      >
                        {isSubmitting ? (
                          <div className="w-3.5 h-3.5 border-[1.5px] border-[#0C0B10] border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            Submit
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Skip — visible and easy to find */}
                  <div className="flex justify-start mt-4">
                    <button
                      onClick={handleSkip}
                      disabled={isSubmitting}
                      className="flex items-center gap-1.5 text-[13px] py-1.5 transition-colors hover:text-[rgba(255,255,255,0.50)] disabled:opacity-30"
                      style={{ color: 'rgba(255,255,255,0.30)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                      Skip this question
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>,
    document.body
  );
}
