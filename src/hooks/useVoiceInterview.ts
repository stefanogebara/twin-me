/**
 * useVoiceInterview — Voice conversation hook for the deep interview
 * ===================================================================
 * Wraps ElevenLabs React SDK's useConversation to provide:
 * - Tap-to-talk voice sessions with the SoulOrb
 * - Transcript callbacks that feed into the unified messages array
 * - Orb state (idle/listening/thinking/speaking) for visual feedback
 * - Seamless text fallback if voice is unavailable
 *
 * Architecture:
 *   Browser mic → ElevenLabs Agent (WebRTC) → Custom LLM (/api/onboarding/voice)
 *   → ElevenLabs TTS → Audio playback + transcript callbacks
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useConversation } from '@elevenlabs/react';
import type { Status, Mode } from '@elevenlabs/react';

// ====================================================================
// Types
// ====================================================================

export type OrbVoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface VoiceInterviewConfig {
  agentId: string;
  userId: string | null;
  enrichmentContext: Record<string, unknown>;
  onTranscript: (text: string, role: 'user' | 'assistant') => void;
  onStatusChange?: (state: OrbVoiceState) => void;
  onError?: (message: string) => void;
}

interface VoiceInterviewReturn {
  /** Whether the voice session is active */
  isActive: boolean;
  /** Current orb visual state */
  orbState: OrbVoiceState;
  /** Whether voice is available (mic permissions, ElevenLabs configured) */
  isAvailable: boolean;
  /** Start or stop the voice session */
  toggleVoice: () => Promise<void>;
  /** Send a text message through the voice session (hybrid mode) */
  sendText: (text: string) => void;
  /** Current input audio volume (0-1, for waveform visualization) */
  inputVolume: number;
  /** Current output audio volume (0-1, for orb pulse sync) */
  outputVolume: number;
  /** ElevenLabs connection status */
  connectionStatus: Status;
}

// ====================================================================
// Hook
// ====================================================================

export function useVoiceInterview(config: VoiceInterviewConfig): VoiceInterviewReturn {
  const { agentId, userId, enrichmentContext, onTranscript, onStatusChange, onError } = config;

  const [isActive, setIsActive] = useState(false);
  const [orbState, setOrbState] = useState<OrbVoiceState>('idle');
  const [isAvailable, setIsAvailable] = useState(true);
  const [inputVolume, setInputVolume] = useState(0);
  const [outputVolume, setOutputVolume] = useState(0);
  const volumeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track the latest callbacks via refs to avoid stale closures
  const onTranscriptRef = useRef(onTranscript);
  const onStatusChangeRef = useRef(onStatusChange);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onStatusChangeRef.current = onStatusChange;
    onErrorRef.current = onError;
  }, [onTranscript, onStatusChange, onError]);

  // Update orb state and notify parent
  const updateOrbState = useCallback((newState: OrbVoiceState) => {
    setOrbState(newState);
    onStatusChangeRef.current?.(newState);
  }, []);

  // ElevenLabs conversation hook
  const conversation = useConversation({
    onConnect: () => {
      setIsActive(true);
      updateOrbState('listening');
    },
    onDisconnect: () => {
      setIsActive(false);
      updateOrbState('idle');
      stopVolumePolling();
    },
    onMessage: (payload) => {
      // Map ElevenLabs role to our role format
      const role = payload.role === 'agent' ? 'assistant' : 'user';
      onTranscriptRef.current(payload.message, role);
    },
    onModeChange: ({ mode }: { mode: Mode }) => {
      // 'speaking' = agent is talking, 'listening' = waiting for user
      if (mode === 'speaking') {
        updateOrbState('speaking');
      } else {
        updateOrbState('listening');
      }
    },
    onStatusChange: ({ status }: { status: Status }) => {
      if (status === 'connecting') {
        updateOrbState('thinking');
      } else if (status === 'disconnected') {
        updateOrbState('idle');
        setIsActive(false);
      }
    },
    onError: (message: string) => {
      console.error('[VoiceInterview] Error:', message);
      onErrorRef.current?.(message);
      // Don't kill voice availability on transient errors
      if (message.includes('microphone') || message.includes('permission')) {
        setIsAvailable(false);
      }
    },
  });

  // Poll audio volumes for visualization (60fps)
  const startVolumePolling = useCallback(() => {
    if (volumeIntervalRef.current) return;
    volumeIntervalRef.current = setInterval(() => {
      setInputVolume(conversation.getInputVolume());
      setOutputVolume(conversation.getOutputVolume());
    }, 50); // 20Hz is enough for smooth animation
  }, [conversation]);

  const stopVolumePolling = useCallback(() => {
    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = null;
    }
    setInputVolume(0);
    setOutputVolume(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVolumePolling();
    };
  }, [stopVolumePolling]);

  // Toggle voice session on/off
  const toggleVoice = useCallback(async () => {
    if (isActive) {
      await conversation.endSession();
      setIsActive(false);
      updateOrbState('idle');
      stopVolumePolling();
      return;
    }

    try {
      // Check mic permission first
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop()); // Release immediately — ElevenLabs will acquire its own

      // Build the system prompt override with enrichment context
      // ElevenLabs passes this to our custom LLM endpoint
      const enrichmentJson = JSON.stringify({
        userId,
        enrichmentContext,
      });

      updateOrbState('thinking');

      await conversation.startSession({
        agentId,
        overrides: {
          agent: {
            prompt: {
              prompt: `You are a warm, perceptive interviewer for Twin Me. This is a VOICE conversation — keep responses short and natural. ENRICHMENT_JSON:${enrichmentJson}END_ENRICHMENT`,
            },
          },
        },
      });

      startVolumePolling();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start voice session';
      console.error('[VoiceInterview] Start failed:', message);

      if (message.includes('Permission denied') || message.includes('NotAllowedError')) {
        setIsAvailable(false);
        onErrorRef.current?.('Microphone access denied. Please allow microphone access in your browser settings.');
      } else {
        onErrorRef.current?.(message);
      }

      updateOrbState('idle');
      setIsActive(false);
    }
  }, [isActive, conversation, agentId, userId, enrichmentContext, updateOrbState, startVolumePolling, stopVolumePolling]);

  // Send text through the voice session (hybrid mode)
  const sendText = useCallback((text: string) => {
    if (isActive && text.trim()) {
      conversation.sendUserMessage(text.trim());
    }
  }, [isActive, conversation]);

  return {
    isActive,
    orbState,
    isAvailable,
    toggleVoice,
    sendText,
    inputVolume,
    outputVolume,
    connectionStatus: conversation.status,
  };
}
