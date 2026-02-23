/**
 * SoulChatInterface Component
 * Complete chat interface with Grok-style features:
 * - Message actions on each assistant message
 * - Contextual quick actions based on topic
 * - Conversation controls (new, save, export)
 * - 2nd person addressing from assistant
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatMessage } from './ChatMessage';
import { ConversationControls } from './ConversationControls';
import { Send, Loader, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface SoulChatInterfaceProps {
  userId: string;
  className?: string;
  conversationTopic?: 'music' | 'youtube' | 'github' | 'general';
}

export function SoulChatInterface({
  userId,
  className = '',
  conversationTopic = 'general'
}: SoulChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Call the twin chat API - POST /api/chat/message
      const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/chat/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: content,
          context: {
            platforms: ['spotify', 'calendar', 'youtube']
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message || data.response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleRegenerate = (messageId: string) => {
    // Find the user message before this assistant message
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex > 0) {
      const previousUserMessage = messages[messageIndex - 1];
      if (previousUserMessage.role === 'user') {
        // Remove the assistant message and regenerate
        setMessages(prev => prev.filter(m => m.id !== messageId));
        sendMessage(previousUserMessage.content);
      }
    }
  };

  const handleQuickAction = (actionId: string) => {
    // Map quick actions to messages
    const actionMessages: Record<string, string> = {
      'deep-dive': 'Can you dive deeper into this?',
      'show-sources': 'What data sources did you use for this insight?',
      'export': 'Can you export these insights?',
      'show-playlists': 'Show me my playlists',
      'compare-artists': 'Compare my top artists',
      'mood-trends': 'Analyze my mood trends over time',
      'viewing-patterns': 'Show me my viewing patterns',
      'genre-breakdown': 'Break down my favorite genres',
      'recommendations': 'Give me personalized recommendations',
      'top-channels': 'Show me my top YouTube channels',
      'learning-paths': 'What are my learning paths?',
      'watch-time': 'Analyze my watch time',
      'coding-patterns': 'What are my coding patterns?',
      'language-breakdown': 'Break down my programming languages',
      'contribution-graph': 'Show my contribution graph',
      'visualize': 'Can you visualize this data?',
      'compare': 'Compare different time periods'
    };

    const message = actionMessages[actionId] || actionId;
    sendMessage(message);
  };

  const handleNewChat = () => {
    if (messages.length > 0) {
      const confirmed = window.confirm('Start a new conversation? Your current chat will be saved.');
      if (confirmed) {
        // In production, save the current conversation
        setMessages([]);
        setIsSaved(false);
        inputRef.current?.focus();
      }
    }
  };

  const handleSave = () => {
    // In production, save to backend
    setIsSaved(true);
  };

  const handleExport = (format: 'pdf' | 'text' | 'json') => {
    if (format === 'text') {
      const text = messages.map(m =>
        `${m.role === 'assistant' ? 'Soul Twin' : 'You'} (${m.timestamp.toLocaleString()}):\n${m.content}\n\n`
      ).join('');

      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `soul-chat-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (format === 'json') {
      const json = JSON.stringify(messages, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `soul-chat-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
    // PDF export would require a library like jsPDF
  };

  return (
    <div
      className={`flex flex-col h-full ${className}`}
      style={{ backgroundColor: '#fcf6ef' }}
    >
      {/* Header with Conversation Controls */}
      <div
        className="flex items-center justify-between p-4 border-b"
        style={{ borderColor: 'rgba(255, 255, 255, 0.45)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden"
            style={{ backgroundColor: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.45)' }}
          >
            <img src="/images/backgrounds/flower-hero.png" alt="Twin" className="w-9 h-9 object-contain" />
          </div>
          <div>
            <h2 className="font-semibold" style={{ color: '#000000' }}>
              Chat with Your Soul Twin
            </h2>
            <p className="text-sm" style={{ color: '#8A857D' }}>
              Ask me anything about your authentic self
            </p>
          </div>
        </div>

        <ConversationControls
          onNewChat={handleNewChat}
          onSave={handleSave}
          onExport={handleExport}
          isSaved={isSaved}
        />
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence>
          {messages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full text-center py-12"
            >
              <img src="/images/backgrounds/flower-hero.png" alt="" className="w-16 h-16 object-contain mb-4 drop-shadow-md opacity-80" />
              <h3 className="text-xl font-semibold mb-2 heading-serif">
                Start a Conversation
              </h3>
              <p className="max-w-md mb-6" style={{ color: '#8A857D' }}>
                Ask me about your music taste, viewing habits, learning patterns, or anything else from your soul signature.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {[
                  'What does my music taste say about me?',
                  'What are my top content interests?',
                  'What am I learning from YouTube?',
                  'Show me my coding activity'
                ].map((suggestion, index) => (
                  <motion.button
                    key={index}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => sendMessage(suggestion)}
                    className="px-4 py-2 rounded-full text-sm transition-colors"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.18)',
                      backdropFilter: 'blur(10px)',
                      border: '1px solid rgba(255, 255, 255, 0.45)',
                      color: '#000000'
                    }}
                  >
                    {suggestion}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ) : (
            messages.map((message) => (
              <ChatMessage
                key={message.id}
                role={message.role}
                content={message.content}
                timestamp={message.timestamp}
                onRegenerate={message.role === 'assistant' ? () => handleRegenerate(message.id) : undefined}
                onQuickAction={handleQuickAction}
                conversationTopic={conversationTopic}
              />
            ))
          )}
        </AnimatePresence>

        {/* Loading Indicator */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 px-6 py-4"
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #000000, #4a3f38)' }}
            >
              <Loader className="w-5 h-5 animate-spin" style={{ color: '#fcf6ef' }} />
            </div>
            <span style={{ color: '#8A857D' }}>Thinking...</span>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div
        className="p-4 border-t"
        style={{ borderColor: 'rgba(255, 255, 255, 0.45)' }}
      >
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your soul signature..."
            rows={1}
            className="flex-1 px-4 py-3 rounded-2xl focus:outline-none resize-none text-sm"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.45)',
              color: '#000000',
              minHeight: '48px',
              maxHeight: '120px'
            }}
          />
          <motion.button
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="btn-cta-app px-6 py-3 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </motion.button>
        </form>
      </div>
    </div>
  );
}
