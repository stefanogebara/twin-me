import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Sparkles, MessageCircle, LayoutDashboard } from 'lucide-react';
import { ConfirmedData } from '@/services/enrichmentService';
import { CalibrationResult } from './CalibrationStep';
import { useAnalytics } from '@/contexts/AnalyticsContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface SoulSignatureRevealStepProps {
  userId: string;
  enrichmentContext: ConfirmedData;
  calibrationData: CalibrationResult | null;
  connectedPlatforms: string[];
  onNavigate: (destination: 'twin' | 'dashboard') => void;
}

interface SoulSignature {
  archetype_name: string;
  core_traits: Array<{ trait: string; source: string }>;
  signature_quote: string;
  first_impression: string;
}

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

export const SoulSignatureRevealStep: React.FC<SoulSignatureRevealStepProps> = ({
  userId,
  enrichmentContext,
  calibrationData,
  connectedPlatforms,
  onNavigate,
}) => {
  const { trackFunnel } = useAnalytics();
  const [signature, setSignature] = useState<SoulSignature | null>(null);
  const [twinIntro, setTwinIntro] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    const generate = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_URL}/onboarding/instant-signature`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            enrichmentContext,
            calibrationInsights: calibrationData?.insights || [],
            connectedPlatforms,
          }),
        });

        if (!response.ok) throw new Error('Generation failed');

        const result = await response.json();
        if (result.success && result.signature) {
          setSignature(result.signature);
          if (result.twinIntro) setTwinIntro(result.twinIntro);
          trackFunnel('soul_signature_generated', {
            source: 'onboarding',
            has_calibration: !!(calibrationData?.insights?.length),
            platforms_connected: connectedPlatforms.length,
          });
        }
      } catch (error) {
        console.error('Signature generation error:', error);
        // Create a fallback
        setSignature({
          archetype_name: 'The Digital Explorer',
          core_traits: [],
          signature_quote: 'Your soul signature is being crafted...',
          first_impression: 'Connect more platforms to reveal your full personality portrait.',
        });
      } finally {
        setIsLoading(false);
        // Trigger reveal animation after a brief pause
        setTimeout(() => setRevealed(true), 300);
      }
    };

    generate();
  }, [enrichmentContext, calibrationData, connectedPlatforms, trackFunnel, userId]);

  const firstName = (enrichmentContext.name || '').split(' ')[0] || 'there';

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0C0C0C]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="relative mx-auto mb-6">
            <Loader2
              className="w-10 h-10 animate-spin mx-auto"
              style={{ color: '#E8D5B7' }}
            />
            <motion.div
              className="absolute inset-0 w-10 h-10 mx-auto rounded-full"
              style={{ border: '1px solid rgba(232, 213, 183, 0.15)' }}
              animate={{ scale: [1, 1.8, 1], opacity: [0.3, 0, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>
          <p
            className="text-lg"
            style={{ fontFamily: 'var(--font-heading)', color: 'rgba(232, 213, 183, 0.7)' }}
          >
            Crafting your soul signature...
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0C0C0C]">
      {/* Header */}
      <div className="flex justify-center items-center px-8 py-6">
        <div
          className="text-xl tracking-tight"
          style={{ fontFamily: 'var(--font-heading)', color: '#E8D5B7' }}
        >
          Twin Me
        </div>
      </div>

      {/* Signature Card */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 md:px-8">
        <div className="max-w-md w-full">
          {/* Pre-card text */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: revealed ? 1 : 0 }}
            transition={{ duration: 0.8 }}
            className="text-center text-base mb-6 opacity-50"
            style={{ fontFamily: 'var(--font-body)', color: '#E8D5B7' }}
          >
            {firstName}, meet your soul signature
          </motion.p>

          {/* The Card */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{
              opacity: revealed ? 1 : 0,
              y: revealed ? 0 : 20,
              scale: revealed ? 1 : 0.95,
            }}
            transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="rounded-2xl p-8 mb-8"
            style={{
              background: 'linear-gradient(145deg, rgba(232, 213, 183, 0.06) 0%, rgba(232, 213, 183, 0.02) 100%)',
              border: '1px solid rgba(232, 213, 183, 0.12)',
              backdropFilter: 'blur(20px)',
            }}
          >
            {/* Sparkle icon */}
            <div className="flex justify-center mb-4">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'rgba(232, 213, 183, 0.08)' }}
              >
                <Sparkles className="w-6 h-6" style={{ color: '#E8D5B7' }} />
              </div>
            </div>

            {/* Archetype Name */}
            <motion.h1
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: revealed ? 1 : 0, y: revealed ? 0 : 8 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="text-3xl md:text-4xl text-center mb-2"
              style={{
                fontFamily: 'var(--font-heading)',
                color: '#E8D5B7',
                fontWeight: 400,
              }}
            >
              {signature?.archetype_name || 'Your Soul Signature'}
            </motion.h1>

            {/* Signature Quote */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: revealed ? 0.7 : 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="text-center text-base italic mb-6"
              style={{ fontFamily: 'var(--font-heading)', color: '#E8D5B7' }}
            >
              "{signature?.signature_quote}"
            </motion.p>

            {/* Divider */}
            <div
              className="h-px mx-auto mb-6"
              style={{
                width: '60px',
                background: 'linear-gradient(90deg, transparent, rgba(232, 213, 183, 0.3), transparent)',
              }}
            />

            {/* Core Traits */}
            {signature?.core_traits && signature.core_traits.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: revealed ? 1 : 0 }}
                transition={{ duration: 0.6, delay: 0.7 }}
                className="space-y-3 mb-6"
              >
                {signature.core_traits.map((trait, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div
                      className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0"
                      style={{ backgroundColor: 'rgba(232, 213, 183, 0.4)' }}
                    />
                    <div>
                      <span
                        className="text-sm font-medium"
                        style={{ color: '#E8D5B7', fontFamily: 'var(--font-body)' }}
                      >
                        {trait.trait}
                      </span>
                      {trait.source && (
                        <span
                          className="text-sm opacity-40 ml-1"
                          style={{ color: '#E8D5B7', fontFamily: 'var(--font-body)' }}
                        >
                          - {trait.source}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}

            {/* First Impression */}
            {signature?.first_impression && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: revealed ? 0.6 : 0 }}
                transition={{ duration: 0.6, delay: 0.9 }}
                className="text-sm leading-relaxed text-center"
                style={{ fontFamily: 'var(--font-body)', color: '#E8D5B7' }}
              >
                {signature.first_impression}
              </motion.p>
            )}
          </motion.div>

          {/* Twin Introduction */}
          {twinIntro && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: revealed ? 1 : 0, y: revealed ? 0 : 8 }}
              transition={{ delay: 1.4, duration: 0.8 }}
              className="rounded-xl p-5 mb-6"
              style={{
                border: '1px solid rgba(232, 213, 183, 0.2)',
                background: 'rgba(232, 213, 183, 0.04)',
              }}
            >
              <p
                className="text-sm italic leading-relaxed text-center"
                style={{ fontFamily: 'var(--font-body)', color: 'rgba(232, 213, 183, 0.75)' }}
              >
                "{twinIntro}"
              </p>
            </motion.div>
          )}

          {/* Draft notice */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: revealed ? 1 : 0 }}
            transition={{ delay: 1.6 }}
            className="text-center text-xs mb-8 opacity-30"
            style={{ fontFamily: 'var(--font-body)', color: '#E8D5B7' }}
          >
            This is your first draft. Connect more platforms to refine it.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: revealed ? 1 : 0, y: revealed ? 0 : 12 }}
            transition={{ delay: 1.0, duration: 0.6 }}
            className="space-y-3"
          >
            <button
              onClick={() => onNavigate('twin')}
              className="w-full px-6 py-4 rounded-xl text-base font-medium transition-all duration-200 hover:scale-[1.01] flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #E8D5B7 0%, #D4C4A8 100%)',
                color: '#0C0C0C',
                fontFamily: 'var(--font-body)',
              }}
            >
              <MessageCircle className="w-4 h-4" />
              Let's keep talking
            </button>
            <button
              onClick={() => onNavigate('dashboard')}
              className="w-full px-6 py-4 rounded-xl text-base font-medium transition-all duration-200 hover:scale-[1.01] flex items-center justify-center gap-2"
              style={{
                backgroundColor: 'transparent',
                border: '1px solid rgba(232, 213, 183, 0.2)',
                color: '#E8D5B7',
                fontFamily: 'var(--font-body)',
              }}
            >
              <LayoutDashboard className="w-4 h-4" />
              Explore Your Dashboard
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default SoulSignatureRevealStep;
