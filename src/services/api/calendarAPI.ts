/**
 * Calendar API Module
 */

import { API_URL, getAuthHeaders } from './apiBase';

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  type: 'meeting' | 'presentation' | 'interview' | 'call' | 'deadline' | 'personal' | 'other';
  isImportant: boolean;
  location?: string;
  description?: string;
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: string;
  }>;
}

export interface CalendarEventsResponse {
  events: CalendarEvent[];
  count: number;
  timeRange: {
    start: string;
    end: string;
  };
  fetchedAt: string;
}

export interface CalendarStatus {
  connected: boolean;
  platform: string;
  connectedAt?: string;
  lastSync?: string;
  lastSyncStatus?: string;
  tokenExpired?: boolean;
  expiresAt?: string;
}

export const calendarAPI = {
  /**
   * Get calendar connection status
   */
  getStatus: async (): Promise<CalendarStatus> => {
    const response = await fetch(`${API_URL}/calendar/status`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch calendar status: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || data;
  },

  /**
   * Get calendar events for today and tomorrow
   */
  getEvents: async (): Promise<CalendarEventsResponse> => {
    const response = await fetch(`${API_URL}/calendar/events`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401 && errorData.needsReconnect) {
        throw new Error('Calendar authentication expired. Please reconnect.');
      }
      if (response.status === 404) {
        throw new Error('Calendar not connected. Please connect Google Calendar first.');
      }
      throw new Error(`Failed to fetch calendar events: ${response.statusText}`);
    }

    const data = await response.json();

    // Convert date strings to Date objects
    if (data.data?.events) {
      data.data.events = data.data.events.map((event: CalendarEvent) => ({
        ...event,
        startTime: new Date(event.startTime),
        endTime: new Date(event.endTime),
      }));
    }

    return data.data || data;
  },

  /**
   * Manually sync calendar events
   */
  sync: async (daysAhead: number = 7): Promise<{ syncedEvents: number; syncedAt: string }> => {
    const response = await fetch(`${API_URL}/calendar/sync`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ daysAhead }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401 && errorData.needsReconnect) {
        throw new Error('Calendar authentication expired. Please reconnect.');
      }
      throw new Error(`Failed to sync calendar: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || data;
  },

  /**
   * Connect Google Calendar (returns OAuth URL)
   */
  connect: async (returnUrl?: string): Promise<{ authUrl: string; state: string }> => {
    const url = returnUrl
      ? `${API_URL}/oauth/calendar/connect?returnUrl=${encodeURIComponent(returnUrl)}`
      : `${API_URL}/oauth/calendar/connect`;

    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to initiate calendar connection: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || data;
  },

  /**
   * Disconnect Google Calendar
   */
  disconnect: async (): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${API_URL}/calendar/disconnect`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to disconnect calendar: ${response.statusText}`);
    }

    return response.json();
  },
};
