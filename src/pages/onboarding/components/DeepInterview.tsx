import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, ArrowRight, Sparkles, Mic, MicOff, Keyboard } from 'lucide-react';
import { useVoiceInterview, type OrbVoiceState } from '../../../hooks/useVoiceInterview';
import SoulOrb from './SoulOrb';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';
const ELEVENLABS_AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID || '';


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

type InterviewMode = 'voice' | 'text' | null;

const DeepInterview: React.FC<DeepInterviewProps> = ({
  enrichmentContext,
  onComplete,
  onSkip,
}) => {
  // Mode selection — null means "show picker"
  const [mode, setMode] = useState<InterviewMode>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [domainProgress, setDomainProgress] = useState<Record<string, { asked: number; covered: boolean }>>({});
  const [isDone, setIsDone] = useState(false);
  const [summary, setSummary] = useState('');
  const [enhancedSignature, setEnhancedSignature] = useState<SoulSignature | undefined>(undefined);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initRan = useRef(false);

  const STORAGE_KEY = 'twinme_interview_progress';

  // Get userId from auth token
  const getUserId = useCallback(() => {
    try {
      const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
      if (!token) return null;
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.id || payload.userId || null;
    } catch { return null; }
  }, []);

  // Voice transcript callback — feeds voice turns into the unified messages array
  const handleVoiceTranscript = useCallback((text: string, role: 'user' | 'assistant') => {
    setMessages(prev => {
      const newMsg: Message = { role, content: text };
      return [...prev, newMsg];
    });
    // Increment question counter after each user answer (voice endpoint tracks its own state)
    if (role === 'user') {
      setQuestionNumber(q => q + 1);
    }
  }, []);

  const handleVoiceStatusChange = useCallback((state: OrbVoiceState) => {
    // Clear voice error when voice starts working
    if (state !== 'idle') setVoiceError(null);
  }, []);

  const handleVoiceError = useCallback((message: string) => {
    setVoiceError(message);
    // Auto-clear error after 5 seconds
    setTimeout(() => setVoiceError(null), 5000);
  }, []);

  // Voice session ended — run completion pipeline
  const handleVoiceSessionEnd = useCallback(async (
    voiceMessages: Array<{ role: string; content: string }>,
    reason: 'agent' | 'user' | 'error'
  ) => {
    // Only run completion if we have enough messages (at least 4 Q&A exchanges)
    if (voiceMessages.length < 4) return;
    console.log('[DeepInterview] Voice session ended:', reason, 'messages:', voiceMessages.length);

    setLoading(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/onboarding/voice/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          conversationHistory: voiceMessages,
          enrichmentContext,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.done) {
          setIsDone(true);
          setSummary(result.personality_summary || '');
          clearProgress();
          await generateEnhancedSignature({
            insights: result.insights,
            archetypeHint: result.archetype_hint,
            summary: result.personality_summary,
          });
        }
      }
    } catch (error) {
      console.error('[DeepInterview] Voice completion error:', error);
    } finally {
      setLoading(false);
    }
  }, [enrichmentContext]);

  // Voice interview hook
  const voiceAvailable = !!ELEVENLABS_AGENT_ID;
  const voiceEnabled = voiceAvailable && mode === 'voice';
  const voice = useVoiceInterview({
    agentId: ELEVENLABS_AGENT_ID,
    userId: getUserId(),
    enrichmentContext,
    onTranscript: handleVoiceTranscript,
    onStatusChange: handleVoiceStatusChange,
    onError: handleVoiceError,
    onSessionEnd: handleVoiceSessionEnd,
  });

  // Derive orb phase from question progress
  const getOrbPhase = (): 'dormant' | 'awakening' | 'alive' => {
    if (questionNumber <= 3) return 'dormant';
    if (questionNumber <= 8) return 'awakening';
    return 'alive';
  };

  // Voice status label for the orb
  const getVoiceLabel = (): string | undefined => {
    if (!voiceEnabled || !voice.isAvailable) return undefined;
    if (voice.orbState === 'listening') return 'Listening...';
    if (voice.orbState === 'thinking') return 'Thinking...';
    if (voice.orbState === 'speaking') return 'Speaking...';
    if (voice.isActive) return 'Stop voice';
    return 'Start voice';
  };

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

  // Restore or start fresh — only when a mode is selected
  useEffect(() => {
    if (mode === null) return; // Wait for mode selection
    if (initRan.current) return;
    initRan.current = true;

    // Voice mode: start voice session immediately, skip text question fetch
    if (mode === 'voice') {
      voice.toggleVoice();
      return;
    }

    // Text mode: restore progress or fetch first question
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const progress = JSON.parse(saved);
        if (progress.savedAt && Date.now() - progress.savedAt < 7 * 24 * 60 * 60 * 1000) {
          const restoredMessages = progress.messages || [];
          const restoredQ = progress.questionNumber || 1;
          const restoredDp = progress.domainProgress || {};
          setMessages(restoredMessages);
          setQuestionNumber(restoredQ);
          setDomainProgress(restoredDp);
          fetchNextQuestion(restoredMessages, 0, restoredQ, restoredDp);
          return;
        }
      }
    } catch { /* corrupted data — start fresh */ }

    fetchNextQuestion([]);
  }, [mode]);

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

    setInput('');
    // Reset textarea height after send
    if (inputRef.current) inputRef.current.style.height = 'auto';

    // If voice session is active, route text through voice agent (NOT text calibration)
    // The voice agent's onMessage callback will handle adding it to messages
    if (voice.hasSession) {
      voice.sendText(text);
      // Add user message to UI immediately (voice onMessage will add agent response)
      setMessages(prev => [...prev, { role: 'user', content: text }]);
      return;
    }

    // Text-only mode: use the text calibration endpoint
    const newMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
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

  // ===== MODE SELECTION SCREEN =====
  if (mode === null) {
    const firstName = enrichmentContext?.name?.split(' ')[0] || '';
    return (
      <div className="flex flex-col flex-1 min-h-0 items-center justify-center px-6">
        <style>{`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(16px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes fadeInScale {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
          }
          @media (prefers-reduced-motion: reduce) {
            .mode-animate { animation: none !important; }
          }
        `}</style>

        {/* SoulOrb */}
        <div className="mb-6 mode-animate" style={{ animation: 'fadeInScale 0.8s ease-out both' }}>
          <SoulOrb phase="alive" dataPointCount={4} />
        </div>

        {/* Greeting */}
        <h2
          className="text-2xl md:text-3xl text-center mb-2 mode-animate"
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontWeight: 400,
            letterSpacing: '-0.02em',
            color: '#E8D5B7',
            animation: 'fadeInUp 0.6s ease-out 0.3s both',
          }}
        >
          {firstName ? `Hey ${firstName}` : 'Hey there'}
        </h2>

        <p
          className="text-sm text-center mb-10 max-w-xs mode-animate"
          style={{
            color: 'rgba(232, 213, 183, 0.5)',
            fontFamily: "'Inter', sans-serif",
            animation: 'fadeInUp 0.6s ease-out 0.5s both',
          }}
        >
          How would you like to tell your story?
        </p>

        {/* Mode options — two elegant choices */}
        <div className="flex flex-col gap-4 w-full max-w-xs mode-animate" style={{ animation: 'fadeInUp 0.6s ease-out 0.7s both' }}>
          {/* Voice option */}
          {voiceAvailable && (
            <button
              onClick={() => setMode('voice')}
              className="group flex items-center gap-4 w-full py-4 px-5 rounded-2xl transition-all duration-200 hover:scale-[1.02]"
              style={{
                background: 'rgba(232, 213, 183, 0.06)',
                border: '1px solid rgba(232, 213, 183, 0.15)',
                cursor: 'pointer',
              }}
            >
              <div
                className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(232, 213, 183, 0.1)' }}
              >
                <Mic className="w-5 h-5" style={{ color: 'rgba(232, 213, 183, 0.7)' }} />
              </div>
              <div className="text-left">
                <p
                  className="text-sm font-medium"
                  style={{ color: '#E8D5B7', fontFamily: "'Inter', sans-serif" }}
                >
                  Voice conversation
                </p>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: 'rgba(232, 213, 183, 0.4)', fontFamily: "'Inter', sans-serif" }}
                >
                  Talk naturally with your AI interviewer
                </p>
              </div>
              <ArrowRight className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: '#E8D5B7' }} />
            </button>
          )}

          {/* Text option */}
          <button
            onClick={() => setMode('text')}
            className="group flex items-center gap-4 w-full py-4 px-5 rounded-2xl transition-all duration-200 hover:scale-[1.02]"
            style={{
              background: 'rgba(232, 213, 183, 0.06)',
              border: '1px solid rgba(232, 213, 183, 0.15)',
              cursor: 'pointer',
            }}
          >
            <div
              className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(232, 213, 183, 0.1)' }}
            >
              <Keyboard className="w-5 h-5" style={{ color: 'rgba(232, 213, 183, 0.7)' }} />
            </div>
            <div className="text-left">
              <p
                className="text-sm font-medium"
                style={{ color: '#E8D5B7', fontFamily: "'Inter', sans-serif" }}
              >
                Text conversation
              </p>
              <p
                className="text-xs mt-0.5"
                style={{ color: 'rgba(232, 213, 183, 0.4)', fontFamily: "'Inter', sans-serif" }}
              >
                Type your answers at your own pace
              </p>
            </div>
            <ArrowRight className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: '#E8D5B7' }} />
          </button>
        </div>

        {/* Skip link */}
        <button
          onClick={onSkip}
          className="mt-8 text-xs transition-opacity hover:opacity-70 mode-animate"
          style={{
            color: 'rgba(232, 213, 183, 0.25)',
            fontFamily: "'Inter', sans-serif",
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            animation: 'fadeInUp 0.6s ease-out 0.9s both',
          }}
        >
          Skip for now
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <style>{`
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes typingBounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-4px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .typing-dot, [class*="animate-"] {
            animation: none !important;
            transition: none !important;
          }
        }
        .soul-orb-responsive {
          transform: scale(0.65);
          transform-origin: center center;
          margin-top: -20px;
          margin-bottom: -20px;
        }
        @media (min-width: 640px) {
          .soul-orb-responsive {
            transform: scale(0.85);
            margin-top: 0;
            margin-bottom: 4px;
          }
        }
      `}</style>

      {/* Scrollable area: full width, scrollbar at screen edge */}
      <div className="flex-1 overflow-y-auto mb-3 scrollbar-hide min-h-0">
        <div className="flex flex-col">
          {/* Header */}
          <div className="text-center mb-2 pt-6 lg:pt-8 flex-shrink-0 max-w-lg mx-auto w-full">
            <h2
              className="text-lg md:text-xl mb-0.5"
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
              style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(255,255,255,0.35)' }}
            >
              {questionNumber <= 12
                ? `Question ${Math.max(1, Math.min(questionNumber - 1, 12))} of 12`
                : 'Wrapping up'}
            </p>
          </div>

          {/* SoulOrb — always shows as visual anchor, voice-interactive when available */}
          <div
            className="soul-orb-responsive flex justify-center flex-shrink-0 max-w-lg mx-auto w-full"
            style={{ animation: 'fadeInScale 0.8s ease-out both' }}
          >
            <SoulOrb
              phase={getOrbPhase()}
              dataPointCount={Math.min(questionNumber * 2, 20)}
              voiceState={voiceEnabled && voice.isAvailable ? voice.orbState : 'idle'}
              outputVolume={voiceEnabled && voice.isAvailable ? voice.outputVolume : 0}
              onClick={voiceEnabled && voice.isAvailable ? voice.toggleVoice : undefined}
              statusLabel={voiceEnabled && voice.isAvailable ? getVoiceLabel() : undefined}
            />
          </div>

          {/* Voice error toast */}
          {voiceError && (
            <div
              className="mx-auto mb-2 px-4 py-2 rounded-xl text-xs max-w-sm text-center flex-shrink-0"
              style={{
                backgroundColor: 'rgba(255, 100, 100, 0.1)',
                border: '1px solid rgba(255, 100, 100, 0.2)',
                color: 'rgba(255, 150, 150, 0.8)',
                fontFamily: "'Geist', sans-serif",
              }}
            >
              {voiceError}
            </div>
          )}

          {/* Chat messages — plain text, no bubbles (matches TalkToTwin) */}
          <div className="space-y-6 py-6 px-6 max-w-3xl mx-auto w-full">
          {messages.map((msg, i) => {
            const isUser = msg.role === 'user';
            // Show divider when speaker changes
            const prevMsg = i > 0 ? messages[i - 1] : null;
            const showDivider = prevMsg && prevMsg.role !== msg.role;
            return (
              <div key={i} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                {showDivider && (
                  <div className="w-full my-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }} />
                )}
                <div className={`max-w-[85%] ${isUser ? 'text-right' : 'text-left'}`}>
                  <p
                    className="whitespace-pre-wrap leading-relaxed"
                    style={{
                      fontSize: '15px',
                      lineHeight: 1.7,
                      color: 'var(--foreground)',
                      opacity: isUser ? 0.95 : 0.7,
                      fontFamily: 'Inter, sans-serif',
                    }}
                  >
                    {msg.content}
                  </p>
                </div>
              </div>
            );
          })}

          {/* Loading indicator — staggered typing dots */}
          {loading && (
            <div className="flex items-start">
              <div className="flex gap-1.5 py-1">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="typing-dot w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.35)',
                      animation: 'typingBounce 1.2s ease-in-out infinite',
                      animationDelay: `${i * 0.2}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* Input area or completion — constrained width */}
      <div className="max-w-3xl mx-auto w-full px-6 pb-2">
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
        <div
          className="flex items-end gap-3 rounded-[20px] px-5 py-4 transition-all duration-300"
          style={{
            background: 'var(--glass-surface-bg)',
            backdropFilter: 'blur(42px)',
            WebkitBackdropFilter: 'blur(42px)',
            border: voice.isActive
              ? '1px solid rgba(240, 200, 128, 0.25)'
              : '1px solid var(--glass-surface-border)',
            boxShadow: voice.isActive
              ? '0 4px 4px rgba(0,0,0,0.12), 0 0 20px rgba(240, 200, 128, 0.06)'
              : '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          {/* Mode toggle: Mic (start voice) / Keyboard (switch to text) */}
          {voiceEnabled && voice.isAvailable && (
            <button
              onClick={() => {
                if (voice.isActive) {
                  // Stop voice and focus text input
                  voice.toggleVoice();
                  setTimeout(() => inputRef.current?.focus(), 100);
                } else {
                  voice.toggleVoice();
                }
              }}
              className="flex-shrink-0 flex items-center justify-center transition-all duration-200"
              title={voice.isActive ? 'Switch to typing' : 'Start voice conversation'}
              aria-label={voice.isActive ? 'Switch to typing' : 'Start voice conversation'}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '100px',
                color: voice.isActive
                  ? 'rgba(240, 200, 128, 0.8)'
                  : 'var(--text-muted)',
                cursor: 'pointer',
                backgroundColor: voice.isActive ? 'rgba(240, 200, 128, 0.08)' : 'transparent',
              }}
            >
              {voice.isActive ? <Keyboard className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          )}

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              voice.isActive
                ? voice.orbState === 'listening'
                  ? 'Listening... or type here'
                  : voice.orbState === 'speaking'
                    ? 'Twin is speaking...'
                    : 'Or type here...'
                : 'Type your answer...'
            }
            disabled={loading}
            rows={1}
            className="flex-1 bg-transparent resize-none"
            style={{
              color: 'var(--foreground)',
              fontFamily: 'Inter, sans-serif',
              fontSize: '15px',
              minHeight: '24px',
              maxHeight: '120px',
              overflowY: 'auto',
              caretColor: 'rgba(232, 213, 183, 0.6)',
              outline: 'none',
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            aria-label="Send message"
            className="flex-shrink-0 flex items-center justify-center transition-all duration-200"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '100px',
              backgroundColor: input.trim() ? '#252222' : 'transparent',
              color: input.trim() ? 'var(--background)' : 'var(--text-muted)',
              cursor: input.trim() ? 'pointer' : 'default',
              opacity: input.trim() ? 1 : 0.5,
            }}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Done for now — triggers completion pipeline if enough data, otherwise skips */}
      {!isDone && (
        <button
          onClick={async () => {
            // Fully end voice session (not just pause)
            await voice.endVoice();
            // If enough conversation data, trigger completion to generate archetype
            if (messages.length >= 4) {
              setLoading(true);
              try {
                const token = getAuthToken();
                // Use voice completion endpoint which handles both voice and text transcripts
                const response = await fetch(`${API_URL}/onboarding/voice/complete`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                  },
                  body: JSON.stringify({
                    conversationHistory: messages,
                    enrichmentContext,
                  }),
                });
                if (response.ok) {
                  const result = await response.json();
                  if (result.done) {
                    setIsDone(true);
                    setSummary(result.personality_summary || '');
                    clearProgress();
                    await generateEnhancedSignature({
                      insights: result.insights,
                      archetypeHint: result.archetype_hint,
                      summary: result.personality_summary,
                    });
                    setLoading(false);
                    return; // Show completion view, don't navigate yet
                  }
                }
              } catch (err) {
                console.error('[DeepInterview] Early completion error:', err);
              }
              setLoading(false);
            }
            // Save partial interview answers as memories before skipping
            const token = getAuthToken();
            const userAnswers = messages.filter(m => m.role === 'user');
            if (token && userAnswers.length > 0) {
              fetch(`${API_URL}/onboarding/calibrate`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                  history: messages.map(m => ({ role: m.role, content: m.content })),
                  questionNumber: questionNumber,
                  domainProgress,
                  forceComplete: true,
                }),
              }).catch(err => console.warn('[DeepInterview] Partial save failed:', err));
            }
            clearProgress();
            onSkip();
          }}
          disabled={loading}
          className="mt-1 py-2.5 text-[13px] transition-opacity hover:opacity-70 w-full"
          style={{
            color: 'rgba(255,255,255,0.6)',
            fontFamily: "'Inter', sans-serif",
            background: 'none',
            border: 'none',
            cursor: loading ? 'wait' : 'pointer',
            textAlign: 'center',
            minHeight: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {loading ? 'Generating your profile...' : 'Done for now'}
        </button>
      )}
      </div>
    </div>
  );
};

export default DeepInterview;
