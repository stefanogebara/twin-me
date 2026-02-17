import React from 'react';
import { motion } from 'framer-motion';
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
    ? 'No problem. Help us find the right you.'
    : 'Still not right? Try adding your LinkedIn.';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-sm mt-6"
    >
      <p
        className="text-sm text-center mb-6"
        style={{
          color: 'rgba(232, 213, 183, 0.7)',
          fontFamily: 'var(--font-body)',
        }}
      >
        {message}
      </p>

      {/* Full Name */}
      <div className="mb-4">
        <label
          className="block text-xs uppercase tracking-widest mb-2"
          style={{
            color: 'rgba(232, 213, 183, 0.4)',
            fontFamily: 'var(--font-body)',
            letterSpacing: '0.1em',
          }}
        >
          Full Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-colors"
          style={{
            backgroundColor: 'rgba(232, 213, 183, 0.06)',
            border: '1px solid rgba(232, 213, 183, 0.15)',
            color: '#E8D5B7',
            fontFamily: 'var(--font-body)',
          }}
          placeholder="Your full name"
        />
      </div>

      {/* LinkedIn URL */}
      <div className="mb-6">
        <label
          className="block text-xs uppercase tracking-widest mb-2"
          style={{
            color: 'rgba(232, 213, 183, 0.4)',
            fontFamily: 'var(--font-body)',
            letterSpacing: '0.1em',
          }}
        >
          LinkedIn URL <span style={{ opacity: 0.5 }}>(optional)</span>
        </label>
        <input
          type="url"
          value={linkedIn}
          onChange={(e) => onLinkedInChange(e.target.value)}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-colors"
          style={{
            backgroundColor: 'rgba(232, 213, 183, 0.06)',
            border: '1px solid rgba(232, 213, 183, 0.15)',
            color: '#E8D5B7',
            fontFamily: 'var(--font-body)',
          }}
          placeholder="https://linkedin.com/in/yourprofile"
        />
      </div>

      {/* Buttons */}
      <div className="flex flex-col gap-3">
        <button
          onClick={onSearchAgain}
          disabled={isRetrying || !name.trim()}
          className="w-full px-6 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 hover:scale-[1.01] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: 'linear-gradient(135deg, #E8D5B7 0%, #D4C4A8 100%)',
            color: '#0C0C0C',
            fontFamily: 'var(--font-body)',
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
            fontFamily: 'var(--font-body)',
            background: 'transparent',
            border: 'none',
          }}
        >
          Skip this step
        </button>
      </div>
    </motion.div>
  );
};

export default CorrectionForm;
