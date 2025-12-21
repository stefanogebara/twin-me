/**
 * Soul Match Card Component
 * Displays individual soul match with compatibility breakdown
 */

import React from 'react';
import { Heart, Users, MessageCircle, Target, Sparkles } from 'lucide-react';
import type { SoulMatch } from '../services/soulMatchingService';

interface SoulMatchCardProps {
  match: SoulMatch;
  onViewProfile?: (userId: string) => void;
  onConnect?: (userId: string) => void;
}

const SoulMatchCard: React.FC<SoulMatchCardProps> = ({ match, onViewProfile, onConnect }) => {
  const { userId, userName, avatar, compatibility, breakdown, sharedInterests, matchReason } = match;

  // Determine compatibility level
  const getCompatibilityLevel = (score: number) => {
    if (score >= 90) return { label: 'Exceptional', color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' };
    if (score >= 75) return { label: 'Great', color: 'text-stone-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' };
    if (score >= 60) return { label: 'Good', color: 'text-orange-600', bgColor: 'bg-orange-50', borderColor: 'border-orange-200' };
    return { label: 'Moderate', color: 'text-slate-600', bgColor: 'bg-slate-50', borderColor: 'border-slate-200' };
  };

  const compatLevel = getCompatibilityLevel(compatibility);

  return (
    <div className={`bg-white rounded-xl border-2 ${compatLevel.borderColor} p-6 hover:shadow-lg transition-all duration-200`}>
      {/* Header: Avatar + Name + Score */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          {avatar ? (
            <img
              src={avatar}
              alt={userName}
              className="w-16 h-16 rounded-full object-cover border-2 border-orange-200"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-stone-400 to-stone-500 flex items-center justify-center">
              <span className="text-white text-xl font-bold">{userName.charAt(0).toUpperCase()}</span>
            </div>
          )}

          <div>
            <h3 className="text-xl font-semibold text-slate-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {userName}
            </h3>
            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ${compatLevel.bgColor} ${compatLevel.color} text-xs font-medium mt-1`}>
              <Sparkles className="w-3 h-3" />
              {compatLevel.label} Match
            </div>
          </div>
        </div>

        {/* Compatibility Score */}
        <div className="text-center">
          <div className="text-4xl font-bold text-orange-600" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {compatibility}%
          </div>
          <div className="text-xs text-slate-500 mt-1">Compatibility</div>
        </div>
      </div>

      {/* Match Reason */}
      <p className="text-slate-600 text-sm mb-4 italic bg-slate-50 p-3 rounded-lg border border-slate-200">
        "{matchReason}"
      </p>

      {/* Compatibility Breakdown */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-3 rounded-lg border border-purple-200">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-purple-600" />
            <span className="text-xs font-medium text-purple-800">Personality</span>
          </div>
          <div className="text-2xl font-bold text-purple-700">{breakdown.personality}%</div>
          <div className="w-full bg-purple-200 rounded-full h-1.5 mt-2">
            <div
              className="bg-purple-600 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${breakdown.personality}%` }}
            />
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-3 rounded-lg border border-blue-200">
          <div className="flex items-center gap-2 mb-1">
            <Heart className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-medium text-blue-800">Interests</span>
          </div>
          <div className="text-2xl font-bold text-blue-700">{breakdown.interests}%</div>
          <div className="w-full bg-blue-200 rounded-full h-1.5 mt-2">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${breakdown.interests}%` }}
            />
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 p-3 rounded-lg border border-emerald-200">
          <div className="flex items-center gap-2 mb-1">
            <MessageCircle className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-medium text-emerald-800">Communication</span>
          </div>
          <div className="text-2xl font-bold text-emerald-700">{breakdown.communication}%</div>
          <div className="w-full bg-emerald-200 rounded-full h-1.5 mt-2">
            <div
              className="bg-emerald-600 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${breakdown.communication}%` }}
            />
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100 p-3 rounded-lg border border-amber-200">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-stone-600" />
            <span className="text-xs font-medium text-amber-800">Values</span>
          </div>
          <div className="text-2xl font-bold text-amber-700">{breakdown.values}%</div>
          <div className="w-full bg-amber-200 rounded-full h-1.5 mt-2">
            <div
              className="bg-stone-600 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${breakdown.values}%` }}
            />
          </div>
        </div>
      </div>

      {/* Shared Interests */}
      {sharedInterests.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium text-slate-700 mb-2">Shared Interests:</div>
          <div className="flex flex-wrap gap-2">
            {sharedInterests.slice(0, 6).map((interest, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full border border-orange-200"
              >
                {interest}
              </span>
            ))}
            {sharedInterests.length > 6 && (
              <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full border border-slate-200">
                +{sharedInterests.length - 6} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 mt-4">
        <button
          onClick={() => onViewProfile?.(userId)}
          className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-stone-700 transition-colors duration-200 text-sm font-medium"
        >
          View Profile
        </button>
        <button
          onClick={() => onConnect?.(userId)}
          className="flex-1 px-4 py-2 bg-card text-orange-600 border-2 border-orange-600 rounded-lg hover:bg-stone-50 transition-colors duration-200 text-sm font-medium"
        >
          Connect
        </button>
      </div>
    </div>
  );
};

export default SoulMatchCard;
