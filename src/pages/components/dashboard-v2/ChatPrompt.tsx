import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, Sun, Music, Calendar, Mail, Heart } from 'lucide-react';
import { getAccessToken } from '@/services/api/apiBase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface QuickAction {
  label: string;
  icon: React.ReactNode;
  type: 'trigger' | 'prefill';
  skillName?: string;
  toast?: string;
  prefill?: string;
}

const ACTIONS: QuickAction[] = [
  { label: 'Morning briefing', icon: <Sun className="w-3.5 h-3.5" />, type: 'trigger', skillName: 'morning_briefing', toast: 'Briefing on its way...' },
  { label: 'Music for now', icon: <Music className="w-3.5 h-3.5" />, type: 'trigger', skillName: 'music_mood_match', toast: 'Finding your vibe...' },
  { label: "What's my schedule?", icon: <Calendar className="w-3.5 h-3.5" />, type: 'prefill', prefill: "What's on my calendar today?" },
  { label: 'Draft an email', icon: <Mail className="w-3.5 h-3.5" />, type: 'prefill', prefill: 'Help me draft a reply to ' },
  { label: 'How am I doing?', icon: <Heart className="w-3.5 h-3.5" />, type: 'prefill', prefill: 'How am I doing lately?' },
];

export function ChatPrompt() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [triggering, setTriggering] = useState<string | null>(null);

  const submit = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    navigate('/talk-to-twin', { state: { prefill: trimmed } });
  };

  const triggerSkill = async (action: QuickAction) => {
    if (!action.skillName) return;
    setTriggering(action.skillName);

    try {
      const token = getAccessToken() || localStorage.getItem('auth_token') || localStorage.getItem('token');
      await fetch(`${API_URL}/skills/trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ skillName: action.skillName }),
      });
    } catch {
      // Silent — skill fires in background
    }

    // Show toast briefly then reset
    setTimeout(() => setTriggering(null), 2500);
  };

  const handleAction = (action: QuickAction) => {
    if (action.type === 'trigger') {
      triggerSkill(action);
    } else {
      submit(action.prefill || action.label);
    }
  };

  return (
    <section className="mb-12">
      <div
        className="rounded-[20px] p-4"
        style={{
          background: 'var(--glass-surface-bg)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
          border: '1px solid var(--glass-surface-border)',
          boxShadow: '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {/* Toast for triggered skills */}
        {triggering && (
          <div
            className="text-[12px] text-center py-1.5 mb-3 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}
          >
            {ACTIONS.find(a => a.skillName === triggering)?.toast || 'Working on it...'}
          </div>
        )}

        {/* Quick action chips */}
        <div className="flex flex-wrap gap-2 mb-3">
          {ACTIONS.map((action) => (
            <button
              key={action.label}
              onClick={() => handleAction(action)}
              disabled={triggering === action.skillName}
              className="flex items-center gap-1.5 rounded-[46px] text-xs px-3 py-2.5 cursor-pointer transition-all duration-150 ease-out hover:brightness-125 active:scale-[0.97] disabled:opacity-40"
              style={{
                background: 'var(--glass-surface-bg)',
                backdropFilter: 'blur(42px)',
                WebkitBackdropFilter: 'blur(42px)',
                border: '1px solid var(--glass-surface-border)',
                color: 'var(--text-secondary)',
              }}
            >
              <span style={{ color: 'rgba(255,255,255,0.35)' }}>{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>

        {/* Input row */}
        <form
          onSubmit={(e) => { e.preventDefault(); submit(text); }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask your twin anything..."
            className="flex-1 bg-transparent text-[15px] outline-none border-none"
            style={{ color: 'var(--foreground)' }}
          />
          <button
            type="submit"
            aria-label="Send message"
            className="flex items-center justify-center border-none cursor-pointer flex-shrink-0 transition-all duration-150 ease-out hover:brightness-110 active:scale-90"
            style={{
              width: 28,
              height: 28,
              borderRadius: '100px',
              background: '#252222',
              padding: '4px',
            }}
          >
            <ArrowUp size={16} style={{ color: 'var(--foreground)' }} />
          </button>
        </form>
      </div>
    </section>
  );
}
