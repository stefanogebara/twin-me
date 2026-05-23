import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL, getAccessToken } from '@/services/api/apiBase';

const API_BASE = API_URL;

// Audit bug C2 (2026-05-12): unlimited tiers return limit=null, remaining=null
// from /api/chat/usage. Frontend must guard against null when rendering
// fractions like "X/Y messages used" — see ChatInputArea + LimitReachedBanner.
interface ChatUsage {
  used: number;
  limit: number | null;
  remaining: number | null;
  tier: string;
  unlimited?: boolean;
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
      // Failsafe: always mark checked after 3 seconds even if fetch hangs.
      // Prevents the chat page from getting stuck on a loading spinner forever.
      const failsafe = setTimeout(() => setInterviewChecked(true), 3000);

      try {
        const token = getAccessToken();
        if (!token) { clearTimeout(failsafe); setInterviewChecked(true); return; }
        const payload = JSON.parse(atob(token.split('.')[1]));
        const id = payload.id || payload.userId;
        if (!id) { clearTimeout(failsafe); setInterviewChecked(true); return; }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const res = await fetch(`${API_BASE}/onboarding/calibration-data/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const { data } = await res.json();
          if (data && !data.completed_at) {
            clearTimeout(failsafe);
            setInterviewChecked(true); // Mark checked BEFORE navigating so chat doesn't hang
            navigate('/interview');
            return;
          }
        }
      } catch {
        // Non-fatal — fallthrough to setInterviewChecked(true)
      }
      clearTimeout(failsafe);
      setInterviewChecked(true);
    };
    checkInterview();
  }, [navigate]);

  // Fetch chat usage limits
  const fetchUsage = async () => {
    if (!userId) return;
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/chat/usage`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setChatUsage({
            used: data.used,
            limit: data.limit ?? null,
            remaining: data.remaining ?? null,
            tier: data.tier,
            unlimited: !!data.unlimited,
          });
          // Only the free tier surfaces the "limit reached" banner up-front.
          // Paid plans hit the gate via a 429 from the chat endpoint instead,
          // and unlimited tiers (max) never hit it. Audit bug C2.
          const remaining = data.remaining;
          setLimitReached(
            !data.unlimited && data.tier === 'free' && typeof remaining === 'number' && remaining <= 0
          );
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
    const token = getAccessToken();
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
    if (!userId) return;
    setIsLoadingContext(true);
    try {
      const token = getAccessToken();
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
