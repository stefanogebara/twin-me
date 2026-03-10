import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, MessageSquare, Sparkles, Settings, User, Target, Brain, Sun, Moon, ChevronLeft, ChevronRight } from 'lucide-react';

const recentChats = [
  'What makes me unique?',
  'My morning routine patterns',
  'Music taste deep dive',
  'Career values analysis',
  'Social energy insights',
];

interface SundustSidebarProps {
  isLight?: boolean;
  onToggleTheme?: () => void;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
}

const navItems = [
  { path: '/prototype/dashboard', icon: Sparkles, label: 'Home' },
  { path: '/prototype/chat', icon: MessageSquare, label: 'Talk to Twin' },
  { path: '/prototype/identity', icon: User, label: 'Identity' },
  { path: '/prototype/goals', icon: Target, label: 'Goals' },
  { path: '/prototype/brain', icon: Brain, label: 'Brain' },
  { path: '/prototype/settings', icon: Settings, label: 'Settings' },
];

export const SundustSidebar: React.FC<SundustSidebarProps> = ({
  isLight = false,
  onToggleTheme,
  isCollapsed = false,
  onToggleCollapsed,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside
      className="sd-sidebar flex flex-col"
      style={{
        width: isCollapsed ? 64 : 296,
        minWidth: isCollapsed ? 64 : 296,
        height: '100vh',
        flexShrink: 0,
        transition: 'width 0.2s ease, min-width 0.2s ease',
        overflow: 'hidden',
      }}
    >
      {/* Logo */}
      <div style={{
        padding: isCollapsed ? '16px 8px' : '20px 16px 16px',
        borderBottom: '1px solid var(--sd-separator)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: isCollapsed ? 'center' : 'flex-start',
        gap: 8,
        flexShrink: 0,
      }}>
        <button
          onClick={() => navigate('/prototype')}
          title="Twin Me"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            flexShrink: 0,
          }}
        >
          <div style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            overflow: 'hidden',
            flexShrink: 0,
          }}>
            <img
              src="/images/backgrounds/flower.png"
              alt="Twin Me"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          {!isCollapsed && (
            <span style={{
              fontFamily: '"Instrument Serif", Georgia, serif',
              fontSize: 18,
              fontWeight: 400,
              color: 'var(--sd-fg)',
              letterSpacing: '-0.02em',
              whiteSpace: 'nowrap',
            }}>
              Twin Me
            </span>
          )}
        </button>
      </div>

      {/* New Chat button */}
      <div style={{
        padding: isCollapsed ? '10px 8px' : '12px 12px 8px',
        flexShrink: 0,
      }}>
        {isCollapsed ? (
          <button
            onClick={() => navigate('/prototype/chat')}
            title="New chat"
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'var(--sd-btn-dark-bg)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto',
              color: '#fdfcfb',
              transition: 'opacity 0.15s ease',
            }}
          >
            <Plus size={16} />
          </button>
        ) : (
          <button
            className="sd-btn-dark"
            onClick={() => navigate('/prototype/chat')}
            style={{ width: '100%', justifyContent: 'center', borderRadius: 6, height: 36 }}
          >
            <Plus size={14} />
            New chat
          </button>
        )}
      </div>

      {/* Nav items */}
      <div style={{
        padding: isCollapsed ? '4px 8px 8px' : '4px 8px 8px',
        borderBottom: '1px solid var(--sd-separator)',
        flexShrink: 0,
      }}>
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path;
          return (
            <button
              key={path}
              className={`sd-nav-item${isActive ? ' active' : ''}`}
              onClick={() => navigate(path)}
              title={isCollapsed ? label : undefined}
              style={{
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                padding: isCollapsed ? '8px' : '8px 12px',
              }}
            >
              <Icon
                size={15}
                style={{ color: isActive ? 'var(--sd-fg)' : undefined, flexShrink: 0 }}
              />
              {!isCollapsed && label}
            </button>
          );
        })}
      </div>

      {/* Recents — hidden when collapsed */}
      {!isCollapsed && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }} className="sd-scroll">
          <div style={{
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--sd-text-muted)',
            padding: '0 8px 8px',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            Recent
          </div>
          {recentChats.map((chat, i) => (
            <button
              key={i}
              className="sd-nav-item"
              onClick={() => navigate('/prototype/chat')}
              style={{ fontSize: 13 }}
            >
              <MessageSquare size={13} style={{ flexShrink: 0, opacity: 0.5 }} />
              <span style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {chat}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Spacer when collapsed (recents hidden) */}
      {isCollapsed && <div style={{ flex: 1 }} />}

      {/* Bottom controls: theme toggle + collapse toggle side by side */}
      <div style={{
        padding: isCollapsed ? '12px 8px' : '10px 12px',
        borderTop: '1px solid var(--sd-separator)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: isCollapsed ? 'center' : 'space-between',
        gap: 4,
        flexShrink: 0,
      }}>
        {/* Theme toggle — always shown, centered when collapsed */}
        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--sd-text-muted)',
              padding: 6,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'color 0.15s ease',
            }}
          >
            {isLight ? <Moon size={15} /> : <Sun size={15} />}
          </button>
        )}

        {/* Collapse toggle — hidden when already collapsed to keep icon-only layout clean */}
        {onToggleCollapsed && !isCollapsed && (
          <button
            onClick={onToggleCollapsed}
            title="Collapse sidebar"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--sd-text-muted)',
              padding: 6,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'color 0.15s ease',
            }}
          >
            <ChevronLeft size={15} />
          </button>
        )}

        {/* When collapsed: show expand chevron centered */}
        {onToggleCollapsed && isCollapsed && (
          <button
            onClick={onToggleCollapsed}
            title="Expand sidebar"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--sd-text-muted)',
              padding: 6,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'color 0.15s ease',
            }}
          >
            <ChevronRight size={15} />
          </button>
        )}
      </div>
    </aside>
  );
};
