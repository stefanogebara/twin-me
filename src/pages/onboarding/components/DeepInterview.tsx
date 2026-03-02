import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Send, Brain, Heart, Palette, Users, Flame, ArrowRight } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initRan = useRef(false);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch first question on mount — ref guard prevents React StrictMode double-invoke
  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    fetchNextQuestion([]);
  }, []);

  const getAuthToken = () => localStorage.getItem('auth_token') || localStorage.getItem('token');

  const fetchNextQuestion = async (conversationHistory: Message[]) => {
    setLoading(true);
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
          questionNumber,
          domainProgress,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();

      if (result.done) {
        // Interview complete
        setIsDone(true);
        setSummary(result.summary || '');
        if (result.domainProgress) setDomainProgress(result.domainProgress);

        // Generate enhanced soul signature
        generateEnhancedSignature(result);
        return;
      }

      if (result.message) {
        setMessages(prev => [...prev, { role: 'assistant', content: result.message }]);
        setQuestionNumber(result.questionNumber + 1);
        if (result.domainProgress) setDomainProgress(result.domainProgress);
      }
    } catch (error) {
      console.error('[DeepInterview] Error fetching question:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "I'd love to keep talking, but let's continue in the chat. Your twin is ready!",
      }]);
      setIsDone(true);
    } finally {
      setLoading(false);
      // Focus input after question arrives
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading || isDone) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');

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
          onComplete(result.signature);
          return;
        }
      }
    } catch {
      // Fall through
    }
    onComplete();
  };

  // Count domains covered
  const domainEntries = Object.entries(domainProgress);
  const coveredCount = domainEntries.filter(([, p]) => p.asked >= 2).length;

  return (
    <div className="flex flex-col h-full min-h-[60vh]">
      {/* Header */}
      <div className="text-center mb-4">
        <h2
          className="text-xl md:text-2xl mb-1"
          style={{ fontFamily: 'var(--font-heading)', color: '#E8D5B7' }}
        >
          Deep Conversation
        </h2>
        <p
          className="text-xs opacity-40"
          style={{ fontFamily: 'var(--font-body)', color: '#E8D5B7' }}
        >
          Your twin wants to really understand you
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
                    ? 'rgba(232, 213, 183, 0.2)'
                    : isActive
                      ? 'rgba(232, 213, 183, 0.1)'
                      : 'rgba(232, 213, 183, 0.03)',
                  border: isCovered
                    ? '1.5px solid rgba(232, 213, 183, 0.5)'
                    : isActive
                      ? '1px solid rgba(232, 213, 183, 0.2)'
                      : '1px solid rgba(232, 213, 183, 0.08)',
                  color: isCovered
                    ? '#E8D5B7'
                    : isActive
                      ? 'rgba(232, 213, 183, 0.5)'
                      : 'rgba(232, 213, 183, 0.2)',
                }}
              >
                {DOMAIN_ICONS[domain]}
              </div>
              <span
                className="text-[10px]"
                style={{
                  color: isCovered
                    ? 'rgba(232, 213, 183, 0.6)'
                    : 'rgba(232, 213, 183, 0.2)',
                  fontFamily: 'var(--font-body)',
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
        className="flex-1 overflow-y-auto space-y-3 px-1 mb-4 scrollbar-hide"
        style={{ maxHeight: '50vh' }}
      >
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className="max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed"
                style={{
                  backgroundColor: msg.role === 'user'
                    ? 'rgba(232, 213, 183, 0.12)'
                    : 'rgba(232, 213, 183, 0.04)',
                  border: msg.role === 'user'
                    ? '1px solid rgba(232, 213, 183, 0.2)'
                    : '1px solid rgba(232, 213, 183, 0.08)',
                  color: msg.role === 'user'
                    ? 'rgba(232, 213, 183, 0.9)'
                    : 'rgba(232, 213, 183, 0.75)',
                  fontFamily: 'var(--font-body)',
                  borderBottomRightRadius: msg.role === 'user' ? 6 : undefined,
                  borderBottomLeftRadius: msg.role === 'assistant' ? 6 : undefined,
                }}
              >
                {msg.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Loading indicator */}
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div
              className="px-4 py-3 rounded-2xl"
              style={{
                backgroundColor: 'rgba(232, 213, 183, 0.04)',
                border: '1px solid rgba(232, 213, 183, 0.08)',
              }}
            >
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: 'rgba(232, 213, 183, 0.4)' }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area or completion */}
      {isDone ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-3"
        >
          {summary && (
            <p
              className="text-sm text-center leading-relaxed mb-2"
              style={{
                color: 'rgba(232, 213, 183, 0.6)',
                fontFamily: 'var(--font-heading)',
                fontStyle: 'italic',
              }}
            >
              {summary}
            </p>
          )}
          <motion.button
            onClick={() => onComplete()}
            className="w-full px-6 py-4 rounded-xl text-base font-medium flex items-center justify-center gap-2"
            style={{
              background: 'linear-gradient(135deg, #E8D5B7 0%, #D4C4A8 100%)',
              color: '#0C0C0C',
              fontFamily: 'var(--font-body)',
            }}
          >
            Enter My World
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </motion.div>
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
              backgroundColor: 'rgba(232, 213, 183, 0.06)',
              border: '1px solid rgba(232, 213, 183, 0.15)',
              color: '#E8D5B7',
              fontFamily: 'var(--font-body)',
            }}
          />
          <motion.button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-4 py-3 rounded-xl transition-all duration-200"
            style={{
              backgroundColor: input.trim()
                ? 'rgba(232, 213, 183, 0.15)'
                : 'rgba(232, 213, 183, 0.05)',
              border: '1px solid rgba(232, 213, 183, 0.15)',
              color: input.trim() ? '#E8D5B7' : 'rgba(232, 213, 183, 0.3)',
            }}
          >
            <Send className="w-4 h-4" />
          </motion.button>
        </div>
      )}

      {/* Done for now escape hatch */}
      {!isDone && messages.length >= 2 && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          onClick={onSkip}
          className="mt-3 text-xs transition-opacity hover:opacity-70"
          style={{
            color: 'rgba(232, 213, 183, 0.3)',
            fontFamily: 'var(--font-body)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'center',
          }}
        >
          Done for now — continue to platforms
        </motion.button>
      )}
    </div>
  );
};

export default DeepInterview;
