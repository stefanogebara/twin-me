import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAnalytics } from '@/contexts/AnalyticsContext';
import { getAccessToken } from '@/services/api/apiBase';
import { enrichmentService, QuickEnrichmentData, EnrichmentData, PersonalizedQuestion } from '@/services/enrichmentService';
import ParticleField from './components/ParticleField';
import PlatformConnectStep from './components/PlatformConnectStep';
import DeepInterview from './components/DeepInterview';
import RevealPhase from './components/RevealPhase';
import DeepeningPhase from './components/DeepeningPhase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Infer name from email
const inferNameFromEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  const genericPrefixes = new Set([
    'info', 'admin', 'hello', 'contact', 'support', 'noreply', 'no-reply',
    'sales', 'team', 'office', 'mail', 'webmaster', 'postmaster', 'help',
  ]);
  if (genericPrefixes.has(local.toLowerCase())) {
    const domainName = (domain || '').split('.')[0];
    return domainName.replace(/[_-]/g, ' ').split(/\s+/)
      .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
  }
  const hasSeparators = /[._]/.test(local);
  let tokens: string[];
  if (hasSeparators) {
    tokens = local.split(/[._]/).filter(t => t.length > 0);
  } else {
    const expanded = local
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
    tokens = expanded.split(/\s+/).filter(t => t.length > 0);
  }
  tokens = tokens.map(t => t.replace(/\d+/g, '')).filter(t => t.length > 0);
  const honorifics = new Set(['mr', 'mrs', 'ms', 'dr', 'prof']);
  if (tokens.length > 1 && honorifics.has(tokens[0].toLowerCase())) tokens = tokens.slice(1);
  const result = tokens.map(t => {
    if (t.length === 1) return t.toUpperCase();
    return t.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('-');
  });
  return result.length === 0 ? local.charAt(0).toUpperCase() + local.slice(1) : result.join(' ');
};

type FlowPhase = 'entry' | 'reveal' | 'platforms' | 'deepening' | 'deep-interview' | 'complete';
type OrbPhase = 'dormant' | 'awakening' | 'alive';

interface DataPoint {
  icon: string;
  label: string;
  value: string;
}

interface SoulSignature {
  archetype_name: string;
  core_traits: Array<{ trait: string; source: string }>;
  signature_quote: string;
  first_impression: string;
}

const NewDiscoverFlow: React.FC = () => {
  const navigate = useNavigate();
  const { user, isLoaded: authLoaded } = useAuth();
  const { trackFunnel } = useAnalytics();

  const setPhaseTracked = (next: FlowPhase, extra?: Record<string, unknown>) => {
    trackFunnel(`discover_${next}_entered`, { phase: next, ...extra });
    setPhase(next);
  };

  // Flow state
  const [phase, setPhase] = useState<FlowPhase>('entry');
  const [orbPhase, setOrbPhase] = useState<OrbPhase>('dormant');
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [narrative, setNarrative] = useState('');
  const [showContinue, setShowContinue] = useState(false);
  const [loading, setLoading] = useState(true);

  // Deepening state
  const [personalizedQuestions, setPersonalizedQuestions] = useState<PersonalizedQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [questionDomains, setQuestionDomains] = useState<Record<string, string>>({});
  const [allQAnswered, setAllQAnswered] = useState(false);
  const [signature, setSignature] = useState<SoulSignature | null>(null);
  const [generatingSignature, setGeneratingSignature] = useState(false);
  const [twinIntro, setTwinIntro] = useState('');

  // Correction flow state
  type RevealSubView = 'data' | 'correction';
  const [revealSubView, setRevealSubView] = useState<RevealSubView>('data');
  const [correctionName, setCorrectionName] = useState('');
  const [correctionLinkedIn, setCorrectionLinkedIn] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);

  // Refs
  const hasStartedRef = useRef(false);
  const enrichmentDataRef = useRef<EnrichmentData | null>(null);
  const quickDataRef = useRef<QuickEnrichmentData | null>(null);
  const confidenceRef = useRef<number | null>(null);

  // Check auth and existing enrichment
  useEffect(() => {
    if (!authLoaded) return;
    if (!user) { navigate('/auth'); return; }

    const checkStatus = async () => {
      try {
        const status = await enrichmentService.getStatus(user.id);
        if (status.isConfirmed) {
          navigate('/dashboard');
          return;
        }
        setLoading(false);
      } catch {
        setLoading(false);
      }
    };
    checkStatus();
  }, [authLoaded, user, navigate]);

  useEffect(() => {
    if (loading || !user || hasStartedRef.current) return;
    hasStartedRef.current = true;
    startReveal();
  }, [loading, user]);

  useEffect(() => {
    if (phase !== 'reveal') return;
    if (orbPhase === 'alive') {
      const timer = setTimeout(() => setShowContinue(true), 1500);
      return () => clearTimeout(timer);
    }
    const fallback = setTimeout(() => setShowContinue(true), 30000);
    return () => clearTimeout(fallback);
  }, [phase, orbPhase]);

  const isLLMJunk = (text: string): boolean => {
    const lower = text.toLowerCase().trim();
    if (/^(okay|sure|alright|let me|i will|i'll|here's (the|my) plan)/i.test(lower)) return true;
    if (/^this report (compiles|summarizes|presents|covers|contains)/i.test(lower)) return true;
    if (/^(below is|here is|the following) (a |the )?(compiled|detailed|comprehensive)/i.test(lower)) return true;
    const junkPhrases = [
      'conduct the searches', 'compile a detailed report', 'execute the search queries',
      'gather information from', 'i will search', 'i will now search',
      'compiles information found through', 'based on the search results',
    ];
    return junkPhrases.some(p => lower.includes(p));
  };

  const addDataPoint = useCallback((dp: DataPoint) => {
    setDataPoints(prev => {
      const idx = prev.findIndex(p => p.label === dp.label);
      if (idx >= 0) {
        if (prev[idx].value === dp.value) return prev;
        return prev.map((p, i) => i === idx ? dp : p);
      }
      return [...prev, dp];
    });
  }, []);

  const extractFirstLine = (text: string, maxLen = 60): string => {
    if (isLLMJunk(text)) return '';
    const line = text.split(/[\n•-]/).map(s => s.trim()).find(s => s.length > 5) || text;
    return line.length > maxLen ? line.slice(0, maxLen).replace(/\s+\S*$/, '') + '...' : line;
  };

  const addFullEnrichmentPoints = (data: EnrichmentData) => {
    if (data.discovered_name) addDataPoint({ icon: 'name', label: 'Name', value: data.discovered_name });
    if (data.discovered_company) addDataPoint({ icon: 'company', label: 'Company', value: data.discovered_company });
    if (data.discovered_title) addDataPoint({ icon: 'title', label: 'Title', value: data.discovered_title });
    if (data.discovered_location) addDataPoint({ icon: 'location', label: 'Location', value: data.discovered_location });
    if (data.discovered_bio && !data.discovered_summary) {
      const bioValue = extractFirstLine(data.discovered_bio, 120);
      if (bioValue) addDataPoint({ icon: 'bio', label: 'Bio', value: bioValue });
    }
    if (data.career_timeline && data.career_timeline.length > 20 && !data.discovered_company && !data.discovered_title) {
      const careerValue = extractFirstLine(data.career_timeline);
      if (careerValue) addDataPoint({ icon: 'career', label: 'Career', value: careerValue });
    }
    if (data.education && data.education.length > 10) {
      const eduValue = extractFirstLine(data.education);
      if (eduValue) addDataPoint({ icon: 'education', label: 'Education', value: eduValue });
    }
    if (data.discovered_github_url) addDataPoint({ icon: 'github', label: 'GitHub', value: 'Profile found' });
    if (data.discovered_twitter_url) addDataPoint({ icon: 'twitter', label: 'Twitter', value: 'Profile found' });
  };

  const startReveal = async () => {
    if (!user) return;
    setPhaseTracked('reveal');
    setOrbPhase('awakening');

    try {
      const cachedRaw = sessionStorage.getItem('twinme_discovery_data');
      let cachedDiscovery: QuickEnrichmentData | null = null;
      if (cachedRaw) {
        try {
          cachedDiscovery = JSON.parse(cachedRaw);
          sessionStorage.removeItem('twinme_discovery_data');
          sessionStorage.removeItem('twinme_discovery_email');
        } catch {
          cachedDiscovery = null;
        }
      }

      const oauthName = user.fullName || undefined;
      const quickResult = cachedDiscovery
        ? { success: true, data: cachedDiscovery, elapsed: 0 }
        : await enrichmentService.quickEnrich(oauthName);
      const q = quickResult?.data;

      if (q && q.source !== 'none' && q.source !== 'error') {
        quickDataRef.current = q;
        if (q.discovered_name) addDataPoint({ icon: 'name', label: 'Name', value: q.discovered_name });
        if (q.discovered_company) addDataPoint({ icon: 'company', label: 'Company', value: q.discovered_company });
        if (q.discovered_location) addDataPoint({ icon: 'location', label: 'Location', value: q.discovered_location });
        if (q.discovered_bio) addDataPoint({ icon: 'bio', label: 'Bio', value: q.discovered_bio });
        if (q.discovered_github_url) addDataPoint({ icon: 'github', label: 'GitHub', value: 'Profile found' });
        if (q.discovered_twitter_url) addDataPoint({ icon: 'twitter', label: 'Twitter', value: 'Profile found' });
      }

      const statusResult = await enrichmentService.getStatus(user.id);
      if (statusResult.hasEnrichment) {
        const resultsResult = await enrichmentService.getResults(user.id);
        if (resultsResult.data && enrichmentService.hasResults(resultsResult.data)) {
          enrichmentDataRef.current = resultsResult.data;
          confidenceRef.current = resultsResult.data.identity_confidence ?? null;
          addFullEnrichmentPoints(resultsResult.data);
          if (resultsResult.data.discovered_summary && !isLLMJunk(resultsResult.data.discovered_summary)) {
            setNarrative(resultsResult.data.discovered_summary);
          }
          setOrbPhase('alive');
          return;
        }
      }

      const name = user.fullName || q?.discovered_name || inferNameFromEmail(user.email);
      const searchResult = await enrichmentService.search(user.id, user.email, name);

      if (searchResult.data) {
        enrichmentDataRef.current = searchResult.data;
        confidenceRef.current = searchResult.data.identity_confidence ?? null;
        addFullEnrichmentPoints(searchResult.data);
        if (searchResult.data.discovered_summary && !isLLMJunk(searchResult.data.discovered_summary)) {
          setNarrative(searchResult.data.discovered_summary);
        }
      }

      setOrbPhase('alive');
    } catch (error) {
      console.error('Enrichment error:', error);
      setEnrichError("We couldn't find your info right now — no worries, let's keep going.");
      setOrbPhase('alive');
    }
  };

  const handleAdvanceToDeepening = async () => {
    if (user && enrichmentDataRef.current) {
      const data = enrichmentDataRef.current;
      enrichmentService.confirm(user.id, {
        name: data.discovered_name || quickDataRef.current?.discovered_name || undefined,
        company: data.discovered_company || quickDataRef.current?.discovered_company || undefined,
        title: data.discovered_title || undefined,
        location: data.discovered_location || quickDataRef.current?.discovered_location || undefined,
        bio: data.discovered_bio || data.discovered_summary || quickDataRef.current?.discovered_bio || undefined,
        github_url: data.discovered_github_url || quickDataRef.current?.discovered_github_url || undefined,
      }).catch(() => {});
    }

    setPhase('platforms');

    setLoadingQuestions(true);
    try {
      const enrichment = enrichmentDataRef.current;
      const quick = quickDataRef.current;
      const enrichmentContext = {
        name: enrichment?.discovered_name || quick?.discovered_name || user?.fullName || undefined,
        company: enrichment?.discovered_company || quick?.discovered_company || undefined,
        title: enrichment?.discovered_title || undefined,
        bio: enrichment?.discovered_bio || enrichment?.discovered_summary || quick?.discovered_bio || undefined,
        location: enrichment?.discovered_location || quick?.discovered_location || undefined,
      };

      const result = await enrichmentService.fetchQuickQuestions(enrichmentContext);
      if (result.success && result.questions?.length > 0) {
        setPersonalizedQuestions(result.questions);
      }
    } catch {
      // empty
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleNotMe = () => {
    const currentName = enrichmentDataRef.current?.discovered_name
      || quickDataRef.current?.discovered_name
      || user?.fullName
      || '';
    setCorrectionName(currentName);
    setCorrectionLinkedIn('');
    setIdentityConfirmed(false);
    setRevealSubView('correction');
  };

  const handleSearchAgain = async () => {
    if (!user) return;
    if (retryCount >= 2) {
      handleSkipEnrichment();
      return;
    }

    setIsRetrying(true);
    setRevealSubView('data');
    setOrbPhase('awakening');
    setDataPoints([]);
    setNarrative('');
    setShowContinue(false);
    setEnrichError(null);
    setIdentityConfirmed(false);
    quickDataRef.current = null;

    try {
      await enrichmentService.clear(user.id);

      let searchResult;
      if (correctionLinkedIn.trim()) {
        searchResult = await enrichmentService.enrichFromLinkedIn(
          user.id,
          correctionLinkedIn.trim(),
          correctionName.trim() || undefined,
        );
      } else {
        searchResult = await enrichmentService.search(
          user.id,
          user.email,
          correctionName.trim() || undefined,
        );
      }

      if (searchResult.data) {
        enrichmentDataRef.current = searchResult.data;
        confidenceRef.current = searchResult.data.identity_confidence ?? null;
        addFullEnrichmentPoints(searchResult.data);
        if (searchResult.data.discovered_summary && !isLLMJunk(searchResult.data.discovered_summary)) {
          setNarrative(searchResult.data.discovered_summary);
        }
      }

      setOrbPhase('alive');
      setRetryCount(prev => prev + 1);
    } catch (error) {
      console.error('Re-search error:', error);
      setEnrichError('Search failed — you can try again or skip this step.');
      setOrbPhase('alive');
    } finally {
      setIsRetrying(false);
    }
  };

  const handleSkipEnrichment = async () => {
    if (!user) return;
    try {
      await enrichmentService.skip(user.id);
    } catch {
      // skip
    }
    enrichmentDataRef.current = null;
    setPhaseTracked('platforms');
  };

  const handlePlatformsComplete = (_connectedPlatforms: string[]) => {
    setPhaseTracked('deepening', { platforms_connected: _connectedPlatforms.length });
  };

  const handleQuestionAnswer = (questionId: string, answer: string, domain: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
    setQuestionDomains(prev => ({ ...prev, [questionId]: domain }));
  };

  const handleAllQuestionsAnswered = () => {
    setAllQAnswered(true);
  };

  useEffect(() => {
    if (!allQAnswered || generatingSignature || signature) return;
    generateSignature();
  }, [allQAnswered]);

  const generateSignature = async () => {
    if (!user) return;
    setGeneratingSignature(true);

    try {
      const token = getAccessToken() || localStorage.getItem('auth_token') || localStorage.getItem('token');
      const enrichment = enrichmentDataRef.current;
      const quick = quickDataRef.current;

      const enrichmentContext = {
        name: enrichment?.discovered_name || quick?.discovered_name || user.fullName || inferNameFromEmail(user.email),
        company: enrichment?.discovered_company || quick?.discovered_company || undefined,
        title: enrichment?.discovered_title || undefined,
        location: enrichment?.discovered_location || quick?.discovered_location || undefined,
        bio: enrichment?.discovered_bio || enrichment?.discovered_summary || quick?.discovered_bio || undefined,
      };

      const calibrationInsights = Object.entries(answers).map(([qId, answer]) => {
        const question = personalizedQuestions.find(q => q.id === qId);
        const domain = questionDomains[qId] || 'personality';
        return question ? `[${domain}] ${question.text} "${answer}"` : '';
      }).filter(Boolean);

      const response = await fetch(`${API_URL}/onboarding/instant-signature`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          enrichmentContext,
          calibrationInsights,
          connectedPlatforms: [],
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.signature) {
          setSignature(result.signature);
          if (result.twinIntro) {
            setTwinIntro(result.twinIntro);
          }
        }
      }
    } catch (error) {
      console.error('Signature generation error:', error);
    } finally {
      setGeneratingSignature(false);
    }
  };

  const handleComplete = () => {
    setPhaseTracked('complete');
    navigate('/dashboard');
  };

  // Loading state
  if (!authLoaded || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0C0C0C]">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#E8D5B7' }} />
      </div>
    );
  }

  if (!user) return null;

  const userName = enrichmentDataRef.current?.discovered_name
    || quickDataRef.current?.discovered_name
    || user.fullName
    || inferNameFromEmail(user.email);

  return (
    <div className={`bg-[#0C0C0C] relative ${phase === 'deep-interview' ? 'h-dvh flex flex-col overflow-hidden' : 'min-h-screen overflow-hidden'}`}>
      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <ParticleField />

      {/* Header */}
      <div className="relative z-10 flex justify-between items-center px-6 md:px-8 py-5">
        <div
          className="text-xl tracking-tight"
          style={{ fontFamily: 'var(--font-heading)', color: '#E8D5B7' }}
        >
          Twin Me
        </div>
        {phase !== 'complete' && (
          <button
            onClick={handleComplete}
            className="text-sm tracking-wide uppercase opacity-40 hover:opacity-80 transition-opacity"
            style={{ fontFamily: 'var(--font-body)', color: '#E8D5B7', letterSpacing: '0.1em' }}
          >
            Skip
          </button>
        )}
      </div>

      {/* Main Content */}
      <div className={`relative z-10 flex flex-col items-center px-6 md:px-8 ${phase === 'deep-interview' ? 'flex-1 min-h-0' : ''}`}>
        {/* ===== PHASE: ENTRY / REVEAL ===== */}
        {(phase === 'entry' || phase === 'reveal') && (
          <RevealPhase
            orbPhase={orbPhase}
            userName={userName}
            dataPoints={dataPoints}
            narrative={narrative}
            showContinue={showContinue}
            enrichError={enrichError}
            identityConfirmed={identityConfirmed}
            revealSubView={revealSubView}
            correctionName={correctionName}
            correctionLinkedIn={correctionLinkedIn}
            isRetrying={isRetrying}
            retryCount={retryCount}
            onConfirmIdentity={() => setIdentityConfirmed(true)}
            onNotMe={handleNotMe}
            onAdvance={handleAdvanceToDeepening}
            onCorrectionNameChange={setCorrectionName}
            onCorrectionLinkedInChange={setCorrectionLinkedIn}
            onSearchAgain={handleSearchAgain}
            onSkipEnrichment={handleSkipEnrichment}
          />
        )}

        {/* ===== PHASE: PLATFORMS ===== */}
        {phase === 'platforms' && (
          <PlatformConnectStep
            userId={user.id}
            onContinue={handlePlatformsComplete}
          />
        )}

        {/* ===== PHASE: DEEPENING ===== */}
        {phase === 'deepening' && (
          <DeepeningPhase
            signature={signature}
            generatingSignature={generatingSignature}
            allQAnswered={allQAnswered}
            loadingQuestions={loadingQuestions}
            personalizedQuestions={personalizedQuestions}
            onQuestionAnswer={handleQuestionAnswer}
            onAllQuestionsAnswered={handleAllQuestionsAnswered}
            onComplete={handleComplete}
            onGoDeeper={() => setPhaseTracked('deep-interview')}
          />
        )}

        {/* ===== PHASE: DEEP INTERVIEW ===== */}
        {phase === 'deep-interview' && (
          <div className="w-full flex-1 flex flex-col min-h-0 transition-all duration-500">
            <DeepInterview
              enrichmentContext={identityConfirmed ? {
                name: enrichmentDataRef.current?.discovered_name || quickDataRef.current?.discovered_name || user.fullName || inferNameFromEmail(user.email),
                company: enrichmentDataRef.current?.discovered_company || quickDataRef.current?.discovered_company || undefined,
                title: enrichmentDataRef.current?.discovered_title || undefined,
                location: enrichmentDataRef.current?.discovered_location || quickDataRef.current?.discovered_location || undefined,
                bio: enrichmentDataRef.current?.discovered_bio || enrichmentDataRef.current?.discovered_summary || quickDataRef.current?.discovered_bio || undefined,
              } : {
                name: user.fullName || inferNameFromEmail(user.email),
              }}
              onComplete={(enhancedSignature) => {
                if (enhancedSignature) {
                  setSignature(enhancedSignature);
                }
                handleComplete();
              }}
              onSkip={handleComplete}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default NewDiscoverFlow;
