import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { discoveryScan } from '../services/enrichmentService';
import { useDemo } from '../contexts/DemoContext';
import { useAnalytics } from '../contexts/AnalyticsContext';
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
type ConfirmationPhase = 'pending' | 'confirmed' | 'correcting';

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
  const { trackFunnel } = useAnalytics();

  // Discovery scan state
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<DiscoverPhase>('idle');
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [personaSummary, setPersonaSummary] = useState<string | null>(null);
  const [webSources, setWebSources] = useState<Array<{ title: string; url: string }>>([]);
  const [discoveredName, setDiscoveredName] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Identity confirmation state
  const [confirmationPhase, setConfirmationPhase] = useState<ConfirmationPhase>('pending');
  const [isRescanning, setIsRescanning] = useState(false);

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
    setDiscoveredName(null);
    setConfirmationPhase('pending');

    try {
      const result = await discoveryScan(trimmed);

      if (!result.success) {
        setError(result.error || 'We couldn\'t find public information for this email. Try a different one or sign up directly.');
        setPhase('idle');
        return;
      }

      const d = result.discovered;
      if (!d) {
        setError('No public information found for this email. Try another email or sign up directly.');
        setPhase('idle');
        return;
      }
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
        if (d.discovered_name) setDiscoveredName(d.discovered_name);
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

  // ── Identity confirmation handlers ────────────────────────────────────
  const handleConfirmYes = useCallback(() => {
    setConfirmationPhase('confirmed');
    sessionStorage.setItem('twinme_discovery_confirmed', 'true');
    trackFunnel('discovery_confirmed', { email: email.trim() });
  }, [email, trackFunnel]);

  const handleConfirmNo = useCallback(() => {
    setConfirmationPhase('correcting');
    trackFunnel('discovery_not_me', { email: email.trim() });
  }, [email, trackFunnel]);

  const handleCorrectionSubmit = useCallback(async (data: { name: string; linkedin: string; website: string }) => {
    setIsRescanning(true);
    trackFunnel('discovery_rescan', {
      has_name: !!data.name,
      has_linkedin: !!data.linkedin,
      has_website: !!data.website,
    });

    try {
      const trimmed = email.trim();
      const result = await discoveryScan(trimmed, {
        name: data.name || undefined,
        linkedin: data.linkedin || undefined,
        website: data.website || undefined,
      });

      if (!result.success || !result.discovered) {
        setError(result.error || 'Re-scan did not find results. You can skip and continue.');
        setIsRescanning(false);
        return;
      }

      const d = result.discovered;
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
      if (d.email_reputation) points.push({ icon: 'shield', label: 'Email reputation', value: d.email_reputation });
      if (d.digital_footprint_score > 0) points.push({ icon: 'fingerprint', label: 'Digital footprint', value: `${d.digital_footprint_score} services detected` });
      if (d.breach_mapped_integrations?.length) points.push({ icon: 'link', label: 'Known accounts', value: d.breach_mapped_integrations.join(', ') });
      if (d.spotify_exists) points.push({ icon: 'music', label: 'Spotify', value: 'Account found' });
      if (d.discovered_platforms?.length) points.push({ icon: 'scan', label: 'Platforms', value: `Found on ${d.discovered_platforms.length} platforms` });
      if (d.wmn_count > 0) points.push({ icon: 'globe', label: 'Web presence', value: `${d.wmn_count} platforms confirmed` });

      setDataPoints(points);
      if (d.discovered_name) setDiscoveredName(d.discovered_name);
      if (d.persona_summary) setPersonaSummary(d.persona_summary);
      if (d.web_sources?.length) setWebSources(d.web_sources);

      // Update cache
      sessionStorage.setItem('twinme_discovery_data', JSON.stringify(d));
      sessionStorage.setItem('twinme_discovery_email', trimmed);

      setConfirmationPhase('pending');
    } catch {
      setError('Something went wrong during re-scan. Please try again.');
    } finally {
      setIsRescanning(false);
    }
  }, [email, trackFunnel]);

  const handleCorrectionSkip = useCallback(() => {
    setConfirmationPhase('confirmed');
    sessionStorage.setItem('twinme_discovery_confirmed', 'true');
  }, []);

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
      style={{
        backgroundColor: T.BG,
        backgroundImage: `
          radial-gradient(ellipse 90% 70% at 15% 8%, rgba(210,145,55,0.28) 0%, transparent 55%),
          radial-gradient(ellipse 80% 60% at 85% 15%, rgba(180,110,65,0.20) 0%, transparent 50%),
          radial-gradient(ellipse 70% 50% at 50% 85%, rgba(160,95,55,0.24) 0%, transparent 50%),
          radial-gradient(ellipse 55% 45% at 80% 65%, rgba(55,45,140,0.18) 0%, transparent 50%)
        `,
        color: T.FG,
        fontFamily: "'Inter', sans-serif",
      }}
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
        discoveredName={discoveredName}
        confirmationPhase={confirmationPhase}
        isRescanning={isRescanning}
        onEmailChange={handleEmailChange}
        onDiscover={handleDiscover}
        onResetPhase={handleResetPhase}
        onNavigateAuth={handleNavigateAuth}
        onEnterDemo={handleEnterDemo}
        onConfirmYes={handleConfirmYes}
        onConfirmNo={handleConfirmNo}
        onCorrectionSubmit={handleCorrectionSubmit}
        onCorrectionSkip={handleCorrectionSkip}
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
