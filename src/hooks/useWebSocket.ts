/**
 * WebSocket Hook
 * Provides real-time connection to backend for platform sync updates
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

export interface WebSocketMessage {
  type: string;
  timestamp: string;
  [key: string]: any;
}

export interface ExtractionProgress {
  jobId: string;
  platform: string;
  itemsProcessed?: number;
  totalItems?: number;
  currentDataType?: string;
  progress?: number;
  message: string;
}

export interface ConnectionStatus {
  platform: string;
  status: string;
  message: string;
}

interface UseWebSocketReturn {
  connected: boolean;
  lastMessage: WebSocketMessage | null;
  sendMessage: (message: any) => void;
  reconnect: () => void;
}

const WS_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace('http', 'ws').replace('/api', '/ws')
  : 'ws://localhost:3001/ws';

export function useWebSocket(onMessage?: (message: WebSocketMessage) => void): UseWebSocketReturn {
  const { user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

  // Exponential backoff: 5s, 10s, 20s, 40s, 60s (max)
  const getReconnectDelay = (attempt: number): number => {
    const baseDelay = 5000; // 5 seconds
    const maxDelay = 60000; // 60 seconds
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    return delay;
  };

  const connect = useCallback(() => {
    if (!user?.id) {
      console.log('[WebSocket] No user ID, skipping connection');
      return;
    }

    // Circuit breaker: Stop after 10 failed attempts
    const MAX_ATTEMPTS = 10;
    if (reconnectAttemptsRef.current >= MAX_ATTEMPTS) {
      console.warn(`[WebSocket] 🛑 Max reconnection attempts (${MAX_ATTEMPTS}) reached. Giving up. Use reconnect() to try again manually.`);
      return;
    }

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    try {
      console.log(`[WebSocket] Connecting to ${WS_URL}... (attempt ${reconnectAttemptsRef.current + 1}/${MAX_ATTEMPTS})`);
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('[WebSocket] ✅ Connected');
        setConnected(true);
        reconnectAttemptsRef.current = 0; // Reset on successful connection

        // Authenticate with user ID
        ws.send(JSON.stringify({
          type: 'auth',
          userId: user.id,
        }));

        // Setup ping/pong for keepalive
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000); // Ping every 30 seconds

        ws.addEventListener('close', () => {
          clearInterval(pingInterval);
        });
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log('[WebSocket] 📩 Message received:', message.type, message);

          setLastMessage(message);
          onMessage?.(message);
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
        }
      };

      ws.onclose = () => {
        console.log('[WebSocket] ❌ Disconnected');
        setConnected(false);

        // Increment retry counter
        reconnectAttemptsRef.current += 1;

        // Circuit breaker check
        if (reconnectAttemptsRef.current >= MAX_ATTEMPTS) {
          console.warn('[WebSocket] 🛑 Circuit breaker activated - max attempts reached');
          return;
        }

        // Exponential backoff reconnection
        const delay = getReconnectDelay(reconnectAttemptsRef.current - 1);
        console.log(`[WebSocket] 🔄 Reconnecting in ${delay/1000}s... (attempt ${reconnectAttemptsRef.current}/${MAX_ATTEMPTS})`);

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] ⚠️ Error:', error);
        setConnected(false);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('[WebSocket] Connection error:', error);
      setConnected(false);

      // Increment and retry with backoff
      reconnectAttemptsRef.current += 1;
      if (reconnectAttemptsRef.current < MAX_ATTEMPTS) {
        const delay = getReconnectDelay(reconnectAttemptsRef.current - 1);
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    }
  }, [user?.id, onMessage]);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('[WebSocket] Cannot send message - not connected');
    }
  }, []);

  const reconnect = useCallback(() => {
    console.log('[WebSocket] Manual reconnect requested - resetting circuit breaker');
    reconnectAttemptsRef.current = 0; // Reset attempts on manual reconnect
    connect();
  }, [connect]);

  useEffect(() => {
    connect();

    return () => {
      console.log('[WebSocket] Cleaning up connection');
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    connected,
    lastMessage,
    sendMessage,
    reconnect,
  };
}

export default useWebSocket;
