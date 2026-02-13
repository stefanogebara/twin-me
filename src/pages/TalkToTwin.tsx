/**
 * Talk to Twin Page - Grok-inspired Design
 *
 * A modern chat interface inspired by Grok's UI with:
 * - Clean, centered layout
 * - Context sidebar showing memories and data sources
 * - Platform status indicators
 * - Quick action chips
 */

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useDemo } from '../contexts/DemoContext';
import { useAnalytics } from '../contexts/AnalyticsContext';
import { usePlatformStatus } from '../hooks/usePlatformStatus';
import {
  MessageCircle, Send, Loader2, ArrowLeft, Settings,
  Check, ChevronRight,
  Sparkles, Clock, Database, Layers, User,
  Mic, Paperclip, ChevronDown, X, MemoryStick,
  Lightbulb, TrendingUp, Heart, Zap
} from 'lucide-react';
import { PlatformLogo, SpotifyLogo, WhoopLogo, GoogleCalendarLogo, YoutubeLogo, TwitchLogo, LinkedinLogo, DiscordLogo, RedditLogo, GithubLogo } from '@/components/PlatformLogos';
import { Clay3DIcon } from '@/components/Clay3DIcon';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  contextUsed?: {
    memories?: number;
    platforms?: string[];
    personality?: boolean;
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

  // Theme colors - Matching platform's warm color palette
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
    // User bubble: darker warm color with good contrast for light text
    userBubble: theme === 'dark' ? 'rgba(193, 192, 182, 0.15)' : 'rgba(0, 0, 0, 0.06)',
    userBubbleBg: theme === 'dark' ? 'rgba(80, 78, 70, 0.9)' : 'rgba(12, 10, 9, 0.85)',
    userBubbleText: theme === 'dark' ? '#E8E7E3' : '#FAFAFA',
    assistantBubble: 'transparent',
    inputBg: theme === 'dark' ? 'rgba(45, 45, 41, 0.7)' : 'rgba(255, 255, 255, 0.9)',
    inputBorder: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(231, 229, 228, 0.6)',
  };

  // Platform configuration - in demo mode, show core 3 as connected
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

  // Demo mode response handler
  const DEMO_RESPONSES: Record<string, string> = {
    'What patterns do you see?': "Based on Alex's data, I see some fascinating patterns:\n\n**Music & Energy Cycles**: You tend to listen to ambient/electronic music (Tycho, Boards of Canada) during deep work sessions, and shift to more energetic indie rock in the evenings. This correlates beautifully with your Whoop recovery scores.\n\n**Schedule Rhythm**: Your most productive blocks are 9-11 AM, followed by a creative burst around 3 PM. You're protecting your mornings well - only 2 meetings before noon this week.\n\n**Recovery Insight**: On days with HRV above 60ms, your listening shifts toward exploratory new artists. Lower recovery days? You return to comfort favorites.",
    'How am I doing today?': "Looking at your data today, Alex:\n\n**Recovery**: 72% (Green zone) - Your body is well-recovered. HRV at 58ms is above your baseline.\n\n**Sleep**: 7.2 hours with good deep sleep. This sets you up for a productive day.\n\n**Schedule**: You have 4 events today, with your next meeting in about an hour. Your afternoon has a nice 2-hour focus block.\n\n**Music Mood**: Your recent listening (Nils Frahm, Olafur Arnalds) suggests you're in a reflective, creative headspace.\n\nOverall: You're in a great position to tackle creative or strategic work today.",
    'Recommend music for now': "Based on your current state:\n\n**Recovery**: 72% (good energy available)\n**Time**: Afternoon focus block ahead\n**Recent mood**: Reflective/creative\n\nI'd recommend:\n1. **Tycho - Dive** (Album) - Perfect for sustained focus, matches your current energy\n2. **Kiasmos - Blurred** - Minimal techno that you've played during your most productive sessions\n3. **Bonobo - Migration** - Layered electronic that pairs well with your green recovery days\n\nThese artists appear in 78% of your high-productivity listening sessions.",
    'Analyze my week': "Here's your week in review, Alex:\n\n**Energy**: Average recovery of 68%, with Thursday being your peak day (82%). Monday was the lowest at 54% - perhaps that intense weekend workout.\n\n**Schedule**: 12 meetings total, 3 deep work blocks. You're spending 40% of your time in collaborative mode, which aligns with your slight extraverted tendency.\n\n**Music Evolution**: Started the week with high-energy playlists (Monday motivation), transitioned to ambient mid-week, and ended with discovery mode on Friday - exploring 4 new artists.\n\n**Pattern**: Your best work sessions happen when recovery is above 65% AND you have at least a 90-minute uninterrupted block. This happened 3 times this week."
  };

  const handleDemoMessage = (message: string) => {
    setIsTyping(true);
    setTimeout(() => {
      // Check for matching demo response or generate a generic one
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
    }, 1200 + Math.random() * 800); // Simulate realistic response time
  };

  // Quick action chips - Grok style
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

  // Load context when component mounts
  useEffect(() => {
    if (user?.id) {
      loadContext();
    }
  }, [user?.id]);

  // Fetch chat usage for freemium gating
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

    // Demo mode: show sample context items
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

      // Fetch memory and context data (Mem0 long-term memory)
      const [mem0StatsRes] = await Promise.all([
        fetch(`${API_BASE}/mem0/stats`, { headers }).catch(() => null),
      ]);
      const memoriesRes = null;
      const factsRes = null;
      const clustersRes = null;

      const items: ContextItem[] = [];

      // Add platform data
      connectedPlatforms.forEach(p => {
        items.push({
          type: 'platform',
          label: p.name,
          value: 'Connected',
          icon: p.icon
        });
      });

      // Add memories if available
      if (memoriesRes?.ok) {
        const data = await memoriesRes.json();
        data.events?.slice(0, 3).forEach((event: any) => {
          items.push({
            type: 'memory',
            label: event.type || 'Event',
            value: event.platform || 'Activity',
            timestamp: event.created_at
          });
        });
      }

      // Add facts if available
      if (factsRes?.ok) {
        const data = await factsRes.json();
        data.facts?.slice(0, 3).forEach((fact: any) => {
          items.push({
            type: 'fact',
            label: fact.category || 'Learned',
            value: fact.key || fact.value || 'Pattern detected'
          });
        });
      }

      // Add personality if available
      if (clustersRes?.ok) {
        const data = await clustersRes.json();
        if (data.profiles?.length > 0) {
          items.push({
            type: 'personality',
            label: 'Personality',
            value: `${data.profiles.length} cluster profiles`
          });
        }
      }

      // Add Mem0 long-term memory stats if available
      if (mem0StatsRes?.ok) {
        const data = await mem0StatsRes.json();
        if (data.stats?.total > 0) {
          items.push({
            type: 'memory',
            label: 'Long-term Memory',
            value: `${data.stats.total} memories stored`
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

    // Demo mode: use local demo responses
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
            memories: (data.contextSources.moltbotMemory ? 1 : 0) + (data.contextSources.mem0Memory ? 1 : 0),
            platforms: data.contextSources.platformData || [],
            personality: data.contextSources.soulSignature
          } : undefined
        };
        setMessages(prev => [...prev, assistantMessage]);
        if (data.conversationId) setConversationId(data.conversationId);
        // Refresh usage after successful message
        fetchUsage();
      } else if (response.status === 429) {
        const data = await response.json();
        setLimitReached(true);
        if (data.usage) setChatUsage({ used: data.usage.used, limit: data.usage.limit, remaining: 0, tier: data.usage.tier });
        // Remove the user message we optimistically added
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

  // Format timestamp
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
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
        {/* Header - Minimal like Grok */}
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

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            /* Empty State - Grok Style */
            <div className="h-full flex flex-col items-center justify-center px-4 py-12">
              <motion.div
                className="w-20 h-20 rounded-full flex items-center justify-center mb-8"
                style={{ backgroundColor: colors.bgSecondary }}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
              >
                <Clay3DIcon name="brain" size={40} />
              </motion.div>

              <motion.h1
                className="text-2xl md:text-3xl font-medium mb-3 text-center"
                style={{ color: colors.text }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15, ease: [0.4, 0, 0.2, 1] }}
              >
                {connectedPlatforms.length > 0
                  ? "What do you want to know?"
                  : "Connect platforms to unlock your Twin"
                }
              </motion.h1>

              <motion.p
                className="text-center mb-8 max-w-md"
                style={{ color: colors.textSecondary }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.25, ease: [0.4, 0, 0.2, 1] }}
              >
                {connectedPlatforms.length > 0
                  ? "Ask me about your patterns, preferences, or get personalized recommendations based on your connected data."
                  : "Your twin learns from your platforms -- music, health, calendar, social, and more -- to understand your soul signature."
                }
              </motion.p>

              {/* Quick Actions - Grok Style Chips */}
              {connectedPlatforms.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center max-w-lg mb-8">
                  {quickActions.map((action, idx) => (
                    <motion.button
                      key={idx}
                      onClick={() => handleQuickAction(action.label)}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm transition-colors border"
                      style={{
                        backgroundColor: colors.bgSecondary,
                        borderColor: colors.border,
                        color: colors.text
                      }}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: 0.35 + idx * 0.08, ease: [0.4, 0, 0.2, 1] }}
                      whileHover={{ scale: 1.04, y: -2 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <span style={{ color: colors.accent }}>{action.icon}</span>
                      {action.label}
                    </motion.button>
                  ))}
                </div>
              )}

              {/* Platform Status Pills */}
              <div className="flex items-center gap-2">
                {platforms.map((platform) => (
                  <div
                    key={platform.key}
                    onClick={() => !platform.connected && navigate('/get-started')}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                      !platform.connected && "cursor-pointer hover:opacity-80"
                    )}
                    style={{
                      backgroundColor: platform.connected
                        ? `${platform.color}15`
                        : colors.bgSecondary,
                      color: platform.connected ? platform.color : colors.textMuted,
                      border: `1px solid ${platform.connected ? `${platform.color}30` : colors.border}`
                    }}
                  >
                    {platform.icon}
                    <span>{platform.name}</span>
                    {platform.connected && <Check className="w-3 h-3" />}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Messages List */
            <div className="px-4 py-6 space-y-6">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-3",
                    message.role === 'user' ? "justify-end" : "justify-start"
                  )}
                >
                  {message.role === 'assistant' && (
                    <div
                      className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: colors.accent }}
                    >
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                  )}

                  <div className={cn("max-w-[80%]", message.role === 'user' && "order-first")}>
                    {/* Message bubble */}
                    <div
                      className={cn(
                        "px-4 py-3 rounded-2xl",
                        message.role === 'user'
                          ? "rounded-br-md"
                          : "rounded-bl-md"
                      )}
                      style={{
                        backgroundColor: message.role === 'user'
                          ? colors.userBubbleBg
                          : colors.userBubble,
                        color: message.role === 'user' ? colors.userBubbleText : colors.text
                      }}
                    >
                      <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
                        {message.content}
                      </p>
                    </div>

                    {/* Context indicator for assistant */}
                    {message.role === 'assistant' && message.contextUsed && (
                      <div
                        className="flex items-center gap-2 mt-2 text-xs"
                        style={{ color: colors.textMuted }}
                      >
                        <Database className="w-3 h-3" />
                        <span>
                          Used: {message.contextUsed.platforms?.join(', ') || 'memories'}
                          {message.contextUsed.personality && ' + personality'}
                        </span>
                      </div>
                    )}

                    {/* Timestamp */}
                    <div
                      className={cn(
                        "text-xs mt-1",
                        message.role === 'user' ? "text-right" : "text-left"
                      )}
                      style={{ color: colors.textMuted }}
                    >
                      {formatTime(message.timestamp)}
                    </div>
                  </div>

                  {message.role === 'user' && (
                    <div
                      className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: colors.bgTertiary }}
                    >
                      <User className="w-4 h-4" style={{ color: colors.textSecondary }} />
                    </div>
                  )}
                </div>
              ))}

              {/* Typing Indicator */}
              {isTyping && (
                <div className="flex gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: colors.accent }}
                  >
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div
                    className="px-4 py-3 rounded-2xl rounded-bl-md"
                    style={{ backgroundColor: colors.userBubble }}
                  >
                    <div className="flex gap-1.5">
                      <div
                        className="w-2 h-2 rounded-full animate-bounce"
                        style={{ backgroundColor: colors.accent, animationDelay: '0ms' }}
                      />
                      <div
                        className="w-2 h-2 rounded-full animate-bounce"
                        style={{ backgroundColor: colors.accent, animationDelay: '150ms' }}
                      />
                      <div
                        className="w-2 h-2 rounded-full animate-bounce"
                        style={{ backgroundColor: colors.accent, animationDelay: '300ms' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Upgrade Banner - shown when free tier limit reached */}
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

        {/* Input Area - Grok Style */}
        <div className="p-4">
          <div
            className="rounded-2xl border shadow-sm overflow-hidden"
            style={{
              backgroundColor: colors.inputBg,
              borderColor: colors.inputBorder
            }}
          >
            <textarea
              ref={inputRef}
              placeholder={connectedPlatforms.length > 0 || isDemoMode
                ? "Ask your twin anything..."
                : "Connect platforms to start chatting..."
              }
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={(connectedPlatforms.length === 0 && !isDemoMode) || limitReached}
              rows={1}
              className="w-full px-4 py-3 resize-none focus:outline-none disabled:opacity-50 text-[15px]"
              style={{
                backgroundColor: 'transparent',
                color: colors.text,
                minHeight: '48px',
                maxHeight: '120px'
              }}
            />

            <div
              className="flex items-center justify-between px-3 py-2 border-t"
              style={{ borderColor: colors.border }}
            >
              <div className="flex items-center gap-1">
                <button
                  className="p-2 rounded-lg transition-colors hover:opacity-70"
                  style={{ color: colors.textMuted }}
                  title="Attach file"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <button
                  className="p-2 rounded-lg transition-colors hover:opacity-70"
                  style={{ color: colors.textMuted }}
                  title="Voice input"
                >
                  <Mic className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                {/* Usage counter */}
                {chatUsage && chatUsage.tier === 'free' && !isDemoMode && (
                  <div
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
                    style={{
                      backgroundColor: chatUsage.remaining <= 2
                        ? 'rgba(239, 68, 68, 0.1)'
                        : colors.bgSecondary,
                      color: chatUsage.remaining <= 2
                        ? '#ef4444'
                        : colors.textSecondary
                    }}
                  >
                    <MessageCircle className="w-3 h-3" />
                    <span>{chatUsage.used}/{chatUsage.limit}</span>
                  </div>
                )}

                {/* Model indicator like Grok */}
                <div
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
                  style={{
                    backgroundColor: colors.bgSecondary,
                    color: colors.textSecondary
                  }}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Twin AI</span>
                </div>

                <button
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim() || (connectedPlatforms.length === 0 && !isDemoMode) || isTyping || limitReached}
                  className="p-2.5 rounded-xl transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
                  style={{
                    backgroundColor: inputMessage.trim() ? colors.accent : colors.bgTertiary,
                    color: inputMessage.trim() ? 'white' : colors.textMuted
                  }}
                >
                  {isTyping ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Context Sidebar - Desktop */}
      <aside
        className={cn(
          "w-72 border-l hidden md:block overflow-y-auto",
          !showContext && "md:hidden"
        )}
        style={{
          backgroundColor: colors.bgSecondary,
          borderColor: colors.border
        }}
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3
              className="font-medium flex items-center gap-2"
              style={{ color: colors.text }}
            >
              <Clay3DIcon name="diamond" size={16} />
              Twin Context
            </h3>
            <button
              onClick={() => setShowContext(false)}
              className="p-1 rounded hover:opacity-70"
              style={{ color: colors.textMuted }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Connected Platforms Section */}
          <div className="mb-6">
            <h4
              className="text-xs font-medium uppercase tracking-wider mb-2"
              style={{ color: colors.textMuted }}
            >
              Data Sources
            </h4>
            <div className="space-y-2">
              {platforms.map((platform) => (
                <div
                  key={platform.key}
                  className="flex items-center justify-between p-2 rounded-lg"
                  style={{ backgroundColor: colors.bgTertiary }}
                >
                  <div className="flex items-center gap-2">
                    <span style={{ color: platform.connected ? platform.color : colors.textMuted }}>
                      {platform.icon}
                    </span>
                    <span
                      className="text-sm"
                      style={{ color: platform.connected ? colors.text : colors.textMuted }}
                    >
                      {platform.name}
                    </span>
                  </div>
                  {platform.connected ? (
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-xs" style={{ color: colors.textMuted }}>Live</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => navigate('/get-started')}
                      className="text-xs px-2 py-1 rounded"
                      style={{ color: colors.accent }}
                    >
                      Connect
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Recent Context Section */}
          <div className="mb-6">
            <h4
              className="text-xs font-medium uppercase tracking-wider mb-2"
              style={{ color: colors.textMuted }}
            >
              Active Context
            </h4>
            {isLoadingContext ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: colors.textMuted }} />
              </div>
            ) : contextItems.length > 0 ? (
              <div className="space-y-2">
                {contextItems.filter(i => i.type !== 'platform').map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: colors.bgTertiary }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {item.type === 'memory' && <Clock className="w-3 h-3" style={{ color: colors.accent }} />}
                      {item.type === 'fact' && <Lightbulb className="w-3 h-3" style={{ color: '#F59E0B' }} />}
                      {item.type === 'personality' && <Clay3DIcon name="brain" size={12} />}
                      <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                        {item.label}
                      </span>
                    </div>
                    <p className="text-sm" style={{ color: colors.text }}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-center py-4" style={{ color: colors.textMuted }}>
                {connectedPlatforms.length > 0
                  ? "Context loads when you chat"
                  : "Connect platforms to build context"
                }
              </p>
            )}
          </div>

          {/* Quick Stats */}
          <div>
            <h4
              className="text-xs font-medium uppercase tracking-wider mb-2"
              style={{ color: colors.textMuted }}
            >
              Twin Stats
            </h4>
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: colors.bgTertiary }}
            >
              <div className="grid grid-cols-2 gap-3 text-center">
                <div>
                  <div className="text-lg font-semibold" style={{ color: colors.accent }}>
                    {connectedCount || 0}
                  </div>
                  <div className="text-xs" style={{ color: colors.textMuted }}>Platforms</div>
                </div>
                <div>
                  <div className="text-lg font-semibold" style={{ color: colors.accent }}>
                    {messages.length}
                  </div>
                  <div className="text-xs" style={{ color: colors.textMuted }}>Messages</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default TalkToTwin;
