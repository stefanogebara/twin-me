import React, { useState, useEffect } from 'react';
import { Bot, CheckCircle2, XCircle, Clock, Zap } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

interface AgentAction {
  id: string;
  skill_name: string;
  action_type: string;
  action_content: string;
  user_response: string | null;
  created_at: string;
}

const SKILL_LABELS: Record<string, string> = {
  morning_briefing: 'Morning Briefing',
  evening_recap: 'Evening Recap',
  music_mood_match: 'Music Suggestion',
  pattern_alert: 'Pattern Alert',
  social_checkin: 'Social Check-in',
  email_triage: 'Email Triage',
  proactive_insight: 'Insight',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  accepted: <CheckCircle2 className="w-3 h-3" style={{ color: 'rgba(34,197,94,0.6)' }} />,
  rejected: <XCircle className="w-3 h-3" style={{ color: 'rgba(239,68,68,0.5)' }} />,
  pending: <Clock className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.3)' }} />,
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const AgentActivityFeed: React.FC = () => {
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/agent-actions?limit=8`, { headers: getAuthHeaders() });
        const data = await res.json();
        setActions(data.actions || []);
      } catch {
        // Silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 justify-center">
        <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
      </div>
    );
  }

  if (actions.length === 0) {
    return (
      <div className="py-4 text-center">
        <Bot className="w-5 h-5 mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.15)' }} />
        <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
          Your twin hasn't taken any actions yet
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {actions.map((action) => (
        <div
          key={action.id}
          className="flex items-start gap-2.5 py-2 px-3 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.02)' }}
        >
          <Zap className="w-3 h-3 mt-0.5 shrink-0" style={{ color: 'rgba(255,255,255,0.2)' }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {SKILL_LABELS[action.skill_name] || action.skill_name?.replace(/_/g, ' ') || 'Action'}
              </span>
              {STATUS_ICON[action.user_response || 'pending']}
            </div>
            <p
              className="text-[11px] mt-0.5 truncate"
              style={{ color: 'rgba(255,255,255,0.3)' }}
            >
              {action.action_content?.slice(0, 100)}
            </p>
          </div>
          <span className="text-[10px] shrink-0" style={{ color: 'rgba(255,255,255,0.15)' }}>
            {timeAgo(action.created_at)}
          </span>
        </div>
      ))}
    </div>
  );
};

export default AgentActivityFeed;
