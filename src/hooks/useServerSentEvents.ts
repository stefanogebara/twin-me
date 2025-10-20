/**
 * React Hook for Server-Sent Events (SSE)
 * Provides real-time updates from the backend using SSE
 *
 * Usage:
 * const { connected, events, lastEvent } = useServerSentEvents(userId);
 */

import { useState, useEffect, useRef, useCallback } from 'react';

interface SSEEvent {
  id?: string;
  type: string;
  message: string;
  timestamp: string;
  [key: string]: any;
}

interface UseServerSentEventsReturn {
  connected: boolean;
  events: SSEEvent[];
  lastEvent: SSEEvent | null;
  error: string | null;
  reconnectCount: number;
}

export function useServerSentEvents(
  userId: string | null,
  options: {
    maxEvents?: number;
    autoReconnect?: boolean;
    onEvent?: (event: SSEEvent) => void;
  } = {}
): UseServerSentEventsReturn {
  const {
    maxEvents = 100,
    autoReconnect = true,
    onEvent,
  } = options;

  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (!userId) {
      console.warn('⚠️  Cannot connect to SSE: userId is null');
      return;
    }

    if (eventSourceRef.current) {
      console.log('🔌 Already connected to SSE');
      return;
    }

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const eventSource = new EventSource(`${apiUrl}/api/sse/stream?userId=${userId}`);

    eventSourceRef.current = eventSource;

    console.log(`📡 Connecting to SSE for user: ${userId}`);

    // Handle connection open
    eventSource.onopen = () => {
      console.log('✅ SSE connection established');
      setConnected(true);
      setError(null);
      setReconnectCount(0);
    };

    // Handle generic messages (data-only events)
    eventSource.onmessage = (event) => {
      try {
        const data: SSEEvent = JSON.parse(event.data);

        console.log('📨 SSE message received:', data.type);

        setLastEvent(data);
        setEvents((prev) => [...prev.slice(-maxEvents + 1), data]);

        onEvent?.(data);
      } catch (err) {
        console.error('❌ Error parsing SSE message:', err);
      }
    };

    // Handle specific event types
    const eventTypes = [
      'connected',
      'heartbeat',
      'platform_status',
      'platform_sync',
      'token_refresh',
      'extraction_progress',
      'new_data',
      'connection_status',
      'webhook_received',
    ];

    eventTypes.forEach((eventType) => {
      eventSource.addEventListener(eventType, (event: any) => {
        try {
          const data: SSEEvent = JSON.parse(event.data);

          console.log(`📨 SSE event received: ${eventType}`,  data);

          setLastEvent(data);
          setEvents((prev) => [...prev.slice(-maxEvents + 1), data]);

          onEvent?.(data);
        } catch (err) {
          console.error(`❌ Error parsing SSE event (${eventType}):`, err);
        }
      });
    });

    // Handle connection errors
    eventSource.onerror = (err) => {
      console.error('❌ SSE connection error:', err);

      setConnected(false);
      setError('SSE connection error');

      // Close the connection
      eventSource.close();
      eventSourceRef.current = null;

      // Auto-reconnect if enabled
      if (autoReconnect) {
        setReconnectCount((prev) => prev + 1);

        const delay = Math.min(1000 * 2 ** reconnectCount, 30000); // Exponential backoff, max 30s

        console.log(`🔄 Reconnecting in ${delay / 1000}s... (attempt ${reconnectCount + 1})`);

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    };
  }, [userId, maxEvents, autoReconnect, onEvent, reconnectCount]);

  const disconnect = useCallback(() => {
    console.log('🔌 Disconnecting from SSE');

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setConnected(false);
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    if (userId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [userId, connect, disconnect]);

  return {
    connected,
    events,
    lastEvent,
    error,
    reconnectCount,
  };
}

/**
 * Example Usage:
 *
 * function MyComponent() {
 *   const { user } = useAuth();
 *   const { connected, lastEvent } = useServerSentEvents(user?.id, {
 *     onEvent: (event) => {
 *       switch (event.type) {
 *         case 'webhook_received':
 *           toast.success(`${event.platform} update received!`);
 *           break;
 *         case 'platform_sync':
 *           console.log('Platform synced:', event.platform);
 *           break;
 *         case 'extraction_progress':
 *           console.log('Extraction progress:', event.progress.percentage);
 *           break;
 *       }
 *     }
 *   });
 *
 *   return (
 *     <div>
 *       <div>SSE Status: {connected ? '🟢 Connected' : '🔴 Disconnected'}</div>
 *       {lastEvent && (
 *         <div>Last event: {lastEvent.type} - {lastEvent.message}</div>
 *       )}
 *     </div>
 *   );
 * }
 */
