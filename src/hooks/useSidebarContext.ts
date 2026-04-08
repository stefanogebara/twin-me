import { useState, useEffect } from 'react';
import { authFetch } from '@/services/api/apiBase';

interface CalendarEvent {
  title: string;
  time: string;
  location?: string;
}

interface RecentEmail {
  subject: string;
  sender: string;
  date: string;
}

interface SidebarContextData {
  calendarEvents: CalendarEvent[];
  recentEmails: RecentEmail[];
  isLoading: boolean;
}

/**
 * Fetches sidebar context data (calendar events + recent emails).
 * Non-blocking: returns empty arrays while loading, never throws.
 * Re-fetches every 5 minutes.
 */
export function useSidebarContext(userId: string | undefined): SidebarContextData {
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [recentEmails, setRecentEmails] = useState<RecentEmail[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    async function fetchData() {
      try {
        const res = await authFetch('/sidebar/context');
        if (cancelled) return;

        const data = await res.json();
        if (data.success) {
          setCalendarEvents(data.calendarEvents || []);
          setRecentEmails(data.recentEmails || []);
        }
      } catch {
        // Silently fail -- sidebar data is not critical
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchData();

    // Re-fetch every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [userId]);

  return { calendarEvents, recentEmails, isLoading };
}
