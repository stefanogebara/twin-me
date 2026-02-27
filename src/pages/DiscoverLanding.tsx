// src/pages/DiscoverLanding.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Search, ArrowRight } from 'lucide-react';

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
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg w-full space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-bold tracking-tight">Discover your Soul Signature</h1>
          <p className="text-gray-400 text-lg">First, let's see what the internet already knows about you.</p>
        </div>

        {!scanned && (
          <form onSubmit={handleScan} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              required
            />
            <button type="submit" disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 rounded-xl px-4 py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-colors">
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
              {loading ? 'Scanning the web...' : 'Scan my public footprint'}
            </button>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          </form>
        )}

        <AnimatePresence>
          {scanned && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              {discovered ? (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-3">
                  <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">What the world knows about you</p>
                  {discovered.discovered_photo && (
                    <img src={discovered.discovered_photo} alt="" className="w-14 h-14 rounded-full object-cover" />
                  )}
                  {discovered.discovered_name && <p className="text-xl font-semibold">{discovered.discovered_name}</p>}
                  {discovered.discovered_title && (
                    <p className="text-gray-300">{discovered.discovered_title}{discovered.discovered_company ? ` · ${discovered.discovered_company}` : ''}</p>
                  )}
                  {discovered.discovered_bio && (
                    <p className="text-gray-400 text-sm leading-relaxed line-clamp-3">{discovered.discovered_bio}</p>
                  )}
                  {discovered.discovered_location && <p className="text-gray-500 text-sm">📍 {discovered.discovered_location}</p>}
                  <div className="border-t border-gray-800 pt-3">
                    <p className="text-indigo-400 text-sm">That's just the surface. Your real self is much more interesting.</p>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center space-y-3">
                  <p className="text-3xl">👻</p>
                  <p className="text-white font-medium">You're a ghost on the internet.</p>
                  <p className="text-gray-400 text-sm">No public footprint found — your Soul Signature will be built entirely from what you share with us.</p>
                </div>
              )}
              <button onClick={handleContinue}
                className="w-full bg-indigo-600 hover:bg-indigo-500 rounded-xl px-4 py-3 font-medium flex items-center justify-center gap-2 transition-colors">
                Discover my Soul Signature <ArrowRight size={18} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default DiscoverLanding;
