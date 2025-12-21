/**
 * Pattern Discovery Card
 * Beautiful card displaying discovered patterns with AI insights
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PatternData } from '@/utils/dataTransformers';
import { Share2, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

interface PatternDiscoveryCardProps {
  pattern: PatternData;
  className?: string;
}

export function PatternDiscoveryCard({ pattern, className = '' }: PatternDiscoveryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Get gradient based on confidence level
  const getConfidenceGradient = (confidence: number): string => {
    if (confidence >= 90) return 'from-green-500/10 to-green-500/5';
    if (confidence >= 70) return 'from-blue-500/10 to-blue-500/5';
    if (confidence >= 50) return 'from-stone-500/10 to-stone-500/5';
    return 'from-stone-500/10 to-stone-500/5';
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 90) return 'text-green-600 bg-green-100 border-green-200';
    if (confidence >= 70) return 'text-blue-600 bg-blue-100 border-blue-200';
    if (confidence >= 50) return 'text-orange-600 bg-orange-100 border-orange-200';
    return 'text-stone-600 bg-stone-100 border-stone-200';
  };

  const handleShare = () => {
    // Copy pattern to clipboard
    const text = `${pattern.title}\n\n${pattern.description}\n\n${pattern.insight}\n\n(Confidence: ${pattern.confidence}%)`;
    navigator.clipboard.writeText(text);
    // Could add toast notification here
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={`bg-gradient-to-br ${getConfidenceGradient(pattern.confidence)} rounded-xl border border-stone-200 overflow-hidden ${className}`}
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
              <Sparkles className="w-5 h-5 text-stone-500" />
              <h4 className="text-lg font-heading font-semibold text-slate-900">
                {pattern.title}
              </h4>
            </div>
            <p className="text-sm text-slate-600">{pattern.description}</p>
          </div>

          {/* Confidence badge */}
          <div className={`px-3 py-1 rounded-full text-xs font-semibold border ${getConfidenceColor(pattern.confidence)} whitespace-nowrap ml-4`}>
            {pattern.confidence}% confidence
          </div>
        </div>

        {/* Platform tags */}
        <div className="flex flex-wrap gap-2 mb-4">
          {pattern.platforms.map((platform, index) => (
            <motion.span
              key={platform}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
              className="text-xs px-2.5 py-1 bg-white rounded-md border border-stone-200 text-slate-700"
            >
              {platform}
            </motion.span>
          ))}
        </div>

        {/* AI Insight (collapsed state) */}
        {!isExpanded && (
          <p className="text-sm text-slate-700 line-clamp-2 mb-4">
            {pattern.insight}
          </p>
        )}

        {/* Expanded content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="mb-4"
            >
              <div className="p-4 bg-white/60 rounded-lg border border-stone-200">
                <div className="flex items-start space-x-3">
                  <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-orange-600" />
                  </div>
                  <div>
                    <h5 className="text-sm font-semibold text-slate-900 mb-2">AI Insight</h5>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {pattern.insight}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center space-x-2 text-sm text-orange-600 hover:text-stone-700 font-medium transition-colors"
          >
            <span>{isExpanded ? 'Show less' : 'Read full insight'}</span>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          <button
            onClick={handleShare}
            className="flex items-center space-x-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
            title="Copy to clipboard"
          >
            <Share2 className="w-4 h-4" />
            <span>Share</span>
          </button>
        </div>
      </div>

      {/* Confidence progress bar */}
      <div className="h-1 bg-stone-200">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pattern.confidence}%` }}
          transition={{ duration: 1, delay: 0.3 }}
          className={`h-full ${
            pattern.confidence >= 90
              ? 'bg-green-500'
              : pattern.confidence >= 70
              ? 'bg-blue-500'
              : pattern.confidence >= 50
              ? 'bg-stone-500'
              : 'bg-stone-500'
          }`}
        />
      </div>
    </motion.div>
  );
}
