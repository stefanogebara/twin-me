import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAccessToken, isDemoMode } from '@/services/api/apiBase';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';

interface ChatUsage {
  used: number;
  limit: number;
  remaining: number;
  tier: string;
}

interface ContextItem {
  type: 'memory' | 'fact' | 'platform' | 'personality';
  label: string;
  value: string;
  timestamp?: string;
  icon?: React.ReactNode;
}

interface Platform {
  name: string;
  icon: React.ReactNode;
  key: string;
  color: string;
  connected?: boolean;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  failed?: boolean;
}

interface UseChatSessionOptions {
  userId: string | undefined;
  connectedPlatforms: Platform[];
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

export function useChatSession({ userId, connectedPlatforms, messages, setMessages }: UseChatSessionOptions) {
  const navigate = useNavigate();

  const [interviewChecked, setInterviewChecked] = useState(false);
  const [chatUsage, setChatUsage] = useState<ChatUsage | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [introFetched, setIntroFetched] = useState(false);
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);
  const [isLoadingContext, setIsLoadingContext] = useState(false);

  // Interview guard: if user started but didn't finish the interview, redirect them back.
  useEffect(() => {
    const checkInterview = async () => {
      // Demo mode: skip interview check entirely
      if (isDemoMode()) { setInterviewChecked(true); return; }
      try {
        const token = getAccessToken() || localStorage.getItem('auth_token');
        if (!token) { setInterviewChecked(true); return; }
        const payload = JSON.parse(atob(token.split('.')[1]));
        const id = payload.id || payload.userId;
        if (!id) { setInterviewChecked(true); return; }
        const res = await fetch(`${API_BASE}/onboarding/calibration-data/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const { data } = await res.json();
          if (data && !data.completed_at) {
            navigate('/interview');
            return;
          }
        }
      } catch {
        // Non-fatal
      }
      setInterviewChecked(true);
    };
    checkInterview();
  }, [navigate]);

  // Fetch chat usage limits
  const fetchUsage = async () => {
    if (!userId || isDemoMode()) return;
    try {
      const token = getAccessToken() || localStorage.getItem('auth_token');
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
  }, [userId]);

  // Fetch personalized intro greeting for new users
  useEffect(() => {
    if (!userId || introFetched) return;
    if (messages.length > 0) {
      setIntroFetched(true);
      return;
    }
    setIntroFetched(true);
    // Demo mode: show a static greeting instead of fetching
    if (isDemoMode()) {
      setMessages([{
        id: 'twin-intro',
        role: 'assistant',
        content: "Hey there! I'm your AI twin. I know about your music taste, schedule, and daily patterns. Ask me anything about yourself!",
        timestamp: new Date(),
      }]);
      return;
    }
    const token = getAccessToken() || localStorage.getItem('auth_token');
    fetch(`${API_BASE}/chat/intro`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.intro) {
          setMessages([{
            id: 'twin-intro',
            role: 'assistant',
            content: data.intro,
            timestamp: new Date(),
          }]);
        }
      })
      .catch(() => { /* non-fatal */ });
  }, [userId]);

  // Load context sidebar items
  const loadContext = async () => {
    if (!userId || isDemoMode()) return;
    setIsLoadingContext(true);
    try {
      const token = getAccessToken() || localStorage.getItem('auth_token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch(`${API_BASE}/chat/context`, { headers }).catch(() => null);
      const items: ContextItem[] = [];

      connectedPlatforms.forEach(p => {
        items.push({ type: 'platform', label: p.name, value: 'Connected', icon: p.icon });
      });

      if (res?.ok) {
        const data = await res.json();
        if (data.twinSummary) {
          items.push({
            type: 'personality',
            label: 'Twin Identity',
            value: data.twinSummary.length > 120 ? data.twinSummary.substring(0, 120) + '...' : data.twinSummary
          });
        }
        if (data.memoryStats && data.memoryStats.total > 0) {
          const ms = data.memoryStats;
          const parts = [`${ms.total} total`];
          if (ms.byType?.reflection) parts.push(`${ms.byType.reflection} reflections`);
          if (ms.byType?.fact) parts.push(`${ms.byType.fact} facts`);
          if (ms.byType?.conversation) parts.push(`${ms.byType.conversation} conversations`);
          items.push({ type: 'memory', label: 'Memory Stream', value: parts.join(', ') });
        }
        if (data.pendingInsights && data.pendingInsights.length > 0) {
          items.push({
            type: 'fact',
            label: 'Pending Insights',
            value: `${data.pendingInsights.length} insight${data.pendingInsights.length > 1 ? 's' : ''} ready`
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

  useEffect(() => {
    if (userId) loadContext();
  }, [userId]);

  return {
    interviewChecked,
    chatUsage,
    setChatUsage,
    limitReached,
    setLimitReached,
    contextItems,
    isLoadingContext,
    fetchUsage,
  };
}
