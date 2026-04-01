/**
 * PlatformTile — Dimension.dev-inspired integration tile
 *
 * Glass card with: icon (left) + name & description (center) + action button (right)
 * States: disconnected ("Connect"), connected (green dot + "Manage"), syncing (spinner)
 */

import React from 'react';
import { Check, Loader2 } from 'lucide-react';

interface PlatformTileProps {
  name: string;
  description: string;
  icon: React.ReactNode;
  connected: boolean;
  syncing?: boolean;
  comingSoon?: boolean;
  onConnect: () => void;
  onManage?: () => void;
}

export const PlatformTile: React.FC<PlatformTileProps> = ({
  name,
  description,
  icon,
  connected,
  syncing,
  comingSoon,
  onConnect,
  onManage,
}) => {
  return (
    <div
      className="flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-200 hover:scale-[1.01]"
      style={{
        backgroundColor: connected ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${connected ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      {/* Icon */}
      <div
        className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
        style={{
          backgroundColor: 'rgba(255,255,255,0.08)',
          color: connected ? '#F5F5F4' : 'rgba(255,255,255,0.5)',
        }}
      >
        {icon}
      </div>

      {/* Name + Description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-medium truncate"
            style={{ color: '#F5F5F4', fontFamily: "'Inter', sans-serif" }}
          >
            {name}
          </span>
          {connected && (
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#10b981' }} />
          )}
        </div>
        <span
          className="text-xs truncate block mt-0.5"
          style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}
        >
          {description}
        </span>
      </div>

      {/* Action Button */}
      {comingSoon ? (
        <span
          className="text-[11px] px-3 py-1.5 rounded-lg flex-shrink-0"
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            color: 'rgba(255,255,255,0.3)',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Soon
        </span>
      ) : syncing ? (
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg flex-shrink-0"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span className="text-xs" style={{ fontFamily: "'Inter', sans-serif" }}>Syncing</span>
        </div>
      ) : connected ? (
        <button
          onClick={onManage || onConnect}
          className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0 transition-opacity hover:opacity-80"
          style={{
            backgroundColor: 'rgba(255,255,255,0.08)',
            color: '#F5F5F4',
            fontFamily: "'Inter', sans-serif",
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          Manage
        </button>
      ) : (
        <button
          onClick={onConnect}
          className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0 transition-opacity hover:opacity-80"
          style={{
            backgroundColor: 'rgba(255,255,255,0.08)',
            color: '#F5F5F4',
            fontFamily: "'Inter', sans-serif",
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          Connect
        </button>
      )}
    </div>
  );
};

export default PlatformTile;
