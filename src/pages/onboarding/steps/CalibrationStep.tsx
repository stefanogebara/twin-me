import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Send, ArrowRight } from 'lucide-react';
import { ConfirmedData } from '@/services/enrichmentService';
import { useAnalytics } from '@/contexts/AnalyticsContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface CalibrationStepProps {
  userId: string;
  enrichmentContext: ConfirmedData;
  onComplete: (calibrationData: CalibrationResult) => void;
  onSkip: () => void;
}

export interface CalibrationResult {
  insights: string[];
  archetypeHint: string;
  summary: string;
  conversationHistory: Array<{ role: string; content: string }>;
}

interface Message {
  id: string;
  type: 'bot' | 'user';
  content: string;
  isTyping?: boolean;
}

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

export const CalibrationStep: React.FC<CalibrationStepProps> = ({
  userId,
  enrichmentContext,
  onComplete,
  onSkip,
}) => {
  const { trackFunnel } = useAnalytics();
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [totalQuestions] = useState(5);
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: string; content: string }>>([]);
  const [isDone, setIsDone] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const typeMessage = useCallback(async (content: string, delay: number = 25) => {
    setIsTyping(true);
    await new Promise(resolve => setTimeout(resolve, 300));

    const id = Date.now().toString();
    setMessages(prev => [...prev, { id, type: 'bot', content: '', isTyping: true }]);

    for (let i = 0; i <= content.length; i++) {
      await new Promise(resolve => setTimeout(resolve, delay));
      setMessages(prev =>
        prev.map(msg => msg.id === id ? { ...msg, content: content.slice(0, i) } : msg)
      );
    }

    setMessages(prev =>
      prev.map(msg => msg.id === id ? { ...msg, isTyping: false } : msg)
    );
    setIsTyping(false);
  }, []);

  const fetchNextQuestion = useCallback(async (history: Array<{ role: string; content: string }>, qNum: number) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/onboarding/calibrate`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          enrichmentContext,
          conversationHistory: history,
          questionNumber: qNum,
        }),
      });

      if (!response.ok) {
        throw new Error('Calibration request failed');
      }

      const result = await response.json();

      if (result.done) {
        setIsDone(true);
        trackFunnel('calibration_completed', {
          questions_answered: qNum - 1,
          has_insights: (result.insights || []).length > 0,
        });

        // Show a brief closing message
        await typeMessage(
          result.summary || "Thanks for sharing. I've got a good sense of who you are now.",
          20
        );

        setTimeout(() => {
          onComplete({
            insights: result.insights || [],
            archetypeHint: result.archetypeHint || '',
            summary: result.summary || '',
            conversationHistory: history,
          });
        }, 2000);
        return;
      }

      // Show the AI's question
      const newHistory = [...history, { role: 'assistant', content: result.message }];
      setConversationHistory(newHistory);
      await typeMessage(result.message, 20);
      setQuestionNumber(qNum + 1);

      // Focus input after question appears
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (error) {
      console.error('Calibration error:', error);
      await typeMessage("Let's move on - I have enough to get started.", 25);
      setTimeout(() => {
        onComplete({
          insights: [],
          archetypeHint: '',
          summary: '',
          conversationHistory: history,
        });
      }, 1500);
    } finally {
      setIsLoading(false);
    }
  }, [enrichmentContext, onComplete, typeMessage]);

  // Start the calibration conversation
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    const start = async () => {
      const firstName = (enrichmentContext.name || '').split(' ')[0] || 'there';
      await typeMessage(
        `Now I'd like to get to know you a bit deeper, ${firstName}. Just a few quick questions.`,
        22
      );
      await new Promise(resolve => setTimeout(resolve, 600));

      // Fetch first question with empty history
      const initialHistory = [
        { role: 'user', content: `Hi, I'm ${enrichmentContext.name || 'here'}. Ask me your first question.` },
      ];
      setConversationHistory(initialHistory);
      await fetchNextQuestion(initialHistory, 1);
    };

    start();
  }, [enrichmentContext, fetchNextQuestion, typeMessage]);

  const handleSubmit = async () => {
    const answer = userInput.trim();
    if (!answer || isTyping || isLoading || isDone) return;

    // Add user message to chat
    const id = Date.now().toString();
    setMessages(prev => [...prev, { id, type: 'user', content: answer }]);
    setUserInput('');

    // Update conversation history
    const newHistory = [...conversationHistory, { role: 'user', content: answer }];
    setConversationHistory(newHistory);

    await new Promise(resolve => setTimeout(resolve, 400));

    // Fetch next question
    await fetchNextQuestion(newHistory, questionNumber);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const progress = Math.min(((questionNumber - 1) / totalQuestions) * 100, 100);

  return (
    <div className="min-h-screen flex flex-col bg-[#0C0C0C]">
      <style>
        {`
          @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
          }
        `}
      </style>

      {/* Header with progress */}
      <div className="flex justify-between items-center px-8 py-6">
        <div
          className="text-xl tracking-tight"
          style={{ fontFamily: 'var(--font-heading)', color: '#E8D5B7' }}
        >
          Twin Me
        </div>
        <div className="flex items-center gap-4">
          {/* Progress dots */}
          <div className="flex gap-1.5">
            {Array.from({ length: totalQuestions }).map((_, i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full transition-all duration-500"
                style={{
                  backgroundColor: i < questionNumber - 1
                    ? '#E8D5B7'
                    : 'rgba(232, 213, 183, 0.15)',
                }}
              />
            ))}
          </div>
          <button
            onClick={onSkip}
            className="text-sm tracking-wide uppercase opacity-40 hover:opacity-80 transition-opacity"
            style={{
              fontFamily: 'var(--font-body)',
              color: '#E8D5B7',
              letterSpacing: '0.1em',
            }}
          >
            Skip
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-8">
        <div
          className="h-0.5 rounded-full overflow-hidden"
          style={{ backgroundColor: 'rgba(232, 213, 183, 0.08)' }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: 'rgba(232, 213, 183, 0.4)' }}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-6 md:px-8">
        <div className="max-w-2xl mx-auto py-8">
          <AnimatePresence>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                className={`mb-6 ${message.type === 'user' ? 'flex justify-end' : ''}`}
              >
                {message.type === 'bot' ? (
                  <p
                    className="text-xl md:text-2xl leading-relaxed"
                    style={{
                      fontFamily: 'var(--font-heading)',
                      fontWeight: 400,
                      color: 'rgba(232, 213, 183, 0.9)',
                      maxWidth: '85%',
                    }}
                  >
                    {message.content}
                    {message.isTyping && (
                      <span
                        className="inline-block w-0.5 h-6 ml-1 rounded-full"
                        style={{
                          backgroundColor: '#E8D5B7',
                          animation: 'blink 1s ease-in-out infinite',
                        }}
                      />
                    )}
                  </p>
                ) : (
                  <div
                    className="inline-block px-5 py-3 rounded-2xl text-base"
                    style={{
                      backgroundColor: 'rgba(232, 213, 183, 0.1)',
                      border: '1px solid rgba(232, 213, 183, 0.2)',
                      color: '#E8D5B7',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    {message.content}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      {!isDone && !isTyping && (
        <div className="p-6 md:p-8">
          <div className="max-w-2xl mx-auto">
            <div
              className="relative rounded-2xl overflow-hidden transition-all duration-200"
              style={{
                backgroundColor: 'rgba(232, 213, 183, 0.05)',
                border: '1px solid rgba(232, 213, 183, 0.15)',
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={userInput}
                onChange={e => setUserInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your answer..."
                disabled={isLoading}
                className="w-full px-5 py-4 pr-14 text-base focus:outline-none bg-transparent disabled:opacity-50"
                style={{
                  color: '#E8D5B7',
                  fontFamily: 'var(--font-body)',
                }}
              />
              <button
                onClick={handleSubmit}
                disabled={isLoading || !userInput.trim()}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-105 disabled:opacity-30"
                style={{
                  background: 'linear-gradient(135deg, #E8D5B7 0%, #D4C4A8 100%)',
                }}
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-[#0C0C0C]" />
                ) : (
                  <Send className="w-4 h-4 text-[#0C0C0C]" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Done state - continue button */}
      {isDone && !isTyping && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="p-6 md:p-8"
        >
          <div className="max-w-2xl mx-auto">
            <button
              onClick={() => onComplete({
                insights: [],
                archetypeHint: '',
                summary: '',
                conversationHistory,
              })}
              className="w-full px-6 py-4 rounded-xl text-base font-medium transition-all duration-200 hover:scale-[1.01] flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #E8D5B7 0%, #D4C4A8 100%)',
                color: '#0C0C0C',
                fontFamily: 'var(--font-body)',
              }}
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default CalibrationStep;
