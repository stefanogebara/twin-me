/**
 * FeedbackWidget Component
 * Collects user feedback on insights and recommendations
 * Supports: thumbs up/down, 1-5 star rating, optional comment
 */

import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, Star, MessageSquare, Check, Loader2 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

interface FeedbackWidgetProps {
  recommendationId: string;
  recommendationType: 'music' | 'activity' | 'insight' | 'tip' | 'pattern' | 'health' | 'schedule';
  contextSnapshot?: Record<string, unknown>;
  onFeedbackSubmitted?: (feedback: FeedbackData) => void;
  compact?: boolean;
}

interface FeedbackData {
  thumbsVote?: 'up' | 'down';
  starRating?: number;
  comment?: string;
}

export const FeedbackWidget: React.FC<FeedbackWidgetProps> = ({
  recommendationId,
  recommendationType,
  contextSnapshot = {},
  onFeedbackSubmitted,
  compact = false
}) => {
  const { theme } = useTheme();
  const { isDemoMode } = useAuth();

  const [thumbsVote, setThumbsVote] = useState<'up' | 'down' | null>(null);
  const [starRating, setStarRating] = useState<number | null>(null);
  const [showStars, setShowStars] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hoverStar, setHoverStar] = useState<number | null>(null);

  // Map insight types to valid API types
  const getApiType = (type: string): string => {
    const typeMap: Record<string, string> = {
      health: 'insight',
      schedule: 'insight',
      music: 'music',
      activity: 'activity',
      insight: 'insight',
      tip: 'tip',
      pattern: 'pattern'
    };
    return typeMap[type] || 'insight';
  };

  const submitFeedback = async (feedback: FeedbackData) => {
    console.log(`\n📤 [FeedbackWidget] Submitting feedback:`);
    console.log(`   - Recommendation: ${recommendationId}`);
    console.log(`   - Type: ${recommendationType} -> ${getApiType(recommendationType)}`);
    console.log(`   - Vote: ${feedback.thumbsVote || 'none'}`);
    console.log(`   - Stars: ${feedback.starRating || 'none'}`);
    if (feedback.comment) console.log(`   - Comment: "${feedback.comment.substring(0, 30)}..."`);

    if (isDemoMode) {
      // Demo mode - just simulate success
      console.log(`🎭 [FeedbackWidget] Demo mode - feedback simulated (not persisted to database)`);
      setSubmitted(true);
      onFeedbackSubmitted?.(feedback);
      return;
    }

    setIsSubmitting(true);
    try {
      console.log(`🔄 [FeedbackWidget] Sending to API...`);
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/twin/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          recommendationId,
          recommendationType: getApiType(recommendationType),
          thumbsVote: feedback.thumbsVote,
          starRating: feedback.starRating,
          comment: feedback.comment,
          contextSnapshot
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`❌ [FeedbackWidget] API error:`, response.status, errorData);
        throw new Error(errorData.error || 'Failed to submit feedback');
      }

      const result = await response.json();
      console.log(`✅ [FeedbackWidget] Feedback submitted successfully!`);
      console.log(`   - Feedback ID: ${result.feedbackId}`);
      console.log(`   - Will be processed by PatternLearningService in next cron run`);

      setSubmitted(true);
      onFeedbackSubmitted?.(feedback);
    } catch (error) {
      console.error(`❌ [FeedbackWidget] Error submitting feedback:`, error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleThumbsClick = async (vote: 'up' | 'down') => {
    setThumbsVote(vote);

    // In compact mode, submit immediately for both up and down
    // (no room for star rating in compact mode)
    if (compact) {
      await submitFeedback({ thumbsVote: vote });
      return;
    }

    // In full mode: If thumbs down, show stars for more detail
    if (vote === 'down') {
      setShowStars(true);
    } else {
      // Thumbs up - submit immediately
      await submitFeedback({ thumbsVote: vote });
    }
  };

  const handleStarClick = async (rating: number) => {
    setStarRating(rating);

    // If low rating, show comment option
    if (rating <= 2) {
      setShowComment(true);
    } else {
      // Good rating - submit
      await submitFeedback({
        thumbsVote: thumbsVote || undefined,
        starRating: rating
      });
    }
  };

  const handleCommentSubmit = async () => {
    await submitFeedback({
      thumbsVote: thumbsVote || undefined,
      starRating: starRating || undefined,
      comment: comment || undefined
    });
  };

  // Already submitted - show thank you
  if (submitted) {
    return (
      <div
        className="flex items-center gap-2 py-2 px-3 rounded-lg text-sm"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.08)',
          color: '#22c55e'
        }}
      >
        <Check className="w-4 h-4" />
        <span>Thanks for your feedback!</span>
      </div>
    );
  }

  // Compact version (just thumbs)
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="text-xs"
          style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }}
        >
          Helpful?
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); handleThumbsClick('up'); }}
          disabled={isSubmitting}
          className={`p-1.5 rounded-md transition-all ${
            thumbsVote === 'up' ? 'scale-110' : 'hover:scale-105'
          }`}
          style={{
            backgroundColor: thumbsVote === 'up'
              ? 'rgba(34, 197, 94, 0.15)'
              : theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(0, 0, 0, 0.04)',
            color: thumbsVote === 'up' ? '#22c55e' : theme === 'dark' ? '#C1C0B6' : '#57534e'
          }}
        >
          <ThumbsUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleThumbsClick('down'); }}
          disabled={isSubmitting}
          className={`p-1.5 rounded-md transition-all ${
            thumbsVote === 'down' ? 'scale-110' : 'hover:scale-105'
          }`}
          style={{
            backgroundColor: thumbsVote === 'down'
              ? 'rgba(239, 68, 68, 0.15)'
              : theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(0, 0, 0, 0.04)',
            color: thumbsVote === 'down' ? '#ef4444' : theme === 'dark' ? '#C1C0B6' : '#57534e'
          }}
        >
          <ThumbsDown className="w-3.5 h-3.5" />
        </button>
        {isSubmitting && <Loader2 className="w-3 h-3 animate-spin" style={{ color: theme === 'dark' ? '#C1C0B6' : '#57534e' }} />}
      </div>
    );
  }

  // Full version
  return (
    <div
      className="rounded-lg p-3 space-y-3"
      style={{
        backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.05)' : 'rgba(0, 0, 0, 0.02)',
        border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.05)'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Thumbs Row */}
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-medium"
          style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e' }}
        >
          Was this helpful?
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleThumbsClick('up')}
            disabled={isSubmitting}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              thumbsVote === 'up' ? 'scale-105' : 'hover:scale-102'
            }`}
            style={{
              backgroundColor: thumbsVote === 'up'
                ? 'rgba(34, 197, 94, 0.15)'
                : theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
              color: thumbsVote === 'up' ? '#22c55e' : theme === 'dark' ? '#C1C0B6' : '#57534e'
            }}
          >
            <ThumbsUp className="w-3.5 h-3.5" />
            Yes
          </button>
          <button
            onClick={() => handleThumbsClick('down')}
            disabled={isSubmitting}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              thumbsVote === 'down' ? 'scale-105' : 'hover:scale-102'
            }`}
            style={{
              backgroundColor: thumbsVote === 'down'
                ? 'rgba(239, 68, 68, 0.15)'
                : theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
              color: thumbsVote === 'down' ? '#ef4444' : theme === 'dark' ? '#C1C0B6' : '#57534e'
            }}
          >
            <ThumbsDown className="w-3.5 h-3.5" />
            No
          </button>
        </div>
      </div>

      {/* Star Rating (shown after thumbs down or can be toggled) */}
      {showStars && (
        <div className="space-y-2">
          <span
            className="text-xs"
            style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}
          >
            How would you rate this insight?
          </span>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => handleStarClick(star)}
                onMouseEnter={() => setHoverStar(star)}
                onMouseLeave={() => setHoverStar(null)}
                disabled={isSubmitting}
                className="p-1 transition-transform hover:scale-110"
              >
                <Star
                  className="w-5 h-5 transition-colors"
                  fill={
                    (hoverStar !== null ? star <= hoverStar : star <= (starRating || 0))
                      ? '#F59E0B'
                      : 'transparent'
                  }
                  stroke={
                    (hoverStar !== null ? star <= hoverStar : star <= (starRating || 0))
                      ? '#F59E0B'
                      : theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#a8a29e'
                  }
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Comment (shown for low ratings) */}
      {showComment && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <MessageSquare
              className="w-3.5 h-3.5"
              style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }}
            />
            <span
              className="text-xs"
              style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}
            >
              Help us improve (optional)
            </span>
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What could be better?"
            rows={2}
            className="w-full text-sm rounded-md px-3 py-2 resize-none"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : '#fff',
              border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.15)' : '1px solid rgba(0, 0, 0, 0.1)',
              color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
            }}
          />
          <button
            onClick={handleCommentSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.15)' : 'rgba(0, 0, 0, 0.08)',
              color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
            }}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Submit Feedback
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default FeedbackWidget;
