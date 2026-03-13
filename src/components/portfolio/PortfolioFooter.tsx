import React, { useCallback, useState } from 'react';
import { Share2, Check } from 'lucide-react';

interface PortfolioFooterProps {
  updatedAt: string | null;
  colorScheme: { primary: string; secondary: string; accent: string };
}

const PortfolioFooter: React.FC<PortfolioFooterProps> = ({ updatedAt, colorScheme }) => {
  const [copied, setCopied] = useState(false);

  const updatedDate = updatedAt
    ? new Date(updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    const title = document.title || 'Soul Signature Portfolio';

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // User cancelled or share failed, fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }, []);

  return (
    <footer className="py-16 px-6 flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-6">
        {/* Powered by */}
        <p
          className="text-xs opacity-30"
          style={{ fontFamily: "'Inter', sans-serif", color: '#E8D5B7' }}
        >
          Powered by TwinMe
        </p>

        {/* CTA + Share row */}
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="text-sm px-6 py-3 rounded-xl inline-block transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: `linear-gradient(135deg, ${colorScheme.accent} 0%, ${colorScheme.primary} 100%)`,
              color: '#0C0C0C',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            Discover Your Soul Signature
          </a>

          <button
            onClick={handleShare}
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:scale-[1.05] active:scale-[0.95]"
            style={{
              backgroundColor: 'rgba(232, 213, 183, 0.08)',
              border: '1px solid rgba(232, 213, 183, 0.15)',
              color: '#E8D5B7',
            }}
            aria-label="Share"
          >
            {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Updated date */}
        {updatedDate && (
          <p
            className="text-xs opacity-25"
            style={{ fontFamily: "'Inter', sans-serif", color: '#E8D5B7' }}
          >
            Updated {updatedDate}
          </p>
        )}
      </div>
    </footer>
  );
};

export default PortfolioFooter;
