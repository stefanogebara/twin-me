import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { authFetch, getAccessToken } from '@/services/api/apiBase';
import { useAuth } from '@/contexts/AuthContext';
import DeepInterview from './onboarding/components/DeepInterview';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

interface CalibrationData {
  completed_at?: string;
  enrichment_context?: Record<string, string | undefined>;
  archetype_hint?: string;
  personality_summary?: string;
  insights?: string[];
}

function getUserIdFromToken(): string | null {
  try {
    const token = getAccessToken() || localStorage.getItem('auth_token') || localStorage.getItem('token');
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.id || payload.userId || null;
  } catch {
    return null;
  }
}

export default function InterviewPage() {
  useDocumentTitle('Interview');
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

  const handleComplete = () => navigate('/identity');
  const handleSkip = () => navigate('/identity');

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="flex items-center justify-center h-64">
          <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ color: 'rgba(255,255,255,0.2)' }} />
        </div>
      </div>
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
      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Header */}
        <h1
          className="mb-2"
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontStyle: 'italic',
            fontSize: '28px',
            fontWeight: 400,
            color: 'var(--foreground)',
            letterSpacing: '-0.02em',
          }}
        >
          Interview Complete
        </h1>
        <p className="text-sm mb-10" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {completedDate ? `Completed ${completedDate}` : 'Your twin has your story'}
        </p>

        <div style={{ borderTop: '1px solid var(--border-glass)' }} className="mb-10" />

        {/* Archetype */}
        {(archetype || summary) && (
          <div className="mb-10">
            {archetype && (
              <>
                <span
                  className="text-[11px] font-medium tracking-widest uppercase block mb-3"
                  style={{ color: 'var(--accent-vibrant)', fontFamily: 'Inter, sans-serif' }}
                >
                  Your Archetype
                </span>
                <p
                  className="text-xl mb-3"
                  style={{
                    fontFamily: "'Instrument Serif', Georgia, serif",
                    fontWeight: 400,
                    letterSpacing: '-0.02em',
                    color: 'var(--foreground)',
                  }}
                >
                  {archetype}
                </p>
              </>
            )}
            {summary && (
              <p
                className="text-sm leading-relaxed"
                style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif" }}
              >
                {summary}
              </p>
            )}
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--border-glass)' }} className="mb-10" />

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={() => navigate('/identity')}
            className="w-full py-3.5 rounded-[100px] text-sm font-medium transition-opacity hover:opacity-90"
            style={{
              backgroundColor: '#252222',
              color: '#fdfcfb',
              fontFamily: "'Inter', sans-serif",
              cursor: 'pointer',
              minHeight: '48px',
            }}
          >
            Explore Your Soul Signature
          </button>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setAlreadyDone(false);
                setCalibrationData(null);
                // Clear saved interview progress so DeepInterview starts fresh
                localStorage.removeItem('twinme_interview_progress');
              }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-[100px] text-sm transition-opacity hover:opacity-70"
              style={{
                border: '1px solid var(--glass-surface-border, rgba(255,255,255,0.1))',
                color: 'rgba(255,255,255,0.5)',
                fontFamily: "'Inter', sans-serif",
                cursor: 'pointer',
                minHeight: '44px',
              }}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Redo Interview
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="flex-1 py-3 rounded-[100px] text-sm transition-opacity hover:opacity-70"
              style={{
                border: '1px solid var(--glass-surface-border, rgba(255,255,255,0.1))',
                color: 'rgba(255,255,255,0.5)',
                fontFamily: "'Inter', sans-serif",
                cursor: 'pointer',
                minHeight: '44px',
              }}
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-9rem)] lg:h-dvh">
      <DeepInterview
        enrichmentContext={enrichmentContext}
        onComplete={handleComplete}
        onSkip={handleSkip}
      />
    </div>
  );
}

// Note: The "Tell Your Story" header was removed because DeepInterview has its own
// "Deep Conversation" header + question counter. Reducing visual redundancy.
