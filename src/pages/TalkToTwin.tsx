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
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { usePlatformStatus } from '../hooks/usePlatformStatus';
import {
  MessageCircle, Send, Loader2, ArrowLeft, Settings,
  Music, Activity, Calendar, Check, ChevronRight,
  Sparkles, Brain, Clock, Database, Layers, User,
  Mic, Paperclip, ChevronDown, X, MemoryStick,
  Lightbulb, TrendingUp, Heart, Zap
} from 'lucide-react';
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

  // Platform configuration
  const platforms = [
    { name: 'Spotify', icon: <Music className="w-4 h-4" />, key: 'spotify', color: '#1DB954', connected: platformStatus?.spotify?.connected },
    { name: 'Whoop', icon: <Activity className="w-4 h-4" />, key: 'whoop', color: '#00A5E0', connected: platformStatus?.whoop?.connected },
    { name: 'Calendar', icon: <Calendar className="w-4 h-4" />, key: 'google_calendar', color: '#4285F4', connected: platformStatus?.google_calendar?.connected }
  ];

  const connectedPlatforms = platforms.filter(p => p.connected);

  // Quick action chips - Grok style
  const quickActions = [
    { label: 'What patterns do you see?', icon: <TrendingUp className="w-4 h-4" /> },
    { label: 'How am I doing today?', icon: <Heart className="w-4 h-4" /> },
    { label: 'Recommend music for now', icon: <Music className="w-4 h-4" /> },
    { label: 'Analyze my week', icon: <Lightbulb className="w-4 h-4" /> },
  ];

  useEffect(() => {
    if (!isSignedIn) {
      navigate('/auth');
    }
  }, [isSignedIn, navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load context when component mounts
  useEffect(() => {
    if (user?.id) {
      loadContext();
    }
  }, [user?.id]);

  const loadContext = async () => {
    if (!user?.id) return;
    setIsLoadingContext(true);

    try {
      const token = localStorage.getItem('auth_token');
      const headers = { 'Authorization': `Bearer ${token}` };

      // Fetch memory and context data in parallel (including Mem0 long-term memory)
      const [memoriesRes, factsRes, clustersRes, mem0StatsRes] = await Promise.all([
        fetch(`${API_BASE}/moltbot/memory/recent?limit=5`, { headers }).catch(() => null),
        fetch(`${API_BASE}/moltbot/memory/facts?limit=5`, { headers }).catch(() => null),
        fetch(`${API_BASE}/moltbot/clusters`, { headers }).catch(() => null),
        fetch(`${API_BASE}/mem0/stats`, { headers }).catch(() => null),
      ]);

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

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
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
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center mb-8"
                style={{ backgroundColor: colors.bgSecondary }}
              >
                <Brain className="w-10 h-10" style={{ color: colors.accent }} />
              </div>

              <h1
                className="text-2xl md:text-3xl font-medium mb-3 text-center"
                style={{ color: colors.text }}
              >
                {connectedPlatforms.length > 0
                  ? "What do you want to know?"
                  : "Connect platforms to unlock your Twin"
                }
              </h1>

              <p
                className="text-center mb-8 max-w-md"
                style={{ color: colors.textSecondary }}
              >
                {connectedPlatforms.length > 0
                  ? "Ask me about your patterns, preferences, or get personalized recommendations based on your connected data."
                  : "Your twin learns from Spotify, Whoop, and Calendar to understand your soul signature."
                }
              </p>

              {/* Quick Actions - Grok Style Chips */}
              {connectedPlatforms.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center max-w-lg mb-8">
                  {quickActions.map((action, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleQuickAction(action.label)}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm transition-all hover:scale-[1.02] border"
                      style={{
                        backgroundColor: colors.bgSecondary,
                        borderColor: colors.border,
                        color: colors.text
                      }}
                    >
                      <span style={{ color: colors.accent }}>{action.icon}</span>
                      {action.label}
                    </button>
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
              placeholder={connectedPlatforms.length > 0
                ? "Ask your twin anything..."
                : "Connect platforms to start chatting..."
              }
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={connectedPlatforms.length === 0}
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
                  disabled={!inputMessage.trim() || connectedPlatforms.length === 0 || isTyping}
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
              <Database className="w-4 h-4" style={{ color: colors.accent }} />
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
                      {item.type === 'personality' && <Brain className="w-3 h-3" style={{ color: '#EC4899' }} />}
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
