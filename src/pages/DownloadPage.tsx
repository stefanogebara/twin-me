import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Apple,
  Monitor,
  Terminal,
  Loader2,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';

// Public GitHub Releases for the desktop app. The Release may not exist yet
// (it is tagged separately as desktop-v0.1.0) — every state below is handled.
const RELEASES_API = 'https://api.github.com/repos/stefanogebara/twin-me/releases/latest';
const RELEASES_PAGE = 'https://github.com/stefanogebara/twin-me/releases';

type OS = 'mac' | 'windows' | 'linux' | 'unknown';

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GitHubRelease {
  tag_name?: string;
  name?: string;
  assets?: GitHubAsset[];
}

// A download option as rendered in the UI: an installer asset plus a friendly
// label (e.g. "Apple Silicon (M1-M4)") and a short recommendation tag.
interface DownloadOption {
  asset: GitHubAsset;
  label: string;
  recommended?: boolean;
}

type FetchState =
  | { status: 'loading' }
  | { status: 'no-release' }
  | { status: 'error' }
  | { status: 'ready'; release: GitHubRelease };

// --- OS detection -----------------------------------------------------------
// navigator.platform is the most reliable cross-browser signal; fall back to
// the userAgent string. We cannot tell Apple Silicon from Intel in the
// browser, so macOS surfaces BOTH .dmg builds (see buildOptions).
function detectOS(): OS {
  if (typeof navigator === 'undefined') return 'unknown';
  const platform = (navigator.platform || '').toLowerCase();
  const ua = (navigator.userAgent || '').toLowerCase();
  const haystack = `${platform} ${ua}`;

  if (/mac|iphone|ipad|ipod/.test(haystack)) return 'mac';
  if (/win/.test(haystack)) return 'windows';
  if (/linux|x11|android/.test(haystack)) return 'linux';
  return 'unknown';
}

const OS_LABELS: Record<OS, string> = {
  mac: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
  unknown: 'your platform',
};

const OS_ICONS: Record<OS, React.ElementType> = {
  mac: Apple,
  windows: Monitor,
  linux: Terminal,
  unknown: Download,
};

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${mb.toFixed(1)} MB`;
}

const lower = (name: string) => name.toLowerCase();

// --- Asset -> platform mapping by file extension ----------------------------
// Robust to version-number changes in filenames: we classify purely by
// extension (and, for macOS, by the arch token embedded in the name).
function buildOptions(assets: GitHubAsset[], os: OS): Record<OS, DownloadOption[]> {
  const result: Record<OS, DownloadOption[]> = {
    mac: [],
    windows: [],
    linux: [],
    unknown: [],
  };

  for (const asset of assets) {
    const name = lower(asset.name);

    // Windows: NSIS .exe (recommended), MSI as the alternative.
    if (name.endsWith('.exe')) {
      result.windows.push({ asset, label: 'Windows installer (.exe)' });
    } else if (name.endsWith('.msi')) {
      result.windows.push({ asset, label: 'Windows installer (.msi)' });
    }

    // macOS: two .dmg builds. Label by the arch token in the filename.
    else if (name.endsWith('.dmg')) {
      const isArm = /aarch64|arm64/.test(name);
      const isIntel = /x64|x86_64|intel/.test(name);
      const label = isArm
        ? 'Apple Silicon (M1-M4) — .dmg'
        : isIntel
        ? 'Intel — .dmg'
        : 'macOS — .dmg';
      result.mac.push({ asset, label });
    }

    // Linux: AppImage (portable, recommended) + .deb.
    else if (name.endsWith('.appimage')) {
      result.linux.push({ asset, label: 'AppImage (portable)' });
    } else if (name.endsWith('.deb')) {
      result.linux.push({ asset, label: 'Debian/Ubuntu (.deb)' });
    }
  }

  // Mark the recommended option per OS so the hero CTA can pick it.
  const markRecommended = (
    options: DownloadOption[],
    isPreferred: (name: string) => boolean,
  ) => {
    if (options.length === 0) return;
    const preferred = options.find((opt) => isPreferred(lower(opt.asset.name)));
    (preferred ?? options[0]).recommended = true;
  };

  markRecommended(result.windows, (n) => n.endsWith('.exe'));
  markRecommended(result.linux, (n) => n.endsWith('.appimage'));
  // For macOS, recommend the build matching the visitor's likely arch is not
  // possible from the browser; default to Apple Silicon as the common case.
  markRecommended(result.mac, (n) => /aarch64|arm64/.test(n));

  // Suppress an unused-variable lint while keeping the OS-aware signature for
  // future per-OS ordering tweaks.
  void os;

  return result;
}

// Install instructions — the installers are UNSIGNED, so each OS needs a
// one-time bypass note.
const INSTALL_NOTES: Record<Exclude<OS, 'unknown'>, { title: string; body: string }> = {
  mac: {
    title: 'Opening on macOS',
    body: 'After downloading, right-click the app and choose Open (first launch only) to bypass Gatekeeper, since it is not yet notarized.',
  },
  windows: {
    title: 'Opening on Windows',
    body: 'Windows SmartScreen may warn "Windows protected your PC" — click More info, then Run anyway. The installer is safe; it is just not code-signed yet.',
  },
  linux: {
    title: 'Opening on Linux',
    body: 'For the .AppImage, make it executable (chmod +x TwinMe.AppImage) and run it. Or install the .deb with sudo apt install ./TwinMe.deb.',
  },
};

// --- Shared style fragments (design system: dark glass) ---------------------
const GLASS_CARD: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: '20px',
  backdropFilter: 'blur(42px)',
  WebkitBackdropFilter: 'blur(42px)',
};

const PRIMARY_PILL: React.CSSProperties = {
  background: '#F5F5F4',
  color: '#110f0f',
  borderRadius: '100px',
  border: 'none',
};

const SECONDARY_PILL: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  color: '#F5F5F4',
  borderRadius: '100px',
  border: '1px solid rgba(255,255,255,0.10)',
};

// Route downloads through the same-origin proxy so the browser saves a
// correctly-named installer. Linking GitHub's release URL directly makes some
// browsers (Brave) follow the cross-origin CDN redirect and name the file after
// the GUID object, dropping the .exe/.dmg extension. See
// api/routes/desktop-download.js. The tag is derived from the asset URL so the
// proxy serves the exact version this page rendered.
function proxyHref(asset: GitHubAsset): string {
  const tag = asset.browser_download_url.match(/\/releases\/download\/([^/]+)\//)?.[1];
  const params = new URLSearchParams({ file: asset.name });
  if (tag) params.set('tag', tag);
  return `/api/desktop-download?${params.toString()}`;
}

// --- Sub-components ----------------------------------------------------------
const DownloadButton: React.FC<{ option: DownloadOption; primary?: boolean }> = ({
  option,
  primary,
}) => {
  const size = formatSize(option.asset.size);
  return (
    <a
      href={proxyHref(option.asset)}
      download={option.asset.name}
      className="flex items-center gap-3 px-5 py-3 transition-opacity hover:opacity-90"
      style={{
        ...(primary ? PRIMARY_PILL : SECONDARY_PILL),
        textDecoration: 'none',
        fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
      }}
    >
      <Download size={18} aria-hidden="true" />
      <span className="flex flex-col text-left">
        <span style={{ fontSize: '14px', fontWeight: 500 }}>{option.label}</span>
        <span
          style={{
            fontSize: '12px',
            opacity: primary ? 0.6 : 0.5,
          }}
        >
          {option.asset.name}
          {size ? ` · ${size}` : ''}
        </span>
      </span>
    </a>
  );
};

const InstallNote: React.FC<{ os: Exclude<OS, 'unknown'> }> = ({ os }) => {
  const [open, setOpen] = useState(false);
  const note = INSTALL_NOTES[os];
  return (
    <div style={{ ...GLASS_CARD, padding: '4px 0', borderRadius: '12px' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-5 py-3 transition-opacity hover:opacity-80"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
        }}
      >
        <span style={{ fontSize: '14px', fontWeight: 500, color: '#F5F5F4' }}>{note.title}</span>
        <ChevronDown
          size={16}
          style={{
            color: 'rgba(245,245,244,0.5)',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
          }}
          aria-hidden="true"
        />
      </button>
      {open && (
        <p
          className="px-5 pb-4"
          style={{ fontSize: '13px', lineHeight: 1.6, color: 'rgba(245,245,244,0.6)' }}
        >
          {note.body}
        </p>
      )}
    </div>
  );
};

const DownloadPage: React.FC = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const detectedOS = useMemo(detectOS, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(RELEASES_API, {
          headers: { Accept: 'application/vnd.github+json' },
        });
        if (cancelled) return;

        if (res.status === 404) {
          setState({ status: 'no-release' });
          return;
        }
        if (!res.ok) {
          setState({ status: 'error' });
          return;
        }

        const release = (await res.json()) as GitHubRelease;
        if (cancelled) return;

        if (!release.assets || release.assets.length === 0) {
          setState({ status: 'no-release' });
          return;
        }
        setState({ status: 'ready', release });
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(() => {
    if (state.status !== 'ready') return null;
    return buildOptions(state.release.assets ?? [], detectedOS);
  }, [state, detectedOS]);

  const DetectedIcon = OS_ICONS[detectedOS];

  // Recommended option for the detected OS (drives the hero CTA).
  const heroOption = useMemo(() => {
    if (!options || detectedOS === 'unknown') return null;
    const list = options[detectedOS];
    return list.find((o) => o.recommended) ?? list[0] ?? null;
  }, [options, detectedOS]);

  return (
    <div className="min-h-screen px-4 py-12 flex flex-col items-center" style={{ background: 'transparent' }}>
      <div className="w-full max-w-3xl">
        <button
          onClick={() => navigate(-1)}
          className="mb-8 text-sm flex items-center gap-2 transition-opacity hover:opacity-70"
          style={{ color: 'var(--text-secondary)', fontFamily: "'Geist', 'Inter', sans-serif" }}
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back
        </button>

        {/* Hero */}
        <div className="mb-10 text-center">
          <h1
            className="mb-3"
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: '44px',
              fontWeight: 400,
              letterSpacing: '-0.88px',
              color: '#F5F5F4',
            }}
          >
            TwinMe Desktop
          </h1>
          <p style={{ fontSize: '15px', color: 'rgba(245,245,244,0.5)', lineHeight: 1.6 }}>
            Your twin, on your desk. Download the app for {OS_LABELS[detectedOS]} and let it learn
            from what you do — privately, on your machine.
          </p>
        </div>

        {/* Loading */}
        {state.status === 'loading' && (
          <div
            className="flex flex-col items-center justify-center gap-3 py-16"
            style={{ ...GLASS_CARD, padding: '48px 24px' }}
          >
            <Loader2 size={24} className="animate-spin" style={{ color: 'rgba(245,245,244,0.5)' }} />
            <p style={{ fontSize: '14px', color: 'rgba(245,245,244,0.5)' }}>
              Finding the latest release...
            </p>
          </div>
        )}

        {/* No release published yet */}
        {state.status === 'no-release' && (
          <div className="text-center" style={{ ...GLASS_CARD, padding: '40px 28px' }}>
            <h2
              className="mb-2"
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: '24px',
                fontWeight: 400,
                color: '#F5F5F4',
              }}
            >
              No release published yet
            </h2>
            <p className="mb-6" style={{ fontSize: '14px', color: 'rgba(245,245,244,0.5)', lineHeight: 1.6 }}>
              The desktop app is on its way. We are putting the finishing touches on the first
              build — check back soon, or watch the releases page for the announcement.
            </p>
            <a
              href={RELEASES_PAGE}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 transition-opacity hover:opacity-90"
              style={{ ...SECONDARY_PILL, textDecoration: 'none', fontSize: '14px', fontWeight: 500 }}
            >
              <ExternalLink size={16} aria-hidden="true" />
              View releases on GitHub
            </a>
          </div>
        )}

        {/* Network / API error */}
        {state.status === 'error' && (
          <div className="text-center" style={{ ...GLASS_CARD, padding: '40px 28px' }}>
            <h2
              className="mb-2"
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: '24px',
                fontWeight: 400,
                color: '#F5F5F4',
              }}
            >
              Could not load downloads
            </h2>
            <p className="mb-6" style={{ fontSize: '14px', color: 'rgba(245,245,244,0.5)', lineHeight: 1.6 }}>
              Something went wrong reaching GitHub. You can grab the installers directly from the
              releases page instead.
            </p>
            <a
              href={RELEASES_PAGE}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 transition-opacity hover:opacity-90"
              style={{ ...SECONDARY_PILL, textDecoration: 'none', fontSize: '14px', fontWeight: 500 }}
            >
              <ExternalLink size={16} aria-hidden="true" />
              Open releases on GitHub
            </a>
          </div>
        )}

        {/* Ready — render downloads */}
        {state.status === 'ready' && options && (
          <div className="flex flex-col gap-8">
            {/* Primary CTA for the detected OS */}
            {heroOption && detectedOS !== 'unknown' && (
              <div style={{ ...GLASS_CARD, padding: '28px 24px' }}>
                <div className="flex items-center gap-2 mb-4">
                  <DetectedIcon size={18} style={{ color: '#F5F5F4' }} aria-hidden="true" />
                  <span style={{ fontSize: '14px', fontWeight: 500, color: '#F5F5F4' }}>
                    Recommended for {OS_LABELS[detectedOS]}
                  </span>
                </div>
                <div className="flex flex-wrap gap-3">
                  <DownloadButton option={heroOption} primary />
                  {detectedOS !== 'unknown' && <InstallNoteInline os={detectedOS} />}
                </div>
                {/* Show the second macOS arch right under the hero. */}
                {detectedOS === 'mac' && options.mac.length > 1 && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {options.mac
                      .filter((o) => o !== heroOption)
                      .map((o) => (
                        <DownloadButton key={o.asset.name} option={o} />
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* All platforms */}
            <div>
              <h2
                className="mb-4"
                style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  fontSize: '24px',
                  fontWeight: 400,
                  color: '#F5F5F4',
                }}
              >
                All platforms
              </h2>
              <div className="flex flex-col gap-4">
                {(['mac', 'windows', 'linux'] as const).map((os) => {
                  const list = options[os];
                  if (list.length === 0) return null;
                  const OsIcon = OS_ICONS[os];
                  return (
                    <div key={os} style={{ ...GLASS_CARD, padding: '20px 22px' }}>
                      <div className="flex items-center gap-2 mb-4">
                        <OsIcon size={18} style={{ color: '#F5F5F4' }} aria-hidden="true" />
                        <span style={{ fontSize: '15px', fontWeight: 500, color: '#F5F5F4' }}>
                          {OS_LABELS[os]}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 mb-4">
                        {list.map((option) => (
                          <DownloadButton
                            key={option.asset.name}
                            option={option}
                            primary={os === detectedOS && option.recommended}
                          />
                        ))}
                      </div>
                      <InstallNote os={os} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* System requirements */}
            <p
              className="text-center"
              style={{ fontSize: '13px', color: 'rgba(245,245,244,0.4)', lineHeight: 1.6 }}
            >
              Requires macOS 10.15+ / Windows 10+ / a recent Linux. Roughly a 10MB download.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// A compact inline variant of the install note shown beside the hero CTA, so
// the bypass step is visible without scrolling to the per-OS card.
const InstallNoteInline: React.FC<{ os: Exclude<OS, 'unknown'> }> = ({ os }) => (
  <div style={{ flex: '1 1 240px', minWidth: 0 }}>
    <InstallNote os={os} />
  </div>
);

export default DownloadPage;
