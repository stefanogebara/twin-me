/**
 * PWAInstallPrompt
 *
 * Subtle glass banner at the bottom of the screen prompting users
 * to install TwinMe as a PWA. Only shows on mobile or after 3 visits.
 * Dismissible, stores dismissal in localStorage.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Download } from 'lucide-react';

const DISMISSED_KEY = 'pwa_install_dismissed';
const VISIT_COUNT_KEY = 'pwa_visit_count';
const MIN_VISITS_DESKTOP = 3;

const PWAInstallPrompt: React.FC = () => {
  const location = useLocation();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [visible, setVisible] = useState(false);

  const isChatPage = location.pathname === '/talk-to-twin';

  useEffect(() => {
    // Don't show on chat page — overlaps the message input
    if (isChatPage) return;

    // Don't show if already dismissed
    if (localStorage.getItem(DISMISSED_KEY) === 'true') return;

    // Don't show if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Track visit count
    const visits = parseInt(localStorage.getItem(VISIT_COUNT_KEY) || '0', 10) + 1;
    localStorage.setItem(VISIT_COUNT_KEY, String(visits));

    // On mobile, show after first visit; on desktop, after 3 visits
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const threshold = isMobile ? 1 : MIN_VISITS_DESKTOP;

    if (visits < threshold) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, [isChatPage]);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    try {
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === 'accepted') {
        setVisible(false);
        localStorage.setItem(DISMISSED_KEY, 'true');
      }
    } catch {
      // User cancelled or prompt failed
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, 'true');
  }, []);

  if (isChatPage || !visible) return null;

  // In the register: white with a hairline and an 8px corner, one grey line, a
  // 32px ink Install and a 32px dismiss. No glass, no shadow.
  return (
    <div
      className="fixed bottom-24 lg:bottom-4 left-4 right-4 z-50 flex items-center justify-between gap-3 px-4 py-3 max-w-md mx-auto"
      style={{
        borderRadius: 'var(--rg-radius-icon)',
        background: 'var(--rg-white)',
        border: '1px solid var(--rg-rule)',
      }}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Download
          className="w-4 h-4 flex-shrink-0"
          style={{ color: 'var(--rg-ink-2)' }}
          aria-hidden="true"
        />
        <span className="text-[13px]" style={{ color: 'var(--rg-ink-2)' }}>
          Install TwinMe for the best experience
        </span>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={handleInstall}
          className="h-8 px-3 text-[13px] font-medium transition-opacity hover:opacity-[0.86] cursor-pointer"
          style={{
            background: 'var(--rg-ink)',
            color: 'var(--rg-page)',
            borderRadius: 'var(--rg-radius)',
          }}
        >
          Install
        </button>
        <button
          onClick={handleDismiss}
          className="inline-grid place-items-center w-8 h-8 transition-colors cursor-pointer text-[var(--rg-ink-2)] hover:text-[var(--rg-ink)] hover:bg-[var(--rg-hover)]"
          style={{ borderRadius: 'var(--rg-radius)' }}
          aria-label="Dismiss install prompt"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default PWAInstallPrompt;
