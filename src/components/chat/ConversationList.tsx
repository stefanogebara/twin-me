import { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { getAccessToken } from '@/services/api/apiBase';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';

interface Conversation {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
}

interface ConversationListProps {
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function SkeletonRow() {
  return (
    <div className="px-3 py-2.5 rounded-xl animate-pulse">
      <div className="h-[13px] w-3/4 rounded bg-[rgba(255,255,255,0.06)] mb-1.5" />
      <div className="h-[11px] w-full rounded bg-[rgba(255,255,255,0.04)]" />
    </div>
  );
}

export function ConversationList({
  activeConversationId,
  onSelectConversation,
  onNewChat,
}: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const response = await fetch(`${API_BASE}/chat/conversations`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch conversations (${response.status})`);
      }

      const data = await response.json();
      const items: Conversation[] = Array.isArray(data)
        ? data
        : Array.isArray(data.conversations)
          ? data.conversations
          : [];
      setConversations(items);
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
      setError('Could not load conversations');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  return (
    <div className="flex flex-col h-full">
      {/* New Chat button */}
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={onNewChat}
          className="bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.1)] rounded-xl px-3 py-2 text-[13px] text-[#F5F5F4] w-full text-left flex items-center gap-2 transition-colors"
        >
          <Plus className="w-3.5 h-3.5 opacity-60" />
          New Chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-1.5 pb-3">
        {isLoading ? (
          <div className="flex flex-col gap-1">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : error ? (
          <p className="px-3 py-4 text-[12px] text-[rgba(255,255,255,0.3)] text-center">
            {error}
          </p>
        ) : conversations.length === 0 ? (
          <p className="px-3 py-4 text-[12px] text-[rgba(255,255,255,0.3)] text-center">
            No conversations yet
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {conversations.map((conv) => {
              const isActive = conv.id === activeConversationId;
              return (
                <button
                  key={conv.id}
                  onClick={() => onSelectConversation(conv.id)}
                  className={`px-3 py-2.5 rounded-xl cursor-pointer hover:bg-[rgba(255,255,255,0.06)] transition-colors text-left w-full ${
                    isActive ? 'bg-[rgba(255,255,255,0.08)]' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-[#F5F5F4] truncate">
                      {conv.title || 'Untitled'}
                    </span>
                    {conv.updatedAt && (
                      <span className="text-[10px] text-[rgba(255,255,255,0.3)] whitespace-nowrap flex-shrink-0">
                        {formatRelativeTime(conv.updatedAt)}
                      </span>
                    )}
                  </div>
                  {conv.preview && (
                    <p className="text-[11px] text-[rgba(255,255,255,0.4)] truncate mt-0.5">
                      {conv.preview}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
