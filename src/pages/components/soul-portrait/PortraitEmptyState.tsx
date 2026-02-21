import React from 'react';
import { Sparkles, MessageSquare, Plug } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { GlassPanel } from '@/components/layout/PageLayout';

export const PortraitEmptyState: React.FC = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();

  return (
    <GlassPanel className="text-center py-16">
      <Sparkles
        className="w-12 h-12 mx-auto mb-4"
        style={{ color: isDark ? 'rgba(193, 192, 182, 0.4)' : '#a8a29e' }}
      />
      <h3
        className="text-xl mb-2"
        style={{
          fontFamily: 'var(--font-heading)',
          fontWeight: 500,
          color: isDark ? '#C1C0B6' : '#0c0a09',
        }}
      >
        Your Twin Is Still Learning
      </h3>
      <p
        className="mb-8 max-w-md mx-auto"
        style={{ color: isDark ? 'rgba(193, 192, 182, 0.7)' : '#57534e' }}
      >
        Connect your platforms and chat with your twin to build your soul signature. The more data, the richer your portrait.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={() => navigate('/get-started')}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all hover:scale-[1.02]"
          style={{
            background: 'linear-gradient(135deg, var(--accent-vibrant), var(--accent-vibrant-hover))',
            color: '#1a1a17',
            boxShadow: '0 2px 12px var(--accent-vibrant-glow)',
          }}
        >
          <Plug className="w-4 h-4" />
          Connect Platforms
        </button>
        <button
          onClick={() => navigate('/talk-to-twin')}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all hover:scale-[1.02]"
          style={{
            backgroundColor: isDark ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
            color: isDark ? '#C1C0B6' : '#0c0a09',
            border: isDark ? '1px solid rgba(193, 192, 182, 0.2)' : '1px solid rgba(0, 0, 0, 0.1)',
          }}
        >
          <MessageSquare className="w-4 h-4" />
          Chat with Twin
        </button>
      </div>
    </GlassPanel>
  );
};
