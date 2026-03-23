import React from 'react';
import { Sparkles, MessageSquare, Plug, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const PortraitEmptyState: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div
      className="text-center py-16 rounded-lg"
      style={{
        backgroundColor: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--border-glass)',
      }}
    >
      <Sparkles
        className="w-12 h-12 mx-auto mb-4"
        style={{ color: 'rgba(255,255,255,0.4)' }}
      />
      <h3
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontStyle: 'italic',
          fontSize: '28px',
          fontWeight: 400,
          letterSpacing: '-0.02em',
          color: 'var(--foreground)',
          marginBottom: '8px',
        }}
      >
        Your Twin Is Still Learning
      </h3>
      <p
        className="mb-8 max-w-md mx-auto"
        style={{ color: 'rgba(255,255,255,0.4)' }}
      >
        Connect your platforms and chat with your twin to build your soul signature. The more data, the richer your portrait.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={() => navigate('/interview')}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm"
          style={{ backgroundColor: '#10b77f', color: '#0a0f0a' }}
        >
          <BookOpen className="w-4 h-4" />
          Tell Your Story
        </button>
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm"
          style={{
            backgroundColor: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--border-glass)',
            color: 'var(--foreground)',
          }}
        >
          <Plug className="w-4 h-4" />
          Connect Platforms
        </button>
        <button
          onClick={() => navigate('/talk-to-twin')}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm"
          style={{
            backgroundColor: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--border-glass)',
            color: 'var(--foreground)',
          }}
        >
          <MessageSquare className="w-4 h-4" />
          Chat with Twin
        </button>
      </div>
    </div>
  );
};
