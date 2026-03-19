/**
 * useVoiceInterview — Voice conversation hook for the deep interview
 * ===================================================================
 * Uses the ElevenLabs VoiceConversation client SDK directly.
 * IMPORTANT: Must use VoiceConversation (NOT Conversation) for mic input.
 *
 * Architecture:
 *   Browser mic → ElevenLabs Agent (WebSocket) → LLM → ElevenLabs TTS → Audio playback
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { VoiceConversation } from '@elevenlabs/client';

// ====================================================================
// Types
// ====================================================================

export type OrbVoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

type ElevenLabsStatus = 'connecting' | 'connected' | 'disconnecting' | 'disconnected';

interface VoiceInterviewConfig {
  agentId: string;
  userId: string | null;
  enrichmentContext: Record<string, unknown>;
  onTranscript: (text: string, role: 'user' | 'assistant') => void;
  onStatusChange?: (state: OrbVoiceState) => void;
  onError?: (message: string) => void;
}

interface VoiceInterviewReturn {
  isActive: boolean;
  orbState: OrbVoiceState;
  isAvailable: boolean;
  toggleVoice: () => Promise<void>;
  sendText: (text: string) => void;
  inputVolume: number;
  outputVolume: number;
  connectionStatus: ElevenLabsStatus;
}

// ====================================================================
// Hook — uses VoiceConversation (with mic input/output)
// ====================================================================

export function useVoiceInterview(config: VoiceInterviewConfig): VoiceInterviewReturn {
  const { agentId, userId, enrichmentContext, onTranscript, onStatusChange, onError } = config;

  const [isActive, setIsActive] = useState(false);
  const [orbState, setOrbState] = useState<OrbVoiceState>('idle');
  const [isAvailable, setIsAvailable] = useState(true);
  const [inputVolume, setInputVolume] = useState(0);
  const [outputVolume, setOutputVolume] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<ElevenLabsStatus>('disconnected');

  // Refs for session and callbacks
  const sessionRef = useRef<VoiceConversation | null>(null);
  const volumeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const onStatusChangeRef = useRef(onStatusChange);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onStatusChangeRef.current = onStatusChange;
    onErrorRef.current = onError;
  }, [onTranscript, onStatusChange, onError]);

  // Volume polling
  const startVolumePolling = useCallback(() => {
    if (volumeIntervalRef.current) return;
    volumeIntervalRef.current = setInterval(() => {
      if (sessionRef.current) {
        setInputVolume(sessionRef.current.getInputVolume());
        setOutputVolume(sessionRef.current.getOutputVolume());
      }
    }, 50);
  }, []);

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
      if (sessionRef.current) {
        sessionRef.current.endSession();
        sessionRef.current = null;
      }
    };
  }, [stopVolumePolling]);

  const updateOrbState = useCallback((state: OrbVoiceState) => {
    setOrbState(state);
    onStatusChangeRef.current?.(state);
  }, []);

  // Toggle voice session
  const toggleVoice = useCallback(async () => {
    if (isActive && sessionRef.current) {
      await sessionRef.current.endSession();
      sessionRef.current = null;
      setIsActive(false);
      updateOrbState('idle');
      setConnectionStatus('disconnected');
      stopVolumePolling();
      return;
    }

    try {
      updateOrbState('thinking');
      setConnectionStatus('connecting');
      console.log('[VoiceInterview] Starting VoiceConversation with agentId:', agentId);

      const enrichmentJson = JSON.stringify({ userId, enrichmentContext });

      // VoiceConversation handles mic input + audio output (NOT Conversation which is text-only)
      const session = await VoiceConversation.startSession({
        agentId,
        connectionType: 'websocket',
        overrides: {
          agent: {
            prompt: {
              prompt: `You are a warm, perceptive interviewer for Twin Me. This is a VOICE conversation — keep responses short (2-3 sentences max) and natural. ENRICHMENT_JSON:${enrichmentJson}END_ENRICHMENT`,
            },
          },
        },
        onConnect: ({ conversationId }) => {
          console.log('[VoiceInterview] Connected, conversationId:', conversationId);
          setIsActive(true);
          updateOrbState('listening');
          setConnectionStatus('connected');
        },
        onDisconnect: (details) => {
          console.log('[VoiceInterview] Disconnected:', details.reason);
          setIsActive(false);
          updateOrbState('idle');
          setConnectionStatus('disconnected');
          stopVolumePolling();
          sessionRef.current = null;
        },
        onMessage: (payload) => {
          console.log('[VoiceInterview] Message:', payload.role, payload.message?.slice(0, 80));
          if (payload.message) {
            const role = payload.role === 'user' ? 'user' as const : 'assistant' as const;
            onTranscriptRef.current(payload.message, role);
          }
        },
        onModeChange: ({ mode }) => {
          console.log('[VoiceInterview] Mode:', mode);
          if (mode === 'speaking') {
            updateOrbState('speaking');
          } else {
            updateOrbState('listening');
          }
        },
        onStatusChange: ({ status }) => {
          console.log('[VoiceInterview] Status:', status);
          setConnectionStatus(status);
        },
        onError: (message, context) => {
          console.error('[VoiceInterview] Error:', message, context);
          onErrorRef.current?.(message);
          if (message.includes('microphone') || message.includes('permission')) {
            setIsAvailable(false);
          }
        },
        onVadScore: ({ vadScore }) => {
          // Log periodically to verify mic is picking up audio
          if (vadScore > 0.3) {
            console.log('[VoiceInterview] VAD speech detected:', vadScore.toFixed(2));
          }
        },
        onDebug: (info) => {
          console.log('[VoiceInterview] Debug:', info);
        },
      });

      sessionRef.current = session;
      console.log('[VoiceInterview] Session started:', session.getId());
      startVolumePolling();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start voice session';
      console.error('[VoiceInterview] Start failed:', message, err);

      if (message.includes('Permission denied') || message.includes('NotAllowedError')) {
        setIsAvailable(false);
        onErrorRef.current?.('Microphone access denied. Please allow microphone access in your browser settings.');
      } else {
        onErrorRef.current?.(message);
      }

      updateOrbState('idle');
      setIsActive(false);
      setConnectionStatus('disconnected');
    }
  }, [isActive, agentId, userId, enrichmentContext, startVolumePolling, stopVolumePolling, updateOrbState]);

  // Send text through voice session
  const sendText = useCallback((text: string) => {
    if (isActive && sessionRef.current && text.trim()) {
      sessionRef.current.sendUserMessage(text.trim());
    }
  }, [isActive]);

  return {
    isActive,
    orbState,
    isAvailable,
    toggleVoice,
    sendText,
    inputVolume,
    outputVolume,
    connectionStatus,
  };
}
