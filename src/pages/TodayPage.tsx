/**
 * TodayPage — the M1 "one home".
 *
 * The daily loop on a single screen: the morning Brief up top (what matters +
 * what the twin noticed), the action inbox in the middle (drafts waiting on
 * your Send/Edit/Reject), and a composer to talk to your twin. Everything the
 * founder needs each day, in one relationship — not a dashboard of pages.
 *
 * Built from the register's page kit: the brief is the page title and a
 * section of rows, the inbox is a second section, the composer is the field.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp } from 'lucide-react';
import MorningBriefingCard from '@/components/chat/MorningBriefingCard';
import ActionInbox from '@/components/today/ActionInbox';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Page } from '@/components/register';

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
    <Page>
      <MorningBriefingCard onAskTwin={askTwin} />
      <ActionInbox />
      <TwinComposer onSubmit={askTwin} />
    </Page>
  );
};

/** The field with one ink submit (.n-prompt), 72px under the last section. */
const TwinComposer: React.FC<{ onSubmit: (message: string) => void }> = ({ onSubmit }) => {
  const [value, setValue] = useState('');

  const submit = () => {
    onSubmit(value);
    setValue('');
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className="n-prompt"
      style={{ marginTop: 'var(--rg-section)' }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask your twin anything"
        aria-label="Ask your twin"
      />
      <button type="submit" disabled={!value.trim()} aria-label="Send to your twin">
        <ArrowUp size={16} aria-hidden />
      </button>
    </form>
  );
};

export default TodayPage;
