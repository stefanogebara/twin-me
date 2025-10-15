/**
 * Soul Data Extractor Component
 * Real-time data extraction with progress tracking and personality insights
 */

import React, { useState, useEffect } from 'react';
import { Brain, Sparkles, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { soulDataService, ExtractionStatus, StyleProfile } from '@/services/soulDataService';

interface ExtractionCompleteData {
  status: ExtractionStatus;
  profile: StyleProfile;
}

interface Props {
  userId: string;
  onExtractionComplete?: (data: ExtractionCompleteData) => void;
}

export const SoulDataExtractor: React.FC<Props> = ({ userId, onExtractionComplete }) => {
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState<ExtractionStatus | null>(null);
  const [styleProfile, setStyleProfile] = useState<StyleProfile | null>(null);
  const [currentPhase, setCurrentPhase] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Check initial status on load
  useEffect(() => {
    loadExtractionStatus();
    loadStyleProfile();
  }, [userId]);

  const loadExtractionStatus = async () => {
    try {
      const status = await soulDataService.getExtractionStatus(userId);
      setExtractionStatus(status);
    } catch (err) {
      console.error('Failed to load extraction status:', err);
    }
  };

  const loadStyleProfile = async () => {
    try {
      const profile = await soulDataService.getStyleProfile(userId);
      if (profile.success) {
        setStyleProfile(profile);
      }
    } catch (err) {
      console.log('No style profile yet');
    }
  };

  const startFullPipeline = async () => {
    setIsExtracting(true);
    setError(null);
    setProgress(0);

    try {
      // Phase 1: Extract data from all platforms
      setCurrentPhase('Extracting data from connected platforms...');
      setProgress(10);

      const extractResult = await soulDataService.extractAll(userId);

      if (!extractResult.success) {
        throw new Error(extractResult.error || 'Extraction failed');
      }

      // Poll for extraction completion
      setCurrentPhase('Processing platform data...');
      setProgress(25);

      await soulDataService.pollExtractionStatus(userId, (status) => {
        setExtractionStatus(status);

        // Calculate progress based on completed jobs
        const totalJobs = status.recentJobs.length;
        const completedJobs = status.recentJobs.filter(j => j.status === 'completed').length;
        const phaseProgress = 25 + (completedJobs / totalJobs) * 25;
        setProgress(phaseProgress);
      });

      // Phase 2: Process text
      setCurrentPhase('Processing and cleaning text content...');
      setProgress(50);

      await soulDataService.processText(userId, 100);
      setProgress(60);

      // Phase 3: Analyze style
      setCurrentPhase('Analyzing writing style and personality...');
      setProgress(70);

      await soulDataService.analyzeStyle(userId);
      setProgress(80);

      // Reload style profile
      await loadStyleProfile();

      // Phase 4: Generate embeddings
      setCurrentPhase('Generating vector embeddings...');
      setProgress(85);

      await soulDataService.generateEmbeddings(userId, 100);
      setProgress(100);

      // Complete
      setCurrentPhase('Soul signature extraction complete!');

      if (onExtractionComplete) {
        const finalStatus = await soulDataService.getExtractionStatus(userId);
        const finalProfile = await soulDataService.getStyleProfile(userId);
        onExtractionComplete({ status: finalStatus, profile: finalProfile });
      }

    } catch (err: unknown) {
      console.error('Extraction pipeline error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Extraction failed';
      setError(errorMsg);
    } finally {
      setIsExtracting(false);
    }
  };

  const formatPersonalityTrait = (trait: string, value: number): string => {
    const percentage = (value * 100).toFixed(0);
    const interpretation = value > 0.7 ? 'High' : value < 0.3 ? 'Low' : 'Moderate';
    return `${trait}: ${interpretation} (${percentage}%)`;
  };

  return (
    <Card className="p-6 bg-[hsl(var(--claude-surface))] border-[hsl(var(--claude-border))]">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Brain className="w-8 h-8 text-[hsl(var(--claude-accent))]" />
            <div>
              <h2 className="text-2xl font-bold text-[hsl(var(--claude-text))]">
                Soul Signature Extraction
              </h2>
              <p className="text-sm text-[hsl(var(--claude-text-muted))]">
                Deep personality analysis from your digital footprint
              </p>
            </div>
          </div>
          <Button
            onClick={startFullPipeline}
            disabled={isExtracting}
            className="bg-[hsl(var(--claude-accent))] hover:bg-[hsl(var(--claude-accent))]/90"
          >
            {isExtracting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Extracting...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Extract Soul Signature
              </>
            )}
          </Button>
        </div>

        {/* Progress */}
        {isExtracting && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[hsl(var(--claude-text-muted))]">{currentPhase}</span>
              <span className="text-[hsl(var(--claude-accent))] font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-sm text-red-500">{error}</span>
          </div>
        )}

        {/* Extraction Status */}
        {extractionStatus && extractionStatus.recentJobs.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-[hsl(var(--claude-text))]">Recent Extractions</h3>
            <div className="space-y-2">
              {extractionStatus.recentJobs.slice(0, 5).map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-3 bg-[hsl(var(--claude-surface-raised))] rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {job.status === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : job.status === 'running' ? (
                      <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                    ) : job.status === 'failed' ? (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-gray-500" />
                    )}
                    <div>
                      <div className="text-sm font-medium text-[hsl(var(--claude-text))] capitalize">
                        {job.platform}
                      </div>
                      {job.processed_items > 0 && (
                        <div className="text-xs text-[hsl(var(--claude-text-muted))]">
                          {job.processed_items} items extracted
                        </div>
                      )}
                    </div>
                  </div>
                  <Badge
                    variant={
                      job.status === 'completed' ? 'default' :
                      job.status === 'running' ? 'secondary' :
                      'destructive'
                    }
                  >
                    {job.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Personality Profile */}
        {styleProfile && styleProfile.success && (
          <div className="space-y-4 p-4 bg-[hsl(var(--claude-surface-raised))] rounded-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[hsl(var(--claude-text))]">
                Your Personality Profile
              </h3>
              <Badge className="bg-[hsl(var(--claude-accent))]">
                {(styleProfile.profile.confidence_score * 100).toFixed(0)}% Confidence
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="text-xs text-[hsl(var(--claude-text-muted))]">Communication Style</div>
                <div className="text-sm font-medium text-[hsl(var(--claude-text))] capitalize">
                  {styleProfile.profile.communication_style}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-[hsl(var(--claude-text-muted))]">Humor Style</div>
                <div className="text-sm font-medium text-[hsl(var(--claude-text))] capitalize">
                  {styleProfile.profile.humor_style}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-[hsl(var(--claude-text-muted))] uppercase tracking-wide">
                Big Five Personality Traits
              </div>
              <div className="space-y-1 text-sm text-[hsl(var(--claude-text))]">
                {styleProfile.profile.personality_traits && Object.entries(styleProfile.profile.personality_traits)
                  .filter(([trait, value]) => typeof value === 'number' && !isNaN(value))
                  .map(([trait, value]) => (
                  <div key={trait} className="flex items-center justify-between">
                    <span className="capitalize">{trait}</span>
                    <div className="flex items-center gap-2">
                      <Progress value={value * 100} className="w-24 h-2" />
                      <span className="text-xs text-[hsl(var(--claude-text-muted))] w-12 text-right">
                        {(value * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-[hsl(var(--claude-border))] text-xs text-[hsl(var(--claude-text-muted))]">
              Analyzed from {styleProfile.profile.sample_size} text samples
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};
