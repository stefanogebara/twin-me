import { Menu, X } from 'lucide-react';
import { T } from './discoverTokens';

interface DiscoverNavProps {
  mobileMenuOpen: boolean;
  onOpenMobileMenu: () => void;
  onCloseMobileMenu: () => void;
  onNavigate: (path: string) => void;
}

export default function DiscoverNav({
  mobileMenuOpen,
  onOpenMobileMenu,
  onCloseMobileMenu,
  onNavigate,
}: DiscoverNavProps) {
  const glassStyle = {
    background: T.CARD_BG,
    border: `1px solid ${T.CARD_BDR}`,
  };

  return (
    <>
      {/* ══ NAV ══════════════════════════════════════════════════════════ */}
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-full max-w-[878px] px-4">
        <nav
          className="flex items-center pl-5 pr-3 py-[10px] rounded-[32px] gap-9"
          style={{
            ...glassStyle,
            backdropFilter: 'blur(19.65px)',
            WebkitBackdropFilter: 'blur(19.65px)',
          }}
        >
          {/* Logo — flower circle overlaps wordmark by 21px (Figma exact) */}
          <div className="flex items-center shrink-0" style={{ width: '108px', paddingRight: '21px' }}>
            <div
              className="flex items-center justify-center shrink-0 rounded-full overflow-hidden"
              style={{
                width: '32px', height: '32px',
                marginRight: '-21px',
                zIndex: 1,
                flexShrink: 0,
              }}
            >
              <img
                src="/images/backgrounds/flower.png"
                alt="TwinMe"
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
              />
            </div>
            <span style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: '25.36px',
              letterSpacing: '-0.507px',
              color: T.FG,
              marginRight: '-21px',
              whiteSpace: 'nowrap',
              position: 'relative',
              zIndex: 2,
            }}>
              TwinMe
            </span>
          </div>

          {/* Nav links — hidden on mobile */}
          <div
            className="hidden md:flex items-center px-5 gap-14 flex-1"
            style={{ fontFamily: "'Poppins', sans-serif", fontSize: '14px', color: T.FG }}
          >
            <a href="#how-it-works" className="hover:opacity-60 transition-opacity whitespace-nowrap">How it works</a>
            <a href="#features"     className="hover:opacity-60 transition-opacity whitespace-nowrap">Features</a>
            <a href="#pricing"      className="hover:opacity-60 transition-opacity whitespace-nowrap">Pricing</a>
            <a href="#faq"          className="hover:opacity-60 transition-opacity whitespace-nowrap">FAQ</a>
          </div>

          {/* Divider — hidden on mobile */}
          <div className="hidden md:block w-px self-stretch" style={{ background: T.CARD_BDR }} />

          {/* Desktop actions — hidden on mobile */}
          <div className="hidden md:flex items-center gap-1 shrink-0">
            <button
              onClick={() => onNavigate('/auth')}
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '12px',
                fontWeight: 500,
                lineHeight: '24px',
                color: T.FG,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                minWidth: '64px',
                padding: '2px 8px',
                borderRadius: '6px',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--input)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              Sign in
            </button>
            <button
              onClick={() => onNavigate('/auth')}
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '14px',
                fontWeight: 500,
                lineHeight: '24px',
                color: T.SIGN_UP_FG,
                background: T.SIGN_UP_BG,
                border: 'none',
                cursor: 'pointer',
                height: '36px',
                minWidth: '80px',
                padding: '6px 12px',
                borderRadius: '100px',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              Sign up
            </button>
          </div>

          {/* Mobile: hamburger — visible only on mobile */}
          <div className="flex md:hidden items-center gap-1 ml-auto shrink-0">
            <button
              onClick={onOpenMobileMenu}
              className="flex items-center justify-center w-8 h-8 rounded-full transition-opacity hover:opacity-70"
              style={{ color: T.FG }}
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </nav>
      </div>

      {/* ══ MOBILE MENU OVERLAY ════════════════════════════════════════════ */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={onCloseMobileMenu}
          />
          <div
            className="absolute top-0 left-0 right-0 rounded-b-[20px] px-6 pt-5 pb-8"
            style={{
              background: 'rgba(27, 24, 24, 0.95)',
              borderBottom: `1px solid ${T.CARD_BDR}`,
              boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
            }}
          >
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center" style={{ width: '108px', paddingRight: '21px' }}>
                <div
                  className="flex items-center justify-center shrink-0 rounded-full overflow-hidden"
                  style={{ width: '32px', height: '32px', marginRight: '-21px', zIndex: 1, flexShrink: 0 }}
                >
                  <img
                    src="/images/backgrounds/flower.png"
                    alt="TwinMe"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
                  />
                </div>
                <span style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  fontSize: '25.36px',
                  letterSpacing: '-0.507px',
                  color: T.FG,
                  marginRight: '-21px',
                  whiteSpace: 'nowrap',
                  position: 'relative',
                  zIndex: 2,
                }}>
                  TwinMe
                </span>
              </div>
              <button
                onClick={onCloseMobileMenu}
                className="flex items-center justify-center w-8 h-8 rounded-full transition-opacity hover:opacity-70"
                style={{ color: T.FG }}
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-1 mb-6">
              {[
                { label: 'How it works', href: '#how-it-works' },
                { label: 'Features',     href: '#features' },
                { label: 'Pricing',      href: '#pricing' },
                { label: 'FAQ',          href: '#faq' },
              ].map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  onClick={onCloseMobileMenu}
                  className="block py-3 px-3 rounded-[12px] transition-colors duration-150 ease-out"
                  style={{
                    fontFamily: "'Poppins', sans-serif",
                    fontSize: '16px',
                    color: T.FG,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--input)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {label}
                </a>
              ))}
            </div>

            <div className="h-px mb-6" style={{ background: T.CARD_BDR }} />

            <div className="flex flex-col gap-3">
              <button
                onClick={() => { onCloseMobileMenu(); onNavigate('/auth'); }}
                className="flex items-center justify-center h-11 w-full rounded-[100px] text-sm font-medium transition-opacity hover:opacity-90"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  background: T.SIGN_UP_BG,
                  color: T.SIGN_UP_FG,
                }}
              >
                Get Started
              </button>
              <button
                onClick={() => { onCloseMobileMenu(); onNavigate('/auth'); }}
                className="flex items-center justify-center h-11 w-full rounded-[100px] text-sm font-medium transition-opacity hover:opacity-80"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  background: 'transparent',
                  color: T.FG,
                  border: `1px solid ${T.CARD_BDR}`,
                }}
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
