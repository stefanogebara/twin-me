import React from 'react';
import { Sparkles, MessageSquare, Plug, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { GlassPanel } from '@/components/layout/PageLayout';

export const PortraitEmptyState: React.FC = () => {
  const navigate = useNavigate();

  return (
    <GlassPanel className="text-center py-16">
      <Sparkles
        className="w-12 h-12 mx-auto mb-4"
        style={{ color: 'var(--text-secondary)' }}
      />
      <h3
        className="text-xl mb-2"
        style={{
          fontFamily: 'var(--font-heading)',
          fontWeight: 500,
          color: 'var(--foreground)',
        }}
      >
        Your Twin Is Still Learning
      </h3>
      <p
        className="mb-8 max-w-md mx-auto"
        style={{ color: 'var(--text-secondary)' }}
      >
        Connect your platforms and chat with your twin to build your soul signature. The more data, the richer your portrait.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={() => navigate('/interview')}
          className="btn-cta-app flex items-center justify-center gap-2"
        >
          <BookOpen className="w-4 h-4" />
          Tell Your Story
        </button>
        <button
          onClick={() => navigate('/dashboard')}
          className="btn-glass-app flex items-center justify-center gap-2"
        >
          <Plug className="w-4 h-4" />
          Connect Platforms
        </button>
        <button
          onClick={() => navigate('/talk-to-twin')}
          className="btn-glass-app flex items-center justify-center gap-2"
        >
          <MessageSquare className="w-4 h-4" />
          Chat with Twin
        </button>
      </div>
    </GlassPanel>
  );
};
