import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, X } from 'lucide-react';
import { getAccessToken } from '@/services/api/apiBase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';

/**
 * Dismissable banner prompting users to connect Telegram.
 * Only shows if Telegram is NOT linked. Dismissed state persists in sessionStorage.
 */
export function MessagingPrompt() {
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('telegram_prompt_dismissed')) return;

    const token = getAccessToken() || localStorage.getItem('auth_token') || localStorage.getItem('token');
    fetch(`${API_URL}/telegram/status`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(d => {
        if (d.success && !d.linked) setShow(true);
      })
      .catch(() => {});
  }, []);

  const dismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('telegram_prompt_dismissed', '1');
  };

  if (!show || dismissed) return null;

  return (
    <section className="mb-6">
      <div
        className="relative flex items-center gap-3 rounded-[20px] px-5 py-4"
        style={{
          background: 'var(--glass-surface-bg)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
          border: '1px solid var(--glass-surface-border)',
        }}
      >
        <div
          className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
          style={{ background: 'rgba(0,136,204,0.12)' }}
        >
          <Send className="w-4 h-4" style={{ color: 'rgba(0,136,204,0.8)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm" style={{ color: 'var(--foreground)' }}>
            Get twin insights on Telegram
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Morning briefings, music suggestions, and reminders — right in your chat.
          </p>
        </div>
        <button
          onClick={() => navigate('/settings')}
          className="shrink-0 text-[12px] px-3 py-1.5 rounded-[6px] transition-opacity hover:opacity-80"
          style={{ backgroundColor: 'rgba(0,136,204,0.15)', color: 'rgba(0,136,204,0.9)' }}
        >
          Connect
        </button>
        <button
          onClick={dismiss}
          className="absolute top-2 right-2 p-1 rounded-full transition-opacity hover:opacity-60"
          aria-label="Dismiss Telegram prompt"
        >
          <X className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.2)' }} />
        </button>
      </div>
    </section>
  );
}
