import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, Sparkles, Check } from 'lucide-react';
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
    // Load existing progress on mount
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

        // Animate facts appearing one by one
        for (let i = 0; i < data.facts.length; i++) {
          await new Promise(r => setTimeout(r, 400));
          setExtractedFacts(prev =>
            prev.map((f, idx) => idx === i ? { ...f, visible: true } : f)
          );
        }

        // Brief pause to read facts, then advance
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

  const progress = totalAvailable > 0
    ? ((totalAvailable - remaining) / totalAvailable) * 100
    : 0;

  // Shared: full-screen background with ambient gradient orbs (matches app body)
  const overlayBackground = {
    backgroundColor: '#13121a',
    backgroundImage: [
      'radial-gradient(ellipse 80% 60% at 20% 30%, rgba(210,145,55,0.28) 0%, transparent 70%)',
      'radial-gradient(ellipse 70% 50% at 85% 25%, rgba(180,110,65,0.22) 0%, transparent 65%)',
      'radial-gradient(ellipse 90% 70% at 50% 80%, rgba(160,95,55,0.24) 0%, transparent 70%)',
      'radial-gradient(ellipse 60% 50% at 75% 55%, rgba(55,45,140,0.20) 0%, transparent 65%)',
    ].join(', '),
    backgroundAttachment: 'fixed' as const,
  };

  // Completion screen
  if (isDone) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto"
        style={overlayBackground}
      >
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-full hover:bg-[rgba(255,255,255,0.06)] transition-colors z-10"
        >
          <X className="w-5 h-5 text-[rgba(255,255,255,0.4)]" />
        </button>

        <div className="max-w-lg w-full px-6 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-center mb-8"
          >
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[rgba(255,132,0,0.12)] mb-4">
              <Sparkles className="w-6 h-6 text-[#ff8400]" />
            </div>
            <h2
              className="text-[28px] sm:text-[36px] mb-2"
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontStyle: 'italic',
                color: '#F5F5F4',
                letterSpacing: '-0.02em',
              }}
            >
              Your soul, captured
            </h2>
          </motion.div>

          {isLoadingSummary ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-[#ff8400] border-t-transparent rounded-full animate-spin" />
              <span className="ml-3 text-sm text-[rgba(255,255,255,0.4)]">Synthesizing your portrait...</span>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <div
                className="rounded-[20px] px-6 py-5 mb-8"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  backdropFilter: 'blur(42px)',
                  WebkitBackdropFilter: 'blur(42px)',
                  boxShadow: '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
                }}
              >
                <p
                  className="text-[15px] leading-relaxed whitespace-pre-line"
                  style={{ color: 'rgba(245,245,244,0.8)' }}
                >
                  {summary || 'Your twin has absorbed everything you shared. The more you talk, the deeper it understands you.'}
                </p>
              </div>

              <div className="flex justify-center">
                <button
                  onClick={() => { onComplete(); onClose(); }}
                  className="px-6 py-2.5 rounded-[100px] text-sm font-medium transition-all duration-150 active:scale-[0.97]"
                  style={{
                    background: '#F5F5F4',
                    color: '#110f0f',
                  }}
                >
                  Start chatting with your twin
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    );
  }

  // Interview question screen
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col"
      style={overlayBackground}
    >
      {/* Top bar: progress + close */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3 flex-1">
          <span
            className="text-xs"
            style={{ color: 'rgba(255,132,0,0.7)', fontFamily: "'Inter', sans-serif" }}
          >
            {categoryLabel || 'Soul Interview'}
          </span>
          <div className="flex-1 max-w-[200px] h-[2px] bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: '#ff8400' }}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
          <span className="text-xs text-[rgba(255,255,255,0.3)]">
            {remaining} left
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-full hover:bg-[rgba(255,255,255,0.06)] transition-colors"
        >
          <X className="w-5 h-5 text-[rgba(255,255,255,0.4)]" />
        </button>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 max-w-2xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {showFacts ? (
            // Show extracted facts briefly
            <motion.div
              key="facts"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="w-full"
            >
              <p className="text-xs text-[rgba(255,132,0,0.6)] mb-4 text-center" style={{ fontFamily: "'Inter', sans-serif" }}>
                Learned about you
              </p>
              <div className="space-y-2">
                {extractedFacts.map((fact, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: fact.visible ? 1 : 0, x: fact.visible ? 0 : -10 }}
                    className="flex items-start gap-3 px-5 py-3 rounded-[20px]"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.10)',
                      backdropFilter: 'blur(42px)',
                      WebkitBackdropFilter: 'blur(42px)',
                      boxShadow: '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
                    }}
                  >
                    <Check className="w-4 h-4 text-[#ff8400] mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-[rgba(245,245,244,0.7)]">{fact.text}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : (
            // Show question + answer input
            <motion.div
              key={`q-${category}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="w-full"
            >
              {isLoadingQuestion ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-5 h-5 border-2 border-[rgba(255,132,0,0.4)] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* Question */}
                  <h2
                    className="text-center mb-10 text-[22px] sm:text-[28px] leading-snug"
                    style={{
                      fontFamily: "'Instrument Serif', Georgia, serif",
                      fontStyle: 'italic',
                      color: '#F5F5F4',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {question}
                  </h2>

                  {/* Answer textarea — glass surface card */}
                  <div
                    className="rounded-[20px] overflow-hidden"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.10)',
                      backdropFilter: 'blur(42px)',
                      WebkitBackdropFilter: 'blur(42px)',
                      boxShadow: '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
                    }}
                  >
                    <textarea
                      ref={textareaRef}
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Take your time — there's no wrong answer..."
                      className="w-full bg-transparent px-5 py-4 text-[15px] resize-none outline-none min-h-[120px] max-h-[240px]"
                      style={{
                        color: '#F5F5F4',
                        fontFamily: "'Inter', sans-serif",
                      }}
                      disabled={isSubmitting}
                    />
                    <div className="flex items-center justify-between px-5 pb-3">
                      <span className="text-xs text-[rgba(255,255,255,0.2)]">
                        {answer.length > 0 ? `${answer.length} chars` : 'Enter to submit'}
                      </span>
                      <button
                        onClick={handleSubmit}
                        disabled={!answer.trim() || isSubmitting}
                        className="p-1.5 rounded-full transition-all duration-150 active:scale-[0.95]"
                        style={{
                          background: answer.trim() ? '#F5F5F4' : 'rgba(255,255,255,0.1)',
                          opacity: answer.trim() ? 1 : 0.4,
                        }}
                      >
                        {isSubmitting ? (
                          <div className="w-4 h-4 border-2 border-[#110f0f] border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <ArrowRight className="w-4 h-4" style={{ color: '#110f0f' }} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Skip option */}
                  <div className="flex justify-center mt-4">
                    <button
                      onClick={() => {
                        const newAnswered = [...answeredCategories, category];
                        setAnsweredCategories(newAnswered);
                        fetchNextQuestion(newAnswered);
                      }}
                      className="text-xs text-[rgba(255,255,255,0.25)] hover:text-[rgba(255,255,255,0.4)] transition-colors"
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
