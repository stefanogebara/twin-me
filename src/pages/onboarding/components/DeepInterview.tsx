import React, { useState, useEffect, useRef } from 'react';
import { Send, Brain, Heart, Palette, Users, Flame, ArrowRight, Sparkles } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';

const DOMAIN_ICONS: Record<string, React.ReactNode> = {
  motivation: <Flame className="w-3.5 h-3.5" />,
  lifestyle: <Heart className="w-3.5 h-3.5" />,
  personality: <Brain className="w-3.5 h-3.5" />,
  cultural: <Palette className="w-3.5 h-3.5" />,
  social: <Users className="w-3.5 h-3.5" />,
};

const DOMAIN_LABELS: Record<string, string> = {
  motivation: 'Motivation',
  lifestyle: 'Lifestyle',
  personality: 'Personality',
  cultural: 'Cultural',
  social: 'Social',
};

interface SoulSignature {
  archetype_name: string;
  core_traits: Array<{ trait: string; source: string }>;
  signature_quote: string;
  first_impression: string;
}

interface EnrichmentContext {
  name?: string;
  company?: string;
  title?: string;
  location?: string;
  bio?: string;
}

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

interface DeepInterviewProps {
  enrichmentContext: EnrichmentContext;
  onComplete: (enhancedSignature?: SoulSignature) => void;
  onSkip: () => void;
}

const DeepInterview: React.FC<DeepInterviewProps> = ({
  enrichmentContext,
  onComplete,
  onSkip,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [domainProgress, setDomainProgress] = useState<Record<string, { asked: number; covered: boolean }>>({});
  const [isDone, setIsDone] = useState(false);
  const [summary, setSummary] = useState('');
  const [enhancedSignature, setEnhancedSignature] = useState<SoulSignature | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initRan = useRef(false);

  const STORAGE_KEY = 'twinme_interview_progress';

  // Save progress to localStorage
  const saveProgress = (msgs: Message[], qNum: number, dp: Record<string, { asked: number; covered: boolean }>) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        messages: msgs,
        questionNumber: qNum,
        domainProgress: dp,
        savedAt: Date.now(),
      }));
    } catch { /* storage full — non-critical */ }
  };

  // Clear saved progress
  const clearProgress = () => {
    localStorage.removeItem(STORAGE_KEY);
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Restore or start fresh on mount
  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const progress = JSON.parse(saved);
        // Only restore if saved within last 7 days
        if (progress.savedAt && Date.now() - progress.savedAt < 7 * 24 * 60 * 60 * 1000) {
          const restoredMessages = progress.messages || [];
          const restoredQ = progress.questionNumber || 1;
          const restoredDp = progress.domainProgress || {};
          setMessages(restoredMessages);
          setQuestionNumber(restoredQ);
          setDomainProgress(restoredDp);
          // Resume from where we left off
          fetchNextQuestion(restoredMessages, 0, restoredQ, restoredDp);
          return;
        }
      }
    } catch { /* corrupted data — start fresh */ }

    fetchNextQuestion([]);
  }, []);

  const getAuthToken = () => localStorage.getItem('auth_token') || localStorage.getItem('token');

  const fetchNextQuestion = async (
    conversationHistory: Message[],
    retryCount = 0,
    qNumOverride?: number,
    dpOverride?: Record<string, { asked: number; covered: boolean }>,
  ) => {
    setLoading(true);
    const qNum = qNumOverride ?? questionNumber;
    const dp = dpOverride ?? domainProgress;
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/onboarding/calibrate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          enrichmentContext,
          conversationHistory,
          questionNumber: qNum,
          domainProgress: dp,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();

      if (result.done) {
        setIsDone(true);
        setSummary(result.summary || '');
        if (result.domainProgress) setDomainProgress(result.domainProgress);
        clearProgress();
        await generateEnhancedSignature(result);
        return;
      }

      if (result.message) {
        const nextQ = result.questionNumber + 1;
        const nextDp = result.domainProgress || dp;
        setMessages(prev => {
          const updated = [...prev, { role: 'assistant' as const, content: result.message }];
          saveProgress(updated, nextQ, nextDp);
          return updated;
        });
        setQuestionNumber(nextQ);
        if (result.domainProgress) setDomainProgress(result.domainProgress);
      }
    } catch (error) {
      console.error('[DeepInterview] Error fetching question:', error);

      if (retryCount < 2) {
        await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));
        return fetchNextQuestion(conversationHistory, retryCount + 1, qNum, dp);
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Something went wrong on my end — hit send again or click 'Done for now' to continue.",
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading || isDone) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    saveProgress(newMessages, questionNumber, domainProgress);

    fetchNextQuestion(newMessages);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const generateEnhancedSignature = async (calibrationResult: {
    insights?: string[];
    archetypeHint?: string;
    summary?: string;
  }) => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/onboarding/instant-signature`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          enrichmentContext,
          calibrationInsights: calibrationResult.insights || [],
          connectedPlatforms: [],
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.signature) {
          setEnhancedSignature(result.signature);
          return;
        }
      }
    } catch {
      // Fall through — signature generation is non-critical
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="text-center mb-4">
        <h2
          className="text-xl md:text-2xl mb-1"
          style={{
            fontFamily: 'Instrument Serif, Georgia, serif',
            fontWeight: 400,
            letterSpacing: '-0.03em',
            color: 'var(--foreground)',
          }}
        >
          Deep Conversation
        </h2>
        <p
          className="text-xs"
          style={{ fontFamily: "'Geist', sans-serif", color: 'rgba(255,255,255,0.4)' }}
        >
          {questionNumber <= 18
            ? `Question ${Math.min(questionNumber, 18)} of ~18`
            : 'Wrapping up'}
        </p>
      </div>

      {/* Domain progress dots */}
      <div className="flex items-center justify-center gap-3 mb-6">
        {['motivation', 'lifestyle', 'personality', 'cultural', 'social'].map(domain => {
          const progress = domainProgress[domain];
          const isActive = progress?.asked > 0;
          const isCovered = progress?.covered || (progress?.asked ?? 0) >= 2;
          return (
            <div
              key={domain}
              className="flex flex-col items-center gap-1"
              title={DOMAIN_LABELS[domain]}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300"
                style={{
                  backgroundColor: isCovered
                    ? 'rgba(255,255,255,0.04)'
                    : isActive
                      ? 'rgba(255,255,255,0.02)'
                      : 'transparent',
                  border: isCovered
                    ? '1.5px solid rgba(255,255,255,0.08)'
                    : isActive
                      ? '1px solid rgba(255,255,255,0.08)'
                      : '1px solid rgba(255,255,255,0.06)',
                  color: isCovered
                    ? 'var(--text-primary)'
                    : isActive
                      ? 'rgba(255,255,255,0.4)'
                      : 'var(--text-placeholder)',
                }}
              >
                {DOMAIN_ICONS[domain]}
              </div>
              <span
                className="text-[10px]"
                style={{
                  fontFamily: "'Geist', sans-serif",
                  color: isCovered
                    ? 'rgba(255,255,255,0.4)'
                    : 'var(--text-placeholder)',
                }}
              >
                {DOMAIN_LABELS[domain]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Chat messages */}
      <div
        className="flex-1 overflow-y-auto px-1 mb-4 scrollbar-hide min-h-0"
        style={{ maxHeight: 'min(50vh, 400px)' }}
      >
        <div className="flex flex-col min-h-full justify-end space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className="max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed"
                style={{
                  backgroundColor: msg.role === 'user'
                    ? 'rgba(255,255,255,0.02)'
                    : 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: msg.role === 'user' ? 'var(--text-primary)' : 'rgba(255,255,255,0.4)',
                  fontFamily: "'Geist', sans-serif",
                  borderBottomRightRadius: msg.role === 'user' ? 6 : undefined,
                  borderBottomLeftRadius: msg.role === 'assistant' ? 6 : undefined,
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}

        {/* Loading indicator */}
        {loading && (
          <div
            className="flex justify-start"
          >
            <div
              className="px-4 py-3 rounded-2xl"
              style={{
                backgroundColor: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{ backgroundColor: 'rgba(255,255,255,0.3)', animationDelay: `${i * 0.2}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area or completion */}
      {isDone ? (
        <div
          className="flex flex-col items-center gap-4 py-4"
        >
          <div className="flex items-center justify-center w-12 h-12 rounded-full"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <Sparkles className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.4)' }} />
          </div>

          <div className="text-center">
            <p
              className="text-lg mb-1"
              style={{
                fontFamily: 'Instrument Serif, Georgia, serif',
                fontWeight: 500,
                color: 'var(--foreground)',
              }}
            >
              Interview Complete
            </p>

            {enhancedSignature?.archetype_name && (
              <p
                className="text-sm font-medium mb-2"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                Your archetype: {enhancedSignature.archetype_name}
              </p>
            )}

            {enhancedSignature?.first_impression && (
              <p
                className="text-xs leading-relaxed max-w-sm mx-auto mb-1"
                style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Geist', sans-serif" }}
              >
                {enhancedSignature.first_impression}
              </p>
            )}

            {enhancedSignature?.signature_quote && (
              <p
                className="text-xs leading-relaxed max-w-sm mx-auto mt-2"
                style={{
                  color: 'rgba(255,255,255,0.4)',
                  fontFamily: 'Instrument Serif, Georgia, serif',
                  fontStyle: 'italic',
                  opacity: 0.8,
                }}
              >
                "{enhancedSignature.signature_quote}"
              </p>
            )}

            {!enhancedSignature && summary && (
              <p
                className="text-sm leading-relaxed max-w-sm mx-auto"
                style={{
                  color: 'rgba(255,255,255,0.4)',
                  fontFamily: 'Instrument Serif, Georgia, serif',
                  fontStyle: 'italic',
                }}
              >
                {summary}
              </p>
            )}
          </div>

          {enhancedSignature?.core_traits && enhancedSignature.core_traits.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5 max-w-sm">
              {enhancedSignature.core_traits.slice(0, 5).map((t, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded-full text-[11px]"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.4)',
                    fontFamily: "'Geist', sans-serif",
                  }}
                >
                  {t.trait}
                </span>
              ))}
            </div>
          )}

          <button
            onClick={() => onComplete(enhancedSignature)}
            className="w-full px-6 py-4 rounded-full text-sm font-normal flex items-center justify-center gap-2 transition-colors mt-2"
            style={{
              backgroundColor: 'var(--foreground)',
              color: 'var(--background)',
              fontFamily: "'Geist', sans-serif",
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
              fontSize: '12px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Enter My World
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your answer..."
            disabled={loading}
            className="flex-1 px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
            style={{
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: 'var(--text-primary)',
              fontFamily: "'Geist', sans-serif",
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="px-4 py-3 rounded-xl transition-all duration-200"
            style={{
              backgroundColor: input.trim() ? 'var(--foreground)' : 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: input.trim() ? 'var(--background)' : 'var(--text-placeholder)',
              cursor: input.trim() ? 'pointer' : 'default',
            }}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Done for now escape hatch */}
      {!isDone && (
        <button
          onClick={onSkip}
          className="mt-3 text-xs transition-opacity hover:opacity-70"
          style={{
            color: 'rgba(255,255,255,0.4)',
            fontFamily: "'Geist', sans-serif",
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'center',
          }}
        >
          Done for now — continue to platforms
        </button>
      )}
    </div>
  );
};

export default DeepInterview;
