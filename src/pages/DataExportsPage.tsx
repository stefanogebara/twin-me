/**
 * DataExportsPage — GDPR data-export uploads for the three platforms
 * whose OAuth APIs hide the data we actually want: Discord (no message
 * history in any user-grantable scope), LinkedIn (gutted developer API),
 * Instagram (Graph API is Creator-only).
 *
 * In the register, one row per platform (no cards), opening to:
 *   1. Three short steps for requesting the export, and a link to the portal
 *   2. A drop zone (the warm field) / click-to-browse for the resulting zip
 *   3. Once parsed: the row's line carries the date and memory count, and its
 *      one action is Remove, which wipes both the row and its derived
 *      observations
 *
 * Wires to:
 *   GET    /api/exports          → list parsed exports
 *   POST   /api/exports/upload   → upload zip, parse inline
 *   DELETE /api/exports/:platform → drop export + observations
 */

import { useEffect, useMemo, useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { Briefcase, Hash, Instagram, Upload, Trash2, ExternalLink, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { exportsAPI, type ExportPlatform, type ExportRow } from '@/services/api/exportsAPI';
import { isAbortError } from '@/services/api/apiBase';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Page, PageHead, List, Row, Empty } from '@/components/register';
import '@/styles/register-public.css';
import '@/styles/register-settings.css';

interface PlatformCardConfig {
  id: ExportPlatform;
  label: string;
  /** Brand colour: the one place colour appears, the 32px icon square. */
  color: string;
  icon: JSX.Element;
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
    icon: <Hash size={16} />,
    privacyNote: 'Keeps times and counts, never your messages',
    exportPortalUrl: 'https://discord.com/settings/privacy-and-safety',
    steps: [
      'In Discord, open User Settings, then Privacy & Safety.',
      'Choose "Request all of my Data". The email takes up to 30 days.',
      'Upload the package.zip it sends you.',
    ],
    expectedFile: 'package.zip',
  },
  {
    id: 'linkedin_export',
    label: 'LinkedIn',
    color: '#0A66C2',
    icon: <Briefcase size={16} />,
    privacyNote: 'Never reads your messages. Connections and post counts only.',
    exportPortalUrl: 'https://www.linkedin.com/mypreferences/d/download-my-data',
    steps: [
      'In LinkedIn, open Settings, then Data privacy.',
      'Choose "Get a copy of your data", then the fast file only.',
      'Upload the zip from the email, about 20 minutes later.',
    ],
    expectedFile: 'Basic_LinkedInDataExport_*.zip',
  },
  {
    id: 'instagram_export',
    label: 'Instagram',
    color: '#E4405F',
    icon: <Instagram size={16} />,
    privacyNote: 'Never reads captions or comments. Counts and searches only.',
    exportPortalUrl: 'https://accountscenter.facebook.com/info_and_permissions/dyi',
    steps: [
      'In Meta Accounts Center, open Your information and permissions.',
      'Choose Download your information, as JSON, for all time.',
      'Upload the zip from the email, 2 to 14 days later.',
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

  const line = isParsed && row?.parsed_at
    ? <><span className="rs-ok">Imported</span> · {new Date(row.parsed_at).toLocaleDateString()}, {row.observation_count} memories</>
    : row?.status === 'failed'
      ? <span className="rs-bad">Failed: {row.error_message ?? 'unknown error'}</span>
      : config.privacyNote;

  return (
    <>
      <Row
        icon={
          <span style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 8, background: config.color, color: 'var(--rg-white)' }}>
            {config.icon}
          </span>
        }
        title={config.label}
        line={line}
        action={isParsed ? (
          <button type="button" onClick={onDelete} className="n-btn rg-danger" title="Remove this export">
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            Remove
          </button>
        ) : undefined}
        className="rs-row-has-body"
      />
      <li className="rs-body">
        <ol className="rs-steps">
          {config.steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
        <a href={config.exportPortalUrl} target="_blank" rel="noreferrer" className="rs-link" style={{ justifySelf: 'start' }}>
          Open {config.label} settings <ExternalLink className="inline w-3.5 h-3.5 ml-0.5" aria-hidden="true" />
        </a>

        <div
          className={`rs-drop${dragging ? ' is-over' : ''}`}
          role="button"
          tabIndex={0}
          aria-label={`Upload ${config.label} export`}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
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
            <span className="rs-strong" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Reading your {config.label} export
            </span>
          ) : status.state === 'success' ? (
            <span className="rs-ok" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 aria-hidden="true" />
              Done. {status.observations} memories added.
            </span>
          ) : status.state === 'error' ? (
            <span className="rs-bad" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle aria-hidden="true" />
              {status.message}
            </span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Upload aria-hidden="true" />
              Drop {config.expectedFile} here, or choose it
            </span>
          )}
        </div>
      </li>
    </>
  );
};

export default function DataExportsPage() {
  useDocumentTitle('Data Exports');
  const [rows, setRows] = useState<ExportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState<Record<ExportPlatform, UploadStatus>>({
    discord_export: { state: 'idle' },
    linkedin_export: { state: 'idle' },
    instagram_export: { state: 'idle' },
  });
  const [dragging, setDragging] = useState<ExportPlatform | null>(null);
  // Surface list-load failures instead of swallowing them: the page still works
  // for uploads, but the user should know their existing exports failed to load
  // (audit-2026-07-03 error-ux). Dismissible so it doesn't block the workflow.
  const [listError, setListError] = useState<string | null>(null);

  const rowByPlatform = useMemo(() => {
    const out: Partial<Record<ExportPlatform, ExportRow>> = {};
    for (const r of rows) out[r.platform] = r;
    return out;
  }, [rows]);

  const refresh = async () => {
    try {
      const list = await exportsAPI.list();
      setRows(list);
      setListError(null);
    } catch (err) {
      if (isAbortError(err)) return; // benign StrictMode/unmount cancellation
      setListError(err instanceof Error ? err.message : 'Could not load your existing exports.');
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
        [platform]: { state: 'error', message: 'The file is over the 100 MB limit.' },
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
      if (isAbortError(err)) return; // benign cancellation — don't flip to error
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
      if (isAbortError(err)) return; // benign cancellation — don't flip to error
      setStatuses((s) => ({
        ...s,
        [platform]: { state: 'error', message: err instanceof Error ? err.message : 'Delete failed' },
      }));
    }
  };

  return (
    <Page className="rs">
      <PageHead
        title="Import your history"
        line="Upload a platform's own export. We read it once, then delete the file."
      />

      {listError && (
        <p className="rs-bad" role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: '0 0 24px' }}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span style={{ flex: 1 }}>{listError}</span>
          <button type="button" onClick={() => setListError(null)} aria-label="Dismiss" className="rg-iconbtn">
            <X aria-hidden="true" />
          </button>
        </p>
      )}

      <List label="Exports" className="pb-stack">
        {loading ? (
          <li><Empty>Loading your imports</Empty></li>
        ) : (
          PLATFORMS.map((c) => (
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
          ))
        )}
      </List>
    </Page>
  );
}
