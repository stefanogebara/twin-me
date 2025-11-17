import React, { useState } from 'react';
import { Copy, Check, Share2, RotateCcw, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface MessageActionsProps {
  message: {
    id: string;
    role: 'user' | 'assistant';
    content: string;
  };
  onRegenerate?: () => void;
  onRate?: (rating: number) => void;
}

export function MessageActions({ message, onRegenerate, onRate }: MessageActionsProps) {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
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
          text: message.content
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

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      {/* Copy Button */}
      <button
        onClick={handleCopy}
        className="p-1.5 rounded-md transition-all hover:scale-105"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(12, 10, 9, 0.04)',
          color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : 'rgba(12, 10, 9, 0.5)'
        }}
        title={copied ? "Copied!" : "Copy"}
      >
        {copied ? (
          <Check className="w-3.5 h-3.5" style={{ color: '#10b981' }} />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>

      {/* Share Button */}
      <button
        onClick={handleShare}
        className="p-1.5 rounded-md transition-all hover:scale-105"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(12, 10, 9, 0.04)',
          color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : 'rgba(12, 10, 9, 0.5)'
        }}
        title="Share"
      >
        <Share2 className="w-3.5 h-3.5" />
      </button>

      {/* Regenerate Button (Assistant messages only) */}
      {message.role === 'assistant' && onRegenerate && (
        <button
          onClick={onRegenerate}
          className="p-1.5 rounded-md transition-all hover:scale-105"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(12, 10, 9, 0.04)',
            color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : 'rgba(12, 10, 9, 0.5)'
          }}
          title="Regenerate"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Rating Buttons (Assistant messages only) */}
      {message.role === 'assistant' && onRate && (
        <>
          <div className="w-px h-4 mx-1" style={{
            backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(12, 10, 9, 0.08)'
          }} />

          <button
            onClick={() => onRate(1)}
            className="p-1.5 rounded-md transition-all hover:scale-105"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(12, 10, 9, 0.04)',
              color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : 'rgba(12, 10, 9, 0.5)'
            }}
            title="Helpful"
          >
            <ThumbsUp className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => onRate(-1)}
            className="p-1.5 rounded-md transition-all hover:scale-105"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(12, 10, 9, 0.04)',
              color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : 'rgba(12, 10, 9, 0.5)'
            }}
            title="Not helpful"
          >
            <ThumbsDown className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
