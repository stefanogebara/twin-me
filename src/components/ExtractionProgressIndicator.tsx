/**
 * Extraction Progress Indicator
 * Real-time progress display for soul signature data extraction
 */

import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Music, Github, MessageSquare, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

interface ExtractionProgress {
  platform: string;
  status: 'pending' | 'extracting' | 'completed' | 'failed';
  itemsExtracted: number;
  totalItems?: number;
  message?: string;
  estimatedTimeRemaining?: number;
}

interface Props {
  userId: string;
  platforms: string[];
  onComplete?: () => void;
  className?: string;
}

const platformIcons: Record<string, React.ElementType> = {
  spotify: Music,
  github: Github,
  discord: MessageSquare,
  linkedin: Sparkles,
};

const platformColors: Record<string, string> = {
  spotify: 'text-green-500',
  github: 'text-purple-500',
  discord: 'text-indigo-500',
  linkedin: 'text-blue-500',
};

export const ExtractionProgressIndicator: React.FC<Props> = ({
  userId,
  platforms,
  onComplete,
  className = ''
}) => {
  const [platformProgress, setPlatformProgress] = useState<Record<string, ExtractionProgress>>({});
  const [overallProgress, setOverallProgress] = useState(0);
  const [isPolling, setIsPolling] = useState(true);
  const [startTime, setStartTime] = useState<number>(Date.now());

  // Initialize platform progress
  useEffect(() => {
    const initial: Record<string, ExtractionProgress> = {};
    platforms.forEach(platform => {
      initial[platform] = {
        platform,
        status: 'pending',
        itemsExtracted: 0,
      };
    });
    setPlatformProgress(initial);
    setStartTime(Date.now());
  }, [platforms]);

  // Poll for extraction status
  useEffect(() => {
    if (!isPolling) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/soul-data/extraction-status?userId=${userId}`
        );

        if (!response.ok) {
          console.error('Failed to fetch extraction status');
          return;
        }

        const data = await response.json();

        if (data.success && data.recentJobs) {
          // Update platform progress based on jobs
          const updatedProgress = { ...platformProgress };

          data.recentJobs.forEach((job: any) => {
            if (platforms.includes(job.platform)) {
              updatedProgress[job.platform] = {
                platform: job.platform,
                status: job.status === 'completed' ? 'completed' :
                       job.status === 'running' ? 'extracting' :
                       job.status === 'failed' ? 'failed' : 'pending',
                itemsExtracted: job.processed_items || 0,
                totalItems: job.total_items,
                message: job.error_message,
              };
            }
          });

          setPlatformProgress(updatedProgress);

          // Calculate overall progress
          const totalPlatforms = platforms.length;
          const completedPlatforms = Object.values(updatedProgress).filter(
            p => p.status === 'completed'
          ).length;
          const progress = (completedPlatforms / totalPlatforms) * 100;
          setOverallProgress(progress);

          // Check if all complete
          if (completedPlatforms === totalPlatforms) {
            setIsPolling(false);
            if (onComplete) {
              onComplete();
            }
          }
        }
      } catch (error) {
        console.error('Error polling extraction status:', error);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [userId, platforms, platformProgress, isPolling, onComplete]);

  const getStatusIcon = (status: ExtractionProgress['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'extracting':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <div className="w-5 h-5 rounded-full border-2 border-gray-300" />;
    }
  };

  const formatElapsedTime = () => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  };

  const estimateTimeRemaining = () => {
    const elapsed = Date.now() - startTime;
    const completedCount = Object.values(platformProgress).filter(p => p.status === 'completed').length;

    if (completedCount === 0) return '~2-3 min';

    const avgTimePerPlatform = elapsed / completedCount;
    const remainingPlatforms = platforms.length - completedCount;
    const estimatedMs = avgTimePerPlatform * remainingPlatforms;

    const minutes = Math.floor(estimatedMs / 60000);
    const seconds = Math.floor((estimatedMs % 60000) / 1000);

    if (minutes > 0) {
      return `~${minutes}m ${seconds}s`;
    }
    return `~${seconds}s`;
  };

  return (
    <Card className={`p-6 bg-[hsl(var(--claude-surface))] border-[hsl(var(--claude-border))] ${className}`}>
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[hsl(var(--claude-text))]">
              Extracting Soul Signature
            </h3>
            <Badge variant={overallProgress === 100 ? 'default' : 'secondary'}>
              {overallProgress === 100 ? 'Complete' : 'In Progress'}
            </Badge>
          </div>
          <p className="text-sm text-[hsl(var(--claude-text-muted))]">
            Analyzing your digital footprint to discover your authentic personality
          </p>
        </div>

        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[hsl(var(--claude-text-muted))]">
              Overall Progress
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[hsl(var(--claude-text-muted))]">
                Elapsed: {formatElapsedTime()}
              </span>
              {overallProgress < 100 && (
                <span className="text-xs text-[hsl(var(--claude-text-muted))]">
                  Est. remaining: {estimateTimeRemaining()}
                </span>
              )}
              <span className="text-[hsl(var(--claude-accent))] font-medium">
                {Math.round(overallProgress)}%
              </span>
            </div>
          </div>
          <Progress value={overallProgress} className="h-2" />
        </div>

        {/* Platform-specific Progress */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-[hsl(var(--claude-text))]">
            Platform Extraction
          </h4>
          <div className="space-y-2">
            {platforms.map((platform) => {
              const progress = platformProgress[platform];
              if (!progress) return null;

              const Icon = platformIcons[platform] || Sparkles;
              const colorClass = platformColors[platform] || 'text-gray-500';

              return (
                <div
                  key={platform}
                  className="flex items-center justify-between p-3 bg-[hsl(var(--claude-surface-raised))] rounded-lg border border-[hsl(var(--claude-border))]"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className={colorClass}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-[hsl(var(--claude-text))] capitalize">
                          {platform}
                        </span>
                        {getStatusIcon(progress.status)}
                      </div>
                      {progress.status === 'extracting' && progress.totalItems && (
                        <div className="mt-1">
                          <div className="flex items-center justify-between text-xs text-[hsl(var(--claude-text-muted))] mb-1">
                            <span>
                              {progress.itemsExtracted} / {progress.totalItems} items
                            </span>
                            <span>
                              {Math.round((progress.itemsExtracted / progress.totalItems) * 100)}%
                            </span>
                          </div>
                          <Progress
                            value={(progress.itemsExtracted / progress.totalItems) * 100}
                            className="h-1"
                          />
                        </div>
                      )}
                      {progress.status === 'completed' && progress.itemsExtracted > 0 && (
                        <span className="text-xs text-green-600">
                          ✓ {progress.itemsExtracted} items extracted
                        </span>
                      )}
                      {progress.status === 'failed' && progress.message && (
                        <span className="text-xs text-red-500">
                          {progress.message}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Status Message */}
        {overallProgress === 100 && (
          <div className="flex items-center gap-2 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <span className="text-sm text-green-700 dark:text-green-400">
              Soul signature extraction complete! Ready to build your digital twin.
            </span>
          </div>
        )}
      </div>
    </Card>
  );
};
