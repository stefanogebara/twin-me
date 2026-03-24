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
    ? 'No problem. Your LinkedIn URL is the fastest way to find the right you.'
    : 'Still not right? Make sure the LinkedIn URL is correct.';

  const linkedInValid = isValidLinkedInUrl(linkedIn);
  const canSubmit = !isRetrying && name.trim().length > 0 && linkedInValid;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canSubmit) {
      onSearchAgain();
    }
  };

  return (
    <div
      className="w-full max-w-sm mt-6"
    >
      <p
        className="text-sm text-center mb-6"
        style={{
          color: 'rgba(232, 213, 183, 0.7)',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        {message}
      </p>

      {/* LinkedIn URL (primary — strongest disambiguation signal) */}
      <div className="mb-4">
        <label
          className="block text-xs uppercase tracking-widest mb-2"
          style={{
            color: 'rgba(232, 213, 183, 0.4)',
            fontFamily: "'Inter', sans-serif",
            letterSpacing: '0.1em',
          }}
        >
          LinkedIn URL
        </label>
        <input
          type="url"
          value={linkedIn}
          onChange={(e) => onLinkedInChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-colors"
          style={{
            backgroundColor: 'rgba(232, 213, 183, 0.06)',
            border: `1px solid ${linkedIn && !linkedInValid ? 'rgba(239, 68, 68, 0.5)' : 'rgba(232, 213, 183, 0.15)'}`,
            color: '#E8D5B7',
            fontFamily: "'Inter', sans-serif",
          }}
          placeholder="https://linkedin.com/in/yourprofile"
        />
        {linkedIn && !linkedInValid && (
          <p
            className="text-xs mt-1.5"
            style={{ color: 'rgba(239, 68, 68, 0.7)', fontFamily: "'Inter', sans-serif" }}
          >
            Enter a valid LinkedIn profile URL
          </p>
        )}
        <p
          className="text-xs mt-1.5"
          style={{ color: 'rgba(232, 213, 183, 0.3)', fontFamily: "'Inter', sans-serif" }}
        >
          Paste your full LinkedIn profile URL
        </p>
      </div>

      {/* Full Name */}
      <div className="mb-6">
        <label
          className="block text-xs uppercase tracking-widest mb-2"
          style={{
            color: 'rgba(232, 213, 183, 0.4)',
            fontFamily: "'Inter', sans-serif",
            letterSpacing: '0.1em',
          }}
        >
          Full Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-colors"
          style={{
            backgroundColor: 'rgba(232, 213, 183, 0.06)',
            border: '1px solid rgba(232, 213, 183, 0.15)',
            color: '#E8D5B7',
            fontFamily: "'Inter', sans-serif",
          }}
          placeholder="Your full name"
        />
      </div>

      {/* Buttons */}
      <div className="flex flex-col gap-3">
        <button
          onClick={onSearchAgain}
          disabled={!canSubmit}
          className="w-full px-6 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 hover:scale-[1.01] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: 'linear-gradient(135deg, #E8D5B7 0%, #D4C4A8 100%)',
            color: '#0C0C0C',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {isRetrying ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          {isRetrying ? 'Searching...' : 'Search again'}
        </button>

        <button
          onClick={onSkip}
          disabled={isRetrying}
          className="w-full px-6 py-3 rounded-xl text-sm transition-opacity hover:opacity-80 disabled:opacity-30"
          style={{
            color: 'rgba(232, 213, 183, 0.5)',
            fontFamily: "'Inter', sans-serif",
            background: 'transparent',
            border: 'none',
          }}
        >
          Skip this step
        </button>
      </div>
    </div>
  );
};

export default CorrectionForm;
