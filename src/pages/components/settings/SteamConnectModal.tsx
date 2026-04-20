import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface SteamConnectModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function SteamConnectModal({ open, onClose, onSuccess }: SteamConnectModalProps) {
  const [steamInput, setSteamInput] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { getAccessToken } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!steamInput.trim()) return;

    setLoading(true);
    try {
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';
      const res = await fetch(`${baseUrl}/steam/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken() || localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({ steamInput: steamInput.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Connection failed');
      }

      toast({
        title: 'Steam connected',
        description: data.personaName ? `Welcome, ${data.personaName}. Your library is syncing.` : 'Your Steam library is syncing.',
      });
      setSteamInput('');
      onSuccess();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      toast({ title: 'Connection failed', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm bg-[rgba(19,18,26,0.98)] border border-[rgba(255,255,255,0.10)] rounded-[20px] backdrop-blur-[42px]">
        <DialogHeader>
          <DialogTitle className="text-[#F5F5F4] font-medium text-base">
            Connect Steam
          </DialogTitle>
        </DialogHeader>

        <p className="text-[#A8A29E] text-sm -mt-1 mb-2">
          Paste your Steam profile URL or 64-bit Steam ID. Your profile must be public for us to read your library.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[12px] text-[#9C9590]">Steam profile URL or ID</Label>
            <Input
              type="text"
              value={steamInput}
              onChange={e => setSteamInput(e.target.value)}
              placeholder="steamcommunity.com/id/yourname or 76561198..."
              autoComplete="off"
              required
              className="bg-[rgba(255,255,255,0.08)] border-[rgba(255,255,255,0.08)] text-[#F5F5F4] placeholder:text-[#57534E] rounded-[6px]"
            />
          </div>

          <p className="text-[11px] text-[#57534E]">
            Find your profile URL at steamcommunity.com. To make your profile public, open Steam -&gt; Profile -&gt; Edit Profile -&gt; Privacy Settings.
          </p>

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={loading}
              className="text-[#A8A29E] hover:text-[#F5F5F4] text-sm"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !steamInput.trim()}
              className="bg-[#F5F5F4] text-[#110f0f] rounded-[100px] px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Connecting...' : 'Connect'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
