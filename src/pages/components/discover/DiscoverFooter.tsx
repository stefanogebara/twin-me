import { T } from './discoverTokens';

export default function DiscoverFooter() {
  return (
    <footer className="px-6 md:px-[100px] py-16">
      <div className="max-w-[800px] mx-auto">
        <div className="h-px mb-12" style={{ background: 'rgba(255,255,255,0.06)' }} />

        <div className="flex flex-col sm:flex-row items-start justify-between gap-8 mb-16">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <img src="/images/backgrounds/flower.png" alt="" className="w-6 h-6 rounded-full object-cover" />
            <span style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: '20px',
              letterSpacing: '-0.4px',
              color: T.FG,
            }}>
              TwinMe
            </span>
          </div>

          {/* Links */}
          <div className="flex gap-16">
            <div className="flex flex-col gap-2.5">
              <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Product</p>
              {['Features', 'Pricing', 'FAQ'].map(l => (
                <a key={l} href={`#${l.toLowerCase()}`} className="text-sm hover:opacity-70 transition-opacity" style={{ color: 'rgba(255,255,255,0.5)' }}>{l}</a>
              ))}
            </div>
            <div className="flex flex-col gap-2.5">
              <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Legal</p>
              <a href="/terms" className="text-sm hover:opacity-70 transition-opacity" style={{ color: 'rgba(255,255,255,0.5)' }}>Terms</a>
              <a href="/privacy-policy" className="text-sm hover:opacity-70 transition-opacity" style={{ color: 'rgba(255,255,255,0.5)' }}>Privacy</a>
              <a href="mailto:hello@twinme.me" className="text-sm hover:opacity-70 transition-opacity" style={{ color: 'rgba(255,255,255,0.5)' }}>Contact</a>
            </div>
          </div>
        </div>

        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
          &copy; 2026 TwinMe. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
