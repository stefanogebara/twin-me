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

  // Don't show on chat page — overlaps the message input
  if (location.pathname === '/talk-to-twin') return null;

  useEffect(() => {
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
  }, []);

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

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-20 lg:bottom-4 left-4 right-4 z-50 flex items-center justify-between gap-3 px-4 py-3 max-w-md mx-auto"
      style={{
        borderRadius: '16px',
        background: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Download
          className="w-4 h-4 flex-shrink-0"
          style={{ color: 'rgba(255,255,255,0.5)' }}
        />
        <span
          className="text-[12px] font-medium"
          style={{
            color: 'rgba(255,255,255,0.6)',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Install TwinMe for the best experience
        </span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleInstall}
          className="px-3 py-1.5 rounded-full text-[11px] font-medium transition-opacity hover:opacity-90 cursor-pointer"
          style={{
            backgroundColor: '#F5F5F4',
            color: '#110f0f',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Install
        </button>
        <button
          onClick={handleDismiss}
          className="p-1 rounded-full transition-colors cursor-pointer"
          style={{ color: 'rgba(255,255,255,0.3)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; }}
          aria-label="Dismiss install prompt"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default PWAInstallPrompt;
