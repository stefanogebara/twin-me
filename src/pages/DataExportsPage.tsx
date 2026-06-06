/**
 * DataExportsPage — GDPR data-export uploads for the three platforms
 * whose OAuth APIs hide the data we actually want: Discord (no message
 * history in any user-grantable scope), LinkedIn (gutted developer API),
 * Instagram (Graph API is Creator-only).
 *
 * Pattern per card:
 *   1. Title + privacy contract one-liner
 *   2. Numbered step-by-step instructions for requesting the export
 *   3. Drop zone / click-to-browse for the resulting zip
 *   4. Once parsed: status badge, observation count, last parsed date,
 *      and a 'remove' button that wipes both the row and its
 *      derived observations
 *
 * Wires to:
 *   GET    /api/exports          → list parsed exports
 *   POST   /api/exports/upload   → upload zip, parse inline
 *   DELETE /api/exports/:platform → drop export + observations
 */

import { useEffect, useMemo, useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { Briefcase, Hash, Instagram, Upload, Trash2, ExternalLink, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { exportsAPI, type ExportPlatform, type ExportRow } from '@/services/api/exportsAPI';

interface PlatformCardConfig {
  id: ExportPlatform;
  label: string;
  color: string;
  icon: JSX.Element;
  oneLiner: string;
  privacyNote: string;
  exportPortalUrl: string;
  steps: string[];
  expectedFile: string;
}

const PLATFORMS: PlatformCardConfig[] = [
  {
    id: 'discord_export',
    label: 'Discord',
    color: '#5865F2',
    icon: <Hash size={18} color="#fff" />,
    oneLiner:
      'Every server, every channel, every DM — the message history Discord’s OAuth scope refuses to give your twin.',
    privacyNote:
      'Only timestamps and counts are kept. Message content never reaches the parser.',
    exportPortalUrl: 'https://discord.com/settings/privacy-and-safety',
    steps: [
      'Open Discord (desktop or web) and go to User Settings (gear icon).',
      'Navigate to Privacy & Safety.',
      'Scroll to the bottom and click "Request all of my Data".',
      'Wait for the email from discord-data@discord.com (24h–30 days).',
      'Upload the package.zip from that email here.',
    ],
    expectedFile: 'package.zip',
  },
  {
    id: 'linkedin_export',
    label: 'LinkedIn',
    color: '#0A66C2',
    icon: <Briefcase size={18} color="#fff" />,
    oneLiner:
      'Full career trajectory, network shape, post history, search patterns — everything the LinkedIn developer API has gutted.',
    privacyNote:
      'Messages.csv is intentionally never read. Connection lists and post counts only.',
    exportPortalUrl: 'https://www.linkedin.com/mypreferences/d/download-my-data',
    steps: [
      'Go to LinkedIn Settings → Data Privacy.',
      'Click "Get a copy of your data".',
      'Choose "Fast file only" (the comma-separated CSVs).',
      'Wait for the email (typically 10–20 minutes).',
      'Upload the Basic_LinkedInDataExport_*.zip here.',
    ],
    expectedFile: 'Basic_LinkedInDataExport_*.zip',
  },
  {
    id: 'instagram_export',
    label: 'Instagram',
    color: '#E4405F',
    icon: <Instagram size={18} color="#fff" />,
    oneLiner:
      'Posts, reels, stories, likes given, saved content, search topics — the visual identity Instagram’s Graph API gates behind Creator accounts.',
    privacyNote:
      'Captions and comment bodies are never read. Counts, timestamps, and your search queries only.',
    exportPortalUrl: 'https://accountscenter.facebook.com/info_and_permissions/dyi',
    steps: [
      'Go to Meta Accounts Center → Your information and permissions.',
      'Click "Download your information".',
      'Choose JSON format. Date range: All time.',
      'Wait for the email (2–14 days).',
      'Upload the instagram-*.zip here.',
    ],
    expectedFile: 'instagram-*.zip',
  },
];

type UploadStatus =
  | { state: 'idle' }
  | { state: 'uploading' }
  | { state: 'success'; observations: number }
  | { state: 'error'; message: string };

const PlatformCard = ({
  config,
  row,
  status,
  dragging,
  onPickFile,
  onDrop,
  onDragOver,
  onDragLeave,
  onDelete,
}: {
  config: PlatformCardConfig;
  row?: ExportRow;
  status: UploadStatus;
  dragging: boolean;
  onPickFile: (file: File) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDelete: () => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const isParsed = row?.status === 'parsed';
  const isUploading = status.state === 'uploading';

  return (
    <div
      className="rounded-[20px] px-5 py-5"
      style={{
        background: 'var(--glass-surface-bg)',
        border: '1px solid var(--glass-surface-border)',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 flex-shrink-0 w-9 h-9 rounded-[10px] flex items-center justify-center"
            style={{ background: config.color }}
          >
            {config.icon}
          </div>
          <div>
            <div className="text-[15px] font-medium" style={{ color: 'var(--text-primary)' }}>
              {config.label}
            </div>
            <div
              className="text-[13px] mt-1 leading-relaxed max-w-[520px]"
              style={{ color: 'var(--text-secondary)' }}
            >
              {config.oneLiner}
            </div>
          </div>
        </div>

        {isParsed && (
          <button
            onClick={onDelete}
            className="flex-shrink-0 inline-flex items-center gap-1.5 text-[12px] px-2 py-1 rounded-[6px] hover:bg-white/5"
            style={{ color: 'var(--text-muted)' }}
            title="Remove this export"
          >
            <Trash2 size={12} />
            Remove
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: '1fr auto' }}>
        <ol className="space-y-1.5 text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {config.steps.map((s, i) => (
            <li key={i} className="flex gap-2.5">
              <span
                className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full text-[11px] flex-shrink-0 mt-0.5"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  color: 'var(--text-primary)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {i + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
          <li className="pt-1">
            <a
              href={config.exportPortalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] hover:underline"
              style={{ color: 'var(--text-primary)' }}
            >
              Open {config.label} portal <ExternalLink size={11} />
            </a>
          </li>
        </ol>
      </div>

      <div
        className={`mt-4 rounded-[14px] border border-dashed px-4 py-5 text-center transition-colors cursor-pointer ${
          dragging ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
        }`}
        style={{
          borderColor: dragging ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.14)',
        }}
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
            e.target.value = '';
          }}
        />

        {isUploading ? (
          <div className="inline-flex items-center gap-2 text-[13px]" style={{ color: 'var(--text-primary)' }}>
            <Loader2 size={14} className="animate-spin" />
            Parsing {config.label} export…
          </div>
        ) : status.state === 'success' ? (
          <div className="inline-flex items-center gap-2 text-[13px]" style={{ color: 'var(--text-primary)' }}>
            <CheckCircle2 size={14} />
            Parsed — {status.observations} observations stored.
          </div>
        ) : status.state === 'error' ? (
          <div className="inline-flex items-center gap-2 text-[13px]" style={{ color: '#dc2626' }}>
            <AlertCircle size={14} />
            {status.message}
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
            <Upload size={14} />
            Drop your {config.expectedFile} here, or click to browse.
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-[12px]" style={{ color: 'var(--text-muted)' }}>
        <span>{config.privacyNote}</span>
        {isParsed && row?.parsed_at && (
          <span>
            Parsed {new Date(row.parsed_at).toLocaleDateString()} · {row.observation_count} obs
          </span>
        )}
        {row?.status === 'failed' && (
          <span style={{ color: '#dc2626' }}>Failed: {row.error_message ?? 'unknown error'}</span>
        )}
      </div>
    </div>
  );
};

export default function DataExportsPage() {
  const [rows, setRows] = useState<ExportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState<Record<ExportPlatform, UploadStatus>>({
    discord_export: { state: 'idle' },
    linkedin_export: { state: 'idle' },
    instagram_export: { state: 'idle' },
  });
  const [dragging, setDragging] = useState<ExportPlatform | null>(null);

  const rowByPlatform = useMemo(() => {
    const out: Partial<Record<ExportPlatform, ExportRow>> = {};
    for (const r of rows) out[r.platform] = r;
    return out;
  }, [rows]);

  const refresh = async () => {
    try {
      const list = await exportsAPI.list();
      setRows(list);
    } catch {
      // List failure is non-fatal — the page still works for uploads.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const uploadOne = async (platform: ExportPlatform, file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setStatuses((s) => ({ ...s, [platform]: { state: 'error', message: 'Expected a .zip file.' } }));
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setStatuses((s) => ({
        ...s,
        [platform]: { state: 'error', message: 'File exceeds the 100MB direct-upload limit.' },
      }));
      return;
    }
    setStatuses((s) => ({ ...s, [platform]: { state: 'uploading' } }));
    try {
      const res = await exportsAPI.upload(platform, file);
      setStatuses((s) => ({
        ...s,
        [platform]: { state: 'success', observations: res.observations_stored },
      }));
      await refresh();
    } catch (err) {
      setStatuses((s) => ({
        ...s,
        [platform]: {
          state: 'error',
          message: err instanceof Error ? err.message : 'Upload failed',
        },
      }));
    }
  };

  const handleDelete = async (platform: ExportPlatform) => {
    if (!window.confirm(`Remove your ${platform.replace('_export', '')} export and its derived memories?`)) return;
    try {
      await exportsAPI.remove(platform);
      setStatuses((s) => ({ ...s, [platform]: { state: 'idle' } }));
      await refresh();
    } catch (err) {
      setStatuses((s) => ({
        ...s,
        [platform]: { state: 'error', message: err instanceof Error ? err.message : 'Delete failed' },
      }));
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-6">
        <h1
          className="text-[32px] leading-[1.1] tracking-[-0.64px]"
          style={{ color: 'var(--text-primary)', fontFamily: 'Instrument Serif, serif' }}
        >
          Data Exports
        </h1>
        <p className="text-[14px] mt-2 max-w-[560px]" style={{ color: 'var(--text-secondary)' }}>
          For platforms whose APIs hide the data we want, your own GDPR data export fills the gap.
          Upload the zip — your twin pulls behavioural signals out, the raw file is parsed in memory
          and discarded.
        </p>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-16" style={{ color: 'var(--text-muted)' }}>
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {PLATFORMS.map((c) => (
            <PlatformCard
              key={c.id}
              config={c}
              row={rowByPlatform[c.id]}
              status={statuses[c.id]}
              dragging={dragging === c.id}
              onPickFile={(f) => uploadOne(c.id, f)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(null);
                const f = e.dataTransfer.files?.[0];
                if (f) uploadOne(c.id, f);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(c.id);
              }}
              onDragLeave={() => setDragging(null)}
              onDelete={() => handleDelete(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
