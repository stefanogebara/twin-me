import React from 'react';
import { ArrowRight, Mic, Keyboard } from 'lucide-react';
import SoulOrb from '../SoulOrb';

interface ModeSelectionScreenProps {
  firstName: string;
  voiceAvailable: boolean;
  onSelectVoice: () => void;
  onSelectText: () => void;
  onSkip: () => void;
}

const ModeSelectionScreen: React.FC<ModeSelectionScreenProps> = ({
  firstName,
  voiceAvailable,
  onSelectVoice,
  onSelectText,
  onSkip,
}) => {
  return (
    <div className="flex flex-col flex-1 min-h-0 items-center justify-center px-6">
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .mode-animate { animation: none !important; }
        }
      `}</style>

      {/* SoulOrb */}
      <div className="mb-6 mode-animate" style={{ animation: 'fadeInScale 0.8s ease-out both' }}>
        <SoulOrb phase="alive" dataPointCount={4} />
      </div>

      {/* Greeting */}
      <h2
        className="text-2xl md:text-3xl text-center mb-2 mode-animate"
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontWeight: 400,
          letterSpacing: '-0.02em',
          color: '#E8D5B7',
          animation: 'fadeInUp 0.6s ease-out 0.3s both',
        }}
      >
        {firstName ? `Hey ${firstName}` : 'Hey there'}
      </h2>

      <p
        className="text-sm text-center mb-10 max-w-xs mode-animate"
        style={{
          color: 'rgba(232, 213, 183, 0.5)',
          fontFamily: "'Inter', sans-serif",
          animation: 'fadeInUp 0.6s ease-out 0.5s both',
        }}
      >
        How would you like to tell your story?
      </p>

      {/* Mode options — two elegant choices */}
      <div className="flex flex-col gap-4 w-full max-w-xs mode-animate" style={{ animation: 'fadeInUp 0.6s ease-out 0.7s both' }}>
        {/* Voice option */}
        {voiceAvailable && (
          <button
            onClick={onSelectVoice}
            className="group flex items-center gap-4 w-full py-4 px-5 rounded-2xl transition-all duration-200 hover:scale-[1.02]"
            style={{
              background: 'rgba(232, 213, 183, 0.06)',
              border: '1px solid rgba(232, 213, 183, 0.15)',
              cursor: 'pointer',
            }}
          >
            <div
              className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(232, 213, 183, 0.1)' }}
            >
              <Mic className="w-5 h-5" style={{ color: 'rgba(232, 213, 183, 0.7)' }} />
            </div>
            <div className="text-left">
              <p
                className="text-sm font-medium"
                style={{ color: '#E8D5B7', fontFamily: "'Inter', sans-serif" }}
              >
                Voice conversation
              </p>
              <p
                className="text-xs mt-0.5"
                style={{ color: 'rgba(232, 213, 183, 0.4)', fontFamily: "'Inter', sans-serif" }}
              >
                Talk naturally with your AI interviewer
              </p>
            </div>
            <ArrowRight className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: '#E8D5B7' }} />
          </button>
        )}

        {/* Text option */}
        <button
          onClick={onSelectText}
          className="group flex items-center gap-4 w-full py-4 px-5 rounded-2xl transition-all duration-200 hover:scale-[1.02]"
          style={{
            background: 'rgba(232, 213, 183, 0.06)',
            border: '1px solid rgba(232, 213, 183, 0.15)',
            cursor: 'pointer',
          }}
        >
          <div
            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(232, 213, 183, 0.1)' }}
          >
            <Keyboard className="w-5 h-5" style={{ color: 'rgba(232, 213, 183, 0.7)' }} />
          </div>
          <div className="text-left">
            <p
              className="text-sm font-medium"
              style={{ color: '#E8D5B7', fontFamily: "'Inter', sans-serif" }}
            >
              Text conversation
            </p>
            <p
              className="text-xs mt-0.5"
              style={{ color: 'rgba(232, 213, 183, 0.4)', fontFamily: "'Inter', sans-serif" }}
            >
              Type your answers at your own pace
            </p>
          </div>
          <ArrowRight className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: '#E8D5B7' }} />
        </button>
      </div>

      {/* Skip link */}
      <button
        onClick={onSkip}
        className="mt-8 text-xs transition-opacity hover:opacity-70 mode-animate"
        style={{
          color: 'rgba(232, 213, 183, 0.25)',
          fontFamily: "'Inter', sans-serif",
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          animation: 'fadeInUp 0.6s ease-out 0.9s both',
        }}
      >
        Skip for now
      </button>
    </div>
  );
};

export default ModeSelectionScreen;
