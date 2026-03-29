import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAnalytics } from '../contexts/AnalyticsContext';
import { getAccessToken } from '@/services/api/apiBase';
import { usePlatformStatus } from '../hooks/usePlatformStatus';
import { useChatSession } from '../hooks/useChatSession';
import { SpotifyLogo, GoogleCalendarLogo, YoutubeLogo, DiscordLogo, LinkedinLogo } from '@/components/PlatformLogos';
import { ChatEmptyState } from '@/components/chat/ChatEmptyState';
import { MessageList } from '@/components/chat/MessageList';
import { ChatInputArea } from '@/components/chat/ChatInputArea';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { LimitReachedBanner } from '@/components/chat/LimitReachedBanner';
import { ContextSidebar } from '@/components/chat/ContextSidebar';
import { ChatContextSidebar } from '@/components/chat/ChatContextSidebar';
import { InsightsBanner } from '@/components/chat/InsightsBanner';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useProactiveInsights } from '@/hooks/useProactiveInsights';

interface ActionEvent {
  tool: string;
  params?: Record<string, any>;
  status: 'executing' | 'complete' | 'failed';
  data?: any;
  elapsedMs?: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  failed?: boolean;
  actions?: ActionEvent[];
  contextUsed?: {
    soulSignature?: boolean;
    twinSummary?: string | null;
    memoryStream?: { total: number; reflections: number; facts: number };
    proactiveInsights?: Array<{ insight: string; category: string; urgency: string }>;
    platformData?: string[];
    personalityProfile?: boolean;
  };
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';

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
    // Non-fatal
  }
}

const TalkToTwin = () => {
  useDocumentTitle('Talk to Twin');
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isSignedIn } = useAuth();
  const { trackFunnel } = useAnalytics();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    data: platformStatus,
    connectedCount,
    isLoading: isLoadingPlatforms
  } = usePlatformStatus(user?.id);
  const { undelivered: pendingInsights, markEngaged } = useProactiveInsights();

  const [messages, setMessages] = useState<Message[]>(loadChatHistory);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showContext, setShowContext] = useState(false);

  const platforms = [
    { name: 'Spotify', icon: <SpotifyLogo className="w-4 h-4" />, key: 'spotify', color: '#1DB954', connected: platformStatus?.spotify?.connected },
    { name: 'Calendar', icon: <GoogleCalendarLogo className="w-4 h-4" />, key: 'calendar', color: '#4285F4', connected: platformStatus?.google_calendar?.connected },
    { name: 'YouTube', icon: <YoutubeLogo className="w-4 h-4" />, key: 'youtube', color: '#FF0000', connected: platformStatus?.youtube?.connected },
    { name: 'Discord', icon: <DiscordLogo className="w-4 h-4" />, key: 'discord', color: '#5865F2', connected: platformStatus?.discord?.connected },
    { name: 'LinkedIn', icon: <LinkedinLogo className="w-4 h-4" />, key: 'linkedin', color: '#0A66C2', connected: platformStatus?.linkedin?.connected },
  ];

  const connectedPlatforms = platforms.filter(p => p.connected);


  const {
    interviewChecked,
    chatUsage,
    setChatUsage,
    limitReached,
    setLimitReached,
    contextItems,
    isLoadingContext,
    fetchUsage,
  } = useChatSession({ userId: user?.id, connectedPlatforms, messages, setMessages });

  useEffect(() => {
    if (!isSignedIn) navigate('/auth');
  }, [isSignedIn, navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (messages.length > 0) saveChatHistory(messages);
  }, [messages]);

  // Auto-send message from "Discuss with Twin" / dashboard chat navigation
  const autoSendFired = useRef(false);
  const pendingAutoSend = useRef<string | null>(null);
  useEffect(() => {
    const state = location.state as { discussContext?: string } | null;
    if (state?.discussContext && !autoSendFired.current) {
      pendingAutoSend.current = state.discussContext;
      setInputMessage(state.discussContext);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  // Trigger send once input is set and user is ready — fires at most once
  useEffect(() => {
    if (pendingAutoSend.current && user?.id && !autoSendFired.current && inputMessage === pendingAutoSend.current) {
      autoSendFired.current = true;
      pendingAutoSend.current = null;
      handleSendMessage();
    }
  }, [inputMessage, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive ghost suggestion from conversation context
  const ghostSuggestion = useMemo(() => {
    if (isTyping || messages.length === 0) return undefined;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== 'assistant') return undefined;

    const content = lastMsg.content.toLowerCase();
    if (content.includes('spotify') || content.includes('music') || content.includes('listening'))
      return 'What does my music taste say about me?';
    if (content.includes('calendar') || content.includes('schedule') || content.includes('meeting'))
      return 'How should I optimize my schedule?';
    if (content.includes('goal') || content.includes('progress') || content.includes('habit'))
      return 'What patterns do you see in my habits?';
    if (content.includes('sleep') || content.includes('recovery') || content.includes('health'))
      return 'How has my sleep been trending?';
    if (content.includes('work') || content.includes('career') || content.includes('project'))
      return 'What motivates me most at work?';
    return 'Tell me something surprising about myself';
  }, [messages, isTyping]);

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
      const token = getAccessToken() || localStorage.getItem('auth_token');
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
            } else if (event.type === 'action_start') {
              // Action events arrive before any chunks, so create the message if needed
              if (firstChunk) {
                firstChunk = false;
                setIsTyping(false);
                setMessages(prev => [...prev, {
                  id: assistantMsgId,
                  role: 'assistant',
                  content: '',
                  timestamp: new Date(),
                  actions: [{
                    tool: event.tool,
                    params: event.params,
                    status: 'executing' as const,
                  }],
                }]);
              } else {
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsgId ? {
                    ...m,
                    actions: [...(m.actions || []), {
                      tool: event.tool,
                      params: event.params,
                      status: 'executing' as const,
                    }]
                  } : m
                ));
              }
            } else if (event.type === 'action_result') {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? {
                  ...m,
                  actions: (m.actions || []).map(a =>
                    a.tool === event.tool ? {
                      ...a,
                      status: event.success ? 'complete' as const : 'failed' as const,
                      data: event.data,
                      elapsedMs: event.elapsedMs,
                    } : a
                  )
                } : m
              ));
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
  };

  const handleRetry = (content: string, messageId: string) => {
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

  const handleRate = async (messageId: string, rating: number, messageContent: string, userMessage: string | null) => {
    try {
      const token = getAccessToken() || localStorage.getItem('auth_token');
      await fetch(`${API_BASE}/chat/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          messageId,
          conversationId,
          rating,
          messageContent,
          userMessage,
          modelVersion: 'claude-sonnet',
        }),
      });
    } catch (err) {
      console.error('Failed to send feedback:', err);
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
      hour12: true,
      timeZoneName: 'short',
    }).format(date);
  };

  if (!interviewChecked) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin opacity-30" />
      </div>
    );
  }

  return (
    <div className="flex twin-chat-container overflow-x-hidden" style={{ height: 'calc(100dvh - 64px - 80px)', maxHeight: 'calc(100dvh - 64px - 80px)' }}>
      {/* Mobile: subtract pt-16 (64px) + pb-20 (80px) from SidebarLayout wrapper.
          Desktop: use full viewport height (sidebar layout has no top/bottom padding on lg+). */}
      <style>{`
        @media (min-width: 1024px) {
          .twin-chat-container { height: 100dvh !important; max-height: 100dvh !important; }
        }
      `}</style>
      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
        <ChatHeader
          hasMessages={messages.length > 0}
          showContext={showContext}
          onClearChat={handleClearChat}
          onToggleContext={() => setShowContext(!showContext)}
        />

        {messages.length === 0 && (
          <InsightsBanner
            insights={pendingInsights.slice(0, 3)}
            onQuickAction={handleQuickAction}
            onEngage={markEngaged}
          />
        )}

        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <ChatEmptyState
              connectedPlatforms={connectedPlatforms}
              platforms={platforms}
              onQuickAction={handleQuickAction}
              onSendMessage={handleSendMessage}
              insightsCount={pendingInsights.length}
            />
          ) : (
            <MessageList
              ref={messagesEndRef}
              messages={messages}
              isTyping={isTyping}
              formatTime={formatTime}
              onRetry={handleRetry}
              onRate={handleRate}
            />
          )}

          {limitReached && <LimitReachedBanner chatUsage={chatUsage} />}
        </div>

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
          ghostSuggestion={ghostSuggestion}
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
        messageCount={messages.filter(m => !m.failed).length}
      />

      <ChatContextSidebar
        calendarEvents={[]}
        insights={
          [...messages]
            .reverse()
            .find(m => m.role === 'assistant' && m.contextUsed?.proactiveInsights?.length)
            ?.contextUsed?.proactiveInsights ?? []
        }
        platformCount={connectedCount}
        messageCount={messages.filter(m => !m.failed).length}
        onMorningBriefing={() => handleQuickAction('Give me my morning briefing')}
      />
    </div>
  );
};

export default TalkToTwin;
