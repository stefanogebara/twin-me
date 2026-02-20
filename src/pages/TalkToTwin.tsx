import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAnalytics } from '../contexts/AnalyticsContext';
import { usePlatformStatus } from '../hooks/usePlatformStatus';
import {
  ArrowLeft,
  Sparkles, Layers,
  Lightbulb, TrendingUp, Heart, Zap
} from 'lucide-react';
import { SpotifyLogo, WhoopLogo, GoogleCalendarLogo, YoutubeLogo, TwitchLogo } from '@/components/PlatformLogos';
import { ChatEmptyState } from '@/components/chat/ChatEmptyState';
import { MessageList } from '@/components/chat/MessageList';
import { ChatInputArea } from '@/components/chat/ChatInputArea';
import { ContextSidebar } from '@/components/chat/ContextSidebar';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
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

const TalkToTwin = () => {
  const navigate = useNavigate();
  const { user, isSignedIn } = useAuth();
  const { theme } = useTheme();
  const { trackFunnel } = useAnalytics();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    data: platformStatus,
    connectedCount,
    isLoading: isLoadingPlatforms
  } = usePlatformStatus(user?.id);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showContext, setShowContext] = useState(true);
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [chatUsage, setChatUsage] = useState<{ used: number; limit: number; remaining: number; tier: string } | null>(null);
  const [limitReached, setLimitReached] = useState(false);

  const colors = {
    bg: theme === 'dark' ? '#232320' : '#FAFAFA',
    bgSecondary: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(255, 255, 255, 0.7)',
    bgTertiary: theme === 'dark' ? 'rgba(45, 45, 41, 0.7)' : 'rgba(0, 0, 0, 0.05)',
    text: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
    textSecondary: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e',
    textMuted: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e',
    border: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(231, 229, 228, 0.6)',
    accent: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
    accentHover: theme === 'dark' ? '#D4D3CC' : '#292524',
    userBubble: theme === 'dark' ? 'rgba(193, 192, 182, 0.15)' : 'rgba(0, 0, 0, 0.06)',
    userBubbleBg: theme === 'dark' ? 'rgba(80, 78, 70, 0.9)' : 'rgba(12, 10, 9, 0.85)',
    userBubbleText: theme === 'dark' ? '#E8E7E3' : '#FAFAFA',
    assistantBubble: 'transparent',
    inputBg: theme === 'dark' ? 'rgba(45, 45, 41, 0.7)' : 'rgba(255, 255, 255, 0.9)',
    inputBorder: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(231, 229, 228, 0.6)',
  };

  const platforms = [
    { name: 'Spotify', icon: <SpotifyLogo className="w-4 h-4" />, key: 'spotify', color: '#1DB954', connected: platformStatus?.spotify?.connected },
    { name: 'Whoop', icon: <WhoopLogo className="w-4 h-4" />, key: 'whoop', color: '#00A5E0', connected: platformStatus?.whoop?.connected },
    { name: 'Calendar', icon: <GoogleCalendarLogo className="w-4 h-4" />, key: 'calendar', color: '#4285F4', connected: platformStatus?.google_calendar?.connected },
    { name: 'YouTube', icon: <YoutubeLogo className="w-4 h-4" />, key: 'youtube', color: '#FF0000', connected: platformStatus?.youtube?.connected },
    { name: 'Twitch', icon: <TwitchLogo className="w-4 h-4" />, key: 'twitch', color: '#9146FF', connected: platformStatus?.twitch?.connected },
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

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/chat/message`, {
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

      if (response.ok) {
        const data = await response.json();
        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.response || data.message || "I'm processing your request...",
          timestamp: new Date(),
          contextUsed: data.contextSources ? {
            soulSignature: data.contextSources.soulSignature,
            twinSummary: data.contextSources.twinSummary,
            memoryStream: data.contextSources.memoryStream,
            proactiveInsights: data.contextSources.proactiveInsights,
            platformData: data.contextSources.platformData,
            personalityProfile: data.contextSources.personalityProfile,
          } : undefined
        };
        setMessages(prev => [...prev, assistantMessage]);
        if (data.conversationId) setConversationId(data.conversationId);
        fetchUsage();
      } else if (response.status === 429) {
        const data = await response.json();
        setLimitReached(true);
        if (data.usage) setChatUsage({ used: data.usage.used, limit: data.usage.limit, remaining: 0, tier: data.usage.tier });
        setMessages(prev => prev.filter(m => m.id !== userMessage.id));
        setInputMessage(currentInput);
      } else {
        throw new Error('Failed to send message');
      }
    } catch (error) {
      console.error('Chat error:', error);
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: connectedPlatforms.length === 0
          ? "Connect your platforms first so I can learn about you and provide personalized insights."
          : "I'm having trouble connecting right now. Please try again.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
    } finally {
      setIsTyping(false);
    }
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

  return (
    <div
      className="min-h-screen flex"
      style={{ backgroundColor: colors.bg }}
    >
      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
        <header
          className="flex items-center justify-between px-4 py-3 border-b"
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
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span
              className="font-medium"
              style={{ color: colors.text }}
            >
              Your Twin
            </span>
          </div>

          <button
            onClick={() => setShowContext(!showContext)}
            className="p-2 rounded-lg transition-colors hover:opacity-70 md:hidden"
            style={{ color: colors.textSecondary }}
          >
            <Layers className="w-5 h-5" />
          </button>
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
            />
          )}
        </div>

        {limitReached && (
          <div
            className="mx-4 mb-2 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3"
            style={{
              background: theme === 'dark'
                ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.1))'
                : 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.05))',
              border: '1px solid rgba(99, 102, 241, 0.25)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(99, 102, 241, 0.15)' }}>
                <Zap className="w-5 h-5" style={{ color: '#6366F1' }} />
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: colors.text }}>
                  You've used all 10 free messages this month
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
          isDisabled={connectedPlatforms.length === 0}
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
