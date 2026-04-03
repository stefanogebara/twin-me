import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { discoveryScan } from '../services/enrichmentService';
import { useDemo } from '../contexts/DemoContext';
import { getAccessToken } from '@/services/api/apiBase';
import DiscoverNav from './components/discover/DiscoverNav';
import DiscoverHero from './components/discover/DiscoverHero';
import DiscoverFeatures from './components/discover/DiscoverFeatures';
import DiscoverPricing from './components/discover/DiscoverPricing';
import DiscoverFAQ from './components/discover/DiscoverFAQ';
import DiscoverFooter from './components/discover/DiscoverFooter';
import { T } from './components/discover/discoverTokens';

// ── Types ─────────────────────────────────────────────────────────────
type DiscoverPhase = 'idle' | 'scanning' | 'revealed';

interface DataPoint {
  icon: string;
  label: string;
  value: string;
}

// ── Main component ─────────────────────────────────────────────────────
export default function DiscoverLanding() {
  const navigate  = useNavigate();
  const [billingAnnual, setBillingAnnual] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { enterDemoMode } = useDemo();

  // Discovery scan state
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<DiscoverPhase>('idle');
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [personaSummary, setPersonaSummary] = useState<string | null>(null);
  const [webSources, setWebSources] = useState<Array<{ title: string; url: string }>>([]);
  const [error, setError] = useState('');

  // Redirect if already signed in
  useEffect(() => {
    const token = getAccessToken() || localStorage.getItem('auth_token') || localStorage.getItem('token');
    if (token) navigate('/dashboard', { replace: true });
  }, [navigate]);

  const handleDiscover = async () => {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }

    setError('');
    setPhase('scanning');
    setDataPoints([]);
    setPersonaSummary(null);
    setWebSources([]);

    try {
      const result = await discoveryScan(trimmed);

      if (!result.success && result.error) {
        setError(result.error);
        setPhase('idle');
        return;
      }

      const d = result.discovered;
      if (d) {
        const points: DataPoint[] = [];
        if (d.discovered_name) points.push({ icon: 'name', label: 'Name', value: d.discovered_name });
        if (d.discovered_company) points.push({ icon: 'company', label: 'Company', value: d.discovered_company });
        if (d.discovered_location) points.push({ icon: 'location', label: 'Location', value: d.discovered_location });
        if (d.discovered_bio) points.push({ icon: 'bio', label: 'Bio', value: d.discovered_bio });
        if (d.discovered_github_url) points.push({ icon: 'github', label: 'GitHub', value: 'Profile found' });
        if (d.discovered_twitter_url) points.push({ icon: 'twitter', label: 'Twitter', value: 'Profile found' });
        if (d.social_links?.length) {
          for (const link of d.social_links) {
            if (!points.some(p => p.label.toLowerCase() === link.platform.toLowerCase())) {
              points.push({ icon: 'social', label: link.platform, value: 'Profile found' });
            }
          }
        }
        // New enrichment fields
        if (d.email_reputation) points.push({ icon: 'shield', label: 'Email reputation', value: d.email_reputation });
        if (d.digital_footprint_score > 0) points.push({ icon: 'fingerprint', label: 'Digital footprint', value: `${d.digital_footprint_score} services detected` });
        if (d.breach_mapped_integrations?.length) points.push({ icon: 'link', label: 'Known accounts', value: d.breach_mapped_integrations.join(', ') });
        if (d.spotify_exists) points.push({ icon: 'music', label: 'Spotify', value: 'Account found' });
        if (d.discovered_platforms?.length) points.push({ icon: 'scan', label: 'Platforms', value: `Found on ${d.discovered_platforms.length} platforms` });
        if (d.wmn_count > 0) points.push({ icon: 'globe', label: 'Web presence', value: `${d.wmn_count} platforms confirmed` });
        setDataPoints(points);
        if (d.persona_summary) setPersonaSummary(d.persona_summary);
        if (d.web_sources?.length) setWebSources(d.web_sources);

        // Cache for post-auth pickup
        sessionStorage.setItem('twinme_discovery_data', JSON.stringify(d));
        sessionStorage.setItem('twinme_discovery_email', trimmed);
      }

      setPhase('revealed');
    } catch {
      setError('Something went wrong. Please try again.');
      setPhase('idle');
    }
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setError('');
  };

  const handleResetPhase = () => {
    setPhase('idle');
    setDataPoints([]);
    setPersonaSummary(null);
    setWebSources([]);
    setEmail('');
  };

  const handleNavigateAuth = (emailValue: string) => {
    navigate(`/auth?email=${encodeURIComponent(emailValue)}`);
  };

  const handleEnterDemo = () => {
    enterDemoMode();
    navigate('/dashboard');
  };

  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{ backgroundColor: T.BG, color: T.FG, fontFamily: "'Inter', sans-serif" }}
    >
      <DiscoverNav
        mobileMenuOpen={mobileMenuOpen}
        onOpenMobileMenu={() => setMobileMenuOpen(true)}
        onCloseMobileMenu={() => setMobileMenuOpen(false)}
        onNavigate={navigate}
      />

      {/* SVG grain filter (Sundust signature texture) */}
      <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
        <defs>
          <filter id="sundust-grain" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" result="noise"/>
            <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise"/>
            <feBlend in="SourceGraphic" in2="grayNoise" mode="overlay" result="blend"/>
            <feComposite in="blend" in2="SourceGraphic" operator="in"/>
          </filter>
        </defs>
      </svg>

      <DiscoverHero
        phase={phase}
        email={email}
        error={error}
        dataPoints={dataPoints}
        personaSummary={personaSummary}
        webSources={webSources}
        onEmailChange={handleEmailChange}
        onDiscover={handleDiscover}
        onResetPhase={handleResetPhase}
        onNavigateAuth={handleNavigateAuth}
        onEnterDemo={handleEnterDemo}
      />

      <DiscoverFeatures />

      <DiscoverPricing
        billingAnnual={billingAnnual}
        onToggleBilling={setBillingAnnual}
        onNavigate={navigate}
      />

      <DiscoverFAQ onNavigate={navigate} />

      <DiscoverFooter />
    </div>
  );
}
