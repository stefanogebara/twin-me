import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageSquarePlus, X, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAnalytics } from '../contexts/AnalyticsContext';
import { authFetch } from '../services/api/apiBase';

const CATEGORIES = ['bug', 'feature', 'ux', 'general'] as const;
type Category = typeof CATEGORIES[number];

const CATEGORY_LABELS: Record<Category, string> = {
  bug: 'Bug',
  feature: 'Feature',
  ux: 'UX',
  general: 'General',
};

const BetaFeedbackWidget: React.FC = () => {
  const { isSignedIn } = useAuth();
  const { trackFunnel } = useAnalytics();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>('general');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  if (!isSignedIn) return null;
  if (location.pathname === '/talk-to-twin') return null;

  const handleSubmit = async () => {
    if (!message.trim() || message.trim().length < 3) return;
    setLoading(true);
    try {
      const res = await authFetch('/beta/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          message: message.trim(),
          pageUrl: window.location.pathname,
        }),
      });
      if (res.ok) {
        setSent(true);
        trackFunnel('beta_feedback_submitted', { category });
        setTimeout(() => {
          setOpen(false);
          setSent(false);
          setMessage('');
          setCategory('general');
        }, 3000);
      }
    } catch {
      // Silent fail for feedback
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 lg:bottom-5 right-5 z-50 flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-medium transition-all hover:scale-105 active:scale-95"
          style={{
            backgroundColor: 'var(--accent-vibrant-glow)',
            color: 'var(--accent-vibrant)',
            border: '1px solid rgba(232,224,212,0.2)',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          <MessageSquarePlus className="w-3.5 h-3.5" />
          Feedback
        </button>
      )}

      {/* Feedback panel */}
      {open && (
        <div
          className="fixed bottom-20 lg:bottom-5 right-5 z-50 w-[320px] rounded-2xl overflow-hidden"
          style={{
            backgroundColor: 'var(--background)',
            border: '1px solid var(--border)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--border-glass)' }}
          >
            <span className="text-sm font-medium" style={{ color: 'var(--foreground)', fontFamily: "'Inter', sans-serif" }}>
              Send feedback
            </span>
            <button
              onClick={() => setOpen(false)}
              className="p-1 transition-opacity hover:opacity-60"
              style={{ color: 'rgba(255,255,255,0.3)' }}
              aria-label="Close feedback panel"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="px-4 py-3">
            {sent ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--accent-vibrant)', fontFamily: "'Inter', sans-serif" }}>
                Thank you! Your feedback helps us improve.
              </p>
            ) : (
              <>
                {/* Category pills */}
                <div className="flex gap-1.5 mb-3">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-all"
                      style={{
                        backgroundColor: category === cat ? 'rgba(232,224,212,0.15)' : 'rgba(255,255,255,0.04)',
                        color: category === cat ? 'var(--accent-vibrant)' : 'rgba(255,255,255,0.4)',
                        border: `1px solid ${category === cat ? 'rgba(232,224,212,0.3)' : 'var(--border-glass)'}`,
                        fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      {CATEGORY_LABELS[cat]}
                    </button>
                  ))}
                </div>

                {/* Message */}
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="What's on your mind?"
                  rows={3}
                  className="w-full text-sm rounded-lg px-3 py-2 outline-none resize-none"
                  style={{
                    backgroundColor: 'rgba(218,217,215,0.06)',
                    border: '1px solid var(--border-glass)',
                    color: 'var(--foreground)',
                    fontFamily: "'Inter', sans-serif",
                  }}
                />

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={loading || message.trim().length < 3}
                  className="w-full mt-2 h-9 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{
                    backgroundColor: 'var(--accent-vibrant)',
                    color: '#fff',
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Send'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default BetaFeedbackWidget;
