import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Fingerprint, Cable, Sparkles, X } from 'lucide-react';

const STORAGE_KEY = 'twinme_welcome_seen';

interface WelcomeGuideProps {
  firstName: string;
}

const STEPS = [
  {
    icon: MessageCircle,
    title: 'Talk to your twin',
    description: 'Ask anything about yourself. Try "What patterns do you notice about me?"',
  },
  {
    icon: Fingerprint,
    title: 'Check your Soul Signature',
    description: 'See your Values, Rhythms, Taste, and how you connect',
  },
  {
    icon: Cable,
    title: 'Connect more platforms',
    description: 'The more data, the better your twin knows you',
  },
  {
    icon: Sparkles,
    title: 'Come back tomorrow',
    description: 'Your twin gets smarter every day with new observations',
  },
] as const;

export function WelcomeGuide({ firstName }: WelcomeGuideProps) {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(() => {
    // Never show if already dismissed
    if (localStorage.getItem(STORAGE_KEY)) return false;
    // Auto-dismiss: if user has chatted before or has significant data, they're not new
    const hasToken = !!(localStorage.getItem('access_token') || localStorage.getItem('auth_token'));
    if (!hasToken) return false; // not logged in
    return true;
  });

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setVisible(false);
  }, []);

  const goToChat = useCallback(() => {
    dismiss();
    navigate('/talk-to-twin', {
      state: { prefill: 'What patterns do you notice about me?' },
    });
  }, [dismiss, navigate]);

  const goToIdentity = useCallback(() => {
    dismiss();
    navigate('/identity');
  }, [dismiss, navigate]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="relative mb-10 rounded-[20px] px-4 sm:px-5 py-5"
          style={{
            background: 'var(--glass-surface-bg)',
            backdropFilter: 'blur(42px)',
            WebkitBackdropFilter: 'blur(42px)',
            border: '1px solid var(--glass-surface-border)',
            boxShadow:
              '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 var(--border-glass)',
          }}
        >
          {/* Dismiss button */}
          <button
            onClick={dismiss}
            aria-label="Dismiss welcome guide"
            className="absolute top-4 right-4 p-1 rounded-full transition-all duration-150 ease-out hover:brightness-150 active:scale-90"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>

          {/* Heading */}
          <h2
            className="tracking-tight mb-1"
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '22px',
              color: 'var(--foreground)',
              lineHeight: 1.2,
            }}
          >
            Welcome to TwinMe, {firstName}
          </h2>

          <p
            className="text-sm mb-5"
            style={{ color: 'var(--text-secondary)' }}
          >
            Your twin is learning about you. Here&apos;s how to get the most out
            of it:
          </p>

          {/* Steps */}
          <div className="flex flex-col gap-3 mb-5">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="flex items-start gap-3">
                  <div
                    className="flex items-center justify-center flex-shrink-0 rounded-full mt-0.5"
                    style={{
                      width: 28,
                      height: 28,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <Icon
                      size={14}
                      style={{ color: 'var(--text-secondary)' }}
                    />
                  </div>
                  <div>
                    <p
                      className="text-[14px] font-medium"
                      style={{ color: 'var(--foreground)', lineHeight: 1.4 }}
                    >
                      <span
                        className="mr-1.5"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {i + 1}.
                      </span>
                      {step.title}
                    </p>
                    <p
                      className="text-[13px] mt-0.5"
                      style={{
                        color: 'var(--text-secondary)',
                        lineHeight: 1.4,
                      }}
                    >
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              onClick={goToChat}
              className="text-[13px] font-medium px-4 py-2 rounded-[100px] cursor-pointer transition-all duration-150 ease-out hover:brightness-110 active:scale-[0.97]"
              style={{
                background: '#F5F5F4',
                color: '#110f0f',
                border: 'none',
              }}
            >
              Start chatting
            </button>
            <button
              onClick={goToIdentity}
              className="text-[13px] font-medium px-4 py-2 rounded-[100px] cursor-pointer transition-all duration-150 ease-out hover:brightness-125 active:scale-[0.97]"
              style={{
                background: 'transparent',
                border: '1px solid var(--glass-surface-border)',
                color: '#E8E0D4',
              }}
            >
              See my signature
            </button>
            <button
              onClick={dismiss}
              className="text-[13px] ml-auto cursor-pointer transition-all duration-150 ease-out hover:brightness-150 active:scale-[0.97]"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
              }}
            >
              Dismiss
            </button>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
