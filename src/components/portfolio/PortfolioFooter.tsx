import React, { useCallback, useState } from 'react';
import { Share2, Check } from 'lucide-react';

interface PortfolioFooterProps {
  updatedAt: string | null;
  /** Kept for callers; the register's primary is ink. */
  colorScheme: { primary: string; secondary: string; accent: string };
}

/** The close: the one primary (discover your own), a share button, and a quiet
 *  line with the date. */
const PortfolioFooter: React.FC<PortfolioFooterProps> = ({ updatedAt }) => {
  const [copied, setCopied] = useState(false);
  const [shareFailed, setShareFailed] = useState<string | null>(null);

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
      setShareFailed(null);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // audit-2026-06-10: clipboard write can reject in non-secure contexts /
      // when both share and clipboard are unavailable. Surface the URL so the
      // visitor can copy it manually instead of a silent no-op.
      setShareFailed(url);
    }
  }, []);

  return (
    <footer className="sh-foot">
      <div className="sh-foot-actions">
        <a href="/" className="n-btn n-btn--primary">Discover your soul signature</a>
        <button type="button" onClick={handleShare} className="n-btn n-btn--ghost" aria-label="Share">
          {copied ? <Check className="w-4 h-4" aria-hidden="true" /> : <Share2 className="w-4 h-4" aria-hidden="true" />}
          {copied ? 'Link copied' : 'Share'}
        </button>
      </div>

      {/* Manual copy fallback when navigator.share + clipboard both fail */}
      {shareFailed && (
        <p className="sh-note" style={{ paddingTop: 0, overflowWrap: 'anywhere' }}>Copy this link: {shareFailed}</p>
      )}

      <p className="sh-note" style={{ paddingTop: 0 }}>
        Made with TwinMe{updatedDate ? `. Updated ${updatedDate}.` : '.'}
      </p>
    </footer>
  );
};

export default PortfolioFooter;
