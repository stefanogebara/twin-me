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
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  Music,
  Youtube,
  MessageSquare,
  ArrowLeft,
  FileJson,
  Archive,
  Loader2,
  ExternalLink,
} from 'lucide-react';
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
    icon: <Music size={20} />,
    description: 'Full multi-year listening history — artists, tracks, and time patterns.',
    exportInstructions: 'Go to spotify.com → Account → Privacy settings → Request data',
    exportUrl: 'https://www.spotify.com/account/privacy/',
    expectedFile: 'StreamingHistory*.json',
    fileAccept: '.json,application/json',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    color: '#FF0000',
    bgColor: 'rgba(255, 0, 0, 0.06)',
    icon: <Youtube size={20} />,
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
    icon: <MessageSquare size={20} />,
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
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
        <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.15" />
        <text x="5" y="14" fontSize="11" fontWeight="bold" fill="currentColor">R</text>
      </svg>
    ),
    description: 'Subreddit activity, comment history, and saved posts.',
    exportInstructions: 'Go to Reddit → Settings → Privacy & Security → Request data export',
    exportUrl: 'https://www.reddit.com/settings/data-request',
    expectedFile: 'reddit-data-*.json',
    fileAccept: '.json,application/json',
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PlatformCard({ config, onSelect }: { config: PlatformConfig; onSelect: () => void }) {
  return (
    <motion.button
      onClick={onSelect}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="w-full text-left p-4 rounded-xl border border-black/8 transition-colors"
      style={{ background: config.bgColor }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: config.color, color: '#fff' }}
        >
          {config.icon}
        </div>
        <div>
          <div className="font-semibold text-sm text-black">{config.label}</div>
          <div className="text-xs text-black/50 mt-0.5 leading-relaxed">{config.description}</div>
        </div>
      </div>
    </motion.button>
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePlatformSelect = useCallback((config: PlatformConfig) => {
    setSelectedPlatform(config);
    setStep('uploading');
  }, []);

  const handleFile = useCallback(async (file: File) => {
    if (!selectedPlatform) return;
    setStep('processing');
    try {
      const res = await importsAPI.uploadGdpr(selectedPlatform.id, file);
      setResult({ observationsCreated: res.observationsCreated });
      setStep('done');
      onImportComplete?.({ platform: selectedPlatform.id, observations_created: res.observationsCreated });
    } catch (err) {
      setResult({ observationsCreated: 0, error: err instanceof Error ? err.message : 'Upload failed' });
      setStep('error');
    }
  }, [selectedPlatform, onImportComplete]);

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }, [handleFile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const reset = useCallback(() => {
    setStep('idle');
    setSelectedPlatform(null);
    setResult(null);
  }, []);

  // ----- Render -----

  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">

        {/* IDLE — start button */}
        {step === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-between"
          >
            <p className="text-sm text-black/50 leading-relaxed max-w-md">
              Import years of history the platform APIs can't provide — full Spotify plays, every YouTube video, Discord activity patterns, and Reddit archives.
            </p>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setStep('selecting')}
              className="flex-shrink-0 ml-4 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: '#000' }}
            >
              <Upload size={14} />
              Import Data
            </motion.button>
          </motion.div>
        )}

        {/* SELECTING — platform cards */}
        {step === 'selecting' && (
          <motion.div
            key="selecting"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <p className="text-sm text-black/50">Choose a platform to import:</p>
            <div className="grid grid-cols-2 gap-3">
              {PLATFORMS.map((p) => (
                <PlatformCard key={p.id} config={p} onSelect={() => handlePlatformSelect(p)} />
              ))}
            </div>
            <button
              onClick={reset}
              className="text-xs text-black/40 hover:text-black/60 flex items-center gap-1 mt-1"
            >
              <ArrowLeft size={12} /> Cancel
            </button>
          </motion.div>
        )}

        {/* UPLOADING — drop zone + instructions */}
        {step === 'uploading' && selectedPlatform && (
          <motion.div
            key="uploading"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* Instructions */}
            <div
              className="rounded-xl p-4 border border-black/8 space-y-2"
              style={{ background: selectedPlatform.bgColor }}
            >
              <div className="flex items-center gap-2 font-semibold text-sm" style={{ color: selectedPlatform.color }}>
                <span>{selectedPlatform.label} Export Instructions</span>
              </div>
              <p className="text-xs text-black/60 leading-relaxed">{selectedPlatform.exportInstructions}</p>
              <a
                href={selectedPlatform.exportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2"
                style={{ color: selectedPlatform.color }}
              >
                Open settings <ExternalLink size={10} />
              </a>
              <div className="flex items-center gap-1.5 text-xs text-black/40 mt-1">
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
              <Upload size={24} className="mx-auto mb-2 text-black/30" />
              <p className="text-sm font-medium text-black/70">Drop file here or click to browse</p>
              <p className="text-xs text-black/40 mt-1">{selectedPlatform.expectedFile}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept={selectedPlatform.fileAccept}
                className="hidden"
                onChange={onInputChange}
              />
            </div>

            <button
              onClick={() => setStep('selecting')}
              className="text-xs text-black/40 hover:text-black/60 flex items-center gap-1"
            >
              <ArrowLeft size={12} /> Choose different platform
            </button>
          </motion.div>
        )}

        {/* PROCESSING */}
        {step === 'processing' && selectedPlatform && (
          <motion.div
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-10 gap-3"
          >
            <Loader2 size={28} className="animate-spin" style={{ color: selectedPlatform.color }} />
            <p className="text-sm text-black/60 font-medium">
              Importing your {selectedPlatform.label} history…
            </p>
            <p className="text-xs text-black/40">This may take a moment for large exports.</p>
          </motion.div>
        )}

        {/* DONE */}
        {step === 'done' && selectedPlatform && result && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-black/8 p-5 space-y-3"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 size={20} className="text-green-500" />
              <span className="font-semibold text-sm">Import complete!</span>
            </div>
            <p className="text-sm text-black/60">
              Added{' '}
              <span className="font-semibold text-black">{result.observationsCreated.toLocaleString()}</span>{' '}
              new observations from {selectedPlatform.label} to your twin's memory.
              {result.observationsCreated > 20 && ' Your twin is reflecting on the new data.'}
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={reset}
                className="text-xs px-3 py-1.5 rounded-lg border border-black/10 text-black/60 hover:border-black/20"
              >
                Import another
              </button>
            </div>
          </motion.div>
        )}

        {/* ERROR */}
        {step === 'error' && selectedPlatform && result && (
          <motion.div
            key="error"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-red-100 bg-red-50 p-5 space-y-3"
          >
            <div className="flex items-center gap-2">
              <AlertCircle size={20} className="text-red-500" />
              <span className="font-semibold text-sm text-red-700">Import failed</span>
            </div>
            <p className="text-xs text-red-600 leading-relaxed">{result.error}</p>
            <button
              onClick={() => setStep('uploading')}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-100"
            >
              Try again
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

export default DataUploadPanel;
