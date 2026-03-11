import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, Brain, RefreshCw } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import { authFetch } from '@/services/api/apiBase';
import { useAuth } from '@/contexts/AuthContext';
import DeepInterview from './onboarding/components/DeepInterview';

interface CalibrationData {
  completed_at?: string;
  enrichment_context?: Record<string, string | undefined>;
  archetype_hint?: string;
  personality_summary?: string;
  insights?: string[];
}

function getUserIdFromToken(): string | null {
  try {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.id || payload.userId || null;
  } catch {
    return null;
  }
}

export default function InterviewPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [calibrationData, setCalibrationData] = useState<CalibrationData | null>(null);
  const [enrichmentContext, setEnrichmentContext] = useState<Record<string, string | undefined>>({
    name: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : undefined,
  });
  const initRan = useRef(false);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;

    const checkCompletion = async () => {
      try {
        const userId = getUserIdFromToken();
        if (userId) {
          const res = await authFetch(`/onboarding/calibration-data/${userId}`);
          if (res.ok) {
            const { data } = await res.json();
            if (data?.completed_at) {
              setAlreadyDone(true);
              setCalibrationData(data);
            }
            // Reuse enrichment_context from previous calibration if available
            if (data?.enrichment_context) {
              setEnrichmentContext(prev => ({ ...prev, ...data.enrichment_context }));
            }
          }
        }
      } catch {
        // Non-fatal
      } finally {
        setLoading(false);
      }
    };

    checkCompletion();
  }, []);

  const handleComplete = () => {
    navigate('/identity');
  };

  const handleSkip = () => {
    navigate('/identity');
  };

  if (loading) {
    return (
      <PageLayout title="Tell Your Story">
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin opacity-40" />
        </div>
      </PageLayout>
    );
  }

  if (alreadyDone) {
    const archetype = calibrationData?.archetype_hint;
    const summary = calibrationData?.personality_summary;
    const completedDate = calibrationData?.completed_at
      ? new Date(calibrationData.completed_at).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : null;

    return (
      <PageLayout title="Tell Your Story">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-xl mx-auto py-12"
        >
          {/* Celebration header */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
              className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4"
              style={{
                backgroundColor: 'var(--accent-vibrant-glow)',
                border: '1px solid var(--glass-surface-border)',
              }}
            >
              <Sparkles className="w-6 h-6" style={{ color: 'var(--accent-vibrant)' }} />
            </motion.div>

            <h2
              className="text-2xl md:text-3xl mb-2"
              style={{
                fontFamily: 'Instrument Serif, Georgia, serif',
                fontWeight: 400,
                letterSpacing: '-0.02em',
                color: 'var(--foreground)',
              }}
            >
              Interview Complete
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {completedDate ? `Completed ${completedDate}` : 'Your twin has your story'}
            </p>
          </div>

          {/* Archetype card */}
          {(archetype || summary) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-2xl p-6 mb-6"
              style={{
                backgroundColor: 'var(--glass-surface-bg)',
                backdropFilter: 'blur(42px)',
                WebkitBackdropFilter: 'blur(42px)',
                border: '1px solid var(--glass-surface-border)',
                boxShadow: '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
              }}
            >
              {archetype && (
                <div className="flex items-center gap-2 mb-3">
                  <Brain className="w-4 h-4" style={{ color: 'var(--accent-vibrant)' }} />
                  <span
                    className="text-xs uppercase tracking-widest"
                    style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}
                  >
                    Your Archetype
                  </span>
                </div>
              )}
              {archetype && (
                <p
                  className="text-xl mb-3"
                  style={{
                    fontFamily: 'Instrument Serif, Georgia, serif',
                    fontWeight: 400,
                    letterSpacing: '-0.02em',
                    color: 'var(--foreground)',
                  }}
                >
                  {archetype}
                </p>
              )}
              {summary && (
                <p
                  className="text-sm leading-relaxed"
                  style={{
                    color: 'var(--text-secondary)',
                    fontFamily: 'Inter, sans-serif',
                  }}
                >
                  {summary}
                </p>
              )}
            </motion.div>
          )}

          {/* Action buttons */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="flex flex-col gap-3"
          >
            {/* Primary CTA — Explore Identity */}
            <button
              onClick={() => navigate('/identity')}
              className="w-full px-6 py-4 rounded-[100px] text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 hover:scale-[1.01]"
              style={{
                backgroundColor: '#252222',
                color: '#fdfcfb',
              }}
            >
              Explore Your Soul Signature
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* Secondary actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setAlreadyDone(false);
                  setCalibrationData(null);
                }}
                className="flex-1 px-4 py-3 rounded-[100px] text-sm flex items-center justify-center gap-2 transition-all duration-200 hover:scale-[1.01]"
                style={{
                  backgroundColor: 'var(--glass-surface-bg)',
                  border: '1px solid var(--glass-surface-border)',
                  color: 'var(--text-secondary)',
                }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Redo Interview
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="flex-1 px-4 py-3 rounded-[100px] text-sm flex items-center justify-center gap-2 transition-all duration-200 hover:scale-[1.01]"
                style={{
                  backgroundColor: 'var(--glass-surface-bg)',
                  border: '1px solid var(--glass-surface-border)',
                  color: 'var(--text-secondary)',
                }}
              >
                Back to Home
              </button>
            </div>
          </motion.div>
        </motion.div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Tell Your Story">
      <div className="max-w-2xl mx-auto">
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          A quick conversation across 5 life domains. Your answers seed your twin with the context no platform data can capture.
        </p>
        <div
          className="rounded-2xl p-6"
          style={{ backgroundColor: 'var(--glass-surface-bg)', border: '1px solid var(--glass-surface-border)' }}
        >
          <DeepInterview
            enrichmentContext={enrichmentContext}
            onComplete={handleComplete}
            onSkip={handleSkip}
          />
        </div>
      </div>
    </PageLayout>
  );
}
