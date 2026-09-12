import React from 'react';
import { Search, Loader2 } from 'lucide-react';

interface CorrectionFormProps {
  name: string;
  linkedIn: string;
  onNameChange: (value: string) => void;
  onLinkedInChange: (value: string) => void;
  onSearchAgain: () => void;
  onSkip: () => void;
  isRetrying: boolean;
  retryCount: number;
}

const isValidLinkedInUrl = (url: string): boolean => {
  if (!url.trim()) return true; // empty is fine (optional field)
  return /^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?$/i.test(url.trim());
};

/** "Not me": two borderless fields (the register's field), one search, a skip. */
const CorrectionForm: React.FC<CorrectionFormProps> = ({
  name,
  linkedIn,
  onNameChange,
  onLinkedInChange,
  onSearchAgain,
  onSkip,
  isRetrying,
  retryCount,
}) => {
  const message = retryCount === 0
    ? 'No problem. Your LinkedIn link is the fastest way to find the right you.'
    : 'Still not right? Check the LinkedIn link.';

  const linkedInValid = isValidLinkedInUrl(linkedIn);
  const canSubmit = !isRetrying && name.trim().length > 0 && linkedInValid;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canSubmit) {
      onSearchAgain();
    }
  };

  return (
    <div className="w-full max-w-sm mt-6" style={{ display: 'grid', gap: 20, textAlign: 'left' }}>
      <p className="rs-flow-line" style={{ textAlign: 'center' }}>{message}</p>

      {/* LinkedIn URL (primary — strongest disambiguation signal) */}
      <div style={{ display: 'grid', gap: 8 }}>
        <label htmlFor="correction-linkedin">Your LinkedIn link</label>
        <input
          id="correction-linkedin"
          type="url"
          value={linkedIn}
          onChange={(e) => onLinkedInChange(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-invalid={!!linkedIn && !linkedInValid}
          className="n-input"
          style={{ width: '100%' }}
          placeholder="https://linkedin.com/in/yourprofile"
        />
        {linkedIn && !linkedInValid
          ? <p className="rs-bad" style={{ margin: 0 }}>Enter a LinkedIn profile link</p>
          : <p className="rs-quiet">The full link to your profile</p>}
      </div>

      {/* Full Name */}
      <div style={{ display: 'grid', gap: 8 }}>
        <label htmlFor="correction-name">Your full name</label>
        <input
          id="correction-name"
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="n-input"
          style={{ width: '100%' }}
          placeholder="Your full name"
        />
      </div>

      {/* Buttons */}
      <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
        <button
          type="button"
          onClick={onSearchAgain}
          disabled={!canSubmit}
          className="n-btn n-btn--primary pb-cta"
        >
          {isRetrying ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="w-4 h-4" aria-hidden="true" />
          )}
          {isRetrying ? 'Searching' : 'Search again'}
        </button>

        <button type="button" onClick={onSkip} disabled={isRetrying} className="rs-link">
          Skip this step
        </button>
      </div>
    </div>
  );
};

export default CorrectionForm;
