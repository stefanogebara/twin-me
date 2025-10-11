import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Brain,
  Play,
  Pause,
  RefreshCcw,
  Database,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Activity,
  FileText,
  Zap
} from 'lucide-react';
import { trainingAPI, handleAPIError } from '@/services/apiService';

interface TrainingMetrics {
  modelStatus: 'idle' | 'training' | 'ready' | 'error';
  accuracy: number;
  totalSamples: number;
  lastTraining: string | null;
  epochs: number;
  currentEpoch: number;
}

export const Training: React.FC = () => {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<TrainingMetrics>({
    modelStatus: 'idle',
    accuracy: 0,
    totalSamples: 0,
    lastTraining: null,
    epochs: 10,
    currentEpoch: 0
  });
  const [isTraining, setIsTraining] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTrainingStatus();
  }, [user]);

  // Poll for training status updates when training is active
  useEffect(() => {
    if (isTraining) {
      const interval = setInterval(() => {
        loadTrainingStatus();
      }, 2000); // Poll every 2 seconds

      return () => clearInterval(interval);
    }
  }, [isTraining]);

  const loadTrainingStatus = async () => {
    try {
      setLoading(true);
      setError(null);

      const userId = user?.id;

      // Fetch real training status from API
      const metricsData = await trainingAPI.getStatus(userId);

      setMetrics(metricsData);

      // Update isTraining state based on model status
      setIsTraining(metricsData.modelStatus === 'training');
    } catch (error) {
      console.error('Error loading training status:', error);
      setError(handleAPIError(error));
    } finally {
      setLoading(false);
    }
  };

  const startTraining = async () => {
    try {
      setError(null);
      const userId = user?.id;

      // Start training via API
      const response = await trainingAPI.startTraining(userId, metrics.epochs);

      if (response.success) {
        console.log('Training started successfully:', response.jobId);
        setIsTraining(true);

        // Immediately update local state to show training started
        setMetrics(prev => ({ ...prev, modelStatus: 'training', currentEpoch: 0 }));

        // The polling effect will handle updating progress
      } else {
        throw new Error(response.message || 'Failed to start training');
      }
    } catch (error) {
      console.error('Training error:', error);
      setError(handleAPIError(error));
      setMetrics(prev => ({ ...prev, modelStatus: 'error' }));
      setIsTraining(false);
    }
  };

  const stopTraining = async () => {
    try {
      setError(null);
      const userId = user?.id;

      // Stop training via API
      await trainingAPI.stopTraining(userId);

      setIsTraining(false);
      setMetrics(prev => ({ ...prev, modelStatus: 'idle' }));
    } catch (error) {
      console.error('Error stopping training:', error);
      setError(handleAPIError(error));
    }
  };

  const resetModel = async () => {
    if (confirm('Are you sure you want to reset the model? This will clear all training progress.')) {
      try {
        setError(null);
        const userId = user?.id;

        // Reset model via API
        await trainingAPI.resetModel(userId);

        // Reload training status to get updated metrics
        await loadTrainingStatus();
      } catch (error) {
        console.error('Error resetting model:', error);
        setError(handleAPIError(error));
      }
    }
  };

  const statusConfig = {
    idle: { color: 'text-gray-500', bg: 'bg-gray-500/10', label: 'Idle', icon: AlertCircle },
    training: { color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Training', icon: Activity },
    ready: { color: 'text-green-500', bg: 'bg-green-500/10', label: 'Ready', icon: CheckCircle2 },
    error: { color: 'text-red-500', bg: 'bg-red-500/10', label: 'Error', icon: AlertCircle }
  };

  const currentStatus = statusConfig[metrics.modelStatus];
  const StatusIcon = currentStatus.icon;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[hsl(var(--claude-bg))]">
        <div className="text-center">
          <Activity className="w-8 h-8 text-[hsl(var(--claude-accent))] animate-spin mx-auto mb-4" />
          <p className="text-[hsl(var(--claude-text-muted))]">Loading training data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--claude-bg))] p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[hsl(var(--claude-text))] mb-2">
          Model Training & Fine-Tuning
        </h1>
        <p className="text-[hsl(var(--claude-text-muted))]">
          Train your digital twin to better represent your personality and communication style
        </p>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Model Status Card */}
        <div className="bg-[hsl(var(--claude-surface))] border border-[hsl(var(--claude-border))] rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-12 h-12 rounded-lg ${currentStatus.bg} flex items-center justify-center`}>
              <StatusIcon className={`w-6 h-6 ${currentStatus.color}`} />
            </div>
            <div>
              <p className="text-sm text-[hsl(var(--claude-text-muted))]">Model Status</p>
              <p className={`text-lg font-semibold ${currentStatus.color}`}>
                {currentStatus.label}
              </p>
            </div>
          </div>
          {metrics.lastTraining && (
            <p className="text-xs text-[hsl(var(--claude-text-muted))]">
              Last trained: {new Date(metrics.lastTraining).toLocaleString()}
            </p>
          )}
        </div>

        {/* Accuracy Card */}
        <div className="bg-[hsl(var(--claude-surface))] border border-[hsl(var(--claude-border))] rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-[hsl(var(--claude-text-muted))]">Model Accuracy</p>
              <p className="text-lg font-semibold text-[hsl(var(--claude-text))]">
                {metrics.accuracy.toFixed(1)}%
              </p>
            </div>
          </div>
          <div className="w-full bg-[hsl(var(--claude-surface-raised))] rounded-full h-2">
            <div
              className="bg-purple-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${metrics.accuracy}%` }}
            />
          </div>
        </div>

        {/* Training Data Card */}
        <div className="bg-[hsl(var(--claude-surface))] border border-[hsl(var(--claude-border))] rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Database className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-[hsl(var(--claude-text-muted))]">Training Samples</p>
              <p className="text-lg font-semibold text-[hsl(var(--claude-text))]">
                {metrics.totalSamples.toLocaleString()}
              </p>
            </div>
          </div>
          <p className="text-xs text-[hsl(var(--claude-text-muted))]">
            Collected from {3} platforms
          </p>
        </div>
      </div>

      {/* Training Progress */}
      {isTraining && (
        <div className="bg-[hsl(var(--claude-surface))] border border-[hsl(var(--claude-border))] rounded-lg p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Activity className="w-5 h-5 text-blue-500 animate-spin" />
            <h2 className="text-lg font-semibold text-[hsl(var(--claude-text))]">
              Training in Progress
            </h2>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-sm text-[hsl(var(--claude-text-muted))]">
              <span>Epoch {metrics.currentEpoch} of {metrics.epochs}</span>
              <span>{Math.round((metrics.currentEpoch / metrics.epochs) * 100)}%</span>
            </div>
            <div className="w-full bg-[hsl(var(--claude-surface-raised))] rounded-full h-3">
              <div
                className="bg-blue-500 h-3 rounded-full transition-all duration-300"
                style={{ width: `${(metrics.currentEpoch / metrics.epochs) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Training Controls */}
      <div className="bg-[hsl(var(--claude-surface))] border border-[hsl(var(--claude-border))] rounded-lg p-6 mb-8">
        <h2 className="text-xl font-semibold text-[hsl(var(--claude-text))] mb-4">
          Training Controls
        </h2>
        <div className="flex flex-wrap gap-3">
          {!isTraining ? (
            <div
              className="inline-block"
              title={metrics.totalSamples === 0 ? "Connect platforms and collect data before training" : ""}
            >
              <button
                onClick={startTraining}
                disabled={metrics.totalSamples === 0}
                className="flex items-center gap-2 px-6 py-3 bg-[hsl(var(--claude-accent))] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-4 h-4" />
                Start Training
              </button>
            </div>
          ) : (
            <button
              onClick={stopTraining}
              className="flex items-center gap-2 px-6 py-3 bg-red-500 text-white rounded-lg hover:opacity-90 transition-opacity"
            >
              <Pause className="w-4 h-4" />
              Stop Training
            </button>
          )}
          <div
            className="inline-block"
            title={isTraining ? "Cannot reset while training is in progress" : ""}
          >
            <button
              onClick={resetModel}
              disabled={isTraining}
              className="flex items-center gap-2 px-6 py-3 bg-[hsl(var(--claude-surface-raised))] text-[hsl(var(--claude-text))] border border-[hsl(var(--claude-border))] rounded-lg hover:bg-[hsl(var(--claude-bg))] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCcw className="w-4 h-4" />
              Reset Model
            </button>
          </div>
        </div>
      </div>

      {/* Training Data Sources */}
      <div className="bg-[hsl(var(--claude-surface))] border border-[hsl(var(--claude-border))] rounded-lg p-6">
        <h2 className="text-xl font-semibold text-[hsl(var(--claude-text))] mb-4">
          Training Data Sources
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-[hsl(var(--claude-surface-raised))] rounded-lg">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-[hsl(var(--claude-text-muted))]" />
              <div>
                <p className="text-sm font-medium text-[hsl(var(--claude-text))]">
                  Connected Platforms
                </p>
                <p className="text-xs text-[hsl(var(--claude-text-muted))]">
                  Spotify, GitHub, Discord
                </p>
              </div>
            </div>
            <span className="text-sm font-semibold text-[hsl(var(--claude-text))]">
              {metrics.totalSamples} samples
            </span>
          </div>
          <div className="flex items-center justify-between p-4 bg-[hsl(var(--claude-surface-raised))] rounded-lg">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-[hsl(var(--claude-text-muted))]" />
              <div>
                <p className="text-sm font-medium text-[hsl(var(--claude-text))]">
                  Soul Signature Data
                </p>
                <p className="text-xs text-[hsl(var(--claude-text-muted))]">
                  Personality patterns and preferences
                </p>
              </div>
            </div>
            <span className="text-sm font-semibold text-[hsl(var(--claude-text))]">
              Active
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Training;
