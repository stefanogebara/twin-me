// src/pages/DiscoverLanding.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';

interface Discovered {
  discovered_name?: string | null;
  discovered_company?: string | null;
  discovered_title?: string | null;
  discovered_location?: string | null;
  discovered_bio?: string | null;
  discovered_photo?: string | null;
}

const DiscoverLanding: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [discovered, setDiscovered] = useState<Discovered | null>(null);
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/discovery/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = await res.json();
      setDiscovered(json.discovered);
      setScanned(true);
    } catch {
      setError('Scan failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    navigate(`/auth?email=${encodeURIComponent(email)}&mode=signup`);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="max-w-[480px] w-full mx-auto space-y-8">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2">
          <img src="/images/backgrounds/flower-hero.png" alt="" className="w-8 h-8" />
          <span className="heading-serif text-xl">Twin Me</span>
        </div>

        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="heading-serif text-5xl font-normal tracking-tight">Discover your Soul Signature</h1>
          <p className="text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            First, let's see what the internet already knows about you.
          </p>
        </div>

        {/* Scan form */}
        {!scanned && (
          <form onSubmit={handleScan} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="input focus:border-[var(--glass-surface-border-hover)]"
              required
            />
            <button type="submit" disabled={loading} className="btn-cta w-full disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="animate-spin w-4 h-4" />}
              {loading ? 'Scanning the web...' : 'Scan my public footprint'}
            </button>
            {error && <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>{error}</p>}
          </form>
        )}

        {/* Results */}
        <AnimatePresence>
          {scanned && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              {discovered ? (
                <div className="rounded-2xl p-6 space-y-3"
                  style={{
                    background: 'var(--glass-surface-bg)',
                    border: '1px solid var(--glass-surface-border)',
                    backdropFilter: 'blur(8px)',
                    boxShadow: 'var(--glass-shadow)',
                  }}>
                  <p className="text-xs uppercase tracking-widest font-medium" style={{ color: 'var(--text-secondary)' }}>
                    What the world knows about you
                  </p>
                  {discovered.discovered_photo && (
                    <img src={discovered.discovered_photo} alt="" className="w-14 h-14 rounded-full object-cover" />
                  )}
                  {discovered.discovered_name && (
                    <p className="heading-serif text-2xl">{discovered.discovered_name}</p>
                  )}
                  {discovered.discovered_title && (
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {discovered.discovered_title}{discovered.discovered_company ? ` · ${discovered.discovered_company}` : ''}
                    </p>
                  )}
                  {discovered.discovered_bio && (
                    <p className="text-sm leading-relaxed line-clamp-3">{discovered.discovered_bio}</p>
                  )}
                  {discovered.discovered_location && (
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>📍 {discovered.discovered_location}</p>
                  )}
                  <div className="pt-3" style={{ borderTop: '1px solid var(--glass-surface-border)' }}>
                    <p className="text-sm italic" style={{ color: 'var(--accent-vibrant)' }}>
                      That's just the surface. Your real self is much more interesting.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl p-6 text-center space-y-3"
                  style={{
                    background: 'var(--glass-surface-bg)',
                    border: '1px solid var(--glass-surface-border)',
                    backdropFilter: 'blur(8px)',
                    boxShadow: 'var(--glass-shadow)',
                  }}>
                  <p className="text-4xl">👻</p>
                  <p className="heading-serif text-2xl">You're a ghost on the internet.</p>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    No public footprint found — your Soul Signature will be built entirely from what you share with us.
                  </p>
                </div>
              )}

              <button onClick={handleContinue} className="btn-cta w-full">
                Discover my Soul Signature →
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default DiscoverLanding;
