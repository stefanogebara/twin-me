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
    }
  }, [updateOrbState]);

  // Toggle voice session — starts new session or pauses/resumes existing one
  const toggleVoice = useCallback(async () => {
    // If session exists and active, pause: mute mic + silence output
    if (isActive && sessionRef.current) {
      sessionRef.current.setMicMuted(true);
      sessionRef.current.setVolume({ volume: 0 }); // Stop agent audio output
      setIsActive(false);
      updateOrbState('idle');
      stopVolumePolling();
      return;
    }

    // If session exists but paused, resume: unmute mic + restore volume
    if (!isActive && sessionRef.current && sessionRef.current.isOpen()) {
      sessionRef.current.setMicMuted(false);
      sessionRef.current.setVolume({ volume: 1 }); // Restore agent audio
      setIsActive(true);
      updateOrbState('listening');
      startVolumePolling();
      return;
    }

    // No session — start a new one
    try {
      updateOrbState('thinking');
      setConnectionStatus('connecting');
      messagesRef.current = [];
      setQuestionCount(0);

      // Sanitize enrichment context — only pass clean, short fields (no raw web scraping)
      const safeContext: Record<string, string> = {};
      const ec = enrichmentContext as Record<string, string>;
      if (ec?.name && ec.name.length < 100) safeContext.name = ec.name;
      if (ec?.company && ec.company.length < 100) safeContext.company = ec.company;
      if (ec?.title && ec.title.length < 100) safeContext.title = ec.title;
      if (ec?.location && ec.location.length < 100) safeContext.location = ec.location;
      // Skip bio — often contains raw web scraping junk

      const userName = safeContext.name || '';
      const firstName = userName.split(' ')[0] || '';

      // Build a clean context string (NOT raw JSON dump)
      const contextParts: string[] = [];
      if (safeContext.name) contextParts.push(`Name: ${safeContext.name}`);
      if (safeContext.company) contextParts.push(`Company: ${safeContext.company}`);
      if (safeContext.title) contextParts.push(`Title: ${safeContext.title}`);
      if (safeContext.location) contextParts.push(`Location: ${safeContext.location}`);
      const contextBlock = contextParts.length > 0
        ? `\n\nWhat you know about the user:\n${contextParts.join('\n')}`
        : '';

      // Conversation auto-delegates to VoiceConversation when textOnly is false
      // WebRTC: UDP-based, echo cancellation, noise removal, lower perceived latency
      const session = await Conversation.startSession({
        agentId,
        connectionType: 'webrtc',
        overrides: {
          agent: {
            prompt: {
              prompt: `You are a warm, curious interviewer for Twin Me — a platform that creates digital twins of people's personalities. You're conducting a voice interview to understand who this person truly is.

VOICE RULES:
- Keep every response to 1-2 sentences max — this is spoken aloud
- Sound like a perceptive friend having coffee, not a therapist
- React specifically to what they said, never generic
- ONE question per turn
- Use conversational language (contractions, casual tone)
- NO markdown, no labels, no numbering

QUESTION FLOW (follow this arc):
1. Start with what they're passionate about right now
2. Ask about their daily rhythms and energy
3. Explore their creative or aesthetic side
4. Ask about their relationships and social energy
5. Go deeper into values and what drives them
6. End with a reflective question tying themes together

After ~10 questions, wrap up warmly: summarize 2-3 things you learned and thank them genuinely.${contextBlock}`,
            },
            firstMessage: firstName
              ? `Hey ${firstName}! I'm excited to get to know you. Let's start with something fun — what's something you're genuinely passionate about right now?`
              : `Hey! I'm excited to get to know you. Let's start with something fun — what's something you're genuinely passionate about right now?`,
          },
          tts: {
            speed: 1.0,
            stability: 0.5,
            similarityBoost: 0.85,
          },
        },
        onConnect: () => {
          setIsActive(true);
          updateOrbState('listening');
          setConnectionStatus('connected');
        },
        onDisconnect: (details) => {
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
          if (mode === 'speaking') {
            updateOrbState('speaking');
          } else {
            updateOrbState('listening');
          }
        },
        onStatusChange: ({ status }) => {
          setConnectionStatus(status);
        },
        onError: (message, context) => {
          console.error('[VoiceInterview] Error:', message, context);
          onErrorRef.current?.(message);
          if (message.includes('microphone') || message.includes('permission')) {
            setIsAvailable(false);
          }
        },
        onVadScore: () => {},
        onDebug: () => {},
      });

      sessionRef.current = session;
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
