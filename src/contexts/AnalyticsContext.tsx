import React, { createContext, useContext, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';

export interface AnalyticsEvent {
  event_type: string;
  event_data: Record<string, any>;
  user_id?: string;
  session_id: string;
  timestamp: Date;
  page_url: string;
  user_agent: string;
  referrer?: string;
}

interface AnalyticsContextType {
  trackEvent: (eventType: string, eventData?: Record<string, any>) => Promise<void>;
  trackPageView: (pagePath: string) => Promise<void>;
  trackUserAction: (action: string, target: string, metadata?: Record<string, any>) => Promise<void>;
  trackConversation: (twinId: string, messageCount: number, duration: number) => Promise<void>;
  trackTwinInteraction: (twinId: string, interactionType: string, metadata?: Record<string, any>) => Promise<void>;
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

let sessionId: string;

const generateSessionId = (): string => {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const getSessionId = (): string => {
  if (!sessionId) {
    sessionId = generateSessionId();
  }
  return sessionId;
};

export const AnalyticsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const sendAnalyticsEvent = async (event: Omit<AnalyticsEvent, 'timestamp' | 'session_id' | 'page_url' | 'user_agent' | 'referrer'>) => {
    try {
      const analyticsEvent: AnalyticsEvent = {
        ...event,
        user_id: user?.id,
        session_id: getSessionId(),
        timestamp: new Date(),
        page_url: window.location.href,
        user_agent: navigator.userAgent,
        referrer: document.referrer || undefined
      };

      const response = await fetch('/api/analytics/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(analyticsEvent)
      });

      if (!response.ok) {
        console.warn('Analytics event failed to send:', response.statusText);
      }
    } catch (error) {
      console.warn('Analytics event failed to send:', error);
    }
  };

  const trackEvent = useCallback(async (eventType: string, eventData: Record<string, any> = {}) => {
    await sendAnalyticsEvent({
      event_type: eventType,
      event_data: {
        ...eventData,
        timestamp: new Date().toISOString()
      }
    });
  }, [user]);

  const trackPageView = useCallback(async (pagePath: string) => {
    await sendAnalyticsEvent({
      event_type: 'page_view',
      event_data: {
        page: pagePath,
        title: document.title
      }
    });
  }, [user]);

  const trackUserAction = useCallback(async (action: string, target: string, metadata: Record<string, any> = {}) => {
    await sendAnalyticsEvent({
      event_type: 'user_action',
      event_data: {
        action,
        target,
        ...metadata
      }
    });
  }, [user]);

  const trackConversation = useCallback(async (twinId: string, messageCount: number, duration: number) => {
    await sendAnalyticsEvent({
      event_type: 'conversation_session',
      event_data: {
        twin_id: twinId,
        message_count: messageCount,
        duration_seconds: duration,
        engagement_level: messageCount > 10 ? 'high' : messageCount > 5 ? 'medium' : 'low'
      }
    });
  }, [user]);

  const trackTwinInteraction = useCallback(async (twinId: string, interactionType: string, metadata: Record<string, any> = {}) => {
    await sendAnalyticsEvent({
      event_type: 'twin_interaction',
      event_data: {
        twin_id: twinId,
        interaction_type: interactionType,
        ...metadata
      }
    });
  }, [user]);

  useEffect(() => {
    const currentPath = window.location.pathname;
    trackPageView(currentPath);

    const handleBeforeUnload = () => {
      navigator.sendBeacon('/api/analytics/session-end', JSON.stringify({
        session_id: getSessionId(),
        user_id: user?.id,
        end_time: new Date().toISOString()
      }));
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [trackPageView, user]);

  const value: AnalyticsContextType = {
    trackEvent,
    trackPageView,
    trackUserAction,
    trackConversation,
    trackTwinInteraction
  };

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
    </AnalyticsContext.Provider>
  );
};

export const useAnalytics = () => {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error('useAnalytics must be used within an AnalyticsProvider');
  }
  return context;
};