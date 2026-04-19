import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Sparkles, Loader2 } from 'lucide-react';
import PortfolioHero from '../components/portfolio/PortfolioHero';
import PortfolioRadar from '../components/portfolio/PortfolioRadar';
import PortfolioTraits from '../components/portfolio/PortfolioTraits';
import PortfolioNarrative from '../components/portfolio/PortfolioNarrative';
import PortfolioPlatforms from '../components/portfolio/PortfolioPlatforms';
import PortfolioFooter from '../components/portfolio/PortfolioFooter';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';

const DEFAULT_COLOR_SCHEME = {
  primary: '#E8D5B7',
  secondary: '#D4C4A8',
  accent: '#E8D5B7',
  background: '#13121a',
  text: '#E8D5B7',
};

interface PortfolioData {
  first_name: string | null;
  avatar_url: string | null;
  title: string | null;
  location: string | null;
  archetype_name: string;
  archetype_subtitle: string;
  narrative: string;
  defining_traits: Array<{ trait: string; score?: number; evidence?: string; source?: string }>;
  color_scheme: { primary: string; secondary: string; accent: string; background?: string; text?: string } | null;
  icon_type: string;
  updated_at: string;
  personality: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
    mbti_code: string | null;
  } | null;
  platforms: Array<{ name: string; features: Array<{ type: string; value: number | string }> }>;
}

const PortfolioPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchPortfolio = async () => {
      if (!userId) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/portfolio/public/${userId}`);
        if (!response.ok) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        const result = await response.json();
        if (result.success && result.portfolio) {
          setPortfolio(result.portfolio);
          // Set page title
          const name = result.portfolio.first_name || 'Someone';
          document.title = `${name}'s Soul Signature | TwinMe`;
        } else {
          setNotFound(true);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    fetchPortfolio();
  }, [userId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#E8D5B7' }} />
      </div>
    );
  }

  if (notFound || !portfolio) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <Sparkles className="w-10 h-10 mx-auto mb-4" style={{ color: 'rgba(232, 213, 183, 0.3)' }} />
          <h1
            className="text-xl mb-2"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif", color: '#E8D5B7' }}
          >
            Portfolio Not Found
          </h1>
          <p
            className="text-sm opacity-50 mb-6"
            style={{ fontFamily: "'Inter', sans-serif", color: '#E8D5B7' }}
          >
            This soul signature is private or doesn't exist yet.
          </p>
          <a
            href="/"
            className="text-sm px-6 py-3 rounded-xl inline-block transition-all hover:scale-[1.01]"
            style={{
              background: 'linear-gradient(135deg, #E8D5B7 0%, #D4C4A8 100%)',
              color: '#0C0C0C',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            Discover Your Soul Signature
          </a>
        </div>
      </div>
    );
  }

  const colorScheme = {
    primary: portfolio.color_scheme?.primary || DEFAULT_COLOR_SCHEME.primary,
    secondary: portfolio.color_scheme?.secondary || DEFAULT_COLOR_SCHEME.secondary,
    accent: portfolio.color_scheme?.accent || DEFAULT_COLOR_SCHEME.accent,
  };

  return (
    <div
      className="min-h-screen max-w-[900px] mx-auto px-6 py-16"
      style={{
        '--portfolio-primary': colorScheme.primary,
        '--portfolio-secondary': colorScheme.secondary,
        '--portfolio-accent': colorScheme.accent,
      } as React.CSSProperties}
    >
      {/* Section 1: Hero */}
      <PortfolioHero
        firstName={portfolio.first_name}
        avatarUrl={portfolio.avatar_url}
        archetypeName={portfolio.archetype_name}
        archetypeSubtitle={portfolio.archetype_subtitle}
        platforms={portfolio.platforms}
        colorScheme={colorScheme}
      />

      {/* Section 2: Personality Radar (only if personality data exists) */}
      {portfolio.personality && (
        <PortfolioRadar
          personality={portfolio.personality}
          platformCount={portfolio.platforms.length}
          colorScheme={colorScheme}
        />
      )}

      {/* Section 3: Defining Traits */}
      <PortfolioTraits
        traits={portfolio.defining_traits}
        colorScheme={colorScheme}
      />

      {/* Section 4: Narrative */}
      <PortfolioNarrative
        narrative={portfolio.narrative}
        colorScheme={colorScheme}
      />

      {/* Section 5: Platform Highlights */}
      <PortfolioPlatforms platforms={portfolio.platforms} />

      {/* Section 6: Footer / CTA */}
      <PortfolioFooter
        updatedAt={portfolio.updated_at}
        colorScheme={colorScheme}
      />
    </div>
  );
};

export default PortfolioPage;
