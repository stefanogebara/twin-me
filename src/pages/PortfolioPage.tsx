import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import PortfolioHero from '../components/portfolio/PortfolioHero';
import PortfolioRadar from '../components/portfolio/PortfolioRadar';
import PortfolioTraits from '../components/portfolio/PortfolioTraits';
import PortfolioNarrative from '../components/portfolio/PortfolioNarrative';
import PortfolioPlatforms from '../components/portfolio/PortfolioPlatforms';
import PortfolioFooter from '../components/portfolio/PortfolioFooter';
import { Page, PageHead, Section, List, Row } from '@/components/register';
import '@/styles/register-public.css';
import '@/styles/share.css';

import { API_URL } from '@/services/api/apiBase';

/**
 * The public share page (/s/:userId, /p/:userId), in the register's page kit
 * (src/styles/share.css): the archetype as the title, then sections of rows.
 * The data, the fetch and its three outcomes (found, not found, failed) are
 * unchanged.
 */

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
  fidelity: {
    accuracy: number;
    normalized: number | null;
    self_consistency: number | null;
    items: number | null;
    wave: number;
    measured_at: string;
  } | null;
}

const PortfolioPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Network/server failure — distinct from a genuine 404 (audit-2026-07-03)
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const fetchPortfolio = async () => {
      if (!userId) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/portfolio/public/${userId}`);
        // Only a real 404 means "not found" — a 5xx or network failure must
        // not tell the visitor the portfolio does not exist (audit-2026-07-03).
        if (response.status === 404) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        if (!response.ok) {
          console.error('Portfolio fetch failed:', response.status);
          setLoadFailed(true);
          setLoading(false);
          return;
        }

        const result = await response.json();
        if (result.success && result.portfolio) {
          setPortfolio(result.portfolio);
          // Set page title
          const name = result.portfolio.first_name || 'Someone';
          // Canonical brand spelling is "TwinMe" (matches CLAUDE.md and every other surface).
          document.title = `${name}'s Soul Signature | TwinMe`;
        } else {
          setNotFound(true);
        }
      } catch (err) {
        console.error('Portfolio fetch failed:', err);
        setLoadFailed(true);
      } finally {
        setLoading(false);
      }
    };

    fetchPortfolio();
  }, [userId]);

  if (loading) {
    return (
      <main id="main-content" className="sh sh--center">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--rg-ink-3)' }} aria-label="Loading" />
      </main>
    );
  }

  if (notFound || loadFailed || !portfolio) {
    return (
      <main id="main-content" className="sh">
        <Page>
          <PageHead
            title={loadFailed ? 'This portrait did not load.' : 'Portrait not found.'}
            line={loadFailed
              ? 'Something went wrong reaching the server. Check your connection and try again.'
              : "This soul signature is private or doesn't exist yet."}
          />
          {loadFailed ? (
            <button type="button" onClick={() => window.location.reload()} className="n-btn n-btn--primary">
              Try again
            </button>
          ) : (
            <a href="/" className="n-btn n-btn--primary">Discover your soul signature</a>
          )}
        </Page>
      </main>
    );
  }

  const colorScheme = {
    primary: portfolio.color_scheme?.primary || DEFAULT_COLOR_SCHEME.primary,
    secondary: portfolio.color_scheme?.secondary || DEFAULT_COLOR_SCHEME.secondary,
    accent: portfolio.color_scheme?.accent || DEFAULT_COLOR_SCHEME.accent,
  };

  return (
    <main
      id="main-content"
      className="sh"
      style={{
        '--portfolio-primary': colorScheme.primary,
        '--portfolio-secondary': colorScheme.secondary,
        '--portfolio-accent': colorScheme.accent,
      } as React.CSSProperties}
    >
      <Page>
        {/* Section 1: Hero */}
        <PortfolioHero
          firstName={portfolio.first_name}
          avatarUrl={portfolio.avatar_url}
          archetypeName={portfolio.archetype_name}
          archetypeSubtitle={portfolio.archetype_subtitle}
          platforms={portfolio.platforms}
          colorScheme={colorScheme}
        />

        {/* Fidelity, stated honestly (2026-08-25).
            This block is served to anyone with the URL, with no auth. It used
            to print the RAW accuracy at 40px under "measured by a blind
            test-retest battery" — a clinical-sounding caption over a single
            session of self-report items, with the honest denominator
            (normalized_fidelity) computed and thrown away.
            It now leads with the normalized number where one exists, names the
            denominator, and carries its n and date. Falls back to raw only when
            the ceiling is unmeasurable, and says so. */}
        {portfolio.fidelity && (() => {
          const f = portfolio.fidelity;
          const isNormalized = typeof f.normalized === 'number' && f.normalized > 0;
          const shown = isNormalized ? f.normalized! : f.accuracy;
          const measuredOn = new Date(f.measured_at).toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
          });
          const who = portfolio.first_name || 'its human';
          return (
            <Section title="How close the twin is">
              <List label="Twin accuracy" className="rg-figures">
                <Row
                  title={`${Math.round(shown * 100)}% the same answer as ${who}`}
                  line={isNormalized
                    ? `Measured against how often ${who} agrees with themselves`
                    : 'Raw agreement; self-agreement was not measured'}
                />
              </List>
              <p className="sh-note">
                {f.items ? `${f.items} self-report items` : 'Self-report items'}
                {', one session'}{f.wave ? `, wave ${f.wave}` : ''}
                {`, ${measuredOn}`}
                {isNormalized && typeof f.self_consistency === 'number'
                  ? `, self-consistency ${Math.round(f.self_consistency * 100)}%`
                  : ''}
                {'. Not a clinical measure.'}
              </p>
            </Section>
          );
        })()}

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
      </Page>
    </main>
  );
};

export default PortfolioPage;
