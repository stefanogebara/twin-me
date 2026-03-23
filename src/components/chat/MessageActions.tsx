import React, { useState } from 'react';
import { Copy, Check, Share2, RotateCcw, ThumbsUp, ThumbsDown } from 'lucide-react';

interface MessageActionsProps {
  message: {
    id: string;
    role: 'user' | 'assistant';
    content: string;
  };
  onRegenerate?: () => void;
  onRate?: (rating: number) => void;
  // Legacy prop from ChatMessage - single content string
  messageContent?: string;
}

export function MessageActions({ message, onRegenerate, onRate, messageContent }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  // Support both usage patterns: message object or messageContent string
  const content = message?.content ?? messageContent ?? '';
  const role = message?.role ?? 'assistant';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Soul Signature Conversation',
          text: content
        });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } catch (error) {
        // User cancelled share
      }
    } else {
      // Fallback to copy
      handleCopy();
    }
  };

  const btnStyle = {
    backgroundColor: 'rgba(12, 10, 9, 0.04)',
    color: 'rgba(12, 10, 9, 0.5)'
  };

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      {/* Copy Button */}
      <button
        onClick={handleCopy}
        className="p-1.5 rounded-md transition-all hover:scale-105"
        style={btnStyle}
        aria-label={copied ? "Copied!" : "Copy message"}
        title={copied ? "Copied!" : "Copy"}
      >
        {copied ? (
          <Check className="w-3.5 h-3.5" style={{ color: '#10b981' }} aria-hidden="true" />
        ) : (
          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
        )}
      </button>

      {/* Share Button */}
      <button
        onClick={handleShare}
        className="p-1.5 rounded-md transition-all hover:scale-105"
        style={btnStyle}
        aria-label="Share message"
        title="Share"
      >
        <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
      </button>

      {/* Regenerate Button (Assistant messages only) */}
      {role === 'assistant' && onRegenerate && (
        <button
          onClick={onRegenerate}
          className="p-1.5 rounded-md transition-all hover:scale-105"
          style={btnStyle}
          aria-label="Regenerate response"
          title="Regenerate"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}

      {/* Rating Buttons (Assistant messages only) */}
      {role === 'assistant' && onRate && (
        <>
          <div className="w-px h-4 mx-1" style={{ backgroundColor: 'rgba(12, 10, 9, 0.08)' }} aria-hidden="true" />

          <button
            onClick={() => onRate(1)}
            className="p-1.5 rounded-md transition-all hover:scale-105"
            style={btnStyle}
            aria-label="Rate as helpful"
            title="Helpful"
          >
            <ThumbsUp className="w-3.5 h-3.5" aria-hidden="true" />
          </button>

          <button
            onClick={() => onRate(-1)}
            className="p-1.5 rounded-md transition-all hover:scale-105"
            style={btnStyle}
            aria-label="Rate as not helpful"
            title="Not helpful"
          >
            <ThumbsDown className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}
