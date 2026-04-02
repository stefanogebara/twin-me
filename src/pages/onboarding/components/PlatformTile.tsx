/**
 * PlatformTile — Dimension.dev-inspired integration tile
 *
 * Clean minimal card: large icon (brand-tinted bg) + name/description + pill action button
 * States: disconnected ("Connect"), connected (checkmark + "Manage"), syncing (spinner)
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
  color?: string;
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
  color,
  onConnect,
  onManage,
}) => {
  return (
    <div
      className="flex items-center gap-4 px-5 py-4 rounded-2xl transition-colors duration-150"
      style={{
        backgroundColor: connected ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${connected ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      {/* Icon — brand-tinted background */}
      <div
        className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
        style={{
          backgroundColor: color ? `${color}15` : 'rgba(255,255,255,0.06)',
          color: connected ? (color || '#F5F5F4') : (color ? `${color}cc` : 'rgba(255,255,255,0.45)'),
        }}
      >
        {icon}
      </div>

      {/* Name + Description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="text-[14px] font-medium truncate"
            style={{ color: '#F5F5F4', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
          >
            {name}
          </span>
          {connected && (
            <Check
              className="w-3.5 h-3.5 flex-shrink-0"
              style={{ color: '#10b981' }}
              strokeWidth={2.5}
            />
          )}
        </div>
        <span
          className="text-[12px] leading-relaxed truncate block mt-0.5"
          style={{ color: 'rgba(255,255,255,0.50)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
        >
          {description}
        </span>
      </div>

      {/* Action Button — pill shape */}
      {comingSoon ? (
        <span
          className="text-[12px] px-4 py-1.5 rounded-full flex-shrink-0"
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            color: 'rgba(255,255,255,0.25)',
            fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
          }}
        >
          Soon
        </span>
      ) : syncing ? (
        <div
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-full flex-shrink-0"
          style={{
            backgroundColor: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.50)',
          }}
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span className="text-[12px]" style={{ fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}>Syncing</span>
        </div>
      ) : connected ? (
        <button
          onClick={onManage || onConnect}
          className="text-[12px] px-4 py-1.5 rounded-full flex-shrink-0 transition-all duration-150 hover:bg-[rgba(255,255,255,0.10)]"
          style={{
            backgroundColor: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.60)',
            fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          Manage
        </button>
      ) : (
        <button
          onClick={onConnect}
          className="text-[12px] font-medium px-4 py-1.5 rounded-full flex-shrink-0 transition-all duration-150 hover:opacity-90"
          style={{
            backgroundColor: '#F5F5F4',
            color: '#110f0f',
            fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
          }}
        >
          Connect
        </button>
      )}
    </div>
  );
};

export default PlatformTile;
