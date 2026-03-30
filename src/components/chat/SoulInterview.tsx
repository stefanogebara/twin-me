import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, Check } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';
import { useAuth } from '@/contexts/AuthContext';
import { usePlatformStatus } from '@/hooks/usePlatformStatus';

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
      // Non-fatal — completion screen shows fallback text
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
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 flex flex-col"
        style={{ backgroundColor: '#0C0B10', zIndex: 9999 }}
      >
        {/* Close */}
        <div className="flex justify-end p-6">
          <button
            onClick={onClose}
            className="p-2 rounded-full transition-colors hover:bg-[rgba(255,255,255,0.05)]"
          >
            <X className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.3)' }} />
          </button>
        </div>

        {/* Header — pinned */}
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

        {/* Summary — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 sm:px-8">
          <div className="max-w-[520px] mx-auto">
            {isLoadingSummary ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-4 h-4 border-[1.5px] border-[rgba(255,255,255,0.2)] border-t-transparent rounded-full animate-spin" />
                <span className="ml-3 text-[13px]" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}>
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
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 400,
                  }}
                >
                  {summary || 'Your twin has absorbed everything you shared. The more you talk, the deeper it understands you.'}
                </p>
              </motion.div>
            )}
          </div>
        </div>

        {/* CTA — pinned bottom */}
        <div className="flex-shrink-0 py-8 flex justify-center">
          <button
            onClick={() => { onComplete(); onClose(); }}
            className="px-6 py-2.5 rounded-full text-[14px] font-medium transition-all duration-150 active:scale-[0.97]"
            style={{
              background: 'rgba(255,255,255,0.9)',
              color: '#0C0B10',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            Start chatting with your twin
          </button>
        </div>
      </motion.div>
    );
  }

  // ─── Interview Question Screen ───
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex flex-col"
      style={{ backgroundColor: '#0C0B10' }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 sm:px-8 py-5">
        <div className="flex items-center gap-4 flex-1">
          <span
            className="text-[12px] tracking-wide uppercase"
            style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif", fontWeight: 500, letterSpacing: '0.08em' }}
          >
            {categoryLabel || 'Soul Interview'}
          </span>
          <div className="flex-1 max-w-[160px] h-[1px] bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'rgba(255,255,255,0.4)' }}
              initial={{ width: 0 }}
              animate={{ width: `${(questionNumber / totalQuestions) * 100}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
          <span
            className="text-[12px]"
            style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Inter', sans-serif" }}
          >
            {questionNumber}/{totalQuestions}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-full transition-colors hover:bg-[rgba(255,255,255,0.05)]"
        >
          <X className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.3)' }} />
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-8 max-w-[600px] mx-auto w-full">
        <AnimatePresence mode="wait">
          {showFacts ? (
            <motion.div
              key="facts"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="w-full"
            >
              <p
                className="text-[11px] uppercase tracking-widest mb-5 text-center"
                style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif", fontWeight: 500 }}
              >
                Learned about you
              </p>
              <div className="space-y-2.5">
                {extractedFacts.map((fact, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: fact.visible ? 1 : 0, x: fact.visible ? 0 : -8 }}
                    className="flex items-start gap-3 px-4 py-3"
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}
                  >
                    <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }} />
                    <span
                      className="text-[14px] leading-relaxed"
                      style={{ color: 'rgba(245,245,244,0.6)', fontFamily: "'Inter', sans-serif" }}
                    >
                      {fact.text}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={`q-${category}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35 }}
              className="w-full"
            >
              {isLoadingQuestion ? (
                <div className="flex items-center justify-center py-24">
                  <div className="w-4 h-4 border-[1.5px] border-[rgba(255,255,255,0.15)] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* Question */}
                  <h2
                    className="text-center mb-12 text-[24px] sm:text-[30px] leading-[1.35]"
                    style={{
                      fontFamily: "'Instrument Serif', Georgia, serif",
                      fontStyle: 'italic',
                      color: 'rgba(245,245,244,0.88)',
                      letterSpacing: '-0.02em',
                      maxWidth: '540px',
                      margin: '0 auto 48px',
                    }}
                  >
                    {question}
                  </h2>

                  {/* Answer textarea — minimal, no heavy glass */}
                  <div
                    className="rounded-[12px] overflow-hidden"
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
                      placeholder="Take your time..."
                      className="w-full bg-transparent px-5 py-4 text-[15px] leading-relaxed resize-none outline-none min-h-[120px] max-h-[220px]"
                      style={{
                        color: 'rgba(245,245,244,0.85)',
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 400,
                      }}
                      disabled={isSubmitting}
                    />
                    <div className="flex items-center justify-between px-5 pb-3">
                      <span
                        className="text-[11px]"
                        style={{ color: 'rgba(255,255,255,0.2)', fontFamily: "'Inter', sans-serif" }}
                      >
                        {answer.length > 0 ? `${answer.length}` : 'Enter to submit'}
                      </span>
                      <button
                        onClick={handleSubmit}
                        disabled={!answer.trim() || isSubmitting}
                        className="w-7 h-7 flex items-center justify-center rounded-full transition-all duration-150 active:scale-[0.92]"
                        style={{
                          background: answer.trim() ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.06)',
                        }}
                      >
                        {isSubmitting ? (
                          <div className="w-3.5 h-3.5 border-[1.5px] border-[#0C0B10] border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <ArrowRight className="w-3.5 h-3.5" style={{ color: '#0C0B10', opacity: answer.trim() ? 1 : 0.2 }} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Skip */}
                  <div className="flex justify-center mt-6">
                    <button
                      onClick={() => {
                        const newAnswered = [...answeredCategories, category];
                        setAnsweredCategories(newAnswered);
                        fetchNextQuestion(newAnswered);
                      }}
                      className="text-[12px] transition-colors hover:text-[rgba(255,255,255,0.4)]"
                      style={{ color: 'rgba(255,255,255,0.2)', fontFamily: "'Inter', sans-serif" }}
                    >
                      Skip this one
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
