/**
 * Soul Matching Page
 * Discover compatible soul signatures and connect with like-minded individuals
 */

import React, { useState, useEffect } from 'react';
import { Sparkles, Users, Settings, TrendingUp, AlertCircle, Loader2, Filter, X } from 'lucide-react';
import SoulMatchCard from '../components/SoulMatchCard';
import soulMatchingService, { type SoulMatch } from '../services/soulMatchingService';

const SoulMatching: React.FC = () => {
  // State management
  const [matches, setMatches] = useState<SoulMatch[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    limit: 20,
    minCompatibility: 50,
    includeOpposites: false,
    privacyLevel: 'medium' as 'respect' | 'medium' | 'full'
  });

  // Load matches and stats on mount
  useEffect(() => {
    loadMatches();
    loadStats();
  }, []);

  const loadMatches = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await soulMatchingService.findMatches(filters);

      if (!response.success) {
        throw new Error('Failed to find matches');
      }

      setMatches(response.matches);
    } catch (err: any) {
      console.error('[SoulMatching] Error loading matches:', err);
      setError(err.message || 'Failed to load soul matches');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await soulMatchingService.getStats();
      if (response.success) {
        setStats(response.stats);
      }
    } catch (err) {
      console.error('[SoulMatching] Error loading stats:', err);
    }
  };

  const handleApplyFilters = () => {
    setShowFilters(false);
    loadMatches();
  };

  const handleResetFilters = () => {
    setFilters({
      limit: 20,
      minCompatibility: 50,
      includeOpposites: false,
      privacyLevel: 'medium'
    });
  };

  const handleViewProfile = (userId: string) => {
    // Navigate to user profile (to be implemented)
    console.log('[SoulMatching] View profile:', userId);
    // TODO: Navigate to /profile/:userId
  };

  const handleConnect = (userId: string) => {
    // Send connection request (to be implemented)
    console.log('[SoulMatching] Send connection request to:', userId);
    // TODO: Implement connection request API
  };

  return (
    <div className="min-h-screen bg-[#FAF9F5] p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1
                className="text-4xl font-bold text-slate-800 mb-2"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                <Sparkles className="inline-block w-10 h-10 text-orange-600 mr-3" />
                Discover Soul Matches
              </h1>
              <p className="text-slate-600 text-lg">
                Find people with compatible soul signatures based on personality, interests, and values
              </p>
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-colors duration-200"
            >
              <Filter className="w-5 h-5" />
              Filters
            </button>
          </div>

          {/* Stats Bar */}
          {stats && stats.hasProfile && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white p-4 rounded-lg border-2 border-slate-200">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-5 h-5 text-blue-600" />
                  <span className="text-sm text-slate-600">Potential Matches</span>
                </div>
                <div className="text-3xl font-bold text-slate-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  {stats.totalUsers || 0}
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border-2 border-slate-200">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-5 h-5 text-orange-600" />
                  <span className="text-sm text-slate-600">Matches Found</span>
                </div>
                <div className="text-3xl font-bold text-slate-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  {matches.length}
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border-2 border-slate-200">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                  <span className="text-sm text-slate-600">Profile Completeness</span>
                </div>
                <div className="text-3xl font-bold text-slate-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  {stats.profileCompleteness || 0}%
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border-2 border-slate-200">
                <div className="flex items-center gap-2 mb-1">
                  <Settings className="w-5 h-5 text-purple-600" />
                  <span className="text-sm text-slate-600">Min. Compatibility</span>
                </div>
                <div className="text-3xl font-bold text-slate-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  {filters.minCompatibility}%
                </div>
              </div>
            </div>
          )}

          {/* Filter Panel */}
          {showFilters && (
            <div className="bg-white p-6 rounded-xl border-2 border-orange-200 shadow-lg mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-slate-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Search Filters
                </h3>
                <button
                  onClick={() => setShowFilters(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Min Compatibility Slider */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Minimum Compatibility: {filters.minCompatibility}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={filters.minCompatibility}
                    onChange={(e) => setFilters({ ...filters, minCompatibility: parseInt(e.target.value) })}
                    className="w-full h-2 bg-orange-200 rounded-lg appearance-none cursor-pointer accent-orange-600"
                  />
                </div>

                {/* Results Limit */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Maximum Results: {filters.limit}
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="50"
                    step="5"
                    value={filters.limit}
                    onChange={(e) => setFilters({ ...filters, limit: parseInt(e.target.value) })}
                    className="w-full h-2 bg-orange-200 rounded-lg appearance-none cursor-pointer accent-orange-600"
                  />
                </div>

                {/* Privacy Level */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Privacy Level
                  </label>
                  <select
                    value={filters.privacyLevel}
                    onChange={(e) => setFilters({ ...filters, privacyLevel: e.target.value as any })}
                    className="w-full px-4 py-2 bg-white border-2 border-slate-200 rounded-lg focus:border-orange-600 focus:outline-none"
                  >
                    <option value="respect">Respect Privacy Settings</option>
                    <option value="medium">Medium (Default)</option>
                    <option value="full">Full Search</option>
                  </select>
                </div>

                {/* Include Opposites */}
                <div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.includeOpposites}
                      onChange={(e) => setFilters({ ...filters, includeOpposites: e.target.checked })}
                      className="w-5 h-5 text-orange-600 bg-white border-2 border-slate-300 rounded focus:ring-orange-500 focus:ring-2"
                    />
                    <div>
                      <span className="text-sm font-medium text-slate-700">Include Opposite Personalities</span>
                      <p className="text-xs text-slate-500">Consider complementary traits (opposites attract)</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Filter Actions */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleApplyFilters}
                  className="flex-1 px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors duration-200 font-medium"
                >
                  Apply Filters
                </button>
                <button
                  onClick={handleResetFilters}
                  className="px-6 py-2 bg-white text-slate-600 border-2 border-slate-200 rounded-lg hover:bg-slate-50 transition-colors duration-200 font-medium"
                >
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-orange-600 animate-spin mb-4" />
            <p className="text-slate-600 text-lg">Finding your soul matches...</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-semibold text-red-800 mb-1">Error Loading Matches</h3>
                <p className="text-red-700">{error}</p>
                <button
                  onClick={loadMatches}
                  className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200 text-sm font-medium"
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        )}

        {/* No Profile State */}
        {!loading && stats && !stats.hasProfile && (
          <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-8 text-center">
            <Sparkles className="w-16 h-16 text-orange-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-800 mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Create Your Soul Signature First
            </h2>
            <p className="text-slate-600 mb-6 max-w-md mx-auto">
              {stats.message || 'You need to create your soul signature before you can find compatible matches.'}
            </p>
            <button
              onClick={() => window.location.href = '/soul-signature'}
              className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors duration-200 font-medium"
            >
              Go to Soul Signature Dashboard
            </button>
          </div>
        )}

        {/* No Matches State */}
        {!loading && !error && stats?.hasProfile && matches.length === 0 && (
          <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-8 text-center">
            <Users className="w-16 h-16 text-slate-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-800 mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              No Matches Found
            </h2>
            <p className="text-slate-600 mb-6 max-w-md mx-auto">
              Try adjusting your filters to discover more compatible soul signatures.
            </p>
            <button
              onClick={() => {
                handleResetFilters();
                setShowFilters(true);
              }}
              className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors duration-200 font-medium"
            >
              Adjust Filters
            </button>
          </div>
        )}

        {/* Match Results Grid */}
        {!loading && !error && matches.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {matches.map((match) => (
              <SoulMatchCard
                key={match.userId}
                match={match}
                onViewProfile={handleViewProfile}
                onConnect={handleConnect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SoulMatching;
