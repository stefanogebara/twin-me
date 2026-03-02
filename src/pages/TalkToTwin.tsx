import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAnalytics } from '../contexts/AnalyticsContext';
import { usePlatformStatus } from '../hooks/usePlatformStatus';
import {
  ArrowLeft,
  Sparkles, Layers,
  Lightbulb, TrendingUp, Heart, Zap,
  Trash2,
} from 'lucide-react';
import { SpotifyLogo, GoogleCalendarLogo, YoutubeLogo, DiscordLogo, LinkedinLogo } from '@/components/PlatformLogos';
import { ChatEmptyState } from '@/components/chat/ChatEmptyState';
import { MessageList } from '@/components/chat/MessageList';
import { ChatInputArea } from '@/components/chat/ChatInputArea';
import { ContextSidebar } from '@/components/chat/ContextSidebar';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  failed?: boolean;
  contextUsed?: {
    soulSignature?: boolean;
    twinSummary?: string | null;
    memoryStream?: { total: number; reflections: number; facts: number };
    proactiveInsights?: Array<{ insight: string; category: string; urgency: string }>;
    platformData?: string[];
    personalityProfile?: boolean;
  };
}

interface ContextItem {
  type: 'memory' | 'fact' | 'platform' | 'personality';
  label: string;
  value: string;
  timestamp?: string;
  icon?: React.ReactNode;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3004/api';

const CHAT_HISTORY_KEY = 'twin_chat_history';
const CHAT_HISTORY_MAX = 20;

function loadChatHistory(): Message[] {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Omit<Message, 'timestamp'> & { timestamp: string }>;
    return parsed.map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
  } catch {
    return [];
  }
}

function saveChatHistory(messages: Message[]): void {
  try {
    const capped = messages.slice(-CHAT_HISTORY_MAX);
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(capped));
  } catch {
    // Non-fatal — localStorage may be unavailable
  }
}

const TalkToTwin = () => {
  const navigate = useNavigate();
  const { user, isSignedIn } = useAuth();
  const { trackFunnel } = useAnalytics();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    data: platformStatus,
    connectedCount,
    isLoading: isLoadingPlatforms
  } = usePlatformStatus(user?.id);

  const [messages, setMessages] = useState<Message[]>(loadChatHistory);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showContext, setShowContext] = useState(true);
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [chatUsage, setChatUsage] = useState<{ used: number; limit: number; remaining: number; tier: string } | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [introFetched, setIntroFetched] = useState(false);

  // Interview guard: if user started but didn't finish the interview, redirect them back.
  // Existing users who never started are NOT blocked.
  const [interviewChecked, setInterviewChecked] = useState(false);
  useEffect(() => {
    const checkInterview = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        if (!token) { setInterviewChecked(true); return; }
        const payload = JSON.parse(atob(token.split('.')[1]));
        const userId = payload.id || payload.userId;
        if (!userId) { setInterviewChecked(true); return; }
        const res = await fetch(`${API_BASE}/onboarding/calibration-data/${userId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const { data } = await res.json();
          // Only block if interview was STARTED but not finished.
          // data === null means existing user who never started → don't block.
          if (data && !data.completed_at) {
            navigate('/interview');
            return;
          }
        }
      } catch {
        // Non-fatal — don't block on network error
      }
      setInterviewChecked(true);
    };
    checkInterview();
  }, [navigate]);

  // Design system color tokens
  const colors = {
    bg: '#fcf6ef',
    bgSecondary: 'rgba(255, 255, 255, 0.7)',
    bgTertiary: 'rgba(0, 0, 0, 0.05)',
    text: '#000000',
    textSecondary: '#8A857D',
    textMuted: '#8A857D',
    border: 'rgba(231, 229, 228, 0.6)',
    accent: '#000000',
    accentHover: '#1a1410',
    userBubble: 'rgba(0, 0, 0, 0.06)',
    userBubbleBg: 'rgba(0, 0, 0, 0.88)',
    userBubbleText: '#fcf6ef',
    assistantBubble: 'transparent',
    inputBg: 'rgba(255, 255, 255, 0.9)',
    inputBorder: 'rgba(231, 229, 228, 0.6)',
  };

  const platforms = [
    { name: 'Spotify', icon: <SpotifyLogo className="w-4 h-4" />, key: 'spotify', color: '#1DB954', connected: platformStatus?.spotify?.connected },
    { name: 'Calendar', icon: <GoogleCalendarLogo className="w-4 h-4" />, key: 'calendar', color: '#4285F4', connected: platformStatus?.google_calendar?.connected },
    { name: 'YouTube', icon: <YoutubeLogo className="w-4 h-4" />, key: 'youtube', color: '#FF0000', connected: platformStatus?.youtube?.connected },
    { name: 'Discord', icon: <DiscordLogo className="w-4 h-4" />, key: 'discord', color: '#5865F2', connected: platformStatus?.discord?.connected },
    { name: 'LinkedIn', icon: <LinkedinLogo className="w-4 h-4" />, key: 'linkedin', color: '#0A66C2', connected: platformStatus?.linkedin?.connected },
  ];

  const connectedPlatforms = platforms.filter(p => p.connected);

  const quickActions = [
    { label: 'How am I doing today?', icon: <Heart className="w-4 h-4" /> },
    { label: 'What have you noticed about me lately?', icon: <TrendingUp className="w-4 h-4" /> },
    { label: 'What should I do this evening?', icon: <Lightbulb className="w-4 h-4" /> },
    { label: "What's on my mind right now?", icon: <Zap className="w-4 h-4" /> },
  ];

  useEffect(() => {
    if (!isSignedIn) {
      navigate('/auth');
    }
  }, [isSignedIn, navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Persist chat history to localStorage whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      saveChatHistory(messages);
    }
  }, [messages]);

  useEffect(() => {
    if (user?.id) {
      loadContext();
    }
  }, [user?.id]);

  const fetchUsage = async () => {
    if (!user?.id) return;
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${API_BASE}/chat/usage`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setChatUsage({ used: data.used, limit: data.limit, remaining: data.remaining, tier: data.tier });
          setLimitReached(data.remaining <= 0 && data.tier === 'free');
        }
      }
    } catch { /* non-blocking */ }
  };

  useEffect(() => {
    fetchUsage();
  }, [user?.id]);

  // Fetch a personalized first greeting from the twin on page load (new users only).
  // Skip if we already have persisted chat history to avoid displacing it.
  useEffect(() => {
    if (!user?.id || introFetched) return;
    if (messages.length > 0) {
      setIntroFetched(true);
      return;
    }
    setIntroFetched(true);
    const token = localStorage.getItem('auth_token');
    fetch(`${API_BASE}/chat/intro`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.intro) {
          setMessages([{
            id: 'twin-intro',
            role: 'assistant',
            content: data.intro,
            timestamp: new Date(),
          }]);
        }
      })
      .catch(() => { /* non-fatal */ });
  }, [user?.id]);

  const loadContext = async () => {
    if (!user?.id) return;
    setIsLoadingContext(true);

    try {
      const token = localStorage.getItem('auth_token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch(`${API_BASE}/chat/context`, { headers }).catch(() => null);
      const items: ContextItem[] = [];

      connectedPlatforms.forEach(p => {
        items.push({ type: 'platform', label: p.name, value: 'Connected', icon: p.icon });
      });

      if (res?.ok) {
        const data = await res.json();

        if (data.twinSummary) {
          items.push({
            type: 'personality',
            label: 'Twin Identity',
            value: data.twinSummary.length > 120 ? data.twinSummary.substring(0, 120) + '...' : data.twinSummary
          });
        }

        if (data.memoryStats && data.memoryStats.total > 0) {
          const ms = data.memoryStats;
          const parts = [`${ms.total} total`];
          if (ms.byType?.reflection) parts.push(`${ms.byType.reflection} reflections`);
          if (ms.byType?.fact) parts.push(`${ms.byType.fact} facts`);
          if (ms.byType?.conversation) parts.push(`${ms.byType.conversation} conversations`);
          items.push({ type: 'memory', label: 'Memory Stream', value: parts.join(', ') });
        }

        if (data.pendingInsights && data.pendingInsights.length > 0) {
          items.push({
            type: 'fact',
            label: 'Pending Insights',
            value: `${data.pendingInsights.length} insight${data.pendingInsights.length > 1 ? 's' : ''} ready`
          });
        }
      }

      setContextItems(items);
    } catch (error) {
      console.error('Error loading context:', error);
    } finally {
      setIsLoadingContext(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !user?.id) return;

    const msgCount = messages.filter(m => m.role === 'user').length + 1;
    trackFunnel('twin_chat_message_sent', {
      message_number: msgCount,
      is_first_message: msgCount === 1,
    });

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputMessage;
    setInputMessage('');
    setIsTyping(true);

    const assistantMsgId = crypto.randomUUID();

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/chat/message?stream=1`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: currentInput,
          conversationId,
          context: { platforms: connectedPlatforms.map(p => p.key) }
        })
      });

      if (response.status === 429) {
        const data = await response.json();
        setLimitReached(true);
        if (data.usage) setChatUsage({ used: data.usage.used, limit: data.usage.limit, remaining: 0, tier: data.usage.tier });
        setMessages(prev => prev.filter(m => m.id !== userMessage.id));
        setInputMessage(currentInput);
        return;
      }

      if (!response.ok || !response.body) {
        throw new Error('Failed to send message');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let firstChunk = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === 'chunk') {
              if (firstChunk) {
                firstChunk = false;
                setIsTyping(false);
                setMessages(prev => [...prev, {
                  id: assistantMsgId,
                  role: 'assistant',
                  content: event.content,
                  timestamp: new Date(),
                }]);
              } else {
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsgId ? { ...m, content: m.content + event.content } : m
                ));
              }
            } else if (event.type === 'done') {
              if (event.conversationId) setConversationId(event.conversationId);
              if (event.contextSources) {
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsgId ? {
                    ...m,
                    contextUsed: {
                      soulSignature: event.contextSources.soulSignature,
                      twinSummary: event.contextSources.twinSummary,
                      memoryStream: event.contextSources.memoryStream,
                      proactiveInsights: event.contextSources.proactiveInsights,
                      platformData: event.contextSources.platformData,
                      personalityProfile: event.contextSources.personalityProfile,
                    }
                  } : m
                ));
              }
              fetchUsage();
            } else if (event.type === 'error') {
              setMessages(prev => {
                const hasMsg = prev.some(m => m.id === assistantMsgId);
                if (hasMsg) {
                  return prev.map(m => m.id === assistantMsgId ? { ...m, failed: true } : m);
                }
                return prev.map(m => m.id === userMessage.id ? { ...m, failed: true } : m);
              });
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => {
        const hasAssistantMsg = prev.some(m => m.id === assistantMsgId);
        if (hasAssistantMsg) {
          return prev.map(m => m.id === assistantMsgId ? { ...m, failed: true } : m);
        }
        return prev.map(m => m.id === userMessage.id ? { ...m, failed: true } : m);
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleClearChat = () => {
    localStorage.removeItem(CHAT_HISTORY_KEY);
    setMessages([]);
    setConversationId(null);
    setIntroFetched(false);
  };

  const handleRetry = (content: string, messageId: string) => {
    // Remove the failed message and restore content to input so user can resend
    setMessages(prev => prev.filter(m => m.id !== messageId));
    setInputMessage(content);
    inputRef.current?.focus();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleQuickAction = (text: string) => {
    setInputMessage(text);
    inputRef.current?.focus();
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  };

  if (!interviewChecked) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: '#fcf6ef' }}>
        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin opacity-30" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex"
      style={{ backgroundColor: colors.bg }}
    >
      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
        <header
          className="flex items-center justify-between px-6 py-4 lg:py-5 border-b"
          style={{ borderColor: colors.border }}
        >
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 rounded-lg transition-colors hover:opacity-70"
            style={{ color: colors.textSecondary }}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: colors.accent }}
            >
              <Sparkles className="w-4 h-4" style={{ color: '#fcf6ef' }} />
            </div>
            <span
              className="font-medium"
              style={{ color: colors.text }}
            >
              Your Twin
            </span>
          </div>

          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={handleClearChat}
                className="p-2 rounded-lg transition-colors hover:opacity-70"
                style={{ color: colors.textSecondary }}
                title="Clear chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setShowContext(!showContext)}
              className="p-2 rounded-lg transition-colors hover:opacity-70 md:hidden"
              style={{ color: colors.textSecondary }}
            >
              <Layers className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <ChatEmptyState
              connectedPlatforms={connectedPlatforms}
              platforms={platforms}
              quickActions={quickActions}
              colors={colors}
              onQuickAction={handleQuickAction}
            />
          ) : (
            <MessageList
              ref={messagesEndRef}
              messages={messages}
              isTyping={isTyping}
              colors={colors}
              formatTime={formatTime}
              onRetry={handleRetry}
            />
          )}
        </div>

        {limitReached && (
          <div
            className="mx-4 mb-2 p-6 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3"
            style={{
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.05))',
              border: '1px solid rgba(99, 102, 241, 0.25)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(99, 102, 241, 0.15)' }}>
                <Zap className="w-5 h-5" style={{ color: '#6366F1' }} />
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: colors.text }}>
                  You've used all {chatUsage?.limit ?? 100} free messages this month
                </p>
                <p className="text-xs" style={{ color: colors.textMuted }}>
                  Resets on {chatUsage ? new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : 'next month'}
                </p>
              </div>
            </div>
            <button
              className="px-5 py-2 rounded-xl text-sm font-medium whitespace-nowrap"
              disabled
              style={{
                background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                color: '#fff',
                boxShadow: '0 2px 12px rgba(99, 102, 241, 0.3)',
                opacity: 0.6,
                cursor: 'not-allowed'
              }}
              title="Upgrade feature coming soon"
            >
              Upgrade to Pro - Coming Soon
            </button>
          </div>
        )}

        <ChatInputArea
          ref={inputRef}
          inputMessage={inputMessage}
          onInputChange={setInputMessage}
          onKeyDown={handleKeyPress}
          onSend={handleSendMessage}
          isTyping={isTyping}
          isDisabled={limitReached}
          limitReached={limitReached}
          hasConnectedPlatforms={connectedPlatforms.length > 0}
          chatUsage={chatUsage}
          colors={colors}
        />
      </div>

      <ContextSidebar
        showContext={showContext}
        onClose={() => setShowContext(false)}
        platforms={platforms}
        connectedPlatforms={connectedPlatforms}
        contextItems={contextItems}
        isLoadingContext={isLoadingContext}
        connectedCount={connectedCount}
        messageCount={messages.length}
        colors={colors}
      />
    </div>
  );
};

export default TalkToTwin;
