import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useDemo } from '../contexts/DemoContext';
import { useAnalytics } from '../contexts/AnalyticsContext';
import { usePlatformStatus } from '../hooks/usePlatformStatus';
import {
  ArrowLeft,
  Sparkles, Layers,
  Lightbulb, TrendingUp, Heart, Zap
} from 'lucide-react';
import { SpotifyLogo, WhoopLogo, GoogleCalendarLogo, YoutubeLogo, TwitchLogo, LinkedinLogo, DiscordLogo, RedditLogo, GithubLogo } from '@/components/PlatformLogos';
import { Clay3DIcon } from '@/components/Clay3DIcon';
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
  const { isDemoMode } = useDemo();
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
    { name: 'Spotify', icon: <SpotifyLogo className="w-4 h-4" />, key: 'spotify', color: '#1DB954', connected: isDemoMode || platformStatus?.spotify?.connected },
    { name: 'Whoop', icon: <WhoopLogo className="w-4 h-4" />, key: 'whoop', color: '#00A5E0', connected: isDemoMode || platformStatus?.whoop?.connected },
    { name: 'Calendar', icon: <GoogleCalendarLogo className="w-4 h-4" />, key: 'google_calendar', color: '#4285F4', connected: isDemoMode || platformStatus?.google_calendar?.connected },
    { name: 'YouTube', icon: <YoutubeLogo className="w-4 h-4" />, key: 'youtube', color: '#FF0000', connected: platformStatus?.youtube?.connected },
    { name: 'Twitch', icon: <TwitchLogo className="w-4 h-4" />, key: 'twitch', color: '#9146FF', connected: platformStatus?.twitch?.connected },
    { name: 'LinkedIn', icon: <LinkedinLogo className="w-4 h-4" />, key: 'linkedin', color: '#0A66C2', connected: platformStatus?.linkedin?.connected },
    { name: 'Discord', icon: <DiscordLogo className="w-4 h-4" />, key: 'discord', color: '#5865F2', connected: platformStatus?.discord?.connected },
    { name: 'Reddit', icon: <RedditLogo className="w-4 h-4" />, key: 'reddit', color: '#FF4500', connected: platformStatus?.reddit?.connected },
    { name: 'GitHub', icon: <GithubLogo className="w-4 h-4" />, key: 'github', color: '#333333', connected: platformStatus?.github?.connected },
  ];

  const connectedPlatforms = platforms.filter(p => p.connected);

  const DEMO_RESPONSES: Record<string, string> = {
    'What patterns do you see?': "Based on Alex's data, I see some fascinating patterns:\n\n**Music & Energy Cycles**: You tend to listen to ambient/electronic music (Tycho, Boards of Canada) during deep work sessions, and shift to more energetic indie rock in the evenings. This correlates beautifully with your Whoop recovery scores.\n\n**Schedule Rhythm**: Your most productive blocks are 9-11 AM, followed by a creative burst around 3 PM. You're protecting your mornings well - only 2 meetings before noon this week.\n\n**Recovery Insight**: On days with HRV above 60ms, your listening shifts toward exploratory new artists. Lower recovery days? You return to comfort favorites.",
    'How am I doing today?': "Looking at your data today, Alex:\n\n**Recovery**: 72% (Green zone) - Your body is well-recovered. HRV at 58ms is above your baseline.\n\n**Sleep**: 7.2 hours with good deep sleep. This sets you up for a productive day.\n\n**Schedule**: You have 4 events today, with your next meeting in about an hour. Your afternoon has a nice 2-hour focus block.\n\n**Music Mood**: Your recent listening (Nils Frahm, Olafur Arnalds) suggests you're in a reflective, creative headspace.\n\nOverall: You're in a great position to tackle creative or strategic work today.",
    'Recommend music for now': "Based on your current state:\n\n**Recovery**: 72% (good energy available)\n**Time**: Afternoon focus block ahead\n**Recent mood**: Reflective/creative\n\nI'd recommend:\n1. **Tycho - Dive** (Album) - Perfect for sustained focus, matches your current energy\n2. **Kiasmos - Blurred** - Minimal techno that you've played during your most productive sessions\n3. **Bonobo - Migration** - Layered electronic that pairs well with your green recovery days\n\nThese artists appear in 78% of your high-productivity listening sessions.",
    'Analyze my week': "Here's your week in review, Alex:\n\n**Energy**: Average recovery of 68%, with Thursday being your peak day (82%). Monday was the lowest at 54% - perhaps that intense weekend workout.\n\n**Schedule**: 12 meetings total, 3 deep work blocks. You're spending 40% of your time in collaborative mode, which aligns with your slight extraverted tendency.\n\n**Music Evolution**: Started the week with high-energy playlists (Monday motivation), transitioned to ambient mid-week, and ended with discovery mode on Friday - exploring 4 new artists.\n\n**Pattern**: Your best work sessions happen when recovery is above 65% AND you have at least a 90-minute uninterrupted block. This happened 3 times this week."
  };

  const handleDemoMessage = (message: string) => {
    setIsTyping(true);
    setTimeout(() => {
      const matchedKey = Object.keys(DEMO_RESPONSES).find(key =>
        message.toLowerCase().includes(key.toLowerCase().slice(0, 20))
      );

      const responseText = matchedKey
        ? DEMO_RESPONSES[matchedKey]
        : `That's a great question! Based on Alex's connected platforms (Spotify, Whoop, Calendar), I can see patterns in your music taste, health metrics, and schedule.\n\nIn the full version, I'd analyze your actual data to give you personalized insights. For now, try asking me:\n- "What patterns do you see?"\n- "How am I doing today?"\n- "Recommend music for now"\n- "Analyze my week"`;

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date(),
        contextUsed: {
          memories: 3,
          platforms: ['spotify', 'whoop', 'google_calendar'],
          personality: true
        }
      };
      setMessages(prev => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 1200 + Math.random() * 800);
  };

  const quickActions = [
    { label: 'What patterns do you see?', icon: <TrendingUp className="w-4 h-4" /> },
    { label: 'How am I doing today?', icon: <Heart className="w-4 h-4" /> },
    { label: 'Recommend music for now', icon: <Clay3DIcon name="headphones" size={16} /> },
    { label: 'Analyze my week', icon: <Lightbulb className="w-4 h-4" /> },
  ];

  useEffect(() => {
    if (!isSignedIn && !isDemoMode) {
      navigate('/auth');
    }
  }, [isSignedIn, isDemoMode, navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (user?.id) {
      loadContext();
    }
  }, [user?.id]);

  const fetchUsage = async () => {
    if (isDemoMode || !user?.id) return;
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
  }, [user?.id, isDemoMode]);

  const loadContext = async () => {
    if (!user?.id) return;
    setIsLoadingContext(true);

    if (isDemoMode) {
      const items: ContextItem[] = [
        { type: 'platform', label: 'Spotify', value: 'Connected', icon: <SpotifyLogo className="w-4 h-4" /> },
        { type: 'platform', label: 'Whoop', value: 'Connected', icon: <WhoopLogo className="w-4 h-4" /> },
        { type: 'platform', label: 'Calendar', value: 'Connected', icon: <GoogleCalendarLogo className="w-4 h-4" /> },
        { type: 'memory', label: 'Long-term Memory', value: '24 memories stored' },
        { type: 'fact', label: 'Music Taste', value: 'Prefers ambient and electronic' },
        { type: 'fact', label: 'Schedule', value: 'Morning person, protects focus time' },
        { type: 'personality', label: 'Personality', value: '3 cluster profiles' }
      ];
      setContextItems(items);
      setIsLoadingContext(false);
      return;
    }

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
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputMessage;
    setInputMessage('');

    if (isDemoMode) {
      handleDemoMessage(currentInput);
      return;
    }

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
          message: inputMessage,
          conversationId,
          context: { platforms: connectedPlatforms.map(p => p.key) }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
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
        id: (Date.now() + 1).toString(),
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

        {limitReached && !isDemoMode && (
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
              className="px-5 py-2 rounded-xl text-sm font-medium transition-all hover:scale-[1.02] whitespace-nowrap"
              style={{
                background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                color: '#fff',
                boxShadow: '0 2px 12px rgba(99, 102, 241, 0.3)'
              }}
              onClick={() => {/* Future: navigate to upgrade page */}}
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
          isDisabled={connectedPlatforms.length === 0 && !isDemoMode}
          limitReached={limitReached}
          isDemoMode={isDemoMode}
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
