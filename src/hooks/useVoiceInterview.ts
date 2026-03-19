/**
 * useVoiceInterview — Voice conversation hook for the deep interview
 * ===================================================================
 * Uses the ElevenLabs VoiceConversation client SDK directly.
 * IMPORTANT: Must use VoiceConversation (NOT Conversation) for mic input.
 *
 * Architecture:
 *   Browser mic → ElevenLabs Agent (WebRTC) → LLM → ElevenLabs TTS → Audio playback
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Conversation, type VoiceConversation } from '@elevenlabs/client';

// ====================================================================
// Types
// ====================================================================

export type OrbVoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

type ElevenLabsStatus = 'connecting' | 'connected' | 'disconnecting' | 'disconnected';

interface VoiceMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface VoiceInterviewConfig {
  agentId: string;
  userId: string | null;
  enrichmentContext: Record<string, unknown>;
  onTranscript: (text: string, role: 'user' | 'assistant') => void;
  onStatusChange?: (state: OrbVoiceState) => void;
  onError?: (message: string) => void;
  /** Called when voice session ends — provides full transcript for completion pipeline */
  onSessionEnd?: (messages: VoiceMessage[], reason: 'agent' | 'user' | 'error') => void;
}

interface VoiceInterviewReturn {
  isActive: boolean;
  orbState: OrbVoiceState;
  isAvailable: boolean;
  toggleVoice: () => Promise<void>;
  /** Fully end the voice session (for "Done for now" / page exit) */
  endVoice: () => Promise<void>;
  sendText: (text: string) => void;
  inputVolume: number;
  outputVolume: number;
  connectionStatus: ElevenLabsStatus;
  /** Number of assistant messages (questions asked) */
  questionCount: number;
  /** Whether a session exists (may be paused but still connected) */
  hasSession: boolean;
}

// ====================================================================
// Hook — uses VoiceConversation (with mic input/output)
// ====================================================================

export function useVoiceInterview(config: VoiceInterviewConfig): VoiceInterviewReturn {
  const { agentId, userId, enrichmentContext, onTranscript, onStatusChange, onError, onSessionEnd } = config;

  const [isActive, setIsActive] = useState(false);
  const [orbState, setOrbState] = useState<OrbVoiceState>('idle');
  const [isAvailable, setIsAvailable] = useState(true);
  const [inputVolume, setInputVolume] = useState(0);
  const [outputVolume, setOutputVolume] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<ElevenLabsStatus>('disconnected');
  const [questionCount, setQuestionCount] = useState(0);

  // Refs for session, callbacks, and message accumulation
  const sessionRef = useRef<Awaited<ReturnType<typeof Conversation.startSession>> | null>(null);
  const volumeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesRef = useRef<VoiceMessage[]>([]);
  const onTranscriptRef = useRef(onTranscript);
  const onStatusChangeRef = useRef(onStatusChange);
  const onErrorRef = useRef(onError);
  const onSessionEndRef = useRef(onSessionEnd);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onStatusChangeRef.current = onStatusChange;
    onErrorRef.current = onError;
    onSessionEndRef.current = onSessionEnd;
  }, [onTranscript, onStatusChange, onError, onSessionEnd]);

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

  // Mute/unmute mic (pause voice without killing session)
  const setMicMuted = useCallback((muted: boolean) => {
    if (sessionRef.current) {
      sessionRef.current.setMicMuted(muted);
      updateOrbState(muted ? 'idle' : 'listening');
      console.log('[VoiceInterview] Mic muted:', muted);
    }
  }, [updateOrbState]);

  // Toggle voice session — starts new session or mutes/unmutes existing one
  const toggleVoice = useCallback(async () => {
    // If session exists and active, mute mic (don't kill session)
    if (isActive && sessionRef.current) {
      sessionRef.current.setMicMuted(true);
      setIsActive(false);
      updateOrbState('idle');
      stopVolumePolling();
      console.log('[VoiceInterview] Paused voice (mic muted, session alive)');
      return;
    }

    // If session exists but paused, unmute and resume
    if (!isActive && sessionRef.current && sessionRef.current.isOpen()) {
      sessionRef.current.setMicMuted(false);
      setIsActive(true);
      updateOrbState('listening');
      startVolumePolling();
      console.log('[VoiceInterview] Resumed voice (mic unmuted)');
      return;
    }

    // No session — start a new one
    try {
      updateOrbState('thinking');
      setConnectionStatus('connecting');
      messagesRef.current = [];
      setQuestionCount(0);
      console.log('[VoiceInterview] Starting new VoiceConversation with agentId:', agentId);

      const enrichmentJson = JSON.stringify({ userId, enrichmentContext });
      const userName = (enrichmentContext as Record<string, string>)?.name || '';
      const firstName = userName.split(' ')[0] || '';

      // Conversation auto-delegates to VoiceConversation when textOnly is false
      // WebRTC: UDP-based, echo cancellation, noise removal, lower perceived latency
      const session = await Conversation.startSession({
        agentId,
        connectionType: 'webrtc',
        overrides: {
          agent: {
            prompt: {
              prompt: `You are a warm, perceptive interviewer for Twin Me. This is a VOICE conversation — keep responses short (2-3 sentences max) and natural. ENRICHMENT_JSON:${enrichmentJson}END_ENRICHMENT`,
            },
            firstMessage: firstName
              ? `Hey ${firstName}! Welcome to Twin Me. I'm going to ask you a few questions to get to know you better. Ready to dive in?`
              : `Hey! Welcome to Twin Me. I'm going to ask you a few questions to get to know you better. Ready to dive in?`,
          },
          tts: {
            speed: 1.0,
            stability: 0.5,
            similarityBoost: 0.85,
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

          // Trigger session end callback with accumulated messages
          const reason = details.reason as 'agent' | 'user' | 'error';
          if (messagesRef.current.length >= 4) {
            onSessionEndRef.current?.(messagesRef.current, reason);
          }
        },
        onMessage: (payload) => {
          console.log('[VoiceInterview] Message:', payload.role, payload.message?.slice(0, 80));
          if (payload.message) {
            const role = payload.role === 'user' ? 'user' as const : 'assistant' as const;
            // Accumulate messages for completion pipeline
            messagesRef.current = [...messagesRef.current, { role, content: payload.message }];
            if (role === 'assistant') {
              setQuestionCount(c => c + 1);
            }
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

  // Fully end the voice session (for "Done for now" or page exit)
  const endVoice = useCallback(async () => {
    if (sessionRef.current) {
      await sessionRef.current.endSession();
      sessionRef.current = null;
      setIsActive(false);
      updateOrbState('idle');
      setConnectionStatus('disconnected');
      stopVolumePolling();
      console.log('[VoiceInterview] Session ended fully');
    }
  }, [updateOrbState, stopVolumePolling]);

  // Send text through voice session (works even when mic is muted)
  const sendText = useCallback((text: string) => {
    if (sessionRef.current?.isOpen() && text.trim()) {
      sessionRef.current.sendUserMessage(text.trim());
    }
  }, []);

  return {
    isActive,
    orbState,
    isAvailable,
    toggleVoice,
    endVoice,
    sendText,
    inputVolume,
    outputVolume,
    connectionStatus,
    questionCount,
    hasSession: !!sessionRef.current,
  };
}
