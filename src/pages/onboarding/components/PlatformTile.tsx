/**
 * PlatformTile — one platform as a row of the page kit: a 32px brand icon, the
 * name, one grey line, one action. Render it inside a List.
 * States: disconnected ("Connect"), connected ("Manage" menu), syncing, soon.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Loader2, LogOut, RefreshCw } from 'lucide-react';
import { Row } from '@/components/register';

interface PlatformTileProps {
  name: string;
  description: string;
  icon: React.ReactNode;
  connected: boolean;
  needsReconnect?: boolean;
  syncing?: boolean;
  comingSoon?: boolean;
  color?: string;
  /** Optional personalized one-liner shown in place of the generic description. */
  pitchHook?: string | null;
  /** Static inline caveat shown after the description (e.g. account requirements). */
  note?: string | null;
  /**
   * audit-2026-05-12 H6: connected platforms that need a nudge but aren't
   * full-blown expired. e.g. last_sync > 7 days, or last_sync_status='partial'.
   * Shown as "Needs attention" in the row's line — does NOT change the
   * connect/reconnect button. Pass `null` or omit for healthy platforms.
   */
  attention?: string | null;
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
  note,
  attention,
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

  // State in the line: ok text for connected (5.1:1), ink at 500 for the
  // warnings (the old amber chip was 1.44:1).
  const line = needsReconnect
    ? <span className="rs-strong">Needs reconnecting</span>
    : connected && attention
      ? <><span className="rs-strong">Needs attention</span> · {attention}</>
      : connected
        ? <span className="rs-ok">Connected</span>
        : <>{pitchHook || description}{note ? ` · ${note}` : ''}</>;

  const action = comingSoon ? (
    <span className="rs-quiet">Soon</span>
  ) : syncing ? (
    <span className="rs-quiet" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      Syncing
    </span>
  ) : needsReconnect ? (
    <button type="button" onClick={onConnect} className="n-btn n-btn--ghost">Reconnect</button>
  ) : connected ? (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setShowMenu(v => !v)}
        aria-expanded={showMenu}
        aria-haspopup="menu"
        className="n-btn n-btn--ghost"
      >
        Manage
      </button>
      {showMenu && (
        <div className="rs-menu" role="menu">
          {attention && (
            <button type="button" role="menuitem" onClick={() => { setShowMenu(false); onConnect(); }}>
              <RefreshCw aria-hidden="true" />
              Reconnect
            </button>
          )}
          <button type="button" role="menuitem" className="rs-bad" onClick={() => { setShowMenu(false); onManage?.(); }}>
            <LogOut aria-hidden="true" />
            Disconnect
          </button>
        </div>
      )}
    </div>
  ) : (
    <button type="button" onClick={onConnect} className="n-btn n-btn--ghost">Connect</button>
  );

  return (
    <Row
      // The brand colour lives in the icon square only.
      icon={<span style={{ display: 'grid', placeItems: 'center', color: color || 'var(--rg-ink-2)' }}>{icon}</span>}
      title={name}
      line={line}
      action={action}
      // A row whose menu is open sits above the rows under it.
      className={showMenu ? 'rs-menu-open' : undefined}
    />
  );
};

export default PlatformTile;
