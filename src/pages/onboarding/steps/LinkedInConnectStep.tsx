import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Linkedin, Loader2, Check, ChevronRight, ExternalLink, User, Briefcase, GraduationCap, MapPin } from 'lucide-react';
import { enrichmentService, EnrichmentData } from '@/services/enrichmentService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface LinkedInConnectStepProps {
  userId: string;
  userName?: string;
  enrichmentData?: EnrichmentData | null;
  onComplete: (connected: boolean) => void;
  onSkip: () => void;
}

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

interface LinkedInProfile {
  name?: string;
  email?: string;
  picture?: string;
  locale?: string;
}

export const LinkedInConnectStep: React.FC<LinkedInConnectStepProps> = ({
  userId,
  userName,
  enrichmentData,
  onComplete,
  onSkip
}) => {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [profile, setProfile] = useState<LinkedInProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check if already connected on mount
  useEffect(() => {
    checkConnectionStatus();
  }, []);

  // Listen for OAuth callback message
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Security: only accept messages from our own origin
      if (event.origin !== window.location.origin) return;

      if (event.data.type === 'OAUTH_SUCCESS' && event.data.platform === 'linkedin') {
        console.log('LinkedIn OAuth success received');
        setStatus('connected');
        // Fetch profile data
        fetchLinkedInProfile();
      } else if (event.data.type === 'OAUTH_ERROR' && event.data.platform === 'linkedin') {
        console.error('LinkedIn OAuth error:', event.data.error);
        setStatus('error');
        setError(event.data.error || 'Failed to connect to LinkedIn');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkConnectionStatus = async () => {
    try {
      const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`${API_URL}/professional/linkedin/status`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data?.connected) {
          setStatus('connected');
          await fetchLinkedInProfile();
        }
      }
    } catch (err) {
      console.error('Error checking LinkedIn status:', err);
    }
  };

  const fetchLinkedInProfile = async () => {
    try {
      const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
      if (!token) return;

      // Get profile from user_platform_data
      const response = await fetch(`${API_URL}/soul-data/platform/linkedin?userId=${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          setProfile(result.data.raw_data || result.data);
        }
      }
    } catch (err) {
      console.error('Error fetching LinkedIn profile:', err);
    }
  };

  const initiateLinkedInConnect = useCallback(async () => {
    setStatus('connecting');
    setError(null);

    try {
      const token = localStorage.getItem('auth_token') || localStorage.getItem('token');

      const response = await fetch(`${API_URL}/professional/connect/linkedin?userId=${userId}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });

      if (!response.ok) {
        throw new Error('Failed to initiate LinkedIn connection');
      }

      const result = await response.json();

      if (result.success && result.authUrl) {
        // Open OAuth popup
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        const popup = window.open(
          result.authUrl,
          'LinkedIn OAuth',
          `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
        );

        // Poll for popup close (fallback if postMessage doesn't work)
        const pollTimer = setInterval(() => {
          if (popup?.closed) {
            clearInterval(pollTimer);
            // Check if we're connected now
            checkConnectionStatus();
          }
        }, 500);

        // Clear poll after 5 minutes
        setTimeout(() => clearInterval(pollTimer), 300000);
      } else {
        throw new Error(result.error || 'Failed to get authorization URL');
      }
    } catch (err) {
      console.error('LinkedIn connect error:', err);
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to connect to LinkedIn');
    }
  }, [userId]);

  const handleContinue = () => {
    onComplete(status === 'connected');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0C0C0C]">
      <style>
        {`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,400&family=Space+Grotesk:wght@300;400;500&display=swap');`}
      </style>

      {/* Header */}
      <div className="flex justify-between items-center px-8 py-6">
        <div
          className="text-xl tracking-tight"
          style={{ fontFamily: "'Cormorant Garamond', serif", color: '#E8D5B7' }}
        >
          Twin Me
        </div>
        <button
          onClick={onSkip}
          className="text-sm tracking-wide uppercase opacity-40 hover:opacity-80 transition-opacity"
          style={{ fontFamily: "'Space Grotesk', sans-serif", color: '#E8D5B7', letterSpacing: '0.1em' }}
        >
          Skip
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 px-6 md:px-8">
        <div className="max-w-2xl mx-auto py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h1
              className="text-3xl md:text-4xl mb-4"
              style={{ fontFamily: "'Cormorant Garamond', serif", color: '#E8D5B7' }}
            >
              {status === 'connected' ? 'Connected to LinkedIn' : 'Connect your LinkedIn'}
            </h1>
            <p
              className="text-base mb-8 opacity-70"
              style={{ fontFamily: "'Space Grotesk', sans-serif", color: '#E8D5B7' }}
            >
              {status === 'connected'
                ? "Your professional identity is now part of your soul signature."
                : "Link your professional profile to enrich your soul signature with career insights."}
            </p>

            {/* Enrichment Summary (from previous steps) */}
            {enrichmentData && (status === 'idle' || status === 'connecting') && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-8 p-6 rounded-xl"
                style={{
                  backgroundColor: 'rgba(232, 213, 183, 0.03)',
                  border: '1px solid rgba(232, 213, 183, 0.1)'
                }}
              >
                <h3
                  className="text-sm uppercase tracking-wider mb-4"
                  style={{ fontFamily: "'Space Grotesk', sans-serif", color: 'rgba(232, 213, 183, 0.5)', letterSpacing: '0.1em' }}
                >
                  What we know so far
                </h3>

                <div className="space-y-3">
                  {enrichmentData.discovered_name && (
                    <div className="flex items-center gap-3">
                      <User className="w-4 h-4" style={{ color: 'rgba(232, 213, 183, 0.4)' }} />
                      <span style={{ fontFamily: "'Space Grotesk', sans-serif", color: 'rgba(232, 213, 183, 0.8)' }}>
                        {enrichmentData.discovered_name}
                      </span>
                    </div>
                  )}

                  {(enrichmentData.discovered_title || enrichmentData.discovered_company) && (
                    <div className="flex items-center gap-3">
                      <Briefcase className="w-4 h-4" style={{ color: 'rgba(232, 213, 183, 0.4)' }} />
                      <span style={{ fontFamily: "'Space Grotesk', sans-serif", color: 'rgba(232, 213, 183, 0.8)' }}>
                        {enrichmentData.discovered_title}
                        {enrichmentData.discovered_company && ` at ${enrichmentData.discovered_company}`}
                      </span>
                    </div>
                  )}

                  {enrichmentData.education && (
                    <div className="flex items-center gap-3">
                      <GraduationCap className="w-4 h-4" style={{ color: 'rgba(232, 213, 183, 0.4)' }} />
                      <span
                        className="line-clamp-1"
                        style={{ fontFamily: "'Space Grotesk', sans-serif", color: 'rgba(232, 213, 183, 0.8)' }}
                      >
                        {enrichmentData.education.split('\n')[0]}
                      </span>
                    </div>
                  )}

                  {enrichmentData.discovered_location && (
                    <div className="flex items-center gap-3">
                      <MapPin className="w-4 h-4" style={{ color: 'rgba(232, 213, 183, 0.4)' }} />
                      <span style={{ fontFamily: "'Space Grotesk', sans-serif", color: 'rgba(232, 213, 183, 0.8)' }}>
                        {enrichmentData.discovered_location}
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Connection States */}
            {status === 'idle' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <button
                  onClick={initiateLinkedInConnect}
                  className="w-full p-6 rounded-xl flex items-center gap-4 transition-all duration-200 hover:scale-[1.01]"
                  style={{
                    backgroundColor: '#0077B5',
                    border: 'none'
                  }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: 'rgba(255, 255, 255, 0.15)' }}
                  >
                    <Linkedin className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <p
                      className="text-base font-medium text-white"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    >
                      Connect with LinkedIn
                    </p>
                    <p
                      className="text-sm text-white/60"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    >
                      Import your professional profile
                    </p>
                  </div>
                  <ExternalLink className="w-5 h-5 text-white/60" />
                </button>

                <p
                  className="text-xs text-center"
                  style={{ color: 'rgba(232, 213, 183, 0.4)' }}
                >
                  We only access your public profile information
                </p>
              </motion.div>
            )}

            {status === 'connecting' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-12"
              >
                <Loader2
                  className="w-12 h-12 animate-spin mx-auto mb-4"
                  style={{ color: '#E8D5B7' }}
                />
                <p
                  className="text-base"
                  style={{ fontFamily: "'Space Grotesk', sans-serif", color: 'rgba(232, 213, 183, 0.8)' }}
                >
                  Connecting to LinkedIn...
                </p>
                <p
                  className="text-sm mt-2"
                  style={{ color: 'rgba(232, 213, 183, 0.5)' }}
                >
                  Complete the authorization in the popup window
                </p>
              </motion.div>
            )}

            {status === 'connected' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Success Card */}
                <div
                  className="p-6 rounded-xl"
                  style={{
                    backgroundColor: 'rgba(232, 213, 183, 0.05)',
                    border: '1px solid rgba(232, 213, 183, 0.15)'
                  }}
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)' }}
                    >
                      <Check className="w-6 h-6 text-green-400" />
                    </div>
                    <div>
                      <p
                        className="text-lg"
                        style={{ fontFamily: "'Cormorant Garamond', serif", color: '#E8D5B7' }}
                      >
                        LinkedIn Connected
                      </p>
                      <p
                        className="text-sm"
                        style={{ fontFamily: "'Space Grotesk', sans-serif", color: 'rgba(232, 213, 183, 0.6)' }}
                      >
                        Your professional identity is linked
                      </p>
                    </div>
                  </div>

                  {/* Profile Info */}
                  {profile && (
                    <div className="flex items-center gap-4 pt-4" style={{ borderTop: '1px solid rgba(232, 213, 183, 0.1)' }}>
                      {profile.picture ? (
                        <img
                          src={profile.picture}
                          alt={profile.name || 'Profile'}
                          className="w-12 h-12 rounded-full"
                        />
                      ) : (
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: 'rgba(232, 213, 183, 0.1)' }}
                        >
                          <User className="w-6 h-6" style={{ color: 'rgba(232, 213, 183, 0.6)' }} />
                        </div>
                      )}
                      <div>
                        <p
                          className="text-base"
                          style={{ fontFamily: "'Space Grotesk', sans-serif", color: '#E8D5B7' }}
                        >
                          {profile.name || userName || 'Professional Profile'}
                        </p>
                        {profile.email && (
                          <p
                            className="text-sm"
                            style={{ color: 'rgba(232, 213, 183, 0.5)' }}
                          >
                            {profile.email}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Continue Button */}
                <button
                  onClick={handleContinue}
                  className="w-full px-6 py-4 rounded-xl text-base font-medium transition-all duration-200 flex items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(135deg, #E8D5B7 0%, #D4C4A8 100%)',
                    color: '#0C0C0C',
                    fontFamily: "'Space Grotesk', sans-serif"
                  }}
                >
                  Continue to Dashboard
                  <ChevronRight className="w-5 h-5" />
                </button>
              </motion.div>
            )}

            {status === 'error' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div
                  className="p-6 rounded-xl"
                  style={{
                    backgroundColor: 'rgba(220, 38, 38, 0.1)',
                    border: '1px solid rgba(220, 38, 38, 0.3)'
                  }}
                >
                  <p className="text-sm text-red-400 mb-2">Connection failed</p>
                  <p className="text-xs text-red-400/70">{error}</p>
                </div>

                <button
                  onClick={initiateLinkedInConnect}
                  className="w-full px-6 py-4 rounded-xl text-base font-medium transition-all duration-200"
                  style={{
                    backgroundColor: 'rgba(232, 213, 183, 0.1)',
                    border: '1px solid rgba(232, 213, 183, 0.2)',
                    color: '#E8D5B7',
                    fontFamily: "'Space Grotesk', sans-serif"
                  }}
                >
                  Try Again
                </button>

                <button
                  onClick={() => onComplete(false)}
                  className="w-full text-sm opacity-50 hover:opacity-80 transition-opacity"
                  style={{ color: '#E8D5B7' }}
                >
                  Skip for now
                </button>
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default LinkedInConnectStep;
