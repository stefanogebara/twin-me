/**
 * Talk to Twin Page
 *
 * Chat interface for conversing with your digital twin.
 * Designed to match the visual style of the insights pages.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { usePlatformStatus } from '../hooks/usePlatformStatus';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';
import {
  MessageCircle, Sparkles, Send, Loader2, ArrowLeft,
  Music, Activity, Calendar, Star, Check, X, RefreshCw,
  Zap, Brain, Heart
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  rating?: number;
  isAccurate?: boolean;
}

interface Platform {
  name: string;
  icon: React.ReactNode;
  connected: boolean;
  key: string;
  color: string;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const TalkToTwin = () => {
  const navigate = useNavigate();
  const { user, isSignedIn } = useAuth();
  const { theme } = useTheme();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    data: platformStatus,
    connectedCount,
    isLoading: isLoadingPlatforms
  } = usePlatformStatus(user?.id);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Theme colors
  const colors = {
    text: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
    textSecondary: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c',
    bg: theme === 'dark' ? '#232320' : '#FAFAFA',
    cardBg: theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.8)',
    border: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    accent: '#8B5CF6',
    accentBg: theme === 'dark' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.1)',
    userBubble: theme === 'dark' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.15)',
    assistantBubble: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.9)',
  };

  // MVP Platforms
  const platforms: Platform[] = [
    {
      name: 'Spotify',
      icon: <Music className="w-4 h-4" />,
      connected: platformStatus?.spotify?.connected || false,
      key: 'spotify',
      color: '#1DB954'
    },
    {
      name: 'Whoop',
      icon: <Activity className="w-4 h-4" />,
      connected: platformStatus?.whoop?.connected || false,
      key: 'whoop',
      color: '#00A5E0'
    },
    {
      name: 'Calendar',
      icon: <Calendar className="w-4 h-4" />,
      connected: platformStatus?.google_calendar?.connected || false,
      key: 'google_calendar',
      color: '#4285F4'
    }
  ];

  const connectedPlatforms = platforms.filter(p => p.connected);

  useEffect(() => {
    if (!isSignedIn) {
      navigate('/auth');
    }
  }, [isSignedIn, navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);
        if (data.conversationId) setConversationId(data.conversationId);
      } else {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: generateFallbackResponse(inputMessage),
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: generateFallbackResponse(inputMessage),
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const generateFallbackResponse = (question: string): string => {
    if (connectedPlatforms.length === 0) {
      return "I don't have any data to learn from yet! Connect at least one platform (Spotify, Whoop, or Calendar) so I can understand your patterns and give you personalized insights.";
    }
    const platformNames = connectedPlatforms.map(p => p.name).join(', ');
    return `Based on your connected platforms (${platformNames}), I can see patterns emerging. My AI is analyzing your data to provide deeper insights. Try asking about your music taste, energy patterns, or schedule habits!`;
  };

  const handleRateResponse = (messageId: string, rating: number) => {
    setMessages(prev => prev.map(msg => msg.id === messageId ? { ...msg, rating } : msg));
  };

  const handleMarkAccurate = (messageId: string, isAccurate: boolean) => {
    setMessages(prev => prev.map(msg => msg.id === messageId ? { ...msg, isAccurate } : msg));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const suggestedQuestions = [
    { text: "What does my music reveal about me?", icon: <Music className="w-3.5 h-3.5" /> },
    { text: "How's my energy this week?", icon: <Zap className="w-3.5 h-3.5" /> },
    { text: "What patterns do you see in my schedule?", icon: <Calendar className="w-3.5 h-3.5" /> },
    { text: "What should I listen to right now?", icon: <Heart className="w-3.5 h-3.5" /> }
  ];

  return (
    <PageLayout maxWidth="lg">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-2 text-sm mb-6 transition-opacity hover:opacity-70"
          style={{ color: colors.textSecondary }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1
              className="text-3xl mb-2"
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 400,
                color: colors.text
              }}
            >
              Chat with Your Twin
            </h1>
            <p
              className="text-[15px]"
              style={{
                fontFamily: 'var(--font-body)',
                color: colors.textSecondary
              }}
            >
              Your digital soul in conversation
            </p>
          </div>

          {/* Platform Pills */}
          <div className="flex items-center gap-2">
            {platforms.map((platform) => (
              <div
                key={platform.key}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                style={{
                  backgroundColor: platform.connected
                    ? `${platform.color}15`
                    : theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                  color: platform.connected ? platform.color : colors.textSecondary,
                  border: `1px solid ${platform.connected ? `${platform.color}30` : 'transparent'}`
                }}
              >
                {platform.icon}
                <span>{platform.name}</span>
                {platform.connected && <Check className="w-3 h-3" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* No platforms warning */}
      {!isLoadingPlatforms && connectedPlatforms.length === 0 && (
        <GlassPanel className="mb-6" style={{ borderColor: '#F59E0B30', backgroundColor: theme === 'dark' ? 'rgba(245,158,11,0.1)' : 'rgba(245,158,11,0.05)' }}>
          <div className="flex items-start gap-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgba(245,158,11,0.15)' }}
            >
              <Sparkles className="w-5 h-5" style={{ color: '#F59E0B' }} />
            </div>
            <div className="flex-1">
              <h3
                className="text-base font-medium mb-1"
                style={{ color: colors.text, fontFamily: 'var(--font-heading)' }}
              >
                Connect platforms to unlock your Twin
              </h3>
              <p
                className="text-sm mb-4"
                style={{ color: colors.textSecondary, fontFamily: 'var(--font-body)' }}
              >
                Your digital twin learns from your connected platforms. Connect Spotify, Whoop, or Calendar to start chatting!
              </p>
              <button
                onClick={() => navigate('/get-started')}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
                style={{
                  backgroundColor: colors.accent,
                  color: 'white',
                  fontFamily: 'var(--font-heading)'
                }}
              >
                Connect Platforms
              </button>
            </div>
          </div>
        </GlassPanel>
      )}

      {/* Chat Interface */}
      <GlassPanel className="overflow-hidden !p-0">
        {/* Messages Container */}
        <div
          className="h-[500px] overflow-y-auto p-6"
          style={{ backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)' }}
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
                style={{ backgroundColor: colors.accentBg }}
              >
                <Brain className="w-8 h-8" style={{ color: colors.accent }} />
              </div>
              <h3
                className="text-xl mb-2"
                style={{ fontFamily: 'var(--font-heading)', color: colors.text }}
              >
                {connectedPlatforms.length > 0 ? "Start a conversation" : "Connect platforms to chat"}
              </h3>
              <p
                className="text-sm mb-8 max-w-md"
                style={{ fontFamily: 'var(--font-body)', color: colors.textSecondary }}
              >
                {connectedPlatforms.length > 0
                  ? "Ask me about your music taste, health patterns, schedule habits, or anything about your soul signature!"
                  : "Your twin needs data from connected platforms to provide personalized insights."}
              </p>

              {connectedPlatforms.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                  {suggestedQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => setInputMessage(q.text)}
                      className="flex items-center gap-2 px-4 py-2 rounded-full text-sm transition-all hover:scale-[1.02]"
                      style={{
                        backgroundColor: colors.cardBg,
                        border: `1px solid ${colors.border}`,
                        color: colors.text,
                        fontFamily: 'var(--font-body)'
                      }}
                    >
                      <span style={{ color: colors.accent }}>{q.icon}</span>
                      {q.text}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "max-w-[85%] p-4 rounded-2xl",
                    message.role === 'user' ? "ml-auto" : "mr-auto"
                  )}
                  style={{
                    backgroundColor: message.role === 'user' ? colors.userBubble : colors.assistantBubble,
                    border: message.role === 'assistant' ? `1px solid ${colors.border}` : 'none'
                  }}
                >
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-2">
                    {message.role === 'assistant' && (
                      <div
                        className="w-5 h-5 rounded-md flex items-center justify-center"
                        style={{ backgroundColor: colors.accentBg }}
                      >
                        <Sparkles className="w-3 h-3" style={{ color: colors.accent }} />
                      </div>
                    )}
                    <span
                      className="text-xs font-medium uppercase tracking-wider"
                      style={{ color: message.role === 'user' ? colors.accent : colors.textSecondary }}
                    >
                      {message.role === 'user' ? 'You' : 'Your Twin'}
                    </span>
                  </div>

                  {/* Message Content */}
                  <p
                    className="text-[15px] leading-relaxed whitespace-pre-wrap"
                    style={{ color: colors.text, fontFamily: 'var(--font-body)' }}
                  >
                    {message.content}
                  </p>

                  {/* Feedback for assistant */}
                  {message.role === 'assistant' && (
                    <div
                      className="flex items-center gap-3 mt-4 pt-3"
                      style={{ borderTop: `1px solid ${colors.border}` }}
                    >
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            onClick={() => handleRateResponse(message.id, star)}
                            className="p-0.5 transition-transform hover:scale-110"
                          >
                            <Star
                              className="w-4 h-4"
                              style={{
                                color: message.rating && star <= message.rating ? '#FBBF24' : colors.textSecondary,
                                fill: message.rating && star <= message.rating ? '#FBBF24' : 'none'
                              }}
                            />
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-1.5 ml-2">
                        <button
                          onClick={() => handleMarkAccurate(message.id, true)}
                          className={cn(
                            "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-all",
                            message.isAccurate === true && "ring-1 ring-green-500"
                          )}
                          style={{
                            backgroundColor: message.isAccurate === true
                              ? theme === 'dark' ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.1)'
                              : 'transparent',
                            color: colors.textSecondary
                          }}
                        >
                          <Check className="w-3 h-3" />
                          Accurate
                        </button>
                        <button
                          onClick={() => handleMarkAccurate(message.id, false)}
                          className={cn(
                            "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-all",
                            message.isAccurate === false && "ring-1 ring-red-500"
                          )}
                          style={{
                            backgroundColor: message.isAccurate === false
                              ? theme === 'dark' ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.1)'
                              : 'transparent',
                            color: colors.textSecondary
                          }}
                        >
                          <X className="w-3 h-3" />
                          Not quite
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Typing Indicator */}
              {isTyping && (
                <div
                  className="max-w-[85%] mr-auto p-4 rounded-2xl"
                  style={{ backgroundColor: colors.assistantBubble, border: `1px solid ${colors.border}` }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-5 h-5 rounded-md flex items-center justify-center"
                      style={{ backgroundColor: colors.accentBg }}
                    >
                      <Sparkles className="w-3 h-3" style={{ color: colors.accent }} />
                    </div>
                    <div className="flex gap-1">
                      <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: colors.accent, animationDelay: '0ms' }} />
                      <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: colors.accent, animationDelay: '150ms' }} />
                      <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: colors.accent, animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div
          className="p-4"
          style={{ borderTop: `1px solid ${colors.border}`, backgroundColor: colors.cardBg }}
        >
          <div className="flex gap-3">
            <input
              type="text"
              placeholder={connectedPlatforms.length > 0 ? "Ask your twin anything..." : "Connect platforms to start chatting..."}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={connectedPlatforms.length === 0}
              className="flex-1 px-4 py-3 rounded-xl text-[15px] transition-all focus:outline-none focus:ring-2 disabled:opacity-50"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                border: `1px solid ${colors.border}`,
                color: colors.text,
                fontFamily: 'var(--font-body)'
              }}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || connectedPlatforms.length === 0 || isTyping}
              className="px-5 py-3 rounded-xl transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
              style={{
                backgroundColor: colors.accent,
                color: 'white'
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
      </GlassPanel>

      {/* Quick Actions */}
      <div className="mt-6 flex gap-4">
        <button
          onClick={() => navigate('/soul-signature')}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all hover:scale-[1.01]"
          style={{
            backgroundColor: colors.cardBg,
            border: `1px solid ${colors.border}`,
            color: colors.text,
            fontFamily: 'var(--font-heading)'
          }}
        >
          <Sparkles className="w-4 h-4" style={{ color: colors.accent }} />
          View Soul Signature
        </button>
        <button
          onClick={() => navigate('/get-started')}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all hover:scale-[1.01]"
          style={{
            backgroundColor: colors.cardBg,
            border: `1px solid ${colors.border}`,
            color: colors.text,
            fontFamily: 'var(--font-heading)'
          }}
        >
          <RefreshCw className="w-4 h-4" style={{ color: colors.accent }} />
          Manage Platforms
        </button>
      </div>
    </PageLayout>
  );
};

export default TalkToTwin;
