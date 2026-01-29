import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { DiscoveryStep } from './steps/DiscoveryStep';
import { ResumeUploadStep } from './steps/ResumeUploadStep';
import { LinkedInConnectStep } from './steps/LinkedInConnectStep';
import { enrichmentService, EnrichmentData, ConfirmedData, ResumeUploadResponse } from '@/services/enrichmentService';
import { Loader2 } from 'lucide-react';

/**
 * EnrichedOnboardingFlow
 *
 * A 3-step onboarding flow that:
 * 1. Discovers information about the user from the web (Discovery)
 * 2. Optionally collects their resume/CV for more context (Resume Upload)
 * 3. Connects their LinkedIn for professional profile (LinkedIn Connect)
 *
 * This creates a magical first impression by showing users
 * what we already know about them, then enriching with more data.
 */

type OnboardingStep = 'discovery' | 'resume' | 'linkedin' | 'complete';

interface OnboardingState {
  step: OnboardingStep;
  discoveryData: ConfirmedData | null;
  resumeData: ResumeUploadResponse['data'] | null;
  linkedInConnected: boolean;
}

const EnrichedOnboardingFlow: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [state, setState] = useState<OnboardingState>({
    step: 'discovery',
    discoveryData: null,
    resumeData: null,
    linkedInConnected: false
  });

  const [enrichmentData, setEnrichmentData] = useState<EnrichmentData | null>(null);
  const [loading, setLoading] = useState(true);

  // Check if user has already completed onboarding
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      if (!user?.id) return;

      try {
        setLoading(true);

        // Check enrichment status
        const statusResult = await enrichmentService.getStatus(user.id);

        if (statusResult.isConfirmed) {
          // User has already confirmed their identity - skip to dashboard
          navigate('/dashboard');
          return;
        }

        // Check if there's existing enrichment data
        if (statusResult.hasEnrichment) {
          const resultsResult = await enrichmentService.getResults(user.id);
          if (resultsResult.data) {
            setEnrichmentData(resultsResult.data);
          }
        }

        setLoading(false);
      } catch (error) {
        console.error('Error checking onboarding status:', error);
        setLoading(false);
      }
    };

    if (!authLoading && user) {
      checkOnboardingStatus();
    } else if (!authLoading && !user) {
      // Not logged in, redirect to login
      navigate('/login');
    }
  }, [user, authLoading, navigate]);

  // Handle discovery step completion
  const handleDiscoveryComplete = async (data: ConfirmedData) => {
    setState(prev => ({
      ...prev,
      step: 'resume',
      discoveryData: data
    }));

    // Fetch updated enrichment data
    if (user?.id) {
      try {
        const resultsResult = await enrichmentService.getResults(user.id);
        if (resultsResult.data) {
          setEnrichmentData(resultsResult.data);
        }
      } catch (error) {
        console.error('Error fetching enrichment results:', error);
      }
    }
  };

  // Handle resume upload step completion
  const handleResumeComplete = (data: ResumeUploadResponse['data']) => {
    setState(prev => ({
      ...prev,
      step: 'linkedin',
      resumeData: data
    }));

    // Update enrichment data with resume info if available
    if (data?.summary) {
      setEnrichmentData(prev => prev ? {
        ...prev,
        discovered_name: data.summary?.name || prev.discovered_name,
        discovered_title: data.summary?.current_role || prev.discovered_title,
        discovered_company: data.summary?.current_company || prev.discovered_company,
        education: data.summary?.education_summary || prev.education
      } : null);
    }
  };

  // Handle resume skip
  const handleResumeSkip = () => {
    setState(prev => ({
      ...prev,
      step: 'linkedin'
    }));
  };

  // Handle LinkedIn connect step completion
  const handleLinkedInComplete = (connected: boolean) => {
    setState(prev => ({
      ...prev,
      linkedInConnected: connected,
      step: 'complete'
    }));

    // Navigate to dashboard
    setTimeout(() => {
      navigate('/dashboard');
    }, 500);
  };

  // Handle LinkedIn skip
  const handleLinkedInSkip = () => {
    // Navigate to dashboard even without LinkedIn
    navigate('/dashboard');
  };

  // Handle discovery skip
  const handleDiscoverySkip = () => {
    // Skip directly to resume
    setState(prev => ({
      ...prev,
      step: 'resume'
    }));
  };

  // Show loading while checking auth and onboarding status
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0C0C0C]">
        <div className="text-center">
          <Loader2
            className="w-8 h-8 animate-spin mx-auto mb-4"
            style={{ color: '#E8D5B7' }}
          />
          <p style={{ color: 'rgba(232, 213, 183, 0.6)', fontFamily: "'Space Grotesk', sans-serif" }}>
            Preparing your experience...
          </p>
        </div>
      </div>
    );
  }

  // User not logged in
  if (!user) {
    return null;
  }

  // Render current step
  switch (state.step) {
    case 'discovery':
      return (
        <DiscoveryStep
          userId={user.id}
          userEmail={user.email || ''}
          userName={user.name || user.email?.split('@')[0]}
          onComplete={handleDiscoveryComplete}
          onSkip={handleDiscoverySkip}
        />
      );

    case 'resume':
      return (
        <ResumeUploadStep
          userId={user.id}
          userName={state.discoveryData?.name || user.name || user.email?.split('@')[0]}
          onComplete={handleResumeComplete}
          onSkip={handleResumeSkip}
        />
      );

    case 'linkedin':
      return (
        <LinkedInConnectStep
          userId={user.id}
          userName={state.discoveryData?.name || user.name}
          enrichmentData={enrichmentData}
          onComplete={handleLinkedInComplete}
          onSkip={handleLinkedInSkip}
        />
      );

    case 'complete':
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0C0C0C]">
          <div className="text-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)' }}
            >
              <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2
              className="text-2xl mb-2"
              style={{ fontFamily: "'Cormorant Garamond', serif", color: '#E8D5B7' }}
            >
              Setup Complete
            </h2>
            <p style={{ color: 'rgba(232, 213, 183, 0.6)', fontFamily: "'Space Grotesk', sans-serif" }}>
              Taking you to your dashboard...
            </p>
          </div>
        </div>
      );

    default:
      return null;
  }
};

export default EnrichedOnboardingFlow;
