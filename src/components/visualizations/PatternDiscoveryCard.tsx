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
    if (confidence >= 90) return 'text-green-400 bg-green-900/20 border-green-800/30';
    if (confidence >= 70) return 'text-blue-400 bg-blue-900/20 border-blue-800/30';
    if (confidence >= 50) return 'text-orange-400 bg-orange-900/20 border-orange-800/30';
    return 'text-muted-foreground bg-white/8 border-white/10';
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
      className={`bg-gradient-to-br ${getConfidenceGradient(pattern.confidence)} rounded-xl border border-white/10 overflow-hidden ${className}`}
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
              <Sparkles className="w-5 h-5 text-muted-foreground" />
              <h4 className="text-lg font-heading font-semibold text-foreground">
                {pattern.title}
              </h4>
            </div>
            <p className="text-sm text-muted-foreground">{pattern.description}</p>
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
              className="text-xs px-2.5 py-1 bg-white/8 rounded-md border border-white/10 text-muted-foreground"
            >
              {platform}
            </motion.span>
          ))}
        </div>

        {/* AI Insight (collapsed state) */}
        {!isExpanded && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
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
              <div className="p-4 bg-white/8 rounded-lg border border-white/10">
                <div className="flex items-start space-x-3">
                  <div className="w-8 h-8 rounded-full bg-orange-900/20 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-orange-400" />
                  </div>
                  <div>
                    <h5 className="text-sm font-semibold text-foreground mb-2">AI Insight</h5>
                    <p className="text-sm text-muted-foreground leading-relaxed">
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
            className="flex items-center space-x-2 text-sm text-orange-400 hover:text-muted-foreground font-medium transition-colors"
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
            className="flex items-center space-x-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            title="Copy to clipboard"
          >
            <Share2 className="w-4 h-4" />
            <span>Share</span>
          </button>
        </div>
      </div>

      {/* Confidence progress bar */}
      <div className="h-1 bg-white/10">
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
