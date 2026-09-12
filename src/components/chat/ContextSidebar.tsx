import { useNavigate } from 'react-router-dom';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Platform {
  name: string;
  icon: React.ReactNode;
  key: string;
  color: string;
  connected: boolean | undefined;
}

interface ContextItem {
  type: 'memory' | 'fact' | 'platform' | 'personality';
  label: string;
  value: string;
  timestamp?: string;
  icon?: React.ReactNode;
}

interface ContextSidebarProps {
  showContext: boolean;
  onClose: () => void;
  platforms: Platform[];
  contextItems: ContextItem[];
  isLoadingContext: boolean;
}

/**
 * The chat's context panel, in the register: the page colour behind a
 * hairline, sentence-case labels as row titles, and a platform's colour kept
 * to its icon (verdigris was the label colour, 3.4:1 as 11px text).
 */
export const ContextSidebar = ({
  showContext,
  onClose,
  platforms,
  contextItems,
  isLoadingContext,
}: ContextSidebarProps) => {
  const navigate = useNavigate();

  return (
    <aside
      aria-label="Chat context"
      className={cn(
        "w-64 hidden md:block overflow-y-auto",
        !showContext && "md:hidden"
      )}
      style={{
        background: 'var(--rg-page)',
        borderLeft: '1px solid var(--rg-rule)',
      }}
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <span className="rg-row-title">Context</span>
          <button type="button" onClick={onClose} className="rg-iconbtn" aria-label="Close context panel">
            <X aria-hidden="true" />
          </button>
        </div>

        {/* Data Sources */}
        <div className="mb-6">
          <h3 className="rg-row-title" style={{ marginBottom: 8 }}>Sources</h3>
          <ul className="rg-list">
            {platforms.map((platform) => (
              <li
                key={platform.key}
                className="flex items-center justify-between"
                style={{ padding: '8px 0', borderBottom: '1px solid var(--rg-rule)' }}
              >
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" style={{ color: platform.connected ? platform.color : 'var(--rg-quiet)' }}>
                    {platform.icon}
                  </span>
                  <span style={{ color: platform.connected ? 'var(--rg-ink)' : 'var(--rg-ink-3)' }}>
                    {platform.name}
                  </span>
                </div>
                {platform.connected ? (
                  <span style={{ color: 'var(--rg-ink-3)', fontWeight: 350 }}>On</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate('/get-started')}
                    className="transition-opacity hover:opacity-70"
                    style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'var(--rg-ink)', textDecoration: 'underline', textUnderlineOffset: '3px', cursor: 'pointer' }}
                  >
                    Connect
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Active Context */}
        <div className="mb-6">
          <h3 className="rg-row-title" style={{ marginBottom: 8 }}>In this conversation</h3>
          {isLoadingContext ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--rg-ink-3)' }} aria-label="Loading context" />
            </div>
          ) : contextItems.filter(i => i.type !== 'platform').length > 0 ? (
            <ul className="rg-list">
              {contextItems.filter(i => i.type !== 'platform').map((item, idx) => (
                <li key={idx} className="rg-row-text" style={{ padding: '10px 0', borderBottom: '1px solid var(--rg-rule)' }}>
                  <span className="rg-row-title">{item.label}</span>
                  <span className="rg-row-line">{item.value}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rg-empty" style={{ padding: 0 }}>Context loads when you chat</p>
          )}
        </div>
        {/* replan-2026-06-10 chat declutter: Platforms/Messages stats block
            deleted — vanity counts, duplicated the (also deleted) Today
            sidebar stats row. */}
      </div>
    </aside>
  );
};
