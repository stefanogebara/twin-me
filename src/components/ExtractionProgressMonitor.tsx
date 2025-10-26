/**
 * Extraction Progress Monitor
 * Real-time display of platform data extraction progress via WebSocket
 */

import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import type { WebSocketMessage } from '../hooks/useWebSocket';

interface ExtractionJob {
  jobId: string;
  platform: string;
  status: 'started' | 'running' | 'completed' | 'failed';
  itemsProcessed?: number;
  totalItems?: number;
  progress?: number;
  message: string;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

interface ExtractionProgressMonitorProps {
  showCompleted?: boolean; // Show completed/failed jobs
  maxJobs?: number; // Maximum number of jobs to display
}

const ExtractionProgressMonitor: React.FC<ExtractionProgressMonitorProps> = ({
  showCompleted = true,
  maxJobs = 5,
}) => {
  const [jobs, setJobs] = useState<Map<string, ExtractionJob>>(new Map());
  const { connected, lastMessage } = useWebSocket((message: WebSocketMessage) => {
    handleWebSocketMessage(message);
  });

  const handleWebSocketMessage = (message: WebSocketMessage) => {
    switch (message.type) {
      case 'extraction_started':
        setJobs((prev) => {
          const newJobs = new Map(prev);
          newJobs.set(message.jobId, {
            jobId: message.jobId,
            platform: message.platform,
            status: 'started',
            message: message.message,
            startedAt: new Date(),
          });
          return newJobs;
        });
        break;

      case 'extraction_update':
        setJobs((prev) => {
          const newJobs = new Map(prev);
          const existing = newJobs.get(message.jobId);
          if (existing) {
            newJobs.set(message.jobId, {
              ...existing,
              status: 'running',
              itemsProcessed: message.itemsProcessed,
              totalItems: message.totalItems,
              progress: message.progress,
              message: message.message,
            });
          }
          return newJobs;
        });
        break;

      case 'extraction_completed':
        setJobs((prev) => {
          const newJobs = new Map(prev);
          const existing = newJobs.get(message.jobId);
          if (existing) {
            newJobs.set(message.jobId, {
              ...existing,
              status: 'completed',
              itemsProcessed: message.itemsExtracted,
              message: message.message,
              completedAt: new Date(),
            });
          }
          return newJobs;
        });

        // Auto-remove completed jobs after 10 seconds
        if (!showCompleted) {
          setTimeout(() => {
            setJobs((prev) => {
              const newJobs = new Map(prev);
              newJobs.delete(message.jobId);
              return newJobs;
            });
          }, 10000);
        }
        break;

      case 'extraction_failed':
        setJobs((prev) => {
          const newJobs = new Map(prev);
          const existing = newJobs.get(message.jobId);
          if (existing) {
            newJobs.set(message.jobId, {
              ...existing,
              status: 'failed',
              error: message.error,
              message: message.message,
              completedAt: new Date(),
            });
          }
          return newJobs;
        });
        break;

      default:
        break;
    }
  };

  // Filter jobs based on showCompleted setting
  const visibleJobs = Array.from(jobs.values())
    .filter((job) => showCompleted || (job.status !== 'completed' && job.status !== 'failed'))
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .slice(0, maxJobs);

  if (visibleJobs.length === 0) {
    return null;
  }

  return (
    <div className="bg-card rounded-lg border-2 border-slate-200 p-4 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Platform Data Extraction
        </h3>
        <div className="flex items-center gap-2">
          {connected ? (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <div className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></div>
              Live
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <div className="w-2 h-2 rounded-full bg-slate-400"></div>
              Offline
            </span>
          )}
        </div>
      </div>

      {/* Job List */}
      <div className="space-y-3">
        {visibleJobs.map((job) => (
          <div
            key={job.jobId}
            className={`p-3 rounded-lg border-2 ${
              job.status === 'completed'
                ? 'border-emerald-200 bg-emerald-50'
                : job.status === 'failed'
                ? 'border-red-200 bg-red-50'
                : 'border-orange-200 bg-orange-50'
            }`}
          >
            {/* Job Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {job.status === 'completed' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                ) : job.status === 'failed' ? (
                  <XCircle className="w-5 h-5 text-red-600" />
                ) : job.status === 'started' ? (
                  <RefreshCw className="w-5 h-5 text-orange-600 animate-spin" />
                ) : (
                  <Loader2 className="w-5 h-5 text-orange-600 animate-spin" />
                )}

                <span className="font-medium text-slate-800 capitalize">{job.platform}</span>
              </div>

              {job.progress !== undefined && job.progress < 100 && (
                <span className="text-sm font-medium text-slate-600">{job.progress}%</span>
              )}
            </div>

            {/* Progress Bar */}
            {job.status === 'running' && job.progress !== undefined && (
              <div className="w-full bg-slate-200 rounded-full h-2 mb-2">
                <div
                  className="bg-orange-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
            )}

            {/* Message */}
            <p className="text-sm text-slate-600">{job.message}</p>

            {/* Items Count */}
            {job.itemsProcessed !== undefined && (
              <p className="text-xs text-slate-500 mt-1">
                {job.totalItems
                  ? `${job.itemsProcessed}/${job.totalItems} items`
                  : `${job.itemsProcessed} items extracted`}
              </p>
            )}

            {/* Error Message */}
            {job.error && (
              <div className="mt-2 flex items-start gap-2 text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p className="text-xs">{job.error}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExtractionProgressMonitor;
