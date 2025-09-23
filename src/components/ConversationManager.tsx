import React, { useState, useEffect } from 'react';
import { useLoading } from '../contexts/LoadingContext';
import { useError } from '../contexts/ErrorContext';
import { LoadingSpinner, Skeleton } from './ui/LoadingSpinner';
import { SearchAndFilter } from './ui/SearchAndFilter';
import { Card } from './ui/ResponsiveContainer';

interface Conversation {
  id: string;
  title: string;
  twinId: string;
  twinName: string;
  lastMessage: string;
  lastActivity: Date;
  messageCount: number;
  status: 'active' | 'archived' | 'deleted';
}

interface ConversationManagerProps {
  userId: string;
  onSelectConversation: (conversation: Conversation) => void;
  selectedConversationId?: string;
}

export const ConversationManager: React.FC<ConversationManagerProps> = ({
  userId,
  onSelectConversation,
  selectedConversationId
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<Conversation[]>([]);
  const { setLoading, isLoading } = useLoading();
  const { showError, showSuccess } = useError();

  useEffect(() => {
    loadConversations();
  }, [userId]);

  const loadConversations = async () => {
    setLoading('conversations', true);
    try {
      // Mock data for now - replace with actual API call
      const mockConversations: Conversation[] = [
        {
          id: '1',
          title: 'Finance Discussion',
          twinId: 'twin-1',
          twinName: 'Prof. Vicente León',
          lastMessage: 'Great question about market volatility...',
          lastActivity: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
          messageCount: 15,
          status: 'active'
        },
        {
          id: '2',
          title: 'Investment Strategy',
          twinId: 'twin-1',
          twinName: 'Prof. Vicente León',
          lastMessage: 'Let me explain the concept of diversification...',
          lastActivity: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
          messageCount: 23,
          status: 'active'
        },
        {
          id: '3',
          title: 'Personal Learning Plan',
          twinId: 'twin-2',
          twinName: 'Learning Assistant',
          lastMessage: 'Your progress looks excellent!',
          lastActivity: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
          messageCount: 8,
          status: 'archived'
        }
      ];

      setConversations(mockConversations);
    } catch (error) {
      showError('Failed to load conversations');
      console.error('Error loading conversations:', error);
    } finally {
      setLoading('conversations', false);
    }
  };

  const archiveConversation = async (conversationId: string) => {
    try {
      setConversations(prev =>
        prev.map(conv =>
          conv.id === conversationId
            ? { ...conv, status: 'archived' as const }
            : conv
        )
      );
      showSuccess('Conversation archived');
    } catch (error) {
      showError('Failed to archive conversation');
    }
  };

  const deleteConversation = async (conversationId: string) => {
    if (!confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
      return;
    }

    try {
      setConversations(prev => prev.filter(conv => conv.id !== conversationId));
      showSuccess('Conversation deleted');
    } catch (error) {
      showError('Failed to delete conversation');
    }
  };

  const restoreConversation = async (conversationId: string) => {
    try {
      setConversations(prev =>
        prev.map(conv =>
          conv.id === conversationId
            ? { ...conv, status: 'active' as const }
            : conv
        )
      );
      showSuccess('Conversation restored');
    } catch (error) {
      showError('Failed to restore conversation');
    }
  };

  const formatLastActivity = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 60) {
      return `${minutes}m ago`;
    } else if (hours < 24) {
      return `${hours}h ago`;
    } else {
      return `${days}d ago`;
    }
  };

  const conversationFilters = [
    {
      key: 'status' as keyof Conversation,
      label: 'Status',
      type: 'select' as const,
      options: [
        { value: 'active', label: 'Active' },
        { value: 'archived', label: 'Archived' }
      ]
    },
    {
      key: 'twinName' as keyof Conversation,
      label: 'Twin',
      type: 'select' as const,
      options: [
        { value: 'Prof. Vicente León', label: 'Prof. Vicente León' },
        { value: 'Learning Assistant', label: 'Learning Assistant' }
      ]
    }
  ];

  if (isLoading('conversations')) {
    return (
      <div className="space-y-4">
        <div className="h-12 bg-gray-200 rounded-lg animate-pulse" />
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton lines={3} avatar />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SearchAndFilter
        data={conversations}
        onFilteredData={setFilteredConversations}
        searchKeys={['title', 'twinName', 'lastMessage']}
        filters={conversationFilters}
        placeholder="Search conversations..."
      />

      <div className="space-y-2">
        {filteredConversations.map((conversation) => (
          <Card
            key={conversation.id}
            className={`p-4 cursor-pointer transition-all duration-200 ${
              selectedConversationId === conversation.id
                ? 'ring-2 ring-[#FF5722] bg-orange-50'
                : 'hover:shadow-md'
            }`}
            onClick={() => onSelectConversation(conversation)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium text-gray-900 truncate">
                    {conversation.title}
                  </h3>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    conversation.status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {conversation.status}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-1">{conversation.twinName}</p>
                <p className="text-sm text-gray-500 truncate mb-2">
                  {conversation.lastMessage}
                </p>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span>{conversation.messageCount} messages</span>
                  <span>{formatLastActivity(conversation.lastActivity)}</span>
                </div>
              </div>

              <div className="flex items-center gap-1 ml-4">
                {conversation.status === 'active' ? (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        archiveConversation(conversation.id);
                      }}
                      className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Archive conversation"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8l6 6 6-6" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConversation(conversation.id);
                      }}
                      className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete conversation"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      restoreConversation(conversation.id);
                    }}
                    className="p-2 text-gray-400 hover:text-green-600 transition-colors"
                    title="Restore conversation"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </Card>
        ))}

        {filteredConversations.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p>No conversations found</p>
            <p className="text-sm mt-1">Start a new conversation with a digital twin!</p>
          </div>
        )}
      </div>
    </div>
  );
};