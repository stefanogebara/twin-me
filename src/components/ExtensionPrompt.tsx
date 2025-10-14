import React, { useState, useEffect } from 'react';
import { Download, Check, ExternalLink, Sparkles, Info } from 'lucide-react';

const EXTENSION_ID = 'acnofcjjfjaikcfnalggkkbghjaijepc';
const CHROME_STORE_URL = 'https://chrome.google.com/webstore/detail/soul-observer-twinme/' + EXTENSION_ID;

export const ExtensionPrompt: React.FC = () => {
  const [extensionStatus, setExtensionStatus] = useState<'checking' | 'installed' | 'not-installed'>('checking');
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    checkExtensionInstalled();
  }, []);

  const checkExtensionInstalled = () => {
    // Check if extension is installed by trying to send a message
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage(
          EXTENSION_ID,
          { type: 'PING' },
          (response) => {
            if (chrome.runtime.lastError) {
              // Extension not installed
              setExtensionStatus('not-installed');
            } else {
              // Extension is installed
              setExtensionStatus('installed');
            }
          }
        );
      } catch (error) {
        setExtensionStatus('not-installed');
      }
    } else {
      setExtensionStatus('not-installed');
    }
  };

  const handleInstallClick = () => {
    window.open(CHROME_STORE_URL, '_blank');
  };

  const handleActivateClick = () => {
    // Open extension management page
    window.open('chrome://extensions/?id=' + EXTENSION_ID, '_blank');
  };

  if (extensionStatus === 'checking') {
    return null; // Or a loading skeleton
  }

  return (
    <div
      className="mb-6 rounded-2xl border overflow-hidden transition-all"
      style={{
        backgroundColor: 'white',
        borderColor: extensionStatus === 'installed' ? '#10B981' : '#D97706'
      }}
    >
      {/* Header */}
      <div
        className="p-4 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          backgroundColor: extensionStatus === 'installed' ? '#ECFDF5' : '#FEF3C7'
        }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: extensionStatus === 'installed' ? '#10B981' : '#D97706'
              }}
            >
              {extensionStatus === 'installed' ? (
                <Check className="w-5 h-5 text-white" />
              ) : (
                <Sparkles className="w-5 h-5 text-white" />
              )}
            </div>
            <div className="flex-1">
              <h3
                className="text-lg font-semibold mb-1"
                style={{
                  color: '#141413',
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  letterSpacing: '-0.02em'
                }}
              >
                {extensionStatus === 'installed' ? (
                  '✓ Soul Observer Extension Active'
                ) : (
                  '🧠 Unlock Deep Soul Insights with Our Extension'
                )}
              </h3>
              <p
                className="text-sm"
                style={{
                  color: '#6B7280',
                  fontFamily: 'var(--_typography---font--tiempos)'
                }}
              >
                {extensionStatus === 'installed' ? (
                  'Your extension is capturing authentic behavioral patterns in real-time'
                ) : (
                  'Track your browsing patterns, typing style, and digital habits for a more accurate soul signature'
                )}
              </p>
            </div>
          </div>
          <button
            className="ml-2 flex-shrink-0"
            style={{ color: extensionStatus === 'installed' ? '#10B981' : '#D97706' }}
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div
          className="p-6 border-t"
          style={{ borderColor: 'rgba(20,20,19,0.1)' }}
        >
          {extensionStatus === 'not-installed' ? (
            <>
              {/* Not Installed - Show Features */}
              <div className="mb-6">
                <h4
                  className="text-sm font-semibold mb-3"
                  style={{
                    color: '#141413',
                    fontFamily: 'var(--_typography---font--styrene-a)',
                    letterSpacing: '-0.02em'
                  }}
                >
                  What Soul Observer Captures:
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { icon: '⌨️', title: 'Typing Patterns', desc: 'Your unique writing style and cadence' },
                    { icon: '🖱️', title: 'Mouse Behavior', desc: 'How you navigate and interact' },
                    { icon: '📖', title: 'Reading Speed', desc: 'Your comprehension and attention patterns' },
                    { icon: '🔍', title: 'Search Habits', desc: 'Your curiosities and interests' },
                    { icon: '🛒', title: 'Decision Making', desc: 'How you research and choose' },
                    { icon: '⏱️', title: 'Focus Patterns', desc: 'When and how long you concentrate' }
                  ].map((feature, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 p-2 rounded-lg"
                      style={{ backgroundColor: '#FAF9F5' }}
                    >
                      <span className="text-xl flex-shrink-0">{feature.icon}</span>
                      <div>
                        <div
                          className="text-sm font-medium"
                          style={{ color: '#141413' }}
                        >
                          {feature.title}
                        </div>
                        <div
                          className="text-xs"
                          style={{ color: '#6B7280' }}
                        >
                          {feature.desc}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Privacy Note */}
              <div
                className="mb-4 p-3 rounded-lg"
                style={{ backgroundColor: '#F3F4F6' }}
              >
                <div className="flex items-start gap-2">
                  <span className="text-lg">🔒</span>
                  <div className="text-sm" style={{ color: '#6B7280' }}>
                    <strong style={{ color: '#141413' }}>100% Private & Secure:</strong> All data is encrypted and stays with you.
                    You can disable tracking anytime, and full control over what gets shared.
                  </div>
                </div>
              </div>

              {/* Install Button */}
              <button
                onClick={handleInstallClick}
                className="w-full py-3 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
                style={{
                  backgroundColor: '#D97706',
                  color: 'white',
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  letterSpacing: '-0.02em'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#B45309'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#D97706'}
              >
                <Download className="w-5 h-5" />
                Install Soul Observer Extension
                <ExternalLink className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              {/* Installed - Show Status & Tips */}
              <div className="mb-4">
                <h4
                  className="text-sm font-semibold mb-3"
                  style={{
                    color: '#141413',
                    fontFamily: 'var(--_typography---font--styrene-a)',
                    letterSpacing: '-0.02em'
                  }}
                >
                  Extension Status:
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4" style={{ color: '#10B981' }} />
                    <span className="text-sm" style={{ color: '#6B7280' }}>
                      Soul Observer is actively tracking behavioral patterns
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4" style={{ color: '#10B981' }} />
                    <span className="text-sm" style={{ color: '#6B7280' }}>
                      Data is being synced to your soul signature profile
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4" style={{ color: '#10B981' }} />
                    <span className="text-sm" style={{ color: '#6B7280' }}>
                      All tracking is encrypted and private to you
                    </span>
                  </div>
                </div>
              </div>

              {/* Pro Tips */}
              <div
                className="p-3 rounded-lg mb-4"
                style={{ backgroundColor: '#F3F4F6' }}
              >
                <div className="flex items-start gap-2">
                  <span className="text-lg">💡</span>
                  <div className="text-sm" style={{ color: '#6B7280' }}>
                    <strong style={{ color: '#141413' }}>Pro Tip:</strong> Use the web naturally for 2-3 days
                    to build a comprehensive soul signature. The more authentic data we capture, the more accurate your digital twin becomes.
                  </div>
                </div>
              </div>

              {/* Manage Button */}
              <button
                onClick={handleActivateClick}
                className="w-full py-2 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2"
                style={{
                  backgroundColor: '#F3F4F6',
                  color: '#141413',
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  letterSpacing: '-0.02em'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#E5E7EB'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
              >
                <ExternalLink className="w-4 h-4" />
                Manage Extension Settings
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ExtensionPrompt;
