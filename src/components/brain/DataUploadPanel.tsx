/**
 * DataUploadPanel
 * ================
 * 3-step wizard for uploading GDPR / platform data exports.
 *
 * Steps:
 *   1. selecting  — choose platform (Spotify / YouTube / Discord / Reddit)
 *   2. uploading  — drag-and-drop or click to browse, shows instructions
 *   3. processing — spinner while upload runs
 *   4. done       — success summary OR error message
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  MessageCircle,
  ArrowLeft,
  FileJson,
  Archive,
  Loader2,
  ExternalLink,
  Heart,
  Search,
  Activity,
  Film,
  BookOpen,
  Tv,
  Music2,
  Hash,
  Music,
  Headphones,
} from 'lucide-react';
import { SpotifyLogo, YoutubeLogo, DiscordLogo, RedditLogo } from '@/components/PlatformLogos';
import { importsAPI, type ImportPlatform, type DataImport } from '@/services/api/importsAPI';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = 'idle' | 'selecting' | 'uploading' | 'processing' | 'done' | 'error';

interface PlatformConfig {
  id: ImportPlatform;
  label: string;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
  description: string;
  exportInstructions: string;
  exportUrl: string;
  expectedFile: string;
  fileAccept: string;
  /** If true, the user can drop/select multiple files and each is uploaded sequentially */
  multiFile?: boolean;
}

// ---------------------------------------------------------------------------
// Platform configs
// ---------------------------------------------------------------------------

const PLATFORMS: PlatformConfig[] = [
  {
    id: 'spotify',
    label: 'Spotify',
    color: '#1DB954',
    bgColor: 'rgba(29, 185, 84, 0.08)',
    icon: <SpotifyLogo className="w-5 h-5" />,
    description: 'Extended Streaming History (4 JSON files, 2018→present) — full artist, album, and time pattern analysis.',
    exportInstructions: 'Go to spotify.com → Account → Privacy settings → Request data → select "Extended streaming history" (takes up to 30 days)',
    exportUrl: 'https://www.spotify.com/account/privacy/',
    expectedFile: 'Streaming_History_Audio_*.json (all 4 files)',
    fileAccept: '.json,application/json',
    multiFile: true,
  },
  {
    id: 'youtube',
    label: 'YouTube',
    color: '#FF0000',
    bgColor: 'rgba(255, 0, 0, 0.06)',
    icon: <YoutubeLogo className="w-5 h-5" />,
    description: 'Every video you\'ve ever watched — channels, patterns, and topics.',
    exportInstructions: 'Go to Google Takeout → select YouTube → only Watch history → Export',
    exportUrl: 'https://takeout.google.com/',
    expectedFile: 'watch-history.json',
    fileAccept: '.json,application/json',
  },
  {
    id: 'discord',
    label: 'Discord',
    color: '#5865F2',
    bgColor: 'rgba(88, 101, 242, 0.08)',
    icon: <DiscordLogo className="w-5 h-5" />,
    description: 'Message frequency and activity patterns across your servers (no content stored).',
    exportInstructions: 'Go to Discord → User Settings → Privacy & Safety → Request all my data',
    exportUrl: 'https://discord.com/settings/privacy-and-safety',
    expectedFile: 'package.zip (Discord export)',
    fileAccept: '.zip,application/zip',
  },
  {
    id: 'reddit',
    label: 'Reddit',
    color: '#FF4500',
    bgColor: 'rgba(255, 69, 0, 0.07)',
    icon: <RedditLogo className="w-5 h-5" />,
    description: 'Subreddit activity, comment history, and saved posts.',
    exportInstructions: 'Go to Reddit → Settings → Privacy & Security → Request data export',
    exportUrl: 'https://www.reddit.com/settings/data-request',
    expectedFile: 'reddit-data-*.json',
    fileAccept: '.json,application/json',
  },
  {
    id: 'whoop',
    label: 'Whoop',
    color: '#00E5FF',
    bgColor: 'rgba(0, 229, 255, 0.07)',
    icon: <Activity size={20} color="#00E5FF" />,
    description: 'Recovery score, HRV, strain, sleep quality, and workout history.',
    exportInstructions: 'Open Whoop app → Profile → Privacy → Download My Data → request ZIP export',
    exportUrl: 'https://app.whoop.com/settings/privacy',
    expectedFile: 'whoop-data-export.zip',
    fileAccept: '.zip,application/zip',
  },
  {
    id: 'apple_health',
    label: 'Apple Health',
    color: '#FF3B30',
    bgColor: 'rgba(255, 59, 48, 0.07)',
    icon: <Heart size={20} />,
    description: 'Steps, heart rate, sleep, workouts from iPhone/Apple Watch.',
    exportInstructions: 'Health app → profile icon → Export All Health Data → share zip',
    exportUrl: 'https://support.apple.com/en-us/guide/iphone/iph27f6325b2/ios',
    expectedFile: 'export.zip',
    fileAccept: '.zip,application/zip',
  },
  {
    id: 'google_search',
    label: 'Google Search',
    color: '#4285F4',
    bgColor: 'rgba(66, 133, 244, 0.07)',
    icon: <Search size={20} />,
    description: 'Your search history — what you look up reveals what you genuinely care about.',
    exportInstructions: 'takeout.google.com → select Search → JSON format → Export',
    exportUrl: 'https://takeout.google.com/',
    expectedFile: 'MyActivity.json',
    fileAccept: '.json,application/json',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    color: '#25D366',
    bgColor: 'rgba(37, 211, 102, 0.07)',
    icon: <MessageCircle size={20} />,
    description: 'Communication patterns from your chat exports (no message content stored).',
    exportInstructions: 'WhatsApp → Settings → Chats → Export chat → Without media. Export each chat you want to include.',
    exportUrl: 'https://faq.whatsapp.com/196737011380816/',
    expectedFile: '_chat.txt or WhatsApp export ZIP',
    fileAccept: '.txt,.zip,text/plain,application/zip',
    multiFile: true,
  },
  {
    id: 'letterboxd',
    label: 'Letterboxd',
    color: '#FF8000',
    bgColor: 'rgba(255, 128, 0, 0.07)',
    icon: <Film size={20} color="#FF8000" />,
    description: 'Film diary, ratings, rewatches, and tags — reveals genre affinity, decade preferences, and cinema taste.',
    exportInstructions: 'Letterboxd → Settings → Data → Export your data. Upload the ZIP (or the diary.csv inside it).',
    exportUrl: 'https://letterboxd.com/settings/data/',
    expectedFile: 'letterboxd-*.zip or diary.csv',
    fileAccept: '.zip,.csv,application/zip,text/csv',
  },
  {
    id: 'goodreads',
    label: 'Goodreads',
    color: '#8B6D47',
    bgColor: 'rgba(139, 109, 71, 0.07)',
    icon: <BookOpen size={20} color="#8B6D47" />,
    description: 'Your full library, shelves, ratings, and reviews — reading taste is one of the strongest personality signals available.',
    exportInstructions: 'Goodreads → My Books → Import and Export → Export Library. Upload the CSV it returns.',
    exportUrl: 'https://www.goodreads.com/review/import',
    expectedFile: 'goodreads_library_export.csv',
    fileAccept: '.csv,text/csv',
  },
  {
    id: 'netflix',
    label: 'Netflix',
    color: '#E50914',
    bgColor: 'rgba(229, 9, 20, 0.07)',
    icon: <Tv size={20} color="#E50914" />,
    description: 'Every show and film you watched — reveals genre preferences, binge patterns, foreign film affinity, and rewatch behavior.',
    exportInstructions: 'Netflix → Account → Privacy → Request your personal information. Upload the ZIP when it arrives (24-48h).',
    exportUrl: 'https://www.netflix.com/account/getmyinfo',
    expectedFile: 'Netflix ZIP or ViewingActivity.csv',
    fileAccept: '.zip,.csv,application/zip,text/csv',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    color: '#FF0050',
    bgColor: 'rgba(255, 0, 80, 0.07)',
    icon: <Music2 size={20} color="#FF0050" />,
    description: 'Watch history, likes, follows, and search history — consumption patterns reveal interests, humor, and subculture membership.',
    exportInstructions: 'TikTok → Settings → Privacy → Personalization and data → Download your data (JSON). Upload the ZIP (3-7 days).',
    exportUrl: 'https://www.tiktok.com/setting/download-your-data',
    expectedFile: 'TikTok user_data.json (or ZIP)',
    fileAccept: '.zip,.json,application/zip,application/json',
  },
  {
    id: 'x_archive',
    label: 'X (Twitter)',
    color: '#1DA1F2',
    bgColor: 'rgba(29, 161, 242, 0.07)',
    icon: <Hash size={20} color="#1DA1F2" />,
    description: 'Your full tweet history, likes, and following list — text voice, interests, and who shapes your attention.',
    exportInstructions: 'X → Settings → Your Account → Download an archive of your data. Upload the ZIP (24-48h).',
    exportUrl: 'https://x.com/settings/your_account/download_an_archive',
    expectedFile: 'twitter-archive-*.zip',
    fileAccept: '.zip,application/zip',
  },
  {
    id: 'apple_music',
    label: 'Apple Music',
    color: '#FA243C',
    bgColor: 'rgba(250, 36, 60, 0.07)',
    icon: <Music size={20} color="#FA243C" />,
    description: 'Your full Apple Music listening history — unlimited play counts beyond the 50-item API cap. Reveals mood-by-time patterns.',
    exportInstructions: 'privacy.apple.com → Request a copy of your data → select Apple Music activity. Upload the ZIP when it arrives (up to 7 days).',
    exportUrl: 'https://privacy.apple.com/',
    expectedFile: 'Apple Music - Play History Daily Tracks.csv (inside ZIP)',
    fileAccept: '.zip,.csv,application/zip,text/csv',
  },
  {
    id: 'soundcloud',
    label: 'SoundCloud',
    color: '#FF5500',
    bgColor: 'rgba(255, 85, 0, 0.07)',
    icon: <Headphones size={20} color="#FF5500" />,
    description: 'Likes, follows, playlists, and comments — indie, electronic, and DJ-mix taste that Spotify often misses.',
    exportInstructions: 'SoundCloud → Settings → Data privacy → Request a copy of your data. Upload the ZIP when it arrives.',
    exportUrl: 'https://soundcloud.com/settings/account',
    expectedFile: 'SoundCloud data export ZIP',
    fileAccept: '.zip,application/zip',
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PlatformCard({ config, onSelect }: { config: PlatformConfig; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="rounded-lg w-full text-left p-4 transition-colors hover:bg-white/[0.03]"
      style={{
        border: '1px solid var(--border-glass)',
        backgroundColor: 'rgba(255,255,255,0.02)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: config.color, color: '#fff' }}
        >
          {config.icon}
        </div>
        <div>
          <div className="font-semibold text-sm text-foreground">{config.label}</div>
          <div className="text-xs text-foreground/50 mt-0.5 leading-relaxed">{config.description}</div>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface DataUploadPanelProps {
  userId: string;
  onImportComplete?: (importRecord: Partial<DataImport>) => void;
}

export function DataUploadPanel({ userId, onImportComplete }: DataUploadPanelProps) {
  const [step, setStep] = useState<Step>('idle');
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformConfig | null>(null);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<{ observationsCreated: number; error?: string } | null>(null);
  const [multiFileProgress, setMultiFileProgress] = useState<{ current: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePlatformSelect = useCallback((config: PlatformConfig) => {
    setSelectedPlatform(config);
    setStep('uploading');
  }, []);

  const handleFiles = useCallback(async (files: File[]) => {
    if (!selectedPlatform || files.length === 0) return;
    setStep('processing');
    setMultiFileProgress(null);

    try {
      if (files.length === 1) {
        // Single file — simple path
        const res = await importsAPI.uploadGdpr(selectedPlatform.id, files[0]);
        setResult({ observationsCreated: res.observationsCreated });
        setStep('done');
        onImportComplete?.({ platform: selectedPlatform.id, observations_created: res.observationsCreated });
      } else {
        // Multi-file: process sequentially, accumulate total observations
        let totalObservations = 0;
        for (let i = 0; i < files.length; i++) {
          setMultiFileProgress({ current: i + 1, total: files.length });
          const res = await importsAPI.uploadGdpr(selectedPlatform.id, files[i]);
          totalObservations += res.observationsCreated;
        }
        setResult({ observationsCreated: totalObservations });
        setMultiFileProgress(null);
        setStep('done');
        onImportComplete?.({ platform: selectedPlatform.id, observations_created: totalObservations });
      }
    } catch (err) {
      setResult({ observationsCreated: 0, error: err instanceof Error ? err.message : 'Upload failed' });
      setMultiFileProgress(null);
      setStep('error');
    }
  }, [selectedPlatform, onImportComplete]);

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) handleFiles(files);
    e.target.value = '';
  }, [handleFiles]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) handleFiles(files);
  }, [handleFiles]);

  const reset = useCallback(() => {
    setStep('idle');
    setSelectedPlatform(null);
    setResult(null);
    setMultiFileProgress(null);
  }, []);

  // ----- Render -----

  return (
    <div className="space-y-4">
      {/* IDLE — start button */}
      {step === 'idle' && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-foreground/50 leading-relaxed max-w-md">
            Import years of history the platform APIs can't provide — full Spotify plays, every YouTube video, Discord activity patterns, and Reddit archives.
          </p>
          <button
            onClick={() => setStep('selecting')}
            className="flex-shrink-0 ml-4 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.10)' }}
          >
            <Upload size={14} />
            Import Data
          </button>
        </div>
      )}

      {/* SELECTING — platform cards */}
      {step === 'selecting' && (
        <div className="space-y-3">
          <p className="text-sm text-foreground/50">Choose a platform to import:</p>
          <div className="grid grid-cols-2 gap-3">
            {PLATFORMS.map((p) => (
              <PlatformCard key={p.id} config={p} onSelect={() => handlePlatformSelect(p)} />
            ))}
          </div>
          <button
            onClick={reset}
            className="text-xs text-foreground/40 hover:text-foreground/60 flex items-center gap-1 mt-1"
          >
            <ArrowLeft size={12} /> Cancel
          </button>
        </div>
      )}

      {/* UPLOADING — drop zone + instructions */}
      {step === 'uploading' && selectedPlatform && (
        <div className="space-y-4">
          {/* Instructions */}
          <div
            className="rounded-xl p-4 border border-black/8 space-y-2"
            style={{ background: selectedPlatform.bgColor }}
          >
            <div className="flex items-center gap-2 font-semibold text-sm" style={{ color: selectedPlatform.color }}>
              <span>{selectedPlatform.label} Export Instructions</span>
            </div>
            <p className="text-xs text-foreground/60 leading-relaxed">{selectedPlatform.exportInstructions}</p>
            <a
              href={selectedPlatform.exportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2"
              style={{ color: selectedPlatform.color }}
            >
              Open settings <ExternalLink size={10} />
            </a>
            <div className="flex items-center gap-1.5 text-xs text-foreground/40 mt-1">
              {selectedPlatform.id === 'discord' ? <Archive size={12} /> : <FileJson size={12} />}
              Expected file: <span className="font-mono">{selectedPlatform.expectedFile}</span>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors"
            style={{
              borderColor: dragging ? selectedPlatform.color : 'rgba(0,0,0,0.15)',
              background: dragging ? selectedPlatform.bgColor : 'transparent',
            }}
          >
            <Upload size={24} className="mx-auto mb-2 text-foreground/30" />
            <p className="text-sm font-medium text-foreground/70">
              {selectedPlatform.multiFile ? 'Drop files here or click to browse' : 'Drop file here or click to browse'}
            </p>
            <p className="text-xs text-foreground/40 mt-1">{selectedPlatform.expectedFile}</p>
            {selectedPlatform.multiFile && (
              <p className="text-xs text-foreground/30 mt-0.5">Select all files at once — they'll be processed sequentially</p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={selectedPlatform.fileAccept}
              multiple={selectedPlatform.multiFile === true}
              className="hidden"
              onChange={onInputChange}
            />
          </div>

          <button
            onClick={() => setStep('selecting')}
            className="text-xs text-foreground/40 hover:text-foreground/60 flex items-center gap-1"
          >
            <ArrowLeft size={12} /> Choose different platform
          </button>
        </div>
      )}

      {/* PROCESSING */}
      {step === 'processing' && selectedPlatform && (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <Loader2 size={28} className="animate-spin" style={{ color: selectedPlatform.color }} />
          <p className="text-sm text-foreground/60 font-medium">
            {multiFileProgress
              ? `Processing file ${multiFileProgress.current} of ${multiFileProgress.total}...`
              : `Importing your ${selectedPlatform.label} history...`}
          </p>
          <p className="text-xs text-foreground/40">This may take a moment for large exports.</p>
          {multiFileProgress && (
            <div className="w-48 h-1.5 rounded-full bg-black/10 overflow-hidden mt-1">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.round((multiFileProgress.current / multiFileProgress.total) * 100)}%`,
                  background: selectedPlatform.color,
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* DONE */}
      {step === 'done' && selectedPlatform && result && (
        <div
          className="rounded-lg p-5 space-y-3"
          style={{
            border: '1px solid var(--border-glass)',
            backgroundColor: 'rgba(255,255,255,0.02)',
          }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={20} className="text-green-500" />
            <span className="font-semibold text-sm">Import complete!</span>
          </div>
          <p className="text-sm text-foreground/60">
            Added{' '}
            <span className="font-semibold text-foreground">{result.observationsCreated.toLocaleString('en-US')}</span>{' '}
            new observations from {selectedPlatform.label} to your twin's memory.
            {result.observationsCreated > 20 && ' Your twin is reflecting on the new data.'}
          </p>
          <div className="flex gap-3 pt-1">
            <button
              onClick={reset}
              className="text-xs px-3 py-1.5 rounded-lg text-foreground/60"
              style={{ border: '1px solid var(--border)' }}
            >
              Import another
            </button>
          </div>
        </div>
      )}

      {/* ERROR */}
      {step === 'error' && selectedPlatform && result && (
        <div
          className="rounded-lg p-5 space-y-3"
          style={{
            border: '1px solid rgba(239,68,68,0.3)',
            backgroundColor: 'rgba(255,255,255,0.02)',
          }}
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={20} className="text-red-500" />
            <span className="font-semibold text-sm text-red-700">Import failed</span>
          </div>
          <p className="text-xs text-red-400 leading-relaxed">{result.error}</p>
          <button
            onClick={() => setStep('uploading')}
            className="text-xs px-3 py-1.5 rounded-lg border border-red-800/30 text-red-400 hover:bg-red-900/20"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

export default DataUploadPanel;
