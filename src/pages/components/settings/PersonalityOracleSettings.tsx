import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, RefreshCw, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { getAccessToken } from '@/services/api/apiBase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const getAuthHeaders = () => {
  const token = getAccessToken() || localStorage.getItem('auth_token') || localStorage.getItem('token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

interface PersonalityOracleSettingsProps {
  cardStyle: string;
}

interface FinetuneStatus {
  status: 'none' | 'pending' | 'running' | 'ready' | 'failed' | 'cancelled';
  modelId?: string;
  trainingExamples?: number;
  completedAt?: string;
  error?: string;
}

interface FlagState {
  personality_oracle: boolean;
}

export default function PersonalityOracleSettings({ cardStyle }: PersonalityOracleSettingsProps) {
  const [finetuneStatus, setFinetuneStatus] = useState<FinetuneStatus>({ status: 'none' });
  const [flagState, setFlagState] = useState<FlagState>({ personality_oracle: false });
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const [statusRes, flagsRes] = await Promise.all([
        fetch(`${API_URL}/finetuning/status`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/eval/flags`, { headers: getAuthHeaders() }),
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        setFinetuneStatus(data.model ? {
          status: data.model.status,
          modelId: data.model.model_id,
          trainingExamples: data.model.training_examples,
          completedAt: data.model.completed_at,
        } : { status: 'none' });
      }

      if (flagsRes.ok) {
        const data = await flagsRes.json();
        setFlagState({ personality_oracle: data.flags?.personality_oracle === true });
      }
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleTrain = async () => {
    setTraining(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/finetuning/train`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: `Training started with ${data.trainingExamples} examples. This takes 15-30 minutes.` });
        setFinetuneStatus({ status: 'running', trainingExamples: data.trainingExamples });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to start training' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setTraining(false);
    }
  };

  const handleToggle = async () => {
    setToggling(true);
    const newValue = !flagState.personality_oracle;
    try {
      const res = await fetch(`${API_URL}/eval/flags`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ flag: 'personality_oracle', value: newValue }),
      });
      if (res.ok) {
        setFlagState({ personality_oracle: newValue });
        setMessage({ type: 'info', text: newValue ? 'Enhanced personality enabled' : 'Enhanced personality disabled' });
      }
    } catch {
      // revert on failure
    } finally {
      setToggling(false);
    }
  };

  const statusIcon = {
    none: <AlertCircle size={14} className="text-gray-400" />,
    pending: <Clock size={14} className="text-yellow-500" />,
    running: <RefreshCw size={14} className="text-blue-500 animate-spin" />,
    ready: <CheckCircle size={14} className="text-green-500" />,
    failed: <AlertCircle size={14} className="text-red-500" />,
    cancelled: <AlertCircle size={14} className="text-gray-400" />,
  };

  const statusLabel = {
    none: 'Not trained',
    pending: 'Queued',
    running: 'Training...',
    ready: 'Ready',
    failed: 'Failed',
    cancelled: 'Cancelled',
  };

  if (loading) return null;

  return (
    <section className={`p-8 ${cardStyle}`}>
      <div className="flex items-center gap-3 mb-6">
        <Sparkles className="w-5 h-5" style={{ color: '#10b77f' }} />
        <h2
          className="text-[11px] uppercase tracking-widest font-medium"
          style={{ color: '#10b77f' }}
        >
          Enhanced Personality
        </h2>
      </div>

      <div className="space-y-4">
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Train a personalized AI model on your conversation history to make your twin's personality more authentic.
        </p>

        {/* Model Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {statusIcon[finetuneStatus.status]}
            <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
              {statusLabel[finetuneStatus.status]}
            </span>
            {finetuneStatus.trainingExamples && (
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                ({finetuneStatus.trainingExamples} examples)
              </span>
            )}
          </div>

          <button
            onClick={handleTrain}
            disabled={training || finetuneStatus.status === 'running' || finetuneStatus.status === 'pending'}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
            style={{
              backgroundColor: '#10b77f',
              color: '#0a0f0a',
            }}
          >
            <RefreshCw size={14} className={training ? 'animate-spin' : ''} />
            {finetuneStatus.status === 'ready' ? 'Retrain' : 'Train Model'}
          </button>
        </div>

        {/* Toggle (only if model is ready) */}
        {finetuneStatus.status === 'ready' && (
          <>
            <div
              className="h-px"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
            />
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                  Use enhanced personality in chat
                </span>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  Your twin will use the trained model for more authentic responses
                </p>
              </div>
              <button
                role="switch"
                aria-checked={flagState.personality_oracle}
                aria-label="Enable Personality Oracle"
                onClick={handleToggle}
                disabled={toggling}
                className="relative w-11 h-6 rounded-full transition-colors"
                style={{
                  backgroundColor: flagState.personality_oracle
                    ? '#10b77f'
                    : 'rgba(255,255,255,0.06)',
                }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform"
                  style={{
                    backgroundColor: 'white',
                    transform: flagState.personality_oracle ? 'translateX(20px)' : 'translateX(0)',
                  }}
                />
              </button>
            </div>
          </>
        )}

        {/* Message */}
        {message && (
          <p className={`text-xs mt-2 ${
            message.type === 'error' ? 'text-red-500' :
            message.type === 'success' ? 'text-green-500' : ''
          }`} style={message.type === 'info' ? { color: 'rgba(255,255,255,0.3)' } : undefined}>
            {message.text}
          </p>
        )}
      </div>
    </section>
  );
}
