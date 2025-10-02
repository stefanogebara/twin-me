import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, Heart, Briefcase, MessageCircle, Star, Sparkles,
  Mail, Calendar, Users, MessageSquare, Music, Film, Youtube,
  Gamepad2, Book, Lock, Unlock, Play, Settings, HelpCircle,
  ChevronRight, RefreshCw, Plus, BarChart, Download, Check,
  X, AlertCircle, Zap, Target
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

type TwinMode = 'personal' | 'professional';
type ConversationContext = 'casual' | 'creative' | 'social' | 'work' | 'meeting' | 'networking' | 'teaching';
type PrivacyContext = 'public' | 'friends' | 'professional' | 'full';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  rating?: number;
  accurate?: boolean;
}

interface TestQuestion {
  id: string;
  category: string;
  question: string;
  difficulty: 'easy' | 'medium' | 'hard';
  platforms: string[];
  estimatedTime: string;
}

interface Platform {
  name: string;
  icon: JSX.Element;
  connected: boolean;
  dataPoints: number;
  key: string;
}

const TalkToTwin = () => {
  const navigate = useNavigate();
  const { user, isSignedIn } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // State Management
  const [twinMode, setTwinMode] = useState<TwinMode>('professional');
  const [conversationContext, setConversationContext] = useState<ConversationContext>('work');
  const [privacyContext, setPrivacyContext] = useState<PrivacyContext>('professional');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showTestBank, setShowTestBank] = useState(true);
  const [showRefinementControls, setShowRefinementControls] = useState(true);
  const [validationProgress, setValidationProgress] = useState({
    personal: 67,
    professional: 92
  });

  // Authentication check
  useEffect(() => {
    if (!isSignedIn) {
      navigate('/auth');
      return;
    }
  }, [isSignedIn, navigate]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Platform Connections
  const professionalPlatforms: Platform[] = [
    { name: 'Gmail', icon: <Mail className="w-4 h-4" />, connected: true, dataPoints: 127, key: 'gmail' },
    { name: 'Calendar', icon: <Calendar className="w-4 h-4" />, connected: true, dataPoints: 48, key: 'calendar' },
    { name: 'Teams', icon: <Users className="w-4 h-4" />, connected: true, dataPoints: 12, key: 'teams' },
    { name: 'Slack', icon: <MessageSquare className="w-4 h-4" />, connected: true, dataPoints: 89, key: 'slack' }
  ];

  const personalPlatforms: Platform[] = [
    { name: 'Spotify', icon: <Music className="w-4 h-4" />, connected: true, dataPoints: 342, key: 'spotify' },
    { name: 'Netflix', icon: <Film className="w-4 h-4" />, connected: true, dataPoints: 67, key: 'netflix' },
    { name: 'YouTube', icon: <Youtube className="w-4 h-4" />, connected: true, dataPoints: 156, key: 'youtube' },
    { name: 'Steam', icon: <Gamepad2 className="w-4 h-4" />, connected: false, dataPoints: 0, key: 'steam' },
    { name: 'Goodreads', icon: <Book className="w-4 h-4" />, connected: false, dataPoints: 0, key: 'goodreads' }
  ];

  // Test Questions
  const testQuestions: TestQuestion[] = [
    {
      id: 'music-preference',
      category: 'Entertainment',
      question: "What's my go-to music genre when I'm working?",
      difficulty: 'easy',
      platforms: ['spotify'],
      estimatedTime: '2 min'
    },
    {
      id: 'netflix-habits',
      category: 'Entertainment',
      question: "Describe my weekend Netflix viewing habits",
      difficulty: 'medium',
      platforms: ['netflix'],
      estimatedTime: '3 min'
    },
    {
      id: 'email-tone',
      category: 'Communication',
      question: "Describe my professional email communication style",
      difficulty: 'easy',
      platforms: ['gmail'],
      estimatedTime: '2 min'
    },
    {
      id: 'meeting-style',
      category: 'Collaboration',
      question: "How do I typically start a meeting with my team?",
      difficulty: 'medium',
      platforms: ['calendar', 'teams'],
      estimatedTime: '3 min'
    },
    {
      id: 'work-style',
      category: 'Productivity',
      question: "Do I prefer collaborative work or independent work?",
      difficulty: 'hard',
      platforms: ['teams', 'slack', 'calendar'],
      estimatedTime: '4 min'
    }
  ];

  // Conversation Contexts
  const conversationContexts = {
    personal: [
      { id: 'casual' as ConversationContext, label: 'Casual Chat', icon: <MessageCircle className="w-4 h-4" /> },
      { id: 'creative' as ConversationContext, label: 'Creative Exploration', icon: <Sparkles className="w-4 h-4" /> },
      { id: 'social' as ConversationContext, label: 'Social Personality', icon: <Users className="w-4 h-4" /> }
    ],
    professional: [
      { id: 'work' as ConversationContext, label: 'Work Communication', icon: <Mail className="w-4 h-4" /> },
      { id: 'meeting' as ConversationContext, label: 'Meeting Prep', icon: <Calendar className="w-4 h-4" /> },
      { id: 'networking' as ConversationContext, label: 'Networking Profile', icon: <Users className="w-4 h-4" /> },
      { id: 'teaching' as ConversationContext, label: 'Teaching Mode', icon: <Book className="w-4 h-4" /> }
    ]
  };

  // Key Insights
  const insights = {
    professional: [
      'Communication Tone: Professional but warm (75% formality)',
      'Response Pattern: 2-3 hours during business hours',
      'Meeting Style: Collaborative with 2-min icebreaker',
      'Peak Productivity: 9-11 AM, 2-4 PM',
      'Collaboration Preference: 60% team meetings, 40% solo work'
    ],
    personal: [
      'Music Style: Lo-fi hip hop and ambient electronic while working',
      'Weekend Pattern: Netflix binge sessions on Friday/Saturday nights',
      'Gaming: Prefers strategy games with 2-3 hour sessions',
      'Reading: Non-fiction with focus on psychology and technology',
      'Social: Small group hangouts over large parties'
    ]
  };

  // Handle Message Send
  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsTyping(true);

    // Simulate AI response
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: generateResponse(inputMessage, twinMode),
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 1500);
  };

  // Generate Mock Response
  const generateResponse = (question: string, mode: TwinMode): string => {
    if (mode === 'professional') {
      return "Based on your Gmail patterns, you tend to respond to professional emails within 2-3 hours during business hours. Your communication style is direct but warm, with an average formality score of 75%. You typically use collaborative language and include actionable next steps in your emails.";
    } else {
      return "Looking at your Spotify listening history, you gravitate toward lo-fi hip hop and ambient electronic music while working, especially artists like Nujabes and Tycho. Your playlists show 70% of work-time listening is in 'Focus' and 'Chill' categories, with sessions averaging 2-3 hours.";
    }
  };

  // Handle Test Question
  const handleTestQuestion = (question: TestQuestion) => {
    setInputMessage(question.question);
  };

  // Rate Response
  const handleRateResponse = (messageId: string, rating: number) => {
    setMessages(prev =>
      prev.map(msg =>
        msg.id === messageId ? { ...msg, rating } : msg
      )
    );
  };

  // Mark Response Accuracy
  const handleMarkAccurate = (messageId: string, accurate: boolean) => {
    setMessages(prev =>
      prev.map(msg =>
        msg.id === messageId ? { ...msg, accurate } : msg
      )
    );
  };

  const currentPlatforms = twinMode === 'professional' ? professionalPlatforms : personalPlatforms;
  const currentContexts = conversationContexts[twinMode];
  const currentInsights = insights[twinMode];
  const currentValidation = validationProgress[twinMode];

  // Filter test questions by current mode
  const relevantTests = testQuestions.filter(test => {
    if (twinMode === 'professional') {
      return ['Communication', 'Collaboration', 'Productivity'].includes(test.category);
    } else {
      return ['Entertainment', 'Creative', 'Social'].includes(test.category);
    }
  });

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAF9F5' }}>
      {/* Navigation */}
      <div className="sticky top-0 z-50 backdrop-blur-sm border-b" style={{ backgroundColor: 'rgba(250, 249, 245, 0.9)', borderColor: 'rgba(20, 20, 19, 0.1)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/soul-signature-dashboard')}
              className="inline-flex items-center gap-2 text-sm"
              style={{ color: '#141413', fontFamily: 'var(--_typography---font--tiempos)' }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>

            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={() => navigate('/settings')}
                style={{
                  borderColor: 'rgba(20, 20, 19, 0.1)',
                  color: '#141413',
                  backgroundColor: 'white',
                  fontFamily: 'var(--_typography---font--tiempos)'
                }}
              >
                <Settings className="w-4 h-4 mr-2" />
                Twin Settings
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-6 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1
              className="text-5xl mb-4"
              style={{
                fontFamily: 'var(--_typography---font--styrene-a)',
                fontWeight: 500,
                letterSpacing: '-0.02em',
                color: '#141413'
              }}
            >
              Talk to Your Twin
            </h1>
            <p
              className="text-lg"
              style={{
                color: '#6B7280',
                fontFamily: 'var(--_typography---font--tiempos)'
              }}
            >
              Your Digital Soul Signature in Conversation
            </p>
          </div>

          {/* Twin Identity Dashboard */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Mode Selector */}
            <Card
              className="p-6"
              style={{
                backgroundColor: 'white',
                border: '1px solid rgba(20,20,19,0.1)'
              }}
            >
              <h3
                className="text-lg mb-4"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  fontWeight: 500,
                  color: '#141413'
                }}
              >
                Mode Selector
              </h3>

              <div className="space-y-3 mb-6">
                <button
                  onClick={() => setTwinMode('personal')}
                  className={cn(
                    "w-full p-4 rounded-xl flex items-center gap-3",
                    twinMode === 'personal' ? 'border-2' : 'border'
                  )}
                  style={{
                    borderColor: twinMode === 'personal' ? '#D97706' : 'rgba(20,20,19,0.1)',
                    backgroundColor: twinMode === 'personal' ? '#FEF3E2' : 'white'
                  }}
                >
                  <Heart className="w-5 h-5" style={{ color: '#D97706' }} />
                  <div className="text-left">
                    <div
                      className="font-medium"
                      style={{
                        fontFamily: 'var(--_typography---font--styrene-a)',
                        color: '#141413'
                      }}
                    >
                      Personal Soul
                    </div>
                    <div
                      className="text-xs"
                      style={{
                        fontFamily: 'var(--_typography---font--tiempos)',
                        color: '#6B7280'
                      }}
                    >
                      Entertainment & Lifestyle
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setTwinMode('professional')}
                  className={cn(
                    "w-full p-4 rounded-xl flex items-center gap-3",
                    twinMode === 'professional' ? 'border-2' : 'border'
                  )}
                  style={{
                    borderColor: twinMode === 'professional' ? '#D97706' : 'rgba(20,20,19,0.1)',
                    backgroundColor: twinMode === 'professional' ? '#FEF3E2' : 'white'
                  }}
                >
                  <Briefcase className="w-5 h-5" style={{ color: '#D97706' }} />
                  <div className="text-left">
                    <div
                      className="font-medium"
                      style={{
                        fontFamily: 'var(--_typography---font--styrene-a)',
                        color: '#141413'
                      }}
                    >
                      Professional Identity
                    </div>
                    <div
                      className="text-xs"
                      style={{
                        fontFamily: 'var(--_typography---font--tiempos)',
                        color: '#6B7280'
                      }}
                    >
                      Work & Communication
                    </div>
                  </div>
                </button>
              </div>

              <div
                className="pt-4"
                style={{ borderTop: '1px solid rgba(20,20,19,0.1)' }}
              >
                <label
                  className="text-sm mb-2 block"
                  style={{
                    fontFamily: 'var(--_typography---font--styrene-a)',
                    fontWeight: 500,
                    color: '#141413'
                  }}
                >
                  Conversation Context
                </label>
                <div className="space-y-2">
                  {currentContexts.map((context) => (
                    <button
                      key={context.id}
                      onClick={() => setConversationContext(context.id)}
                      className={cn(
                        "w-full px-3 py-2 rounded-lg flex items-center gap-2 text-sm",
                        conversationContext === context.id ? 'border' : ''
                      )}
                      style={{
                        borderColor: conversationContext === context.id ? '#D97706' : 'transparent',
                        backgroundColor: conversationContext === context.id ? '#FEF3E2' : '#F5F5F5',
                        fontFamily: 'var(--_typography---font--tiempos)',
                        color: '#141413'
                      }}
                    >
                      {context.icon}
                      {context.label}
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            {/* Twin Visualization */}
            <Card
              className="p-6"
              style={{
                backgroundColor: 'white',
                border: '1px solid rgba(20,20,19,0.1)'
              }}
            >
              <h3
                className="text-lg mb-6 text-center"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  fontWeight: 500,
                  color: '#141413'
                }}
              >
                Twin Visualization
              </h3>

              <div className="relative h-48 flex items-center justify-center mb-6">
                <div
                  className="w-32 h-32 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: '#D97706', border: '4px solid rgba(217,119,6,0.2)' }}
                >
                  {twinMode === 'personal' ? (
                    <Heart className="w-16 h-16" style={{ color: 'white' }} />
                  ) : (
                    <Briefcase className="w-16 h-16" style={{ color: 'white' }} />
                  )}
                </div>
              </div>

              <div className="text-center mb-6">
                <div
                  className="text-sm mb-2"
                  style={{
                    fontFamily: 'var(--_typography---font--tiempos)',
                    color: '#6B7280'
                  }}
                >
                  Authenticity Score
                </div>
                <div
                  className="text-4xl font-medium mb-2"
                  style={{
                    fontFamily: 'var(--_typography---font--styrene-a)',
                    color: '#141413'
                  }}
                >
                  {currentValidation}%
                </div>
                <Progress value={currentValidation} className="h-2" />
              </div>

              <div className="space-y-2 text-sm">
                <div
                  className="flex justify-between"
                  style={{
                    fontFamily: 'var(--_typography---font--tiempos)',
                    color: '#6B7280'
                  }}
                >
                  <span>Last chat:</span>
                  <span style={{ color: '#141413' }}>2 hours ago</span>
                </div>
                <div
                  className="flex justify-between"
                  style={{
                    fontFamily: 'var(--_typography---font--tiempos)',
                    color: '#6B7280'
                  }}
                >
                  <span>Conversations:</span>
                  <span style={{ color: '#141413' }}>127</span>
                </div>
                <div
                  className="flex justify-between"
                  style={{
                    fontFamily: 'var(--_typography---font--tiempos)',
                    color: '#6B7280'
                  }}
                >
                  <span>Insights:</span>
                  <span style={{ color: '#141413' }}>48</span>
                </div>
              </div>

              <Button
                className="w-full mt-6"
                onClick={() => handleSendMessage()}
                disabled={!inputMessage.trim()}
                style={{
                  backgroundColor: '#D97706',
                  color: 'white',
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  fontWeight: 500
                }}
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Start Chat
              </Button>
            </Card>

            {/* Quick Stats */}
            <Card
              className="p-6"
              style={{
                backgroundColor: 'white',
                border: '1px solid rgba(20,20,19,0.1)'
              }}
            >
              <h3
                className="text-lg mb-4"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  fontWeight: 500,
                  color: '#141413'
                }}
              >
                Quick Stats
              </h3>

              <div className="space-y-4">
                <div className="p-4 rounded-lg" style={{ backgroundColor: '#F5F5F5' }}>
                  <div
                    className="flex items-center gap-2 mb-2"
                    style={{
                      fontFamily: 'var(--_typography---font--tiempos)',
                      color: '#6B7280'
                    }}
                  >
                    <MessageCircle className="w-4 h-4" />
                    Conversations
                  </div>
                  <div
                    className="text-2xl font-medium"
                    style={{
                      fontFamily: 'var(--_typography---font--styrene-a)',
                      color: '#141413'
                    }}
                  >
                    127
                  </div>
                </div>

                <div className="p-4 rounded-lg" style={{ backgroundColor: '#F5F5F5' }}>
                  <div
                    className="flex items-center gap-2 mb-2"
                    style={{
                      fontFamily: 'var(--_typography---font--tiempos)',
                      color: '#6B7280'
                    }}
                  >
                    <Sparkles className="w-4 h-4" />
                    Insights
                  </div>
                  <div
                    className="text-2xl font-medium"
                    style={{
                      fontFamily: 'var(--_typography---font--styrene-a)',
                      color: '#141413'
                    }}
                  >
                    48
                  </div>
                </div>

                <div className="p-4 rounded-lg" style={{ backgroundColor: '#F5F5F5' }}>
                  <div
                    className="flex items-center gap-2 mb-2"
                    style={{
                      fontFamily: 'var(--_typography---font--tiempos)',
                      color: '#6B7280'
                    }}
                  >
                    <Target className="w-4 h-4" />
                    Platforms
                  </div>
                  <div
                    className="text-2xl font-medium"
                    style={{
                      fontFamily: 'var(--_typography---font--styrene-a)',
                      color: '#141413'
                    }}
                  >
                    {currentPlatforms.filter(p => p.connected).length}
                  </div>
                </div>

                <div className="p-4 rounded-lg" style={{ backgroundColor: '#F5F5F5' }}>
                  <div
                    className="flex items-center gap-2 mb-2"
                    style={{
                      fontFamily: 'var(--_typography---font--tiempos)',
                      color: '#6B7280'
                    }}
                  >
                    <Check className="w-4 h-4" />
                    Validation
                  </div>
                  <div
                    className="text-2xl font-medium"
                    style={{
                      fontFamily: 'var(--_typography---font--styrene-a)',
                      color: '#141413'
                    }}
                  >
                    {currentValidation}%
                  </div>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full mt-4"
                onClick={() => navigate('/soul-signature-dashboard')}
                style={{
                  borderColor: '#D97706',
                  color: '#D97706',
                  fontFamily: 'var(--_typography---font--tiempos)'
                }}
              >
                View Full Details
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </Card>
          </div>

          {/* Conversation Interface */}
          <Card
            className="mb-8"
            style={{
              backgroundColor: 'white',
              border: '1px solid rgba(20,20,19,0.1)'
            }}
          >
            <div className="p-6">
              <h3
                className="text-xl mb-6"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  fontWeight: 500,
                  color: '#141413'
                }}
              >
                Conversation Interface
              </h3>

              {/* Messages */}
              <div
                className="h-96 overflow-y-auto mb-6 p-4 rounded-xl"
                style={{ backgroundColor: '#F5F5F5' }}
              >
                {messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center">
                      <MessageCircle
                        className="w-16 h-16 mx-auto mb-4"
                        style={{ color: '#6B7280' }}
                      />
                      <p
                        className="text-lg mb-2"
                        style={{
                          fontFamily: 'var(--_typography---font--styrene-a)',
                          color: '#141413'
                        }}
                      >
                        Start a conversation
                      </p>
                      <p
                        className="text-sm"
                        style={{
                          fontFamily: 'var(--_typography---font--tiempos)',
                          color: '#6B7280'
                        }}
                      >
                        Ask your twin anything or try a test question below
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          "p-4 rounded-xl",
                          message.role === 'user'
                            ? 'ml-auto max-w-[80%]'
                            : 'mr-auto max-w-[80%]'
                        )}
                        style={{
                          backgroundColor: message.role === 'user' ? '#D97706' : 'white',
                          color: message.role === 'user' ? 'white' : '#141413',
                          border: message.role === 'assistant' ? '1px solid rgba(20,20,19,0.1)' : 'none'
                        }}
                      >
                        <div
                          className="text-sm mb-2"
                          style={{
                            fontFamily: 'var(--_typography---font--tiempos)',
                            opacity: 0.7
                          }}
                        >
                          {message.role === 'user' ? 'You' : `Your Twin (${twinMode === 'personal' ? 'Personal Soul' : 'Professional Identity'})`}
                        </div>
                        <div
                          className="mb-2"
                          style={{
                            fontFamily: 'var(--_typography---font--tiempos)',
                            lineHeight: '1.6'
                          }}
                        >
                          {message.content}
                        </div>
                        {message.role === 'assistant' && (
                          <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid rgba(20,20,19,0.1)' }}>
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  onClick={() => handleRateResponse(message.id, star)}
                                  className="hover:opacity-80"
                                >
                                  <Star
                                    className="w-4 h-4"
                                    style={{
                                      color: message.rating && star <= message.rating ? '#D97706' : '#6B7280',
                                      fill: message.rating && star <= message.rating ? '#D97706' : 'none'
                                    }}
                                  />
                                </button>
                              ))}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleMarkAccurate(message.id, true)}
                              className={cn(message.accurate === true ? 'border-green-500' : '')}
                              style={{
                                fontSize: '0.75rem',
                                padding: '0.25rem 0.75rem',
                                fontFamily: 'var(--_typography---font--tiempos)'
                              }}
                            >
                              <Check className="w-3 h-3 mr-1" />
                              Accurate
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleMarkAccurate(message.id, false)}
                              className={cn(message.accurate === false ? 'border-red-500' : '')}
                              style={{
                                fontSize: '0.75rem',
                                padding: '0.25rem 0.75rem',
                                fontFamily: 'var(--_typography---font--tiempos)'
                              }}
                            >
                              <X className="w-3 h-3 mr-1" />
                              Refine
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                    {isTyping && (
                      <div
                        className="p-4 rounded-xl mr-auto max-w-[80%]"
                        style={{
                          backgroundColor: 'white',
                          border: '1px solid rgba(20,20,19,0.1)'
                        }}
                      >
                        <div className="flex gap-2">
                          <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Type your message..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  className="flex-1 px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-opacity-50"
                  style={{
                    borderColor: 'rgba(20, 20, 19, 0.1)',
                    backgroundColor: '#F5F5F5',
                    color: '#141413',
                    fontFamily: 'var(--_typography---font--tiempos)'
                  }}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim()}
                  style={{
                    backgroundColor: '#D97706',
                    color: 'white',
                    fontFamily: 'var(--_typography---font--styrene-a)',
                    fontWeight: 500
                  }}
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Send
                </Button>
              </div>
            </div>
          </Card>

          {/* Testing & Refinement Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Authenticity Testing */}
            <Card
              className="p-6"
              style={{
                backgroundColor: 'white',
                border: '1px solid rgba(20,20,19,0.1)'
              }}
            >
              <div className="flex items-center justify-between mb-6">
                <h3
                  className="text-xl"
                  style={{
                    fontFamily: 'var(--_typography---font--styrene-a)',
                    fontWeight: 500,
                    color: '#141413'
                  }}
                >
                  Authenticity Testing
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowTestBank(!showTestBank)}
                >
                  {showTestBank ? 'Hide' : 'Show'}
                </Button>
              </div>

              {showTestBank && (
                <>
                  <div
                    className="mb-6 p-4 rounded-lg"
                    style={{ backgroundColor: '#FEF3E2' }}
                  >
                    <div
                      className="text-sm mb-2"
                      style={{
                        fontFamily: 'var(--_typography---font--styrene-a)',
                        fontWeight: 500,
                        color: '#141413'
                      }}
                    >
                      Validation Progress
                    </div>
                    <Progress value={currentValidation} className="h-2 mb-2" />
                    <div
                      className="text-xs"
                      style={{
                        fontFamily: 'var(--_typography---font--tiempos)',
                        color: '#6B7280'
                      }}
                    >
                      {currentValidation}% validated • {100 - currentValidation}% remaining
                    </div>
                  </div>

                  <div className="space-y-3">
                    {relevantTests.map((test) => (
                      <div
                        key={test.id}
                        className="p-4 rounded-lg border cursor-pointer hover:border-[#D97706] transition-colors"
                        style={{ borderColor: 'rgba(20,20,19,0.1)' }}
                        onClick={() => handleTestQuestion(test)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div
                              className="font-medium mb-1"
                              style={{
                                fontFamily: 'var(--_typography---font--styrene-a)',
                                color: '#141413'
                              }}
                            >
                              {test.category}
                            </div>
                            <div
                              className="text-sm"
                              style={{
                                fontFamily: 'var(--_typography---font--tiempos)',
                                color: '#6B7280'
                              }}
                            >
                              {test.question}
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className="ml-2"
                            style={{
                              backgroundColor: test.difficulty === 'easy' ? '#E8F5E9' : test.difficulty === 'medium' ? '#FFF9E6' : '#FFE5E5',
                              color: test.difficulty === 'easy' ? '#2E7D32' : test.difficulty === 'medium' ? '#F57C00' : '#C62828',
                              border: 'none'
                            }}
                          >
                            {test.difficulty}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between mt-3">
                          <div
                            className="text-xs"
                            style={{
                              fontFamily: 'var(--_typography---font--tiempos)',
                              color: '#6B7280'
                            }}
                          >
                            ⏱️ {test.estimatedTime}
                          </div>
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTestQuestion(test);
                            }}
                            style={{
                              backgroundColor: '#D97706',
                              color: 'white',
                              fontSize: '0.75rem',
                              padding: '0.25rem 0.75rem',
                              fontFamily: 'var(--_typography---font--tiempos)'
                            }}
                          >
                            Test Now
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button
                    variant="outline"
                    className="w-full mt-4"
                    style={{
                      borderColor: '#D97706',
                      color: '#D97706',
                      fontFamily: 'var(--_typography---font--tiempos)'
                    }}
                  >
                    Browse All Tests
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </>
              )}
            </Card>

            {/* Refinement Controls */}
            <Card
              className="p-6"
              style={{
                backgroundColor: 'white',
                border: '1px solid rgba(20,20,19,0.1)'
              }}
            >
              <div className="flex items-center justify-between mb-6">
                <h3
                  className="text-xl"
                  style={{
                    fontFamily: 'var(--_typography---font--styrene-a)',
                    fontWeight: 500,
                    color: '#141413'
                  }}
                >
                  Refinement Controls
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowRefinementControls(!showRefinementControls)}
                >
                  {showRefinementControls ? 'Hide' : 'Show'}
                </Button>
              </div>

              {showRefinementControls && (
                <>
                  <div
                    className="text-sm mb-4"
                    style={{
                      fontFamily: 'var(--_typography---font--styrene-a)',
                      fontWeight: 500,
                      color: '#141413'
                    }}
                  >
                    Quick Actions
                  </div>

                  <div className="space-y-3 mb-6">
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      style={{
                        fontFamily: 'var(--_typography---font--tiempos)',
                        backgroundColor: '#F5F5F5'
                      }}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Re-extract {twinMode === 'professional' ? 'Gmail' : 'Spotify'} insights
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      style={{
                        fontFamily: 'var(--_typography---font--tiempos)',
                        backgroundColor: '#F5F5F5'
                      }}
                      onClick={() => navigate('/soul-signature-dashboard')}
                    >
                      <Lock className="w-4 h-4 mr-2" />
                      Adjust privacy settings
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      style={{
                        fontFamily: 'var(--_typography---font--tiempos)',
                        backgroundColor: '#F5F5F5'
                      }}
                      onClick={() => navigate('/soul-signature-dashboard')}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add more platforms
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      style={{
                        fontFamily: 'var(--_typography---font--tiempos)',
                        backgroundColor: '#F5F5F5'
                      }}
                    >
                      <BarChart className="w-4 h-4 mr-2" />
                      View discovered patterns
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      style={{
                        fontFamily: 'var(--_typography---font--tiempos)',
                        backgroundColor: '#F5F5F5'
                      }}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export twin data
                    </Button>
                  </div>

                  <div
                    className="pt-4"
                    style={{ borderTop: '1px solid rgba(20,20,19,0.1)' }}
                  >
                    <div
                      className="text-sm mb-3"
                      style={{
                        fontFamily: 'var(--_typography---font--styrene-a)',
                        fontWeight: 500,
                        color: '#141413'
                      }}
                    >
                      Privacy Context
                    </div>
                    <div className="space-y-2">
                      {(['public', 'friends', 'professional', 'full'] as PrivacyContext[]).map((context) => (
                        <button
                          key={context}
                          onClick={() => setPrivacyContext(context)}
                          className={cn(
                            "w-full px-3 py-2 rounded-lg text-sm text-left",
                            privacyContext === context ? 'border' : ''
                          )}
                          style={{
                            borderColor: privacyContext === context ? '#D97706' : 'transparent',
                            backgroundColor: privacyContext === context ? '#FEF3E2' : '#F5F5F5',
                            fontFamily: 'var(--_typography---font--tiempos)',
                            color: '#141413'
                          }}
                        >
                          {context === 'public' && '🌍 Public Twin'}
                          {context === 'friends' && '👥 Friends & Family'}
                          {context === 'professional' && '💼 Professional Network'}
                          {context === 'full' && '🔓 Full Authenticity'}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </Card>
          </div>

          {/* Connected Platforms & Insights */}
          <Card
            className="p-6"
            style={{
              backgroundColor: 'white',
              border: '1px solid rgba(20,20,19,0.1)'
            }}
          >
            <h3
              className="text-xl mb-6"
              style={{
                fontFamily: 'var(--_typography---font--styrene-a)',
                fontWeight: 500,
                color: '#141413'
              }}
            >
              Connected Platforms & Insights
            </h3>

            <div
              className="text-sm mb-4"
              style={{
                fontFamily: 'var(--_typography---font--styrene-a)',
                fontWeight: 500,
                color: '#141413'
              }}
            >
              {twinMode === 'professional' ? 'Professional Identity Mode' : 'Personal Soul Mode'} (Currently Active)
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {currentPlatforms.map((platform) => (
                <div
                  key={platform.key}
                  className="p-4 rounded-lg border"
                  style={{
                    borderColor: platform.connected ? '#D97706' : 'rgba(20,20,19,0.1)',
                    backgroundColor: platform.connected ? '#FEF3E2' : '#F5F5F5'
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span style={{ color: '#141413' }}>{platform.icon}</span>
                    <span
                      className="font-medium"
                      style={{
                        fontFamily: 'var(--_typography---font--tiempos)',
                        color: '#141413'
                      }}
                    >
                      {platform.name}
                    </span>
                  </div>
                  {platform.connected ? (
                    <>
                      <Badge
                        style={{
                          backgroundColor: '#D97706',
                          color: 'white',
                          marginBottom: '0.5rem'
                        }}
                      >
                        Connected
                      </Badge>
                      <div
                        className="text-xs"
                        style={{
                          fontFamily: 'var(--_typography---font--tiempos)',
                          color: '#6B7280'
                        }}
                      >
                        {platform.dataPoints} data points
                      </div>
                    </>
                  ) : (
                    <Badge variant="outline" style={{ color: '#6B7280' }}>
                      Not Connected
                    </Badge>
                  )}
                </div>
              ))}
            </div>

            <div
              className="p-6 rounded-xl mb-6"
              style={{ backgroundColor: '#F5F5F5' }}
            >
              <div
                className="text-sm mb-4"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  fontWeight: 500,
                  color: '#141413'
                }}
              >
                Key Insights Discovered:
              </div>
              <ul className="space-y-2">
                {currentInsights.map((insight, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2"
                    style={{
                      fontFamily: 'var(--_typography---font--tiempos)',
                      color: '#141413'
                    }}
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full mt-2"
                      style={{ backgroundColor: '#D97706' }}
                    />
                    {insight}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex gap-4">
              <Button
                onClick={() => {
                  setTwinMode(twinMode === 'personal' ? 'professional' : 'personal');
                }}
                style={{
                  backgroundColor: '#D97706',
                  color: 'white',
                  fontFamily: 'var(--_typography---font--tiempos)'
                }}
              >
                Switch to {twinMode === 'personal' ? 'Professional Identity' : 'Personal Soul'}
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/soul-signature-dashboard')}
                style={{
                  borderColor: '#D97706',
                  color: '#D97706',
                  fontFamily: 'var(--_typography---font--tiempos)'
                }}
              >
                View Full Insights
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>

          {/* Bottom Action Bar */}
          <div
            className="fixed bottom-0 left-0 right-0 p-4 border-t"
            style={{
              backgroundColor: '#FAF9F5',
              borderColor: 'rgba(20,20,19,0.1)'
            }}
          >
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => navigate('/soul-signature-dashboard')}
                style={{
                  fontFamily: 'var(--_typography---font--tiempos)'
                }}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => navigate('/twin-activation')}
                  style={{
                    fontFamily: 'var(--_typography---font--tiempos)'
                  }}
                >
                  <Play className="w-4 h-4 mr-2" />
                  Preview Twin
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/settings')}
                  style={{
                    fontFamily: 'var(--_typography---font--tiempos)'
                  }}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Twin Settings
                </Button>
                <Button
                  variant="outline"
                  style={{
                    fontFamily: 'var(--_typography---font--tiempos)'
                  }}
                >
                  <HelpCircle className="w-4 h-4 mr-2" />
                  Help
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TalkToTwin;
