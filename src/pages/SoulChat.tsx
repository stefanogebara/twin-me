/**
 * Soul Chat Page
 * Chat with your AI digital twin based on your extracted soul signature
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MessageSquare, Send, Bot, User, ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export const SoulChat: React.FC = () => {
  const navigate = useNavigate();
  const { user, isSignedIn } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Authentication check
  useEffect(() => {
    if (!isSignedIn) {
      navigate('/auth');
      return;
    }
  }, [isSignedIn, navigate]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Welcome message
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: '1',
          role: 'assistant',
          content: "Hello! I'm your digital twin, created from your soul signature. I understand your communication style, personality traits, and preferences. Ask me anything, and I'll respond as you would!",
          timestamp: new Date()
        }
      ]);
    }
  }, []);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Call your twin chat API
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const response = await fetch(`${apiUrl}/twin/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id || user?.email,
          message: input,
          conversationHistory: messages.slice(-10) // Last 10 messages for context
        })
      });

      if (response.ok) {
        const data = await response.json();
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.response || "I'm thinking about that...",
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        // Fallback response if API fails
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: "I'm still learning about you. Complete your soul signature extraction for more personalized responses!",
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "Sorry, I'm having trouble connecting right now. Please try again!",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--claude-bg))]">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <Button
            onClick={() => navigate('/soul-signature')}
            variant="outline"
            style={{
              border: '2px solid #D97706',
              color: '#D97706',
              fontFamily: 'var(--_typography---font--styrene-a)',
              fontWeight: 500
            }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>

          <div className="flex items-center gap-2">
            <Bot className="w-6 h-6" style={{ color: '#D97706' }} />
            <h1
              className="text-2xl font-medium"
              style={{
                fontFamily: 'var(--_typography---font--styrene-a)',
                letterSpacing: '-0.02em',
                color: 'hsl(var(--claude-text))'
              }}
            >
              Chat with Your Twin
            </h1>
            <Sparkles className="w-5 h-5" style={{ color: '#D97706' }} />
          </div>

          <div className="w-32"></div> {/* Spacer for alignment */}
        </div>

        {/* Chat Container */}
        <Card
          className="h-[calc(100vh-200px)] flex flex-col"
          style={{
            backgroundColor: 'hsl(var(--claude-surface))',
            border: '1px solid hsl(var(--claude-border))'
          }}
        >
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3",
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {message.role === 'assistant' && (
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: '#D97706' }}
                  >
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                )}

                <div
                  className={cn(
                    "max-w-[70%] rounded-2xl px-4 py-3",
                    message.role === 'user'
                      ? 'bg-[hsl(var(--claude-accent))] text-white'
                      : 'bg-[hsl(var(--claude-surface-raised))] text-[hsl(var(--claude-text))]'
                  )}
                  style={{
                    fontFamily: 'var(--_typography---font--tiempos)'
                  }}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {message.content}
                  </p>
                  <div
                    className="text-xs mt-1 opacity-70"
                    style={{
                      fontFamily: 'var(--_typography---font--tiempos)'
                    }}
                  >
                    {message.timestamp.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </div>

                {message.role === 'user' && (
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: '#6B7280' }}
                  >
                    <User className="w-5 h-5 text-white" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: '#D97706' }}
                >
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div
                  className="max-w-[70%] rounded-2xl px-4 py-3 bg-[hsl(var(--claude-surface-raised))]"
                >
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div
            className="border-t p-4"
            style={{ borderColor: 'hsl(var(--claude-border))' }}
          >
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Type your message..."
                rows={1}
                className="flex-1 px-4 py-3 rounded-lg resize-none focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'hsl(var(--claude-surface-raised))',
                  border: '1px solid hsl(var(--claude-border))',
                  color: 'hsl(var(--claude-text))',
                  fontFamily: 'var(--_typography---font--tiempos)',
                  focusRing: '2px solid #D97706'
                }}
                disabled={isLoading}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!input.trim() || isLoading}
                style={{
                  backgroundColor: '#D97706',
                  color: 'white',
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  fontWeight: 500
                }}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p
              className="text-xs mt-2 text-center"
              style={{
                fontFamily: 'var(--_typography---font--tiempos)',
                color: 'hsl(var(--claude-text-muted))'
              }}
            >
              Press Enter to send • Shift + Enter for new line
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default SoulChat;
