import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useVoiceInterview, type OrbVoiceState } from '../../../hooks/useVoiceInterview';
import SoulOrb from './SoulOrb';
import { getAccessToken } from '@/services/api/apiBase';
import ModeSelectionScreen from './interview/ModeSelectionScreen';
import InterviewCompletion from './interview/InterviewCompletion';
import ChatInputArea from './interview/ChatInputArea';

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
      const token = getAccessToken();
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
    if (role === 'user') {
      setQuestionNumber(q => q + 1);
    }
  }, []);

  const handleVoiceStatusChange = useCallback((state: OrbVoiceState) => {
    if (state !== 'idle') setVoiceError(null);
  }, []);

  const handleVoiceError = useCallback((message: string) => {
    setVoiceError(message);
    setTimeout(() => setVoiceError(null), 5000);
  }, []);

  // Voice session ended — run completion pipeline
  const handleVoiceSessionEnd = useCallback(async (
    voiceMessages: Array<{ role: string; content: string }>,
    reason: 'agent' | 'user' | 'error'
  ) => {
    if (voiceMessages.length < 4) return;

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

  const clearProgress = () => {
    localStorage.removeItem(STORAGE_KEY);
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Restore or start fresh — only when a mode is selected
  useEffect(() => {
    if (mode === null) return;
    if (initRan.current) return;
    initRan.current = true;

    if (mode === 'voice') {
      voice.toggleVoice();
      return;
    }

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

  const getAuthToken = () => getAccessToken();

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
    if (inputRef.current) inputRef.current.style.height = 'auto';

    if (voice.hasSession) {
      voice.sendText(text);
      setMessages(prev => [...prev, { role: 'user', content: text }]);
      return;
    }

    const newMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    saveProgress(newMessages, questionNumber, domainProgress);
    fetchNextQuestion(newMessages);
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

  const handleDoneEarly = async () => {
    // Navigate immediately — don't block on LLM calls
    voice.endVoice().catch(() => {});
    clearProgress();

    const token = getAuthToken();

    if (messages.length >= 4) {
      // Fire completion + signature generation in background (non-blocking)
      fetch(`${API_URL}/onboarding/voice/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          conversationHistory: messages,
          enrichmentContext,
        }),
      })
        .then(r => r.ok ? r.json() : null)
        .then(result => {
          if (result?.done) {
            // Signature generation also in background
            generateEnhancedSignature({
              insights: result.insights,
              archetypeHint: result.archetype_hint,
              summary: result.personality_summary,
            }).catch(() => {});
          }
        })
        .catch(err => console.warn('[DeepInterview] Background completion:', err));
    } else {
      // Save partial interview answers in background
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
    }

    // Navigate immediately — don't wait for API calls
    onSkip();
  };

  // ===== MODE SELECTION SCREEN =====
  if (mode === null) {
    const firstName = enrichmentContext?.name?.split(' ')[0] || '';
    return (
      <ModeSelectionScreen
        firstName={firstName}
        voiceAvailable={voiceAvailable}
        onSelectVoice={() => setMode('voice')}
        onSelectText={() => setMode('text')}
        onSkip={onSkip}
      />
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

      {/* Scrollable area */}
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

          {/* SoulOrb */}
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

          {/* Chat messages */}
          <div className="space-y-6 py-6 px-6 max-w-3xl mx-auto w-full">
          {messages.map((msg, i) => {
            const isUser = msg.role === 'user';
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

          {/* Loading indicator */}
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

      {/* Input area or completion */}
      <div className="max-w-3xl mx-auto w-full px-6 pb-2">
      {isDone ? (
        <InterviewCompletion
          enhancedSignature={enhancedSignature}
          summary={summary}
          onComplete={() => onComplete(enhancedSignature)}
        />
      ) : (
        <ChatInputArea
          input={input}
          loading={loading}
          isDone={isDone}
          voiceEnabled={voiceEnabled}
          voiceAvailable={voice.isAvailable}
          voiceIsActive={voice.isActive}
          voiceHasSession={voice.hasSession}
          voiceOrbState={voice.orbState}
          inputRef={inputRef}
          messages={messages}
          enrichmentContext={enrichmentContext}
          onInputChange={setInput}
          onSend={handleSend}
          onToggleVoice={voice.toggleVoice}
          onEndVoice={voice.endVoice}
          onSendText={voice.sendText}
          onSkip={onSkip}
          onDoneEarly={handleDoneEarly}
        />
      )}
      </div>
    </div>
  );
};

export default DeepInterview;
