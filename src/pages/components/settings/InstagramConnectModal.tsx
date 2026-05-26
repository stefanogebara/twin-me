/**
 * Instagram Connect Modal
 * ========================
 * Phase 4 of the Instagram-via-Playwright plan.
 * Captures username + browser-exported cookies + consent acceptance, then triggers
 * a /sync. Cookies are NEVER persisted server-side — they flow through the request
 * body and Playwright tears down after the scrape.
 *
 * UX: user pastes the JSON exported by a cookie-export browser extension
 * (recommended: EditThisCookie). Phase 5 will ship a branded extension that
 * automates this.
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { syncInstagram, recordInstagramConsent, parseCookiesExport, type InstagramSurface } from '@/services/api/instagramAPI';

interface InstagramConnectModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CONSENT_VERSION = 1;

const ALL_SURFACES: { key: InstagramSurface; label: string; helper: string }[] = [
  { key: 'saved', label: 'Saved posts', helper: 'Most useful — what you intentionally bookmark.' },
  { key: 'own_posts', label: 'Your own posts', helper: 'Captions of posts on your profile.' },
  { key: 'follows', label: 'Following list', helper: 'Phase 1 limitation: requires click-to-open modal, not scraped yet.' },
];

export function InstagramConnectModal({ open, onClose, onSuccess }: InstagramConnectModalProps) {
  const [username, setUsername] = useState('');
  const [cookiesText, setCookiesText] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [selectedSurfaces, setSelectedSurfaces] = useState<Set<InstagramSurface>>(new Set(['saved']));
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  function reset() {
    setUsername('');
    setCookiesText('');
    setConsentAccepted(false);
    setSelectedSurfaces(new Set(['saved']));
  }

  function toggleSurface(key: InstagramSurface) {
    setSelectedSurfaces((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !cookiesText.trim() || !consentAccepted) return;

    setLoading(true);
    try {
      const cookies = parseCookiesExport(cookiesText);
      const surfaces = Array.from(selectedSurfaces);

      // 1. Record consent + username.
      await recordInstagramConsent({
        username: username.trim(),
        consentVersion: CONSENT_VERSION,
      });

      // 2. Run the first sync immediately.
      const result = await syncInstagram({
        cookies,
        username: username.trim(),
        surfaces,
      });

      if (!result.ok) {
        const detected = result.detected;
        let message = result.error || 'Sync did not succeed.';
        if (detected?.captcha) message = 'Instagram showed a captcha. Try again after a few hours.';
        else if (detected?.rate_limit) message = 'Instagram rate-limited the scrape. Try again later.';
        else if (detected?.suspended) message = 'This Instagram account appears suspended.';
        else if (!detected?.logged_in) message = 'Cookies did not appear to be logged-in. Re-export and try again.';
        throw new Error(message);
      }

      toast({
        title: 'Instagram connected',
        description: `${result.observations_stored} observations added to your twin's memory.`,
      });
      reset();
      onSuccess();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed.';
      toast({ title: 'Connection failed', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = !!username.trim() && !!cookiesText.trim() && consentAccepted && !loading;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !loading && onClose()}>
      <DialogContent className="max-w-md bg-[rgba(19,18,26,0.98)] border border-[rgba(255,255,255,0.10)] rounded-[20px] backdrop-blur-[42px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#F5F5F4] font-medium text-base">
            Connect Instagram
          </DialogTitle>
        </DialogHeader>

        <p className="text-[#A8A29E] text-sm -mt-1 mb-2">
          Your aesthetic and social signals — what you save, what you post — added to your soul signature.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[12px] text-[#9C9590]">Your Instagram username</Label>
            <Input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/^@/, ''))}
              placeholder="yourhandle"
              autoComplete="off"
              required
              pattern="[a-zA-Z0-9._]{1,40}"
              className="bg-[rgba(255,255,255,0.08)] border-[rgba(255,255,255,0.08)] text-[#F5F5F4] placeholder:text-[#57534E] rounded-[6px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-[12px] text-[#9C9590]">Cookies (JSON)</Label>
            <Textarea
              value={cookiesText}
              onChange={(e) => setCookiesText(e.target.value)}
              placeholder='[{"name":"sessionid","value":"...","domain":".instagram.com",...}, ...]'
              rows={6}
              required
              className="bg-[rgba(255,255,255,0.08)] border-[rgba(255,255,255,0.08)] text-[#F5F5F4] placeholder:text-[#57534E] rounded-[6px] font-mono text-[11px]"
            />
            <p className="text-[11px] text-[#57534E] leading-snug">
              How to get cookies: install the "EditThisCookie" Chrome extension, open instagram.com (while logged in), click the extension icon, then "Export to JSON". Paste the result here. Your cookies are sent over HTTPS, used once for scraping, then discarded — never stored on our servers.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-[12px] text-[#9C9590]">Surfaces to scrape</Label>
            {ALL_SURFACES.map(({ key, label, helper }) => (
              <label key={key} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedSurfaces.has(key)}
                  onChange={() => toggleSurface(key)}
                  disabled={key === 'follows'}
                  className="mt-0.5 accent-[#F5F5F4]"
                />
                <span className="flex flex-col">
                  <span className="text-[13px] text-[#F5F5F4]">{label}</span>
                  <span className="text-[11px] text-[#57534E]">{helper}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="border border-[rgba(255,255,255,0.08)] rounded-[10px] p-3 bg-[rgba(255,255,255,0.03)] flex flex-col gap-2">
            <p className="text-[11px] text-[#A8A29E] leading-snug">
              By connecting, I understand that:
            </p>
            <ul className="text-[11px] text-[#57534E] leading-snug list-disc pl-4 space-y-1">
              <li>Instagram's Terms of Service do not permit automated access. The risk falls on my account, not on TwinMe.</li>
              <li>TwinMe will use my cookies to read only the surfaces I select above. No write actions, no posting, no messaging.</li>
              <li>Cookies are never stored. They're used once per sync and discarded.</li>
              <li>I can disconnect at any time, which deletes the session and (optionally) all data already scraped.</li>
            </ul>
            <label className="flex items-center gap-2 mt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={consentAccepted}
                onChange={(e) => setConsentAccepted(e.target.checked)}
                className="accent-[#F5F5F4]"
              />
              <span className="text-[12px] text-[#F5F5F4]">I understand and accept these terms.</span>
            </label>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => { reset(); onClose(); }}
              disabled={loading}
              className="text-[#A8A29E] hover:text-[#F5F5F4] text-sm"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              className="bg-[#F5F5F4] text-[#110f0f] rounded-[100px] px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Connecting and syncing...' : 'Connect and sync'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
