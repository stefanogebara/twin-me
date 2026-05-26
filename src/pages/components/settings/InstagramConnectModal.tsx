/**
 * Instagram Connect Modal
 * ========================
 * Final architecture: TwinMe Chrome extension runs in the user's real browser
 * with their real IG session. We don't need credentials, cookies, or any
 * server-side scraping. The collector at browser-extension/collectors/instagram.js
 * captures data as the user browses; the backend fetcher reads it from
 * user_platform_data and normalizes into observations.
 *
 * This modal is purely informational — it tells the user to install/update
 * the extension and visit instagram.com. No form to submit.
 */

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { recordInstagramConsent } from '@/services/api/instagramAPI';

interface InstagramConnectModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CONSENT_VERSION = 1;

// Sentinel injected by content/twinme-auth-sync.js once the TwinMe extension is loaded.
function detectExtensionInstalled(): boolean {
  if (typeof document === 'undefined') return false;
  return !!document.documentElement.dataset.twinmeExtension;
}

export function InstagramConnectModal({ open, onClose, onSuccess }: InstagramConnectModalProps) {
  const [username, setUsername] = useState('');
  const [recording, setRecording] = useState(false);
  const [extensionInstalled, setExtensionInstalled] = useState(detectExtensionInstalled());
  const { toast } = useToast();

  // Poll for extension presence — user may install while the modal is open.
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      setExtensionInstalled(detectExtensionInstalled());
    }, 2000);
    return () => clearInterval(id);
  }, [open]);

  async function handleAccept() {
    if (!username.trim()) {
      toast({
        title: 'Username required',
        description: 'Enter your Instagram @handle so the twin can attribute data correctly.',
        variant: 'destructive',
      });
      return;
    }
    setRecording(true);
    try {
      await recordInstagramConsent({
        username: username.trim().replace(/^@/, ''),
        consentVersion: CONSENT_VERSION,
      });
      toast({
        title: 'Instagram connected',
        description: 'Visit instagram.com in this browser and your saved posts will sync automatically.',
      });
      onSuccess();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not record consent';
      toast({ title: 'Connection failed', description: msg, variant: 'destructive' });
    } finally {
      setRecording(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !recording && onClose()}>
      <DialogContent className="max-w-md bg-[rgba(19,18,26,0.98)] border border-[rgba(255,255,255,0.10)] rounded-[20px] backdrop-blur-[42px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#F5F5F4] font-medium text-base">
            Connect Instagram
          </DialogTitle>
        </DialogHeader>

        <p className="text-[#A8A29E] text-sm -mt-1 mb-3">
          Your aesthetic and social signals — what you save, follow, and post — added to your soul signature.
        </p>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] text-[#9C9590]">Your Instagram username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/^@/, ''))}
              placeholder="yourhandle"
              autoComplete="off"
              pattern="[a-zA-Z0-9._]{1,40}"
              className="bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.08)] text-[#F5F5F4] placeholder:text-[#57534E] rounded-[6px] px-3 py-2.5 text-sm focus:outline-none focus:border-[rgba(255,255,255,0.20)]"
            />
          </div>

          <div className="border border-[rgba(255,255,255,0.06)] rounded-[10px] p-3 bg-[rgba(255,255,255,0.02)] flex flex-col gap-2">
            <p className="text-[11px] text-[#A8A29E] font-medium">How this works:</p>
            <ol className="text-[11px] text-[#A8A29E] leading-relaxed space-y-1.5 list-decimal pl-4">
              <li>
                Install the TwinMe browser extension (it runs in your own browser, with your own Instagram session — no passwords, no server-side scraping).
                {!extensionInstalled && (
                  <span className="block mt-1.5 text-[10.5px] text-[#F5F5F4]">
                    Extension not detected. Install instructions in your TwinMe Settings page.
                  </span>
                )}
                {extensionInstalled && (
                  <span className="block mt-1.5 text-[10.5px] text-[#9bf5a8]">
                    Extension detected.
                  </span>
                )}
              </li>
              <li>
                Visit{' '}
                <a
                  href="https://www.instagram.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#F5F5F4] underline hover:no-underline"
                >
                  instagram.com
                </a>
                {' '}in this browser. Stay logged in.
              </li>
              <li>
                Open <span className="font-mono text-[10.5px]">/{username || 'yourhandle'}/saved/all-posts/</span> or the activity pages once — the extension collects from there automatically.
              </li>
              <li>
                Within a sync cycle (every 30 min), your twin learns from what you've saved, followed, and posted.
              </li>
            </ol>
            <p className="text-[10.5px] text-[#57534E] leading-snug mt-1 pt-2 border-t border-[rgba(255,255,255,0.05)]">
              No credentials are sent to TwinMe. The extension reads what your already-logged-in browser sees and posts only the normalized data to our backend. You can revoke at any time from the extension settings.
            </p>
          </div>

          <div className="border border-[rgba(255,255,255,0.08)] rounded-[10px] p-3 bg-[rgba(255,255,255,0.03)] flex flex-col gap-2">
            <p className="text-[11px] text-[#A8A29E] leading-snug">
              By connecting, you understand that:
            </p>
            <ul className="text-[11px] text-[#57534E] leading-snug list-disc pl-4 space-y-1">
              <li>The TwinMe extension reads Instagram pages you visit (in your own browser, on your own machine).</li>
              <li>No passwords, no cookies, no session tokens leave your machine.</li>
              <li>Only normalized observations (saved posts, follows, captions) are sent to TwinMe.</li>
              <li>You can uninstall the extension or disconnect Instagram at any time from Settings.</li>
            </ul>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setUsername(''); onClose(); }}
              disabled={recording}
              className="text-[#A8A29E] hover:text-[#F5F5F4] text-sm"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAccept}
              disabled={!username.trim() || recording}
              className="bg-[#F5F5F4] text-[#110f0f] rounded-[100px] px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {recording ? 'Connecting...' : 'I understand, connect'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
