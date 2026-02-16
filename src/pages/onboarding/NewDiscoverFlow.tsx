import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { enrichmentService, QuickEnrichmentData, EnrichmentData } from '@/services/enrichmentService';
import SoulOrb from './components/SoulOrb';
import ParticleField from './components/ParticleField';
import DataRevealItem from './components/DataRevealItem';
import QuickQuestionCard, { QUICK_QUESTIONS } from './components/QuickQuestionCard';
import CompactPlatformConnect from './components/CompactPlatformConnect';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Infer name from email (copied from DiscoveryStep)
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

type FlowPhase = 'entry' | 'reveal' | 'deepening' | 'complete';
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

  // Flow state
  const [phase, setPhase] = useState<FlowPhase>('entry');
  const [orbPhase, setOrbPhase] = useState<OrbPhase>('dormant');
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [narrative, setNarrative] = useState('');
  const [showContinue, setShowContinue] = useState(false);
  const [loading, setLoading] = useState(true);

  // Deepening state
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [signature, setSignature] = useState<SoulSignature | null>(null);
  const [generatingSignature, setGeneratingSignature] = useState(false);

  // Refs to prevent double-fire
  const hasStartedRef = useRef(false);
  const enrichmentDataRef = useRef<EnrichmentData | null>(null);
  const quickDataRef = useRef<QuickEnrichmentData | null>(null);

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

  // Start enrichment flow on mount
  useEffect(() => {
    if (loading || !user || hasStartedRef.current) return;
    hasStartedRef.current = true;
    startReveal();
  }, [loading, user]);

  // Show continue button after 5s in reveal phase
  useEffect(() => {
    if (phase !== 'reveal') return;
    const timer = setTimeout(() => setShowContinue(true), 5000);
    return () => clearTimeout(timer);
  }, [phase]);

  const addDataPoint = useCallback((dp: DataPoint) => {
    setDataPoints(prev => {
      if (prev.some(p => p.label === dp.label)) return prev;
      return [...prev, dp];
    });
  }, []);

  const startReveal = async () => {
    if (!user) return;
    setPhase('reveal');
    setOrbPhase('awakening');

    try {
      // Phase 1: Quick enrichment (< 1 second)
      // Pass Google OAuth name so backend can use it for better results
      const oauthName = user.fullName || undefined;
      const quickResult = await enrichmentService.quickEnrich(oauthName);
      const q = quickResult?.data;

      if (q && q.source !== 'none' && q.source !== 'error') {
        quickDataRef.current = q;
        if (q.discovered_name) addDataPoint({ icon: 'name', label: 'Name', value: q.discovered_name });
        if (q.discovered_photo) addDataPoint({ icon: 'photo', label: 'Photo', value: 'Found your photo' });
        if (q.discovered_company) addDataPoint({ icon: 'company', label: 'Company', value: q.discovered_company });
        if (q.discovered_location) addDataPoint({ icon: 'location', label: 'Location', value: q.discovered_location });
        if (q.discovered_bio) addDataPoint({ icon: 'bio', label: 'Bio', value: q.discovered_bio });
        if (q.discovered_github_url) addDataPoint({ icon: 'github', label: 'GitHub', value: 'Profile found' });
        if (q.discovered_twitter_url) addDataPoint({ icon: 'twitter', label: 'Twitter', value: 'Profile found' });
      }

      // Phase 2: Check existing full enrichment
      const statusResult = await enrichmentService.getStatus(user.id);
      if (statusResult.hasEnrichment) {
        const resultsResult = await enrichmentService.getResults(user.id);
        if (resultsResult.data) {
          enrichmentDataRef.current = resultsResult.data;
          addFullEnrichmentPoints(resultsResult.data);
          if (resultsResult.data.discovered_summary) {
            setNarrative(resultsResult.data.discovered_summary);
          }
          setOrbPhase('alive');
          return;
        }
      }

      // Phase 3: Full enrichment search
      // Prefer Google OAuth name (ground truth) over Gravatar/GitHub discovered name
      const name = user.fullName || q?.discovered_name || inferNameFromEmail(user.email);
      const searchResult = await enrichmentService.search(user.id, user.email, name);

      if (searchResult.data) {
        enrichmentDataRef.current = searchResult.data;
        addFullEnrichmentPoints(searchResult.data);
        if (searchResult.data.discovered_summary) {
          setNarrative(searchResult.data.discovered_summary);
        }
      }

      setOrbPhase('alive');
    } catch (error) {
      console.error('Enrichment error:', error);
      setOrbPhase('alive');
    }
  };

  const extractFirstLine = (text: string, maxLen = 60): string => {
    // Get first meaningful line/sentence from a block of text
    const line = text.split(/[\n•\-]/).map(s => s.trim()).find(s => s.length > 5) || text;
    return line.length > maxLen ? line.slice(0, maxLen).replace(/\s+\S*$/, '') + '...' : line;
  };

  const addFullEnrichmentPoints = (data: EnrichmentData) => {
    if (data.discovered_name) addDataPoint({ icon: 'name', label: 'Name', value: data.discovered_name });
    if (data.discovered_company) addDataPoint({ icon: 'company', label: 'Company', value: data.discovered_company });
    if (data.discovered_title) addDataPoint({ icon: 'title', label: 'Title', value: data.discovered_title });
    if (data.discovered_location) addDataPoint({ icon: 'location', label: 'Location', value: data.discovered_location });
    if (data.discovered_bio) addDataPoint({ icon: 'bio', label: 'Bio', value: data.discovered_bio });
    if (data.career_timeline && data.career_timeline.length > 20) {
      addDataPoint({ icon: 'career', label: 'Career', value: extractFirstLine(data.career_timeline) });
    }
    if (data.education && data.education.length > 10) {
      addDataPoint({ icon: 'education', label: 'Education', value: extractFirstLine(data.education) });
    }
    if (data.skills && data.skills.length > 5) {
      addDataPoint({ icon: 'skills', label: 'Skills', value: extractFirstLine(data.skills) });
    }
    if (data.discovered_github_url) addDataPoint({ icon: 'github', label: 'GitHub', value: 'Profile found' });
    if (data.discovered_twitter_url) addDataPoint({ icon: 'twitter', label: 'Twitter', value: 'Profile found' });
  };

  const handleAdvanceToDeepening = () => {
    // Confirm enrichment data if we have it
    if (user && enrichmentDataRef.current) {
      const data = enrichmentDataRef.current;
      enrichmentService.confirm(user.id, {
        name: data.discovered_name || quickDataRef.current?.discovered_name || undefined,
        company: data.discovered_company || quickDataRef.current?.discovered_company || undefined,
        title: data.discovered_title || undefined,
        location: data.discovered_location || quickDataRef.current?.discovered_location || undefined,
        bio: data.discovered_bio || data.discovered_summary || quickDataRef.current?.discovered_bio || undefined,
        github_url: data.discovered_github_url || quickDataRef.current?.discovered_github_url || undefined,
      }).catch(err => console.warn('Confirm error:', err));
    }
    setPhase('deepening');
  };

  const handleQuestionAnswer = (questionId: string, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const allQuestionsAnswered = QUICK_QUESTIONS.every(q => answers[q.id]);

  // Generate soul signature when all questions are answered
  useEffect(() => {
    if (!allQuestionsAnswered || generatingSignature || signature) return;
    generateSignature();
  }, [allQuestionsAnswered]);

  const generateSignature = async () => {
    if (!user) return;
    setGeneratingSignature(true);

    try {
      const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
      const enrichment = enrichmentDataRef.current;
      const quick = quickDataRef.current;

      const enrichmentContext = {
        name: enrichment?.discovered_name || quick?.discovered_name || user.fullName || inferNameFromEmail(user.email),
        company: enrichment?.discovered_company || quick?.discovered_company || undefined,
        title: enrichment?.discovered_title || undefined,
        location: enrichment?.discovered_location || quick?.discovered_location || undefined,
        bio: enrichment?.discovered_bio || enrichment?.discovered_summary || quick?.discovered_bio || undefined,
      };

      // Convert question answers to calibration insights
      const calibrationInsights = Object.entries(answers).map(([qId, answer]) => {
        const question = QUICK_QUESTIONS.find(q => q.id === qId);
        return question ? `${question.question} "${answer}"` : '';
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
        }
      }
    } catch (error) {
      console.error('Signature generation error:', error);
    } finally {
      setGeneratingSignature(false);
    }
  };

  const handleComplete = () => {
    setPhase('complete');
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
    <div className="min-h-screen bg-[#0C0C0C] relative overflow-hidden">
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,400&family=Space+Grotesk:wght@300;400;500&display=swap');
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Particle background */}
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
      <div className="relative z-10 flex flex-col items-center px-6 md:px-8">
        <AnimatePresence mode="wait">
          {/* ===== PHASE: ENTRY / REVEAL ===== */}
          {(phase === 'entry' || phase === 'reveal') && (
            <motion.div
              key="reveal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.6 }}
              className="flex flex-col items-center w-full max-w-lg"
            >
              {/* Status text */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-sm uppercase tracking-widest mb-8 text-center"
                style={{
                  color: 'rgba(232, 213, 183, 0.5)',
                  fontFamily: 'var(--font-body)',
                  letterSpacing: '0.15em',
                }}
              >
                {orbPhase === 'dormant' && 'Discovering you...'}
                {orbPhase === 'awakening' && 'Piecing together your story...'}
                {orbPhase === 'alive' && `Hello, ${userName.split(' ')[0]}`}
              </motion.p>

              {/* Soul Orb */}
              <div className="mb-8">
                <SoulOrb phase={orbPhase} dataPointCount={dataPoints.length} />
              </div>

              {/* Profile photo overlay */}
              <AnimatePresence>
                {quickDataRef.current?.discovered_photo && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    className="absolute flex items-center justify-center"
                    style={{
                      top: '50%',
                      transform: 'translateY(-80px)',
                    }}
                  >
                    <img
                      src={quickDataRef.current.discovered_photo}
                      alt=""
                      className="w-16 h-16 rounded-full object-cover"
                      style={{ border: '2px solid rgba(232, 213, 183, 0.3)' }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Data points reveal */}
              {dataPoints.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="w-full max-w-sm mt-4"
                >
                  {dataPoints.map((dp, i) => (
                    <DataRevealItem
                      key={dp.label}
                      icon={dp.icon}
                      label={dp.label}
                      value={dp.value}
                    />
                  ))}
                </motion.div>
              )}

              {/* Narrative */}
              <AnimatePresence>
                {narrative && (
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.3 }}
                    className="text-base leading-relaxed mt-6 text-center max-w-md"
                    style={{
                      color: 'rgba(232, 213, 183, 0.7)',
                      fontFamily: 'var(--font-heading)',
                      fontStyle: 'italic',
                    }}
                  >
                    {narrative}
                  </motion.p>
                )}
              </AnimatePresence>

              {/* Continue button */}
              <AnimatePresence>
                {(showContinue || orbPhase === 'alive') && (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    onClick={handleAdvanceToDeepening}
                    className="mt-8 px-8 py-3 rounded-full text-base flex items-center gap-2 transition-all duration-200 hover:scale-[1.03]"
                    style={{
                      background: 'linear-gradient(135deg, #E8D5B7 0%, #D4C4A8 100%)',
                      color: '#0C0C0C',
                      fontFamily: 'var(--font-body)',
                      fontWeight: 500,
                    }}
                  >
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ===== PHASE: DEEPENING ===== */}
          {phase === 'deepening' && (
            <motion.div
              key="deepening"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.6 }}
              className="w-full max-w-lg"
            >
              {/* Heading */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-center mb-8"
              >
                <h2
                  className="text-2xl md:text-3xl mb-2"
                  style={{ fontFamily: 'var(--font-heading)', color: '#E8D5B7' }}
                >
                  A few quick taps
                </h2>
                <p
                  className="text-sm opacity-50"
                  style={{ fontFamily: 'var(--font-body)', color: '#E8D5B7' }}
                >
                  Help us understand your vibe
                </p>
              </motion.div>

              {/* Quick Questions */}
              {QUICK_QUESTIONS.map((q, i) => (
                <QuickQuestionCard
                  key={q.id}
                  question={q}
                  selectedAnswer={answers[q.id] || null}
                  onAnswer={handleQuestionAnswer}
                  index={i}
                />
              ))}

              {/* Platform Connect */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-8 mb-6"
              >
                <CompactPlatformConnect userId={user.id} />
              </motion.div>

              {/* Soul Signature Card (shows after all questions answered) */}
              <AnimatePresence>
                {generatingSignature && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center justify-center gap-3 py-6"
                  >
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#E8D5B7' }} />
                    <span
                      className="text-sm"
                      style={{ color: 'rgba(232, 213, 183, 0.6)', fontFamily: 'var(--font-body)' }}
                    >
                      Crafting your soul signature...
                    </span>
                  </motion.div>
                )}

                {signature && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                    className="rounded-2xl p-6 mb-6"
                    style={{
                      backgroundColor: 'rgba(232, 213, 183, 0.06)',
                      border: '1px solid rgba(232, 213, 183, 0.15)',
                    }}
                  >
                    <p
                      className="text-xs uppercase tracking-widest mb-3"
                      style={{
                        color: 'rgba(232, 213, 183, 0.4)',
                        fontFamily: 'var(--font-body)',
                        letterSpacing: '0.15em',
                      }}
                    >
                      Your Soul Signature
                    </p>
                    <h3
                      className="text-xl mb-2"
                      style={{ fontFamily: 'var(--font-heading)', color: '#E8D5B7' }}
                    >
                      {signature.archetype_name}
                    </h3>
                    <p
                      className="text-sm mb-3"
                      style={{
                        color: 'rgba(232, 213, 183, 0.7)',
                        fontFamily: 'var(--font-heading)',
                        fontStyle: 'italic',
                      }}
                    >
                      "{signature.signature_quote}"
                    </p>
                    <p
                      className="text-sm leading-relaxed"
                      style={{
                        color: 'rgba(232, 213, 183, 0.6)',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      {signature.first_impression}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* CTA Button */}
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: allQuestionsAnswered ? 1 : 0.4 }}
                onClick={handleComplete}
                disabled={!allQuestionsAnswered && !signature}
                className="w-full px-6 py-4 rounded-xl text-base font-medium transition-all duration-200 hover:scale-[1.01] flex items-center justify-center gap-2 mb-8"
                style={{
                  background: allQuestionsAnswered
                    ? 'linear-gradient(135deg, #E8D5B7 0%, #D4C4A8 100%)'
                    : 'transparent',
                  color: allQuestionsAnswered ? '#0C0C0C' : '#E8D5B7',
                  border: allQuestionsAnswered ? 'none' : '1px solid rgba(232, 213, 183, 0.2)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {generatingSignature ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Enter My World
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default NewDiscoverFlow;
