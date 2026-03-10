import React, { useState } from 'react';
import { Music, Calendar, Youtube, MessageSquare, Briefcase } from 'lucide-react';
import '../sundust.css';

type Tab = 'Account' | 'Plans & Billing' | 'API keys';
const TABS: Tab[] = ['Account', 'Plans & Billing', 'API keys'];

const platforms = [
  { name: 'Spotify', icon: <Music size={16} />, status: 'connected', desc: '16,482 tracks analyzed' },
  { name: 'Google Calendar', icon: <Calendar size={16} />, status: 'connected', desc: '2,340 events imported' },
  { name: 'YouTube', icon: <Youtube size={16} />, status: 'connected', desc: '890 videos analyzed' },
  { name: 'Discord', icon: <MessageSquare size={16} />, status: 'disconnected', desc: 'Connect to add messaging patterns' },
  { name: 'LinkedIn', icon: <Briefcase size={16} />, status: 'disconnected', desc: 'Connect to add professional context' },
];

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "'Poppins', 'Inter', sans-serif",
  fontSize: 18,
  fontWeight: 600,
  color: 'var(--sd-fg)',
  letterSpacing: '-0.01em',
  marginBottom: 4,
  marginTop: 32,
};

const firstSectionHeadingStyle: React.CSSProperties = {
  ...sectionHeadingStyle,
  marginTop: 0,
};

export default function PrototypeSettings() {
  const [activeTab, setActiveTab] = useState<Tab>('Account');
  const [privacyMode, setPrivacyMode] = useState(true);
  const [customInstructions, setCustomInstructions] = useState('');

  return (
    <div
      style={{ flex: 1, overflowY: 'auto', padding: '24px 32px 48px', display: 'flex', flexDirection: 'column' }}
      className="sd-scroll"
    >
      {/* Glass card wrapper fills main area */}
      <div
        className="sd-settings-card"
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {/* Inner scroll area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px 40px' }} className="sd-scroll">
          <div style={{ maxWidth: 694, margin: '0 auto' }}>

            {/* Settings title — Poppins */}
            <h1 style={{
              fontFamily: "'Poppins', 'Inter', sans-serif",
              fontSize: 20,
              fontWeight: 600,
              color: 'var(--sd-fg)',
              letterSpacing: '-0.02em',
              marginBottom: 20,
              lineHeight: 1.2,
            }}>
              Settings
            </h1>

            {/* Tabs */}
            <div style={{
              display: 'flex',
              gap: 0,
              borderBottom: '1px solid var(--sd-separator)',
              marginBottom: 28,
            }}>
              {TABS.map(tab => (
                <button
                  key={tab}
                  className={`sd-tab${activeTab === tab ? ' active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                  style={{ marginRight: 8 }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* ─── ACCOUNT TAB ─── */}
            {activeTab === 'Account' && (
              <div>
                {/* Account section heading */}
                <div style={firstSectionHeadingStyle}>Account</div>

                {/* Full name row */}
                <div className="sd-settings-row">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--sd-fg)', marginBottom: 4 }}>
                      Full name
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--sd-text-secondary)' }}>
                      How your twin addresses you
                    </div>
                  </div>
                  <div style={{ width: 240 }}>
                    <input
                      type="text"
                      defaultValue="Stefano Gebara"
                      className="sd-input"
                    />
                  </div>
                </div>

                {/* Email row */}
                <div className="sd-settings-row">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--sd-fg)', marginBottom: 4 }}>
                      Email
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--sd-text-secondary)' }}>
                      Login and notifications
                    </div>
                  </div>
                  <div style={{ width: 240 }}>
                    <input
                      type="email"
                      defaultValue="stefanogebara@gmail.com"
                      className="sd-input"
                      disabled
                      style={{ opacity: 0.5, cursor: 'not-allowed' }}
                    />
                  </div>
                </div>

                {/* Preferences section heading */}
                <div style={sectionHeadingStyle}>Preferences</div>

                {/* Custom instructions row — VERTICAL layout (label above, textarea full-width below) */}
                <div
                  className="sd-settings-row"
                  style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--sd-fg)', marginBottom: 4 }}>
                      Custom instructions
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--sd-text-secondary)', lineHeight: 1.6 }}>
                      Guide how your twin thinks and communicates with you
                    </div>
                  </div>
                  <textarea
                    value={customInstructions}
                    onChange={e => setCustomInstructions(e.target.value)}
                    placeholder="e.g. Always be direct. Skip pleasantries."
                    className="sd-input"
                    style={{ resize: 'vertical', minHeight: 80, lineHeight: 1.5, width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Privacy mode row — HORIZONTAL */}
                <div className="sd-settings-row">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--sd-fg)', marginBottom: 4 }}>
                      Privacy mode
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--sd-text-secondary)', lineHeight: 1.6, maxWidth: 340 }}>
                      Restrict what your twin shares with external services
                    </div>
                  </div>
                  <button
                    className={`sd-toggle${privacyMode ? ' on' : ' off'}`}
                    onClick={() => setPrivacyMode(v => !v)}
                  />
                </div>

                {/* Data & Platforms section heading */}
                <div style={sectionHeadingStyle}>Data &amp; Platforms</div>

                {platforms.map((platform, i) => (
                  <div key={i} className="sd-settings-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                      <span style={{ color: 'var(--sd-text-secondary)', display: 'flex' }}>{platform.icon}</span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--sd-fg)', marginBottom: 3 }}>
                          {platform.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--sd-text-secondary)' }}>
                          {platform.desc}
                        </div>
                      </div>
                    </div>
                    {platform.status === 'connected' ? (
                      <span style={{
                        fontSize: 11,
                        fontWeight: 500,
                        padding: '3px 10px',
                        borderRadius: 100,
                        background: 'rgba(52,211,153,0.1)',
                        color: '#34d399',
                        border: '1px solid rgba(52,211,153,0.2)',
                        flexShrink: 0,
                      }}>
                        Connected
                      </span>
                    ) : (
                      <button className="sd-btn-dark" style={{ fontSize: 13, height: 32 }}>
                        Connect
                      </button>
                    )}
                  </div>
                ))}

                {/* Save */}
                <div style={{ marginTop: 32 }}>
                  <button className="sd-btn-dark">Save changes</button>
                </div>
              </div>
            )}

            {/* ─── PLANS & BILLING TAB ─── */}
            {activeTab === 'Plans & Billing' && (
              <div>
                <div style={firstSectionHeadingStyle}>Current plan</div>

                <div className="sd-card" style={{ padding: '24px', borderRadius: 8, marginBottom: 24, marginTop: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--sd-fg)', marginBottom: 6 }}>
                        Free
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--sd-text-secondary)', lineHeight: 1.6 }}>
                        5 platforms &middot; 20,000 memory limit &middot; Basic twin chat
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '3px 10px',
                      borderRadius: 100,
                      background: 'rgba(52,211,153,0.1)',
                      color: '#34d399',
                      border: '1px solid rgba(52,211,153,0.2)',
                    }}>
                      Active
                    </span>
                  </div>
                </div>

                <button className="sd-btn-dark">Upgrade to Pro</button>
              </div>
            )}

            {/* ─── API KEYS TAB ─── */}
            {activeTab === 'API keys' && (
              <div>
                <div style={firstSectionHeadingStyle}>API keys</div>

                <div className="sd-settings-row" style={{ marginTop: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--sd-fg)', marginBottom: 4 }}>
                      Twin API key
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--sd-text-secondary)' }}>
                      Use this key to access your twin programmatically
                    </div>
                  </div>
                  <div style={{ width: 240, display: 'flex', gap: 8 }}>
                    <input
                      type="password"
                      defaultValue="tm_sk_................"
                      className="sd-input"
                      readOnly
                      style={{ flex: 1 }}
                    />
                    <button className="sd-btn-dark" style={{ flexShrink: 0, fontSize: 12, padding: '0 12px' }}>
                      Copy
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 24 }}>
                  <button className="sd-btn-dark">Generate new key</button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
