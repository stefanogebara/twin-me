/**
 * FeedbackWidget Component
 * Collects user feedback on insights and recommendations
 * Supports: thumbs up/down, 1-5 star rating, optional comment
 */

import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, Star, MessageSquare, Check, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getAccessToken } from '@/services/api/apiBase';

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
    if (isDemoMode) {
      // Demo mode - just simulate success
      setSubmitted(true);
      onFeedbackSubmitted?.(feedback);
      return;
    }

    setIsSubmitting(true);
    try {
      const token = getAccessToken() || localStorage.getItem('auth_token');
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
        console.error(`[FeedbackWidget] API error:`, response.status, errorData);
        throw new Error(errorData.error || 'Failed to submit feedback');
      }

      await response.json();

      setSubmitted(true);
      onFeedbackSubmitted?.(feedback);
    } catch (error) {
      console.error(`[FeedbackWidget] Error submitting feedback:`, error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleThumbsClick = async (vote: 'up' | 'down') => {
    setThumbsVote(vote);

    // In compact mode, submit immediately for both up and down
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
          backgroundColor: 'rgba(34, 197, 94, 0.08)',
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
          style={{ color: 'rgba(255,255,255,0.4)' }}
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
              : 'rgba(255,255,255,0.03)',
            color: thumbsVote === 'up' ? '#22c55e' : 'rgba(255,255,255,0.4)'
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
              : 'rgba(255,255,255,0.03)',
            color: thumbsVote === 'down' ? '#ef4444' : 'rgba(255,255,255,0.4)'
          }}
        >
          <ThumbsDown className="w-3.5 h-3.5" />
        </button>
        {isSubmitting && <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'rgba(255,255,255,0.4)' }} />}
      </div>
    );
  }

  // Full version
  return (
    <div
      className="rounded-lg p-3 space-y-3"
      style={{
        backgroundColor: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--border-glass)'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Thumbs Row */}
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-medium"
          style={{ color: 'rgba(255,255,255,0.4)' }}
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
                : 'rgba(255,255,255,0.02)',
              color: thumbsVote === 'up' ? '#22c55e' : 'rgba(255,255,255,0.4)'
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
                : 'rgba(255,255,255,0.02)',
              color: thumbsVote === 'down' ? '#ef4444' : 'rgba(255,255,255,0.4)'
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
            style={{ color: 'rgba(255,255,255,0.3)' }}
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
                      ? '#C9B99A'
                      : 'transparent'
                  }
                  stroke={
                    (hoverStar !== null ? star <= hoverStar : star <= (starRating || 0))
                      ? '#C9B99A'
                      : 'rgba(255,255,255,0.3)'
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
              style={{ color: 'rgba(255,255,255,0.3)' }}
            />
            <span
              className="text-xs"
              style={{ color: 'rgba(255,255,255,0.3)' }}
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
              backgroundColor: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)'
            }}
          />
          <button
            onClick={handleCommentSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'rgba(255,255,255,0.02)',
              color: 'var(--foreground)'
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
