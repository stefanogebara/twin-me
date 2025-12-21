import React from 'react';
import { ChevronRight, RefreshCw, X, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PlatformConnectionStatus } from '@/hooks/usePlatformStatus';

interface PlatformConnectionCardProps {
  connector: {
    key: string;
    name: string;
    icon: React.ReactNode;
    status?: boolean; // Legacy status from connector config
  };
  platformStatus?: PlatformConnectionStatus;
  hasExtractedData?: boolean;
  onConnect: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
}

// Calculate token health based on expiry time
const getTokenHealth = (expiresAt: string | null, tokenExpired: boolean) => {
  if (tokenExpired) {
    return { status: 'expired', color: 'red', icon: AlertCircle, label: 'Token Expired' };
  }

  if (!expiresAt) {
    return { status: 'healthy', color: 'green', icon: CheckCircle, label: 'Connected' };
  }

  const now = new Date();
  const expiry = new Date(expiresAt);
  const hoursUntilExpiry = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntilExpiry < 0) {
    return { status: 'expired', color: 'red', icon: AlertCircle, label: 'Token Expired' };
  } else if (hoursUntilExpiry < 24) {
    return { status: 'expiring', color: 'yellow', icon: Clock, label: `Expires in ${Math.round(hoursUntilExpiry)}h` };
  } else {
    return { status: 'healthy', color: 'green', icon: CheckCircle, label: 'Connected' };
  }
};

export const PlatformConnectionCard: React.FC<PlatformConnectionCardProps> = ({
  connector,
  platformStatus,
  hasExtractedData,
  onConnect,
  onReconnect,
  onDisconnect
}) => {
  const isConnected = platformStatus?.connected || false;
  const isActive = platformStatus?.isActive ?? true;
  const tokenExpired = platformStatus?.tokenExpired || false;
  const needsReconnect = tokenExpired || (isConnected && !isActive);

  const tokenHealth = isConnected ? getTokenHealth(platformStatus?.expiresAt || null, tokenExpired) : null;

  // Format last sync time
  const formatLastSync = (lastSync: string | null) => {
    if (!lastSync) return null;
    const date = new Date(lastSync);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'Just now';
  };

  const lastSyncFormatted = formatLastSync(platformStatus?.lastSync || null);

  return (
    <div
      className={cn(
        "w-full p-3 rounded-lg bg-[hsl(var(--claude-surface-raised))]",
        "flex items-center justify-between group",
        isConnected && !needsReconnect ? 'border border-[hsl(var(--claude-accent))]' : 'border border-[hsl(var(--claude-border))]',
        needsReconnect && 'border-red-500/50 bg-red-50/5'
      )}
    >
      <div className="flex items-center gap-3">
        <span style={{ color: '#141413' }}>{connector.icon}</span>
        <div>
          <span
            style={{
              fontFamily: 'var(--_typography---font--tiempos)',
              color: 'hsl(var(--claude-text))'
            }}
          >
            {connector.name}
          </span>
          {lastSyncFormatted && isConnected && !needsReconnect && (
            <div className="text-xs text-gray-500 mt-0.5">
              Last sync: {lastSyncFormatted}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isConnected ? (
          <>
            {needsReconnect ? (
              <>
                <Badge
                  className="bg-[rgba(193,192,182,0.1)] text-[#C1C0B6] border border-[rgba(193,192,182,0.2)]"
                  title={tokenExpired ? "Token expired - reconnection required" : "Connection inactive"}
                >
                  <AlertCircle className="w-3 h-3 mr-1" />
                  {tokenExpired ? 'Token Expired' : 'Inactive'}
                </Badge>
                {/* PLAT 3.4: More urgent reconnect button */}
                <Button
                  onClick={onReconnect}
                  size="sm"
                  className="h-7 px-3 text-xs bg-red-500 text-white hover:bg-red-600 border-0 animate-pulse"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Reconnect Now
                </Button>
              </>
            ) : (
              <>
                {/* Token Health Badge */}
                {tokenHealth && (
                  <Badge
                    className={cn(
                      "transition-colors",
                      tokenHealth.color === 'green' && "bg-green-500/10 text-green-600 border border-green-500/20",
                      tokenHealth.color === 'yellow' && "bg-yellow-500/10 text-yellow-600 border border-yellow-500/20",
                      tokenHealth.color === 'red' && "bg-red-500/10 text-red-600 border border-red-500/20"
                    )}
                    title={`Token status: ${tokenHealth.label}`}
                  >
                    {React.createElement(tokenHealth.icon, { className: "w-3 h-3 mr-1" })}
                    {tokenHealth.label}
                  </Badge>
                )}

                {/* Data Extracted Badge */}
                {hasExtractedData && (
                  <Badge
                    className="bg-green-500/10 text-green-600 border border-green-500/20"
                    title="Data extracted successfully"
                  >
                    Extracted
                  </Badge>
                )}

                {/* Disconnect Button (hidden by default, shown on hover) */}
                <Button
                  onClick={onDisconnect}
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Disconnect platform"
                >
                  <X className="w-3 h-3" />
                </Button>
              </>
            )}
          </>
        ) : (
          <Button
            onClick={onConnect}
            size="sm"
            variant="ghost"
            className="h-7 px-2"
          >
            Connect
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default PlatformConnectionCard;