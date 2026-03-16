import React from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { DataProvider } from '@/types/data-integration';
import { ConnectorConfig } from './connectorConfig';

interface ConnectorCardProps {
  connector: ConnectorConfig;
  isConnected: boolean;
  needsReconnect: boolean;
  connectingProvider: DataProvider | null;
  disconnectingProvider: DataProvider | null;
  theme: string;
  colors: {
    textPrimary: string;
    textSecondary: string;
    muted: string;
  };
  onConnect: (provider: DataProvider) => void;
  onDisconnect: (provider: DataProvider) => void;
}

export const ConnectorCard: React.FC<ConnectorCardProps> = ({
  connector,
  isConnected,
  needsReconnect,
  connectingProvider,
  disconnectingProvider,
  colors,
  onConnect,
  onDisconnect,
}) => {
  return (
    <div
      className="relative transition-all rounded-lg p-4"
      style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' }}
    >

      <div className="relative flex items-center gap-4 mb-3">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: connector.color, color: 'white' }}
        >
          {connector.icon}
        </div>
        <div className="flex-1">
          <h3
            className="text-lg"
            style={{
              color: 'var(--foreground)',
              fontFamily: 'var(--font-heading)',
              fontWeight: 400
            }}
          >
            {connector.name}
          </h3>
          <p
            className="text-xs"
            style={{
              color: 'rgba(255,255,255,0.4)',
              fontFamily: "'Inter', sans-serif"
            }}
          >
            {connector.setupTime} setup
          </p>
        </div>
      </div>

      <p
        className="text-sm mb-3 leading-relaxed"
        style={{
          color: 'rgba(255,255,255,0.4)',
          fontFamily: "'Inter', sans-serif"
        }}
      >
        {connector.description}
      </p>

      <div className="mb-3">
        <div className="flex flex-wrap gap-1">
          {connector.dataTypes.slice(0, 2).map((type, idx) => (
            <span
              key={idx}
              className="text-xs px-2 py-1 rounded-full"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                color: 'rgba(255,255,255,0.4)',
                fontFamily: "'Inter', sans-serif"
              }}
            >
              {type}
            </span>
          ))}
          {connector.dataTypes.length > 2 && (
            <span
              className="text-xs px-2 py-1 rounded-full"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                color: 'rgba(255,255,255,0.4)',
                fontFamily: "'Inter', sans-serif"
              }}
            >
              +{connector.dataTypes.length - 2} more
            </span>
          )}
        </div>
      </div>

      {!isConnected && (
        <div className="mt-3">
          {connector.comingSoon ? (
            <div
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm opacity-60 cursor-default"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                color: 'rgba(255,255,255,0.4)',
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500
              }}
            >
              Coming Soon
            </div>
          ) : connector.externalUrl ? (
            <a
              href={connector.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm transition-all"
              style={{
                backgroundColor: connector.color || 'rgba(255, 255, 255, 0.06)',
                color: '#fff',
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Install Extension
            </a>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onConnect(connector.provider);
              }}
              disabled={connectingProvider === connector.provider}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                color: 'var(--foreground)',
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500
              }}
            >
              {connectingProvider === connector.provider ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Connecting...
                </>
              ) : (
                'Connect'
              )}
            </button>
          )}
        </div>
      )}

      {isConnected && needsReconnect && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span
                className="text-sm"
                style={{
                  color: '#f59e0b',
                  fontFamily: "'Inter', sans-serif"
                }}
              >
                Token Expired
              </span>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onConnect(connector.provider);
            }}
            disabled={connectingProvider === connector.provider}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              color: 'var(--foreground)',
              border: '1px solid rgba(255, 255, 255, 0.10)',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 500
            }}
          >
            {connectingProvider === connector.provider ? (
              <>
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Reconnecting...
              </>
            ) : (
              'Reconnect'
            )}
          </button>
        </div>
      )}

      {isConnected && !needsReconnect && (
        <div className="mt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
              <span
                className="text-sm"
                style={{
                  color: 'rgba(255,255,255,0.4)',
                  fontFamily: "'Inter', sans-serif"
                }}
              >
                Connected
              </span>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDisconnect(connector.provider);
              }}
              disabled={disconnectingProvider === connector.provider}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'transparent',
                color: 'rgba(255,255,255,0.4)',
                fontFamily: "'Inter', sans-serif"
              }}
            >
                {disconnectingProvider === connector.provider ? (
                  <>
                    <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Disconnecting
                  </>
                ) : (
                  <>
                    <X className="w-3 h-3" />
                    Disconnect
                  </>
                )}
              </button>
            </div>
        </div>
      )}
    </div>
  );
};
