import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSoulSignature } from '../hooks/useSoulSignature';
import { useOrchestrator, type OrchestratorRecommendation, type OrchestratorInsight } from '../hooks/useOrchestrator';
import { twinApi, type ConversationSuggestion } from '@/services/soulApi';
import { CollapsibleSidebar } from '@/components/layout/CollapsibleSidebar';
import { PageLayout } from '@/components/layout/PageLayout';
import { MessageActions } from '@/components/chat/MessageActions';
import { RecommendationsSidebar } from '@/components/chat/RecommendationsSidebar';
import {
  ArrowLeft, Heart, Briefcase, MessageCircle, Sparkles,
  Send, Mic, User, Loader2, Menu, Plus, Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type TwinMode = 'personal' | 'professional';
type ConversationContext = 'casual' | 'creative' | 'social' | 'work' | 'meeting' | 'networking';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  rating?: number;
  recommendations?: OrchestratorRecommendation[];
  insights?: OrchestratorInsight[];
}

const TalkToTwin = () => {
  const navigate = useNavigate();
  const { user, isSignedIn } = useAuth();
  const { theme } = useTheme();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    score,
    connectedPlatforms,
    loading: soulLoading
  } = useSoulSignature({ userId: user?.id });

  const {
    query: orchestratorQuery,
    isLoading: orchestratorLoading
  } = useOrchestrator();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [recommendationsSidebarOpen, setRecommendationsSidebarOpen] = useState(false);
  const [currentRecommendations, setCurrentRecommendations] = useState<OrchestratorRecommendation[]>([]);
  const [currentInsights, setCurrentInsights] = useState<OrchestratorInsight[]>([]);
  const [twinMode, setTwinMode] = useState<TwinMode>('personal');
  const [conversationContext, setConversationContext] = useState<ConversationContext>('casual');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ConversationSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const authenticityScore = score?.overall || 0;
  const connectedCount = connectedPlatforms.length;

  // Load contextual suggestions
  const loadSuggestions = async () => {
    try {
      setLoadingSuggestions(true);
      const newSuggestions = await twinApi.getSuggestions({
        conversationId: conversationId || undefined,
        twinType: twinMode,
        mode: 'twin',
      });
      setSuggestions(newSuggestions);
    } catch (error) {
      console.error('[TalkToTwin] Failed to load suggestions:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  useEffect(() => {
    if (!isSignedIn) navigate('/auth');
  }, [isSignedIn, navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputMessage]);

  useEffect(() => {
    if (messages.length > 0 && connectedCount > 0) {
      loadSuggestions();
    }
  }, [messages.length, conversationId, twinMode]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const messageToSend = inputMessage;
    setInputMessage('');
    setIsTyping(true);

    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      recommendations: [],
      insights: []
    };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      console.log('🎭 [TalkToTwin] Using orchestrator for query:', messageToSend);

      // Use orchestrator API for intelligent multi-agent processing
      const result = await orchestratorQuery({
        query: messageToSend,
        context: {
          twinMode,
          conversationContext,
          conversationId: conversationId || undefined
        }
      });

      // Update message with orchestrator response
      setMessages(prev =>
        prev.map(msg =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: result.synthesis,
                recommendations: result.recommendations || [],
                insights: result.metadata?.agentContributions ? [] : undefined
              }
            : msg
        )
      );

      // Update recommendations sidebar
      if (result.recommendations && result.recommendations.length > 0) {
        setCurrentRecommendations(result.recommendations);
        setRecommendationsSidebarOpen(true);
      }

      // Extract insights if available
      if (result.keyInsights && result.keyInsights.length > 0) {
        // Convert keyInsights to InsightAgent format if needed
        setCurrentInsights([]);
      }

      console.log('✅ [TalkToTwin] Orchestrator succeeded:', {
        latency: result.latencyMs,
        recommendations: result.recommendations?.length || 0,
        agents: result.metadata?.totalAgentsUsed
      });

      setIsTyping(false);
      loadSuggestions();
    } catch (error) {
      console.error('❌ [TalkToTwin] Orchestrator error:', error);
      setIsTyping(false);

      // Fallback to traditional twin API
      console.log('⚠️ [TalkToTwin] Falling back to traditional twin API');

      const assistantMessageId2 = (Date.now() + 2).toString();
      setMessages(prev =>
        prev.filter(msg => msg.id !== assistantMessageId)
          .concat({
            id: assistantMessageId2,
            role: 'assistant',
            content: '',
            timestamp: new Date()
          })
      );

      try {
        const data = await twinApi.sendMessage(conversationId, messageToSend, {
          twinType: twinMode,
          context: conversationContext,
          onChunk: (chunk: string) => {
            setMessages(prev =>
              prev.map(msg =>
                msg.id === assistantMessageId2
                  ? { ...msg, content: msg.content + chunk }
                  : msg
              )
            );
          }
        });

        if (!conversationId && data.conversationId) {
          setConversationId(data.conversationId);
        }

        setIsTyping(false);
        loadSuggestions();
      } catch (fallbackError) {
        console.error('[TwinChat] Fallback error:', fallbackError);
        setIsTyping(false);

        setMessages(prev =>
          prev.map(msg =>
            msg.id === assistantMessageId2
              ? { ...msg, content: 'Sorry, I encountered an error. Please try again.' }
              : msg
          )
        );
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleRegenerate = async (messageId: string) => {
    const messageIndex = messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return;

    // Find the previous user message
    const previousUserMessage = messages
      .slice(0, messageIndex)
      .reverse()
      .find(msg => msg.role === 'user');

    if (!previousUserMessage) return;

    // Remove the assistant message and regenerate
    setMessages(prev => prev.filter(msg => msg.id !== messageId));
    setIsTyping(true);

    const newAssistantMessageId = Date.now().toString();
    const newAssistantMessage: Message = {
      id: newAssistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, newAssistantMessage]);

    try {
      await twinApi.sendMessage(conversationId, previousUserMessage.content, {
        twinType: twinMode,
        context: conversationContext,
        onChunk: (chunk: string) => {
          setMessages(prev =>
            prev.map(msg =>
              msg.id === newAssistantMessageId
                ? { ...msg, content: msg.content + chunk }
                : msg
            )
          );
        }
      });
      setIsTyping(false);
      loadSuggestions();
    } catch (error) {
      console.error('[TwinChat] Regenerate error:', error);
      setIsTyping(false);
      setMessages(prev =>
        prev.map(msg =>
          msg.id === newAssistantMessageId
            ? { ...msg, content: 'Sorry, I encountered an error. Please try again.' }
            : msg
        )
      );
    }
  };

  const handleRate = async (messageId: string, rating: number) => {
    setMessages(prev =>
      prev.map(msg =>
        msg.id === messageId
          ? { ...msg, rating }
          : msg
      )
    );

    // TODO: Send rating to backend
    try {
      // await twinApi.rateMessage(conversationId, messageId, rating);
      console.log(`[TwinChat] Rated message ${messageId}: ${rating}`);
    } catch (error) {
      console.error('[TwinChat] Rating error:', error);
    }
  };

  const contexts = {
    personal: [
      { id: 'casual' as ConversationContext, label: 'Casual', icon: MessageCircle },
      { id: 'creative' as ConversationContext, label: 'Creative', icon: Sparkles },
    ],
    professional: [
      { id: 'work' as ConversationContext, label: 'Work', icon: Briefcase },
    ]
  };

  return (
    <PageLayout sidebarOpen={sidebarOpen}>
      <CollapsibleSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <RecommendationsSidebar
        recommendations={currentRecommendations}
        insights={currentInsights}
        isOpen={recommendationsSidebarOpen}
        onClose={() => setRecommendationsSidebarOpen(false)}
        onApplyRecommendation={(rec) => {
          console.log('[TalkToTwin] Applied recommendation:', rec.title);
        }}
      />

      <div className="h-screen flex flex-col" style={{
        backgroundColor: theme === 'dark' ? '#232320' : '#FAFAFA'
      }}>
        {/* Fixed Header - Minimal & Clean */}
        <div className="flex-shrink-0 border-b" style={{
          backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.6)' : 'rgba(255, 255, 255, 0.9)',
          borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.15)' : 'rgba(0, 0, 0, 0.06)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)'
        }}>
          <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
            {/* Left: Menu & Back */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg hover:bg-opacity-80 transition-colors"
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                  color: theme === 'dark' ? '#C1C0B6' : '#57534e'
                }}
              >
                <Menu className="w-5 h-5" />
              </button>
              <button
                onClick={() => navigate('/soul-signature')}
                className="hidden lg:flex items-center gap-2 text-sm font-medium transition-colors"
                style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#78716c' }}
              >
                <ArrowLeft className="w-4 h-4" />
                Dashboard
              </button>
            </div>

            {/* Center: Title */}
            <div className="flex-1 text-center">
              <h1 className="text-base font-semibold" style={{
                color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
              }}>
                {twinMode === 'personal' ? 'Personal Twin' : 'Professional Twin'}
              </h1>
            </div>

            {/* Right: Score Badge */}
            <div className="flex items-center gap-3">
              <Badge className="px-3 py-1 text-xs font-medium border-0" style={{
                backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.15)' : 'rgba(12, 10, 9, 0.08)',
                color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
              }}>
                {authenticityScore}%
              </Badge>
            </div>
          </div>
        </div>

        {/* Chat Container - Full Height with Overflow */}
        <div className="flex-1 overflow-y-auto" style={{
          backgroundColor: theme === 'dark' ? '#232320' : '#FAFAFA'
        }}>
          <div className="max-w-4xl mx-auto px-4 py-6">
            {/* Mode & Context Toggles - Compact */}
            <div className="flex flex-wrap gap-2 items-center mb-6">
              <div className="flex gap-2">
                <button
                  onClick={() => setTwinMode('personal')}
                  className={cn(
                    "px-3 py-2 rounded-lg flex items-center gap-2 transition-all text-xs font-medium",
                    twinMode === 'personal' && "shadow-sm"
                  )}
                  style={{
                    backgroundColor: twinMode === 'personal'
                      ? (theme === 'dark' ? '#C1C0B6' : '#0c0a09')
                      : (theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(0, 0, 0, 0.04)'),
                    color: twinMode === 'personal'
                      ? (theme === 'dark' ? '#232320' : '#ffffff')
                      : (theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#78716c')
                  }}
                >
                  <Heart className="w-3.5 h-3.5" />
                  Personal
                </button>
                <button
                  onClick={() => setTwinMode('professional')}
                  className={cn(
                    "px-3 py-2 rounded-lg flex items-center gap-2 transition-all text-xs font-medium",
                    twinMode === 'professional' && "shadow-sm"
                  )}
                  style={{
                    backgroundColor: twinMode === 'professional'
                      ? (theme === 'dark' ? '#C1C0B6' : '#0c0a09')
                      : (theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(0, 0, 0, 0.04)'),
                    color: twinMode === 'professional'
                      ? (theme === 'dark' ? '#232320' : '#ffffff')
                      : (theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#78716c')
                  }}
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  Professional
                </button>
              </div>

              <div className="flex gap-2">
                {contexts[twinMode].map((ctx) => {
                  const Icon = ctx.icon;
                  return (
                    <button
                      key={ctx.id}
                      onClick={() => setConversationContext(ctx.id)}
                      className="px-3 py-2 rounded-lg flex items-center gap-2 text-xs transition-all"
                      style={{
                        backgroundColor: conversationContext === ctx.id
                          ? (theme === 'dark' ? 'rgba(193, 192, 182, 0.12)' : 'rgba(12, 10, 9, 0.08)')
                          : 'transparent',
                        color: conversationContext === ctx.id
                          ? (theme === 'dark' ? '#C1C0B6' : '#0c0a09')
                          : (theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e'),
                        fontWeight: conversationContext === ctx.id ? '500' : '400'
                      }}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {ctx.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Messages Area - Borderless, Clean */}
            <div className="space-y-6 pb-32">
              {connectedCount === 0 ? (
                <div className="flex items-center justify-center py-20">
                  <div className="text-center max-w-md">
                    <Zap className="w-12 h-12 mx-auto mb-4" style={{
                      color: theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#d6d3d1'
                    }} />
                    <h3 className="text-lg font-semibold mb-2" style={{
                      color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                    }}>
                      Your Twin Needs Data
                    </h3>
                    <p className="text-sm mb-6" style={{
                      color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#78716c'
                    }}>
                      Connect platforms to discover your soul signature
                    </p>
                    <Button onClick={() => navigate('/soul-signature')} className="shadow-sm">
                      <Plus className="w-4 h-4 mr-2" />
                      Connect Platforms
                    </Button>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="space-y-8 py-8">
                  <div className="text-center">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center" style={{
                      backgroundColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                    }}>
                      {twinMode === 'personal' ? (
                        <Heart className="w-7 h-7" style={{ color: theme === 'dark' ? '#232320' : '#ffffff' }} />
                      ) : (
                        <Briefcase className="w-7 h-7" style={{ color: theme === 'dark' ? '#232320' : '#ffffff' }} />
                      )}
                    </div>
                    <h3 className="text-xl font-semibold mb-2" style={{
                      color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                    }}>
                      {twinMode === 'personal' ? 'Discover Your Soul Signature' : 'Explore Your Professional Identity'}
                    </h3>
                    <p className="text-sm max-w-2xl mx-auto" style={{
                      color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#78716c'
                    }}>
                      {twinMode === 'personal'
                        ? `I've analyzed your ${connectedCount} connected platforms. Ask me anything about what makes you uniquely you.`
                        : `I've studied your ${connectedCount} professional platforms. Let's explore your work identity together.`}
                    </p>
                  </div>

                  {/* Conversation Starters - Clean Grid */}
                  <div className="space-y-5">
                    <div>
                      <h4 className="text-xs font-medium mb-3 uppercase tracking-wide" style={{
                        color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e'
                      }}>
                        {twinMode === 'personal' ? 'Discover Your Patterns' : 'Understand Your Work Style'}
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {(twinMode === 'personal' ? [
                          "What does my music taste say about me?",
                          "What patterns do you see in my entertainment choices?",
                          "How would you describe my curiosity profile?",
                          "What makes my interests unique?"
                        ] : [
                          "How do I communicate professionally?",
                          "What's my optimal work schedule?",
                          "How do I handle meetings?",
                          "What are my professional strengths?"
                        ]).map((question, idx) => (
                          <button
                            key={idx}
                            onClick={() => setInputMessage(question)}
                            className="px-4 py-3 rounded-lg text-left text-sm transition-all hover:scale-[1.01]"
                            style={{
                              backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.05)' : 'rgba(255, 255, 255, 0.8)',
                              color: theme === 'dark' ? 'rgba(193, 192, 182, 0.9)' : '#44403c',
                              border: `1px solid ${theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)'}`,
                              boxShadow: theme === 'dark' ? 'none' : '0 1px 2px 0 rgba(0, 0, 0, 0.03)'
                            }}
                          >
                            {question}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "group flex gap-3",
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      {message.role === 'assistant' && (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{
                          backgroundColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                        }}>
                          {twinMode === 'personal' ? (
                            <Heart className="w-4 h-4" style={{ color: theme === 'dark' ? '#232320' : '#ffffff' }} />
                          ) : (
                            <Briefcase className="w-4 h-4" style={{ color: theme === 'dark' ? '#232320' : '#ffffff' }} />
                          )}
                        </div>
                      )}

                      <div className="flex flex-col gap-2 max-w-[75%]">
                        <div className={cn(
                          "rounded-2xl px-4 py-3",
                          message.role === 'user' && "shadow-sm"
                        )} style={{
                          backgroundColor: message.role === 'user'
                            ? (theme === 'dark' ? '#C1C0B6' : '#0c0a09')
                            : 'transparent',
                          color: message.role === 'user'
                            ? (theme === 'dark' ? '#232320' : '#ffffff')
                            : (theme === 'dark' ? '#C1C0B6' : '#0c0a09')
                        }}>
                          <p className="text-[15px] leading-relaxed whitespace-pre-wrap font-sans">
                            {message.content}
                          </p>
                        </div>

                        {/* Grok-style Message Actions */}
                        <MessageActions
                          message={message}
                          onRegenerate={message.role === 'assistant' ? () => handleRegenerate(message.id) : undefined}
                          onRate={message.role === 'assistant' ? (rating) => handleRate(message.id, rating) : undefined}
                        />

                        {message.role === 'assistant' && messages.indexOf(message) === messages.length - 1 && !isTyping && (
                          <div className="mt-2 pt-3" style={{
                            borderTop: `1px solid ${theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)'}`
                          }}>
                            <div className="flex flex-wrap gap-2">
                              {loadingSuggestions ? (
                                <div className="flex items-center gap-2 text-xs" style={{
                                  color: theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#d6d3d1'
                                }}>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span>Thinking...</span>
                                </div>
                              ) : suggestions.length > 0 ? (
                                suggestions.map((suggestion, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => setInputMessage(suggestion.text)}
                                    className="px-3 py-2 rounded-lg text-xs transition-all hover:scale-[1.02]"
                                    style={{
                                      backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(0, 0, 0, 0.04)',
                                      color: theme === 'dark' ? 'rgba(193, 192, 182, 0.85)' : '#57534e',
                                      border: `1px solid ${theme === 'dark' ? 'rgba(193, 192, 182, 0.12)' : 'rgba(0, 0, 0, 0.08)'}`
                                    }}
                                  >
                                    {suggestion.text}
                                  </button>
                                ))
                              ) : (
                                ["Tell me more", "Compare to last month", "What's changed?"].map((followUp, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => setInputMessage(followUp)}
                                    className="px-3 py-2 rounded-lg text-xs transition-all hover:scale-[1.02]"
                                    style={{
                                      backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(0, 0, 0, 0.04)',
                                      color: theme === 'dark' ? 'rgba(193, 192, 182, 0.85)' : '#57534e',
                                      border: `1px solid ${theme === 'dark' ? 'rgba(193, 192, 182, 0.12)' : 'rgba(0, 0, 0, 0.08)'}`
                                    }}
                                  >
                                    {followUp}
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {message.role === 'user' && (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{
                          backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : '#e7e5e4'
                        }}>
                          <User className="w-4 h-4" style={{
                            color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e'
                          }} />
                        </div>
                      )}
                    </div>
                  ))}

                  {isTyping && (
                    <div className="flex gap-3 justify-start">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{
                        backgroundColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                      }}>
                        <Loader2 className="w-4 h-4 animate-spin" style={{
                          color: theme === 'dark' ? '#232320' : '#ffffff'
                        }} />
                      </div>
                      <div className="flex items-center gap-1 px-4 py-3">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 rounded-full animate-bounce" style={{
                            backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#d6d3d1',
                            animationDelay: '0ms'
                          }}></div>
                          <div className="w-2 h-2 rounded-full animate-bounce" style={{
                            backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#d6d3d1',
                            animationDelay: '150ms'
                          }}></div>
                          <div className="w-2 h-2 rounded-full animate-bounce" style={{
                            backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#d6d3d1',
                            animationDelay: '300ms'
                          }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Fixed Input Area - Modern, Grok-style */}
        <div className="flex-shrink-0 border-t" style={{
          backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.8)' : 'rgba(255, 255, 255, 0.95)',
          borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.15)' : 'rgba(0, 0, 0, 0.06)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)'
        }}>
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Message your twin..."
                rows={1}
                className="w-full px-4 py-3 pr-20 rounded-2xl focus:outline-none resize-none max-h-32 text-sm leading-relaxed font-sans transition-all"
                style={{
                  minHeight: '48px',
                  border: `1.5px solid ${theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
                  backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.05)' : '#ffffff',
                  color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                }}
              />
              <div className="absolute right-2 bottom-2 flex gap-1.5">
                <button
                  disabled
                  className="p-2 rounded-xl opacity-30 transition-all"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.04)'
                  }}
                >
                  <Mic className="w-4 h-4" style={{
                    color: theme === 'dark' ? '#C1C0B6' : '#78716c'
                  }} />
                </button>
                <button
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim()}
                  className="p-2 rounded-xl disabled:opacity-30 transition-all hover:scale-105 active:scale-95 disabled:hover:scale-100"
                  style={{
                    backgroundColor: inputMessage.trim()
                      ? (theme === 'dark' ? '#C1C0B6' : '#0c0a09')
                      : (theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.04)')
                  }}
                >
                  <Send className="w-4 h-4" style={{
                    color: inputMessage.trim()
                      ? (theme === 'dark' ? '#232320' : '#ffffff')
                      : (theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#d6d3d1')
                  }} />
                </button>
              </div>
            </div>
            <p className="text-xs mt-2 text-center" style={{
              color: theme === 'dark' ? 'rgba(193, 192, 182, 0.3)' : '#d6d3d1'
            }}>
              Press Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </PageLayout>
  );
};

export default TalkToTwin;
