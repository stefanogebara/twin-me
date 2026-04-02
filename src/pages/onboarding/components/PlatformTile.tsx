/**
 * PlatformTile — Compact integration tile
 *
 * Bigger icon, smaller card. Just icon + name + action.
 * Description hidden — it's not that important.
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
      className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-colors duration-150"
      style={{
        backgroundColor: connected ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.025)',
        border: `1px solid ${connected ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)'}`,
      }}
    >
      {/* Icon */}
      <div
        className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
        style={{
          backgroundColor: color ? `${color}18` : 'rgba(255,255,255,0.06)',
          color: color || 'rgba(255,255,255,0.45)',
        }}
      >
        {icon}
      </div>

      {/* Name */}
      <span
        className="flex-1 text-[13px] font-medium truncate"
        style={{ color: connected ? '#F5F5F4' : 'rgba(255,255,255,0.60)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
      >
        {name}
      </span>

      {/* Status / Action */}
      {comingSoon ? (
        <span
          className="text-[11px] px-2.5 py-1 rounded-full flex-shrink-0"
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            color: 'rgba(255,255,255,0.20)',
            fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
          }}
        >
          Soon
        </span>
      ) : syncing ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }} />
      ) : connected ? (
        <div className="flex items-center gap-2 flex-shrink-0">
          <Check className="w-3.5 h-3.5" style={{ color: '#10b981' }} strokeWidth={2.5} />
          {onManage && (
            <button
              onClick={onManage}
              className="text-[11px] transition-opacity hover:opacity-70"
              style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
            >
              Manage
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={onConnect}
          className="text-[11px] font-medium px-3 py-1 rounded-full flex-shrink-0 transition-all duration-150 hover:opacity-90"
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
