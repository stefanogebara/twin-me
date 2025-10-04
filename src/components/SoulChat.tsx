/**
 * Soul Chat Component
 * RAG-powered chat with personality-aware responses
 */

import React, { useState, useEffect, useRef } from 'react';
import { Send, Brain, Loader2, Sparkles, User, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { soulDataService, ChatResponse } from '@/services/soulDataService';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  context?: {
    relevantChunksCount: number;
    pastConversationsCount: number;
    confidenceScore: number;
  };
}

interface Props {
  userId: string;
  twinId?: string;
  onNewMessage?: (message: Message) => void;
}

export const SoulChat: React.FC<Props> = ({ userId, twinId, onNewMessage }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Load conversation history on mount
  useEffect(() => {
    if (twinId) {
      loadConversationHistory();
    }
  }, [twinId, userId]);

  const loadConversationHistory = async () => {
    try {
      const history = await soulDataService.getConversationHistory(userId, twinId || 'default', 10);
      if (history.success && history.messages) {
        const loadedMessages: Message[] = history.messages.map((msg: any) => ({
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.timestamp)
        }));
        setMessages(loadedMessages);
      }
    } catch (err) {
      console.error('Failed to load conversation history:', err);
    }
  };

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    };

    // Add user message immediately
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setError(null);

    try {
      // Build conversation history for context
      const conversationHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Call RAG chat endpoint
      const response: ChatResponse = await soulDataService.chat(
        userId,
        userMessage.content,
        twinId || null,
        conversationHistory
      );

      if (response.success) {
        const assistantMessage: Message = {
          role: 'assistant',
          content: response.response,
          timestamp: new Date(),
          context: response.context
        };

        setMessages(prev => [...prev, assistantMessage]);

        if (onNewMessage) {
          onNewMessage(assistantMessage);
        }
      } else {
        throw new Error('Chat response failed');
      }
    } catch (err: any) {
      console.error('Chat error:', err);
      setError(err.message || 'Failed to send message');

      // Add error message
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your message. Please try again.',
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
      sendMessage();
    }
  };

  return (
    <Card className="flex flex-col h-[600px] bg-[hsl(var(--claude-surface))] border-[hsl(var(--claude-border))]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[hsl(var(--claude-border))]">
        <div className="flex items-center gap-3">
          <Brain className="w-6 h-6 text-[hsl(var(--claude-accent))]" />
          <div>
            <h3 className="text-lg font-semibold text-[hsl(var(--claude-text))]">
              Soul Signature Chat
            </h3>
            <p className="text-xs text-[hsl(var(--claude-text-muted))]">
              Personality-aware responses powered by RAG
            </p>
          </div>
        </div>
        <Badge className="bg-[hsl(var(--claude-accent))]">
          <Sparkles className="w-3 h-3 mr-1" />
          Claude 3.5 Sonnet
        </Badge>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
              <Brain className="w-16 h-16 mb-4 text-[hsl(var(--claude-text-muted))]" />
              <h4 className="text-lg font-medium text-[hsl(var(--claude-text))] mb-2">
                Start a Conversation
              </h4>
              <p className="text-sm text-[hsl(var(--claude-text-muted))] max-w-md">
                Chat with your digital twin powered by your soul signature.
                Responses are personalized based on your extracted personality,
                writing style, and platform data.
              </p>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                className={`flex gap-3 ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-[hsl(var(--claude-accent))] flex items-center justify-center flex-shrink-0">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                )}

                <div
                  className={`flex flex-col max-w-[80%] ${
                    message.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`rounded-lg p-3 ${
                      message.role === 'user'
                        ? 'bg-[hsl(var(--claude-accent))] text-white'
                        : 'bg-[hsl(var(--claude-surface-raised))] text-[hsl(var(--claude-text))]'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-[hsl(var(--claude-text-muted))]">
                      {message.timestamp.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>

                    {message.context && message.role === 'assistant' && (
                      <Badge
                        variant="outline"
                        className="text-xs"
                        title={`Used ${message.context.relevantChunksCount} relevant chunks, ${message.context.pastConversationsCount} past conversations`}
                      >
                        <Brain className="w-3 h-3 mr-1" />
                        {(message.context.confidenceScore * 100).toFixed(0)}% confidence
                      </Badge>
                    )}
                  </div>
                </div>

                {message.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-[hsl(var(--claude-surface-raised))] flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-[hsl(var(--claude-text))]" />
                  </div>
                )}
              </div>
            ))
          )}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-[hsl(var(--claude-accent))] flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="bg-[hsl(var(--claude-surface-raised))] rounded-lg p-3">
                <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--claude-text-muted))]" />
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Error Display */}
      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-[hsl(var(--claude-border))]">
        <div className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask your digital twin anything..."
            disabled={isLoading}
            className="flex-1 bg-[hsl(var(--claude-surface-raised))] border-[hsl(var(--claude-border))] text-[hsl(var(--claude-text))] placeholder:text-[hsl(var(--claude-text-muted))]"
          />
          <Button
            onClick={sendMessage}
            disabled={!inputValue.trim() || isLoading}
            className="bg-[hsl(var(--claude-accent))] hover:bg-[hsl(var(--claude-accent))]/90"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-[hsl(var(--claude-text-muted))] mt-2">
          Press Enter to send • Responses use your personality profile and platform data
        </p>
      </div>
    </Card>
  );
};
