/**
 * Demo Calendar Data
 * Google Calendar data for demo mode
 */

import { randomInRange } from './demoHelpers';

// Generate event type distribution data (ensures sum = 100%)
export const generateEventTypeDistribution = () => {
  // Generate raw values
  const rawMeeting = randomInRange(35, 50);
  const rawFocus = randomInRange(25, 35);
  const rawPresentation = randomInRange(8, 15);
  const rawPersonal = randomInRange(5, 15);

  // Calculate total and normalize to 100%
  const total = rawMeeting + rawFocus + rawPresentation + rawPersonal;
  const meetingPct = Math.round((rawMeeting / total) * 100);
  const focusPct = Math.round((rawFocus / total) * 100);
  const presentationPct = Math.round((rawPresentation / total) * 100);
  // Personal gets the remainder to ensure exact 100% total
  const personalPct = 100 - meetingPct - focusPct - presentationPct;

  return [
    { type: 'Meetings', percentage: meetingPct, color: '#4285F4' },
    { type: 'Focus Time', percentage: focusPct, color: '#34A853' },
    { type: 'Presentations', percentage: presentationPct, color: '#FBBC05' },
    { type: 'Personal', percentage: personalPct, color: '#EA4335' },
  ].sort((a, b) => b.percentage - a.percentage);
};

// Generate weekly busy hours for heatmap
export const generateWeeklyHeatmap = () => {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const timeSlots = ['8-10', '10-12', '12-2', '2-4', '4-6'];

  return days.map(day => ({
    day,
    slots: timeSlots.map(slot => ({
      slot,
      intensity: randomInRange(0, 3), // 0 = free, 1 = light, 2 = moderate, 3 = busy
    })),
  }));
};

export const DEMO_CALENDAR_DATA = {
  todayEvents: [
    {
      id: 'event-1',
      title: 'Team Standup',
      startTime: '09:00',
      endTime: '09:30',
      type: 'meeting',
      attendees: 5,
      isRecurring: true,
    },
    {
      id: 'event-2',
      title: 'Deep Work: Project Alpha',
      startTime: '10:00',
      endTime: '12:00',
      type: 'focus',
      attendees: 0,
      isRecurring: false,
    },
    {
      id: 'event-3',
      title: 'Client Presentation',
      startTime: '14:00',
      endTime: '15:00',
      type: 'presentation',
      attendees: 8,
      isRecurring: false,
    },
    {
      id: 'event-4',
      title: 'Gym Session',
      startTime: '18:00',
      endTime: '19:00',
      type: 'workout',
      attendees: 0,
      isRecurring: true,
    },
  ],
  upcomingEvents: [
    {
      id: 'event-5',
      title: 'Product Review',
      date: 'Tomorrow',
      time: '11:00',
      type: 'meeting',
      attendees: 4,
    },
    {
      id: 'event-6',
      title: 'Interview: Senior Dev',
      date: 'Tomorrow',
      time: '15:00',
      type: 'interview',
      attendees: 3,
    },
  ],
  patterns: {
    avgMeetingsPerDay: 3.2,
    focusTimePercentage: 45,
    busiestDay: 'Tuesday',
    preferredMeetingTime: '10am - 12pm',
  },
  eventTypeDistribution: generateEventTypeDistribution(),
  weeklyHeatmap: generateWeeklyHeatmap(),
};
