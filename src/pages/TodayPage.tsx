/**
 * TodayPage — the M1 "one home".
 *
 * The daily loop on a single screen: the morning Brief up top (what matters +
 * what the twin noticed), the action inbox in the middle (drafts waiting on
 * your Send/Edit/Reject), and a composer to talk to your twin. Everything the
 * founder needs each day, in one relationship — not a dashboard of pages.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp } from 'lucide-react';
import MorningBriefingCard from '@/components/chat/MorningBriefingCard';
import ActionInbox from '@/components/today/ActionInbox';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const TodayPage: React.FC = () => {
  const navigate = useNavigate();
  useDocumentTitle('Today');

  // Deep-link into the full chat with the composer seeded (?prefill= is the
  // reliable surface — location.state has a latent render loop in TalkToTwin).
  const askTwin = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    navigate(`/talk-to-twin?prefill=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="min-h-screen w-full flex justify-center px-4 py-10 sm:py-14">
      <div className="w-full max-w-[640px] flex flex-col gap-6">
        <MorningBriefingCard onAskTwin={askTwin} />
        <ActionInbox />
        <TwinComposer onSubmit={askTwin} />
      </div>
    </div>
  );
};

const TwinComposer: React.FC<{ onSubmit: (message: string) => void }> = ({ onSubmit }) => {
  const [value, setValue] = useState('');

  const submit = () => {
    onSubmit(value);
    setValue('');
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--glass-surface-border)] rounded-[20px] px-4 py-3 backdrop-blur-[42px]"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask your twin anything"
        aria-label="Ask your twin"
        className="flex-1 bg-transparent text-[var(--foreground)] text-[14.5px] placeholder:text-[var(--text-secondary)] focus:outline-none"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        aria-label="Send to your twin"
        className="grid place-items-center bg-[image:var(--claura-bone)] text-[var(--claura-bone-ink)] rounded-[100px] w-7 h-7 disabled:opacity-50 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[rgba(255,255,255,0.4)] transition-opacity"
      >
        <ArrowUp size={16} aria-hidden />
      </button>
    </form>
  );
};

export default TodayPage;
