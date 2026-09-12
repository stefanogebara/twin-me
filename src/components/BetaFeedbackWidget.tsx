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

  // In the register: the trigger is a 32px secondary button, the panel the page
  // colour under a hairline with an 8px corner, the categories 32px choices (a
  // pressed one takes the field and an ink line), the message the warm field, and
  // Send the one ink primary. No glass, no shadow, no pills.
  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-[88px] lg:bottom-5 right-5 z-50 flex items-center gap-2 h-8 px-3 text-[13px] transition-colors hover:border-[var(--rg-quiet)]"
          style={{
            backgroundColor: 'var(--rg-white)',
            color: 'var(--rg-ink)',
            border: '1px solid var(--rg-rule)',
            borderRadius: 'var(--rg-radius)',
          }}
        >
          <MessageSquarePlus className="w-3.5 h-3.5" aria-hidden="true" />
          Feedback
        </button>
      )}

      {/* Feedback panel */}
      {open && (
        <div
          className="fixed bottom-[88px] lg:bottom-5 right-5 z-50 w-[320px] overflow-hidden"
          style={{
            backgroundColor: 'var(--rg-page)',
            border: '1px solid var(--rg-rule)',
            borderRadius: 'var(--rg-radius-icon)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--rg-rule)' }}
          >
            <span className="text-[13px] font-medium" style={{ color: 'var(--rg-ink)' }}>
              Send feedback
            </span>
            <button
              onClick={() => setOpen(false)}
              className="inline-grid place-items-center w-8 h-8 transition-colors hover:bg-[var(--rg-hover)]"
              style={{ color: 'var(--rg-ink-2)', borderRadius: 'var(--rg-radius)' }}
              aria-label="Close feedback panel"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="px-4 py-3">
            {sent ? (
              <p className="text-[13px] text-center py-6" style={{ color: 'var(--rg-ink-2)' }}>
                Thank you. Your feedback helps us improve.
              </p>
            ) : (
              <>
                {/* Categories */}
                <div className="flex gap-1.5 mb-3">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      aria-pressed={category === cat}
                      className="h-8 px-3 text-[13px] transition-colors"
                      style={{
                        backgroundColor: category === cat ? 'var(--rg-field)' : 'var(--rg-white)',
                        color: 'var(--rg-ink)',
                        fontWeight: category === cat ? 500 : 400,
                        border: `1px solid ${category === cat ? 'var(--rg-ink)' : 'var(--rg-rule)'}`,
                        borderRadius: 'var(--rg-radius)',
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
                  className="w-full text-[13px] px-[14px] py-[11px] outline-none resize-none focus-visible:ring-2 focus-visible:ring-[var(--rg-ink)]"
                  style={{
                    backgroundColor: 'var(--rg-field)',
                    border: 0,
                    borderRadius: 'var(--rg-radius)',
                    color: 'var(--rg-ink)',
                  }}
                />

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={loading || message.trim().length < 3}
                  className="w-full mt-2 h-8 text-[13px] font-medium transition-opacity hover:opacity-[0.86] disabled:opacity-40"
                  style={{
                    backgroundColor: 'var(--rg-ink)',
                    color: 'var(--rg-page)',
                    borderRadius: 'var(--rg-radius)',
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
