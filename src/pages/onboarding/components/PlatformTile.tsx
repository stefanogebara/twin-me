/**
 * PlatformTile — Dimension.dev-inspired integration tile
 *
 * Clean minimal card: large icon (brand-tinted bg) + name/description + pill action button
 * States: disconnected ("Connect"), connected (checkmark + "Manage"), syncing (spinner)
 */

import React, { useState, useRef, useEffect } from 'react';
import { Check, Loader2, AlertTriangle, LogOut } from 'lucide-react';

interface PlatformTileProps {
  name: string;
  description: string;
  icon: React.ReactNode;
  connected: boolean;
  needsReconnect?: boolean;
  syncing?: boolean;
  comingSoon?: boolean;
  color?: string;
  /** Optional personalized one-liner shown above the generic description. */
  pitchHook?: string | null;
  onConnect: () => void;
  onManage?: () => void;
}

export const PlatformTile: React.FC<PlatformTileProps> = ({
  name,
  description,
  icon,
  connected,
  needsReconnect,
  syncing,
  comingSoon,
  color,
  pitchHook,
  onConnect,
  onManage,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  return (
    <div
      className="flex items-center gap-4 px-5 py-4 rounded-[20px] transition-colors duration-150"
      style={{
        background: needsReconnect ? 'rgba(251,191,36,0.04)' : connected ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        border: `1px solid ${needsReconnect ? 'rgba(251,191,36,0.18)' : connected ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)'}`,
        boxShadow: '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
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
          {connected && !needsReconnect && (
            <Check
              className="w-3.5 h-3.5 flex-shrink-0"
              style={{ color: '#10b981' }}
              strokeWidth={2.5}
            />
          )}
          {needsReconnect && (
            <AlertTriangle
              className="w-3.5 h-3.5 flex-shrink-0"
              style={{ color: '#FBBF24' }}
            />
          )}
        </div>
        {pitchHook && !connected && (
          <span
            className="text-[12px] leading-relaxed block mt-0.5"
            style={{ color: 'var(--accent-vibrant, #c17e2c)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
          >
            {pitchHook}
          </span>
        )}
        <span
          className="text-[12px] leading-relaxed line-clamp-2 block mt-0.5"
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
      ) : needsReconnect ? (
        <button
          onClick={onConnect}
          className="text-[12px] font-medium px-4 py-1.5 rounded-full flex-shrink-0 transition-all duration-150 hover:opacity-90"
          style={{
            backgroundColor: 'rgba(251,191,36,0.15)',
            color: '#FBBF24',
            fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
            border: '1px solid rgba(251,191,36,0.25)',
          }}
        >
          Reconnect
        </button>
      ) : connected ? (
        <div ref={menuRef} className="relative flex-shrink-0">
          <button
            onClick={() => setShowMenu(v => !v)}
            className="text-[12px] px-4 py-1.5 rounded-full transition-all duration-150 hover:bg-[rgba(255,255,255,0.10)]"
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.60)',
              fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            Manage
          </button>
          {showMenu && (
            <div
              className="absolute right-0 top-full mt-1.5 w-40 rounded-[12px] py-1 z-50"
              style={{
                background: 'rgba(28,26,35,0.95)',
                backdropFilter: 'blur(24px)',
                border: '1px solid rgba(255,255,255,0.10)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}
            >
              <button
                onClick={() => { setShowMenu(false); onManage?.(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[12px] transition-colors hover:bg-[rgba(220,38,38,0.08)]"
                style={{ color: 'rgba(220,38,38,0.85)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
              >
                <LogOut className="w-3.5 h-3.5" />
                Disconnect
              </button>
            </div>
          )}
        </div>
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
