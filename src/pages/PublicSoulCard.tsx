import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, Loader2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface PublicSignature {
  archetype_name: string;
  archetype_subtitle: string;
  narrative: string;
  defining_traits: Array<{ trait: string; source?: string; score?: number; evidence?: string }>;
  first_name: string | null;
  avatar_url: string | null;
  updated_at: string;
}

const PublicSoulCard: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const [signature, setSignature] = useState<PublicSignature | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchSignature = async () => {
      if (!userId) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/soul-signature/public/${userId}`);
        if (!response.ok) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        const result = await response.json();
        if (result.success && result.signature) {
          setSignature(result.signature);
        } else {
          setNotFound(true);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    fetchSignature();
  }, [userId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0C0C0C]">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#E8D5B7' }} />
      </div>
    );
  }

  if (notFound || !signature) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0C0C0C] px-6">
        <div className="text-center max-w-sm">
          <Sparkles className="w-10 h-10 mx-auto mb-4" style={{ color: 'rgba(232, 213, 183, 0.3)' }} />
          <h1
            className="text-xl mb-2"
            style={{ fontFamily: 'var(--font-heading)', color: '#E8D5B7' }}
          >
            Soul Signature Not Found
          </h1>
          <p
            className="text-sm opacity-50 mb-6"
            style={{ fontFamily: 'var(--font-body)', color: '#E8D5B7' }}
          >
            This soul signature is private or doesn't exist yet.
          </p>
          <a
            href="/"
            className="text-sm px-6 py-3 rounded-xl inline-block transition-all hover:scale-[1.01]"
            style={{
              background: 'linear-gradient(135deg, #E8D5B7 0%, #D4C4A8 100%)',
              color: '#0C0C0C',
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            Discover Your Soul Signature
          </a>
        </div>
      </div>
    );
  }

  const traits = signature.defining_traits || [];
  const updatedDate = signature.updated_at
    ? new Date(signature.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#0C0C0C]">
      {/* Header */}
      <div className="flex justify-center items-center px-8 py-6">
        <a
          href="/"
          className="text-xl tracking-tight transition-opacity hover:opacity-70"
          style={{ fontFamily: 'var(--font-heading)', color: '#E8D5B7', textDecoration: 'none' }}
        >
          Twin Me
        </a>
      </div>

      {/* Card */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 md:px-8 pb-12">
        <div className="max-w-md w-full">
          {/* Pre-card text */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="text-center text-base mb-6 opacity-50"
            style={{ fontFamily: 'var(--font-body)', color: '#E8D5B7' }}
          >
            {signature.first_name ? `${signature.first_name}'s Soul Signature` : 'A Soul Signature'}
          </motion.p>

          {/* The Card */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="rounded-2xl p-8 mb-6"
            style={{
              background: 'linear-gradient(145deg, rgba(232, 213, 183, 0.06) 0%, rgba(232, 213, 183, 0.02) 100%)',
              border: '1px solid rgba(232, 213, 183, 0.12)',
              backdropFilter: 'blur(20px)',
            }}
          >
            {/* Avatar + Sparkle */}
            <div className="flex justify-center mb-4">
              {signature.avatar_url ? (
                <img
                  src={signature.avatar_url}
                  alt=""
                  className="w-16 h-16 rounded-full object-cover"
                  style={{ border: '2px solid rgba(232, 213, 183, 0.15)' }}
                />
              ) : (
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(232, 213, 183, 0.08)' }}
                >
                  <Sparkles className="w-6 h-6" style={{ color: '#E8D5B7' }} />
                </div>
              )}
            </div>

            {/* Archetype Name */}
            <motion.h1
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-3xl md:text-4xl text-center mb-2"
              style={{
                fontFamily: 'var(--font-heading)',
                color: '#E8D5B7',
                fontWeight: 400,
              }}
            >
              {signature.archetype_name}
            </motion.h1>

            {/* Subtitle / Quote */}
            {signature.archetype_subtitle && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.7 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="text-center text-base italic mb-6"
                style={{ fontFamily: 'var(--font-heading)', color: '#E8D5B7' }}
              >
                "{signature.archetype_subtitle}"
              </motion.p>
            )}

            {/* Divider */}
            <div
              className="h-px mx-auto mb-6"
              style={{
                width: '60px',
                background: 'linear-gradient(90deg, transparent, rgba(232, 213, 183, 0.3), transparent)',
              }}
            />

            {/* Traits */}
            {traits.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                className="space-y-3 mb-6"
              >
                {traits.map((trait, i) => (
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
                      {(trait.source || trait.evidence) && (
                        <span
                          className="text-sm opacity-40 ml-1"
                          style={{ color: '#E8D5B7', fontFamily: 'var(--font-body)' }}
                        >
                          - {trait.source || trait.evidence}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}

            {/* Narrative */}
            {signature.narrative && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.6 }}
                transition={{ duration: 0.6, delay: 0.8 }}
                className="text-sm leading-relaxed text-center"
                style={{ fontFamily: 'var(--font-body)', color: '#E8D5B7' }}
              >
                {signature.narrative}
              </motion.p>
            )}
          </motion.div>

          {/* Footer info */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.0 }}
            className="text-center space-y-4"
          >
            {updatedDate && (
              <p
                className="text-xs opacity-30"
                style={{ fontFamily: 'var(--font-body)', color: '#E8D5B7' }}
              >
                Updated {updatedDate}
              </p>
            )}

            {/* CTA */}
            <a
              href="/"
              className="text-sm px-6 py-3 rounded-xl inline-block transition-all hover:scale-[1.01]"
              style={{
                background: 'linear-gradient(135deg, #E8D5B7 0%, #D4C4A8 100%)',
                color: '#0C0C0C',
                fontFamily: 'var(--font-body)',
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Discover Your Soul Signature
            </a>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default PublicSoulCard;
