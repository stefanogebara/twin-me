import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PageLayout } from '@/components/layout/PageLayout';
import { authFetch } from '@/services/api/apiBase';
import { useAuth } from '@/contexts/AuthContext';
import DeepInterview from './onboarding/components/DeepInterview';

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
  const initRan = useRef(false);

  // Build enrichment context from AuthContext user — no extra API call needed
  const enrichmentContext = {
    name: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : undefined,
  };

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
            if (data?.completed_at) setAlreadyDone(true);
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
    navigate('/get-started');
  };

  const handleSkip = () => {
    navigate('/get-started');
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
    return (
      <PageLayout title="Tell Your Story">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-xl mx-auto text-center py-16"
        >
          <p className="text-2xl mb-2" style={{ fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
            Your story is already in.
          </p>
          <p className="mb-8" style={{ color: '#8A857D' }}>
            Your twin has your interview context. You can redo it to update your portrait.
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => setAlreadyDone(false)} className="btn-cta-app">
              Redo Interview
            </button>
            <button onClick={() => navigate('/dashboard')} className="btn-glass-app">
              Back to Home
            </button>
          </div>
        </motion.div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Tell Your Story">
      <div className="max-w-2xl mx-auto">
        <p className="text-sm mb-6" style={{ color: '#8A857D' }}>
          12-18 questions across 5 life domains. Your answers seed your twin with the context no platform data can capture.
        </p>
        {/* Dark container — DeepInterview uses cream (#E8D5B7) text designed for dark backgrounds */}
        <div
          className="rounded-2xl p-6"
          style={{ backgroundColor: '#1a1814', border: '1px solid rgba(232,213,183,0.1)' }}
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
