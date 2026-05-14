/**
 * Meeting Briefings API client — used by the /meetings page.
 *
 * Backend: GET /api/meeting-briefings (see api/routes/meeting-briefings.js)
 */

import { authFetch, isAbortError } from './apiBase';

export interface BriefingAttendeeResearch {
  name: string;
  company: string | null;
  title: string | null;
  whoTheyAre: string | null;
  lastTouchpoint: string | null;
}

export interface DebriefActionItem {
  owner: string; // "me" or an attendee name
  task: string;
}

export interface DebriefRelationshipNote {
  person: string;
  note: string;
}

export interface MeetingDebrief {
  summary: string;
  likelyCovered?: string[];
  probableActionItems?: DebriefActionItem[];
  followUpsRecommended?: string[];
  relationshipNotes?: DebriefRelationshipNote[];
  generatedAt?: string;
}

export interface BriefingPayload {
  headline: string;
  attendees?: BriefingAttendeeResearch[];
  companyContext?: string | null;
  talkingPoints?: string[];
  watchOuts?: string[];
  myContext?: string | null;
  /** Present once the post-meeting debrief cron has run for this meeting. */
  debrief?: MeetingDebrief;
}

export interface CalendarAttendee {
  email: string;
  name: string | null;
  responseStatus: string | null;
  organizer: boolean;
}

export interface MeetingBriefing {
  id: string;
  eventId: string;
  generatedAt: string;
  headline: string;
  summary: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  hangoutLink: string | null;
  meetingUrl: string | null;
  attendees: CalendarAttendee[];
  briefing: BriefingPayload;
}

export interface MeetingBriefingsResponse {
  success: boolean;
  upcoming: MeetingBriefing[];
  recent: MeetingBriefing[];
  undated: MeetingBriefing[];
  windowDays: number;
  error?: string;
}

export async function fetchMeetingBriefings(signal?: AbortSignal): Promise<MeetingBriefingsResponse> {
  try {
    const res = await authFetch('/meeting-briefings', { signal });
    if (!res.ok) {
      return {
        success: false,
        upcoming: [],
        recent: [],
        undated: [],
        windowDays: 0,
        error: `request failed (${res.status})`,
      };
    }
    return await res.json();
  } catch (err) {
    if (isAbortError(err)) throw err;
    return {
      success: false,
      upcoming: [],
      recent: [],
      undated: [],
      windowDays: 0,
      error: err instanceof Error ? err.message : 'unknown error',
    };
  }
}
