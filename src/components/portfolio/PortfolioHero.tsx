import React from 'react';
import { Sparkles } from 'lucide-react';
import { getPlatformLogo } from '../PlatformLogos';
import { PageHead } from '@/components/register';

interface PortfolioHeroProps {
  firstName: string | null;
  avatarUrl: string | null;
  archetypeName: string;
  archetypeSubtitle: string;
  platforms: Array<{ name: string }>;
  /** The portrait's own colours. Kept for callers; the register sets this page
   *  in ink, because the default cream failed as text on the page. */
  colorScheme: { primary: string; secondary: string; accent: string };
}

/** The share page's head: the wordmark, whose portrait it is, the archetype as
 *  the title with its line, and the connected platforms as brand icons. */
const PortfolioHero: React.FC<PortfolioHeroProps> = ({
  firstName,
  avatarUrl,
  archetypeName,
  archetypeSubtitle,
  platforms,
}) => {
  // Only render http(s) avatar URLs — the value comes from the public
  // portfolio API, so guard against non-web schemes before putting it in
  // an img src (audit-2026-07-03). Falls back to the Sparkles placeholder.
  const safeAvatarUrl = avatarUrl && /^https?:\/\//i.test(avatarUrl) ? avatarUrl : null;

  return (
    <>
      <div className="sh-top">
        <a href="/" className="sh-mark">TwinMe</a>
      </div>

      <div className="sh-who">
        {safeAvatarUrl ? (
          <img
            src={safeAvatarUrl}
            alt={firstName ? `${firstName}'s avatar` : 'Portfolio avatar'}
            className="sh-avatar"
          />
        ) : (
          <span className="sh-avatar" aria-hidden="true">
            <Sparkles className="w-4 h-4" />
          </span>
        )}
        <span className="sh-who-label">
          {firstName ? `${firstName}'s soul signature` : 'A soul signature'}
        </span>

        {platforms.length > 0 && (
          <ul className="sh-platforms" aria-label="Connected platforms">
            {platforms.map((p) => {
              const Logo = getPlatformLogo(p.name);
              return (
                <li key={p.name} className="rg-row-icon" title={p.name}>
                  {Logo && <Logo className="w-4 h-4" />}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <PageHead title={archetypeName} line={archetypeSubtitle || undefined} />
    </>
  );
};

export default PortfolioHero;
