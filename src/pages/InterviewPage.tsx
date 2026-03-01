import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PageLayout } from '@/components/layout/PageLayout';
import { authFetch } from '@/services/api/apiBase';
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

interface EnrichmentContext {
  name?: string;
  company?: string;
  title?: string;
  location?: string;
  bio?: string;
}

export default function InterviewPage() {
  const navigate = useNavigate();
  const [enrichmentContext, setEnrichmentContext] = useState<EnrichmentContext>({});
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        // Fetch user profile for enrichment context
        const profileRes = await authFetch('/user/profile');
        if (profileRes.ok) {
          const profile = await profileRes.json();
          setEnrichmentContext({
            name: profile.name || profile.full_name,
            company: profile.company,
            title: profile.title || profile.job_title,
            location: profile.location,
            bio: profile.bio,
          });
        }
      } catch {
        // Non-fatal — interview works without enrichment context
      }

      try {
        // Check if interview already completed
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
      }

      setLoading(false);
    };
    init();
  }, []);

  const handleComplete = () => {
    navigate('/soul-signature');
  };

  const handleSkip = () => {
    navigate('/soul-signature');
  };

  if (loading) {
    return (
      <PageLayout title="Deep Interview">
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin opacity-40" />
        </div>
      </PageLayout>
    );
  }

  if (alreadyDone) {
    return (
      <PageLayout title="Deep Interview">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-xl mx-auto text-center py-16"
        >
          <p className="text-2xl mb-2" style={{ fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
            Your story is already in.
          </p>
          <p className="mb-8" style={{ color: '#8A857D' }}>
            Your twin has your deep interview context. You can take it again to update your portrait.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setAlreadyDone(false)}
              className="btn-cta-app"
            >
              Redo Interview
            </button>
            <button
              onClick={() => navigate('/soul-signature')}
              className="btn-glass-app"
            >
              View Portrait
            </button>
          </div>
        </motion.div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Deep Interview">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <p className="text-sm" style={{ color: '#8A857D' }}>
            12-18 questions across 5 life domains. Your answers seed your twin with the context no platform data can capture.
          </p>
        </div>
        <DeepInterview
          enrichmentContext={enrichmentContext}
          onComplete={handleComplete}
          onSkip={handleSkip}
        />
      </div>
    </PageLayout>
  );
}
