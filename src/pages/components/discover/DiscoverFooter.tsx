import { T, FOOTER_GLOW_1, FOOTER_GLOW_2, FOOTER_GLOW_3 } from './discoverTokens';

export default function DiscoverFooter() {
  return (
    <footer
      className="relative overflow-hidden"
      style={{ borderTop: `1px solid ${T.CARD_BDR}` }}
    >
      {/* Three layered sunset gradients (exact from Figma footer frame SVG) */}
      <div className="absolute inset-0 pointer-events-none">
        <div style={{ position: 'absolute', inset: 0, background: FOOTER_GLOW_1, opacity: 0.5 }} />
        <div style={{ position: 'absolute', inset: 0, background: FOOTER_GLOW_2, opacity: 0.5 }} />
        <div style={{ position: 'absolute', inset: 0, background: FOOTER_GLOW_3, opacity: 0.5 }} />
      </div>

      <div className="relative max-w-[1512px] mx-auto px-6 md:px-[100px] pt-12 pb-8">
        {/* Top — 2 column links */}
        <div className="flex flex-col sm:flex-row sm:justify-end gap-8 sm:gap-[200px] mb-16 md:mb-[200px]">
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium" style={{ color: T.FG }}>Product</p>
            {[
              { label: 'Features', href: '#features' },
              { label: 'Pricing', href: '#pricing' },
              { label: 'FAQ', href: '#faq' },
            ].map(l => (
              <a key={l.label} href={l.href} className="text-sm hover:opacity-70 transition-opacity" style={{ color: T.TEXT_SEC }}>{l.label}</a>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium" style={{ color: T.FG }}>Legal</p>
            {[
              { label: 'Terms of Service', href: '/terms' },
              { label: 'Privacy Policy', href: '/privacy-policy' },
              { label: 'Contact', href: 'mailto:hello@twinme.me' },
            ].map(l => (
              <a key={l.label} href={l.href} className="text-sm hover:opacity-70 transition-opacity" style={{ color: T.TEXT_SEC }}>{l.label}</a>
            ))}
          </div>
        </div>

        {/* Center — wordmark */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-1">
            <div
              className="w-8 h-8 rounded-full opacity-80"
              style={{ background: 'radial-gradient(circle at 35% 35%, #D4CBBE, #7c2d12)' }}
            />
            <span style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: '36px',
              letterSpacing: '-0.7px',
              color: T.FG,
            }}>
              TwinMe
            </span>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4"
          style={{ borderTop: `1px solid ${T.CARD_BDR}` }}
        >
          <p className="text-sm" style={{ color: T.TEXT_SEC }}>©2026 TwinMe Inc.</p>
          <div className="flex items-center gap-8">
            <a href="/terms" className="text-sm hover:opacity-70 transition-opacity" style={{ color: T.TEXT_SEC }}>Terms of service</a>
            <a href="/privacy-policy" className="text-sm hover:opacity-70 transition-opacity" style={{ color: T.TEXT_SEC }}>Privacy notice</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
