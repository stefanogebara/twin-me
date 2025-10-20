/**
 * OAuth Connection Flow Component
 * Improved OAuth connection UI with better user feedback
 */

import React, { useState, useEffect } from 'react';
import {
  Link2,
  Unlink,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  Shield,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import { StandardButton, OutlineButton } from './ui/StandardButton';
import { StandardCard, CardHeader, CardContent, CardFooter } from './ui/StandardCard';
import { StandardBadge, ConnectedBadge, DisconnectedBadge, PendingBadge } from './ui/StandardBadge';
import { Spinner, LoadingButton } from './ui/LoadingStates';
import { PlatformIcon, getPlatformColor } from './PlatformIcons';
import { cn } from '@/lib/utils';

// Connection states
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'authenticating'
  | 'authorizing'
  | 'extracting'
  | 'connected'
  | 'error'
  | 'token_expired'
  | 'needs_reauth';

interface OAuthConnectionProps {
  platform: string;
  status: ConnectionState;
  lastSync?: Date | null;
  expiresAt?: Date | null;
  dataCount?: number;
  errorMessage?: string;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  onReconnect: () => Promise<void>;
  onExtract?: () => Promise<void>;
}

export const OAuthConnectionFlow: React.FC<OAuthConnectionProps> = ({
  platform,
  status,
  lastSync,
  expiresAt,
  dataCount = 0,
  errorMessage,
  onConnect,
  onDisconnect,
  onReconnect,
  onExtract
}) => {
  const [localState, setLocalState] = useState<ConnectionState>(status);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setLocalState(status);
  }, [status]);

  // Simulate OAuth progress
  useEffect(() => {
    if (localState === 'connecting' || localState === 'authenticating' || localState === 'authorizing') {
      const timer = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 500);
      return () => clearInterval(timer);
    } else if (localState === 'connected') {
      setProgress(100);
    } else {
      setProgress(0);
    }
  }, [localState]);

  const handleConnect = async () => {
    setIsProcessing(true);
    setLocalState('connecting');

    try {
      // Simulate OAuth flow steps
      setTimeout(() => setLocalState('authenticating'), 1000);
      setTimeout(() => setLocalState('authorizing'), 2000);

      await onConnect();
      setLocalState('connected');
    } catch (error) {
      setLocalState('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDisconnect = async () => {
    setIsProcessing(true);
    try {
      await onDisconnect();
      setLocalState('disconnected');
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReconnect = async () => {
    setIsProcessing(true);
    setLocalState('connecting');

    try {
      await onReconnect();
      setLocalState('connected');
    } catch (error) {
      setLocalState('error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Format time helpers
  const formatLastSync = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (mins > 0) return `${mins} minute${mins > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  const getExpiryStatus = (expiry: Date) => {
    const now = new Date();
    const diff = expiry.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (diff < 0) return { status: 'expired', text: 'Token expired', color: 'text-red-600' };
    if (days > 30) return { status: 'healthy', text: 'Token healthy', color: 'text-green-600' };
    if (days > 7) return { status: 'good', text: `Expires in ${days} days`, color: 'text-blue-600' };
    if (days > 0) return { status: 'warning', text: `Expires in ${days} days`, color: 'text-amber-600' };
    return { status: 'critical', text: `Expires in ${hours} hours`, color: 'text-red-600' };
  };

  const getStateMessage = () => {
    switch (localState) {
      case 'connecting':
        return 'Establishing secure connection...';
      case 'authenticating':
        return 'Authenticating with ' + platform + '...';
      case 'authorizing':
        return 'Requesting permissions...';
      case 'extracting':
        return 'Extracting soul signature data...';
      default:
        return '';
    }
  };

  const isInProgress = ['connecting', 'authenticating', 'authorizing', 'extracting'].includes(localState);

  return (
    <StandardCard variant={localState === 'connected' ? 'bordered' : 'default'} padding="sm">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <PlatformIcon platform={platform} size="lg" colored />
            <div>
              <h3 className="font-heading text-lg font-medium text-[hsl(var(--claude-text))] capitalize">
                {platform.replace(/-/g, ' ')}
              </h3>

              {/* Connection Status */}
              <div className="mt-1">
                {localState === 'connected' && <ConnectedBadge size="sm" />}
                {localState === 'disconnected' && <DisconnectedBadge size="sm" />}
                {localState === 'token_expired' && (
                  <StandardBadge variant="error" icon={<AlertCircle className="w-3 h-3" />} size="sm">
                    Token Expired
                  </StandardBadge>
                )}
                {localState === 'needs_reauth' && (
                  <StandardBadge variant="warning" icon={<RefreshCw className="w-3 h-3" />} size="sm">
                    Re-authentication Required
                  </StandardBadge>
                )}
                {localState === 'error' && (
                  <StandardBadge variant="error" icon={<AlertCircle className="w-3 h-3" />} size="sm">
                    Connection Failed
                  </StandardBadge>
                )}
                {isInProgress && (
                  <StandardBadge variant="info" icon={<Loader2 className="w-3 h-3 animate-spin" />} size="sm">
                    {getStateMessage()}
                  </StandardBadge>
                )}
              </div>
            </div>
          </div>

          {/* Shield icon for secure connection */}
          {localState === 'connected' && (
            <Shield className="w-5 h-5 text-green-600" />
          )}
        </div>

        {/* Progress Bar for OAuth Flow */}
        {isInProgress && (
          <div className="mb-4">
            <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[hsl(var(--claude-accent))] transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-[hsl(var(--claude-text-muted))] mt-2">
              {getStateMessage()}
            </p>
          </div>
        )}

        {/* Connection Details */}
        {localState === 'connected' && (
          <div className="space-y-2 mb-4">
            {lastSync && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-[hsl(var(--claude-text-muted))]">Last synced:</span>
                <span className="font-medium">{formatLastSync(lastSync)}</span>
              </div>
            )}

            {expiresAt && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-[hsl(var(--claude-text-muted))]">Token status:</span>
                <span className={cn("font-medium", getExpiryStatus(expiresAt).color)}>
                  {getExpiryStatus(expiresAt).text}
                </span>
              </div>
            )}

            {dataCount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-[hsl(var(--claude-text-muted))]">Data points:</span>
                <span className="font-medium flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-[hsl(var(--claude-accent))]" />
                  {dataCount.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Error Message */}
        {localState === 'error' && errorMessage && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{errorMessage}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          {localState === 'disconnected' && (
            <StandardButton
              onClick={handleConnect}
              disabled={isProcessing}
              leftIcon={<Link2 className="w-4 h-4" />}
              className="flex-1"
            >
              Connect {platform}
            </StandardButton>
          )}

          {localState === 'connected' && (
            <>
              {onExtract && (
                <StandardButton
                  onClick={onExtract}
                  disabled={isProcessing}
                  leftIcon={<Sparkles className="w-4 h-4" />}
                  variant="primary"
                  className="flex-1"
                >
                  Extract Data
                </StandardButton>
              )}
              <OutlineButton
                onClick={handleDisconnect}
                disabled={isProcessing}
                leftIcon={<Unlink className="w-4 h-4" />}
                size="sm"
              >
                Disconnect
              </OutlineButton>
            </>
          )}

          {(localState === 'token_expired' || localState === 'needs_reauth') && (
            <StandardButton
              onClick={handleReconnect}
              disabled={isProcessing}
              leftIcon={<RefreshCw className="w-4 h-4" />}
              variant="primary"
              className="flex-1"
            >
              Reconnect
            </StandardButton>
          )}

          {localState === 'error' && (
            <StandardButton
              onClick={handleConnect}
              disabled={isProcessing}
              leftIcon={<RefreshCw className="w-4 h-4" />}
              variant="primary"
              className="flex-1"
            >
              Try Again
            </StandardButton>
          )}

          {isInProgress && (
            <LoadingButton
              isLoading
              loadingText="Connecting..."
              className="flex-1"
              disabled
            />
          )}
        </div>

        {/* Privacy Note */}
        {localState === 'disconnected' && (
          <p className="text-xs text-[hsl(var(--claude-text-muted))] mt-3 flex items-center gap-1">
            <Shield className="w-3 h-3" />
            Your data is encrypted and never shared
          </p>
        )}

        {/* OAuth Window Note */}
        {(localState === 'authenticating' || localState === 'authorizing') && (
          <p className="text-xs text-[hsl(var(--claude-text-muted))] mt-3 flex items-center gap-1">
            <ExternalLink className="w-3 h-3" />
            Complete authentication in the popup window
          </p>
        )}
      </div>
    </StandardCard>
  );
};

// Export helper hook for managing OAuth state
export const useOAuthConnection = (platform: string) => {
  const [state, setState] = useState<ConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    setState('connecting');
    try {
      // Simulate OAuth steps
      await new Promise(resolve => setTimeout(resolve, 1000));
      setState('authenticating');
      await new Promise(resolve => setTimeout(resolve, 1500));
      setState('authorizing');
      await new Promise(resolve => setTimeout(resolve, 1000));
      setState('connected');
    } catch (err: any) {
      setError(err.message || 'Connection failed');
      setState('error');
    }
  };

  const disconnect = async () => {
    setState('disconnected');
    setError(null);
  };

  const reconnect = async () => {
    await connect();
  };

  return {
    state,
    error,
    connect,
    disconnect,
    reconnect
  };
};

export default OAuthConnectionFlow;