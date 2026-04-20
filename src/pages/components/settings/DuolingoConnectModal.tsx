import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface DuolingoConnectModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function DuolingoConnectModal({ open, onClose, onSuccess }: DuolingoConnectModalProps) {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { getAccessToken } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;

    setLoading(true);
    try {
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';
      const res = await fetch(`${baseUrl}/duolingo/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({ username: username.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Connection failed');
      }

      toast({
        title: 'Duolingo connected',
        description: data.streak
          ? `Welcome, @${data.username}. ${data.streak}-day streak, ${Number(data.totalXp || 0).toLocaleString()} XP. Syncing now.`
          : `@${data.username} is syncing.`,
      });
      setUsername('');
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
            Connect Duolingo
          </DialogTitle>
        </DialogHeader>

        <p className="text-[#A8A29E] text-sm -mt-1 mb-2">
          Enter your Duolingo username. You can find it at the end of your profile URL: duolingo.com/profile/{'{username}'}.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[12px] text-[#9C9590]">Duolingo username</Label>
            <Input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="yourname or duolingo.com/profile/yourname"
              autoComplete="off"
              required
              className="bg-[rgba(255,255,255,0.08)] border-[rgba(255,255,255,0.08)] text-[#F5F5F4] placeholder:text-[#57534E] rounded-[6px]"
            />
          </div>

          <p className="text-[11px] text-[#57534E]">
            Your profile must be public (the default on Duolingo). We only read your streak, total XP, courses, and account age.
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
              disabled={loading || !username.trim()}
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
