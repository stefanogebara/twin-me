/**
 * Calendar Data Fetcher
 *
 * Extracts and structures Google Calendar platform data for reflection generation.
 * Includes visualization data for charts (timeline, heatmap, distribution).
 */

/**
 * Get Calendar data for reflection
 * Includes visualization data for charts
 *
 * @param {Object} context - Aggregated user context
 * @returns {Object} { success, data?, error? }
 */
export function getCalendarData(context) {
  // Check for null/undefined OR explicit disconnected state
  if (!context.calendar) {
    return { success: false, error: 'Calendar not connected' };
  }

  // Handle case where token refresh failed (needsReauth) or connection marked as false
  if (context.calendar.connected === false || context.calendar.needsReauth) {
    return {
      success: false,
      error: context.calendar.needsReauth
        ? 'Calendar connection expired. Please reconnect to see your time patterns.'
        : 'Calendar not connected'
    };
  }

  const events = context.calendar.upcomingEvents || context.calendar.events || [];
  const nextEvent = context.calendar.nextEvent;

  // Analyze patterns without counting
  const hasManyMeetings = events.length > 5;
  const hasUpcomingSoon = nextEvent && nextEvent.minutesUntil < 60;
  const meetingTypes = [...new Set(events.map(e => e.type).filter(Boolean))];

  // Helper to format time as HH:mm
  const formatTime = (dateStr) => {
    if (!dateStr) return '09:00';
    try {
      const date = new Date(dateStr);
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } catch (e) {
      return '09:00';
    }
  };

  // Get today's date for filtering
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Filter and format today's events for timeline
  const todayEvents = events
    .filter(e => {
      const eventDate = new Date(e.startTime || e.start);
      return eventDate >= today && eventDate < tomorrow;
    })
    .map((e, index) => ({
      id: e.id || `event-${index}`,
      title: e.title || 'Untitled',
      startTime: formatTime(e.startTime || e.start),
      endTime: formatTime(e.endTime || e.end),
      type: e.type || 'meeting',
      attendees: e.attendeeCount || 0
    }));

  // Format upcoming events for list display with day grouping info
  const upcomingEvents = events.slice(0, 10).map((e, index) => {
    const eventDate = new Date(e.startTime || e.start);
    const eventDateStr = eventDate.toDateString();
    const todayStr = today.toDateString();
    const tomorrowStr = tomorrow.toDateString();

    // Calculate day label
    let dayLabel;
    if (eventDateStr === todayStr) {
      dayLabel = 'Today';
    } else if (eventDateStr === tomorrowStr) {
      dayLabel = 'Tomorrow';
    } else {
      // Format as "Wednesday, Jan 15"
      dayLabel = eventDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
      });
    }

    return {
      id: e.id || `upcoming-${index}`,
      title: e.title || 'Untitled',
      time: `${formatTime(e.startTime || e.start)} - ${formatTime(e.endTime || e.end)}`,
      type: e.type || 'meeting',
      attendees: e.attendeeCount || 0,
      date: eventDateStr,
      dayLabel
    };
  });

  // Calculate event type distribution with colors
  const typeCounts = {};
  events.forEach(e => {
    const type = (e.type || 'General').charAt(0).toUpperCase() + (e.type || 'General').slice(1);
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });
  const totalEvents = events.length || 1;
  const typeColors = {
    'Meeting': '#4285F4',
    'Focus': '#34A853',
    'Presentation': '#FBBC05',
    'Workout': '#EA4335',
    'Interview': '#9334E9',
    'Personal': '#FF6D01',
    'General': '#5F6368',
    'Other': '#9E9E9E'
  };
  const eventTypeDistribution = Object.entries(typeCounts)
    .map(([type, count]) => ({
      type,
      percentage: Math.round((count / totalEvents) * 100),
      color: typeColors[type] || typeColors['Other']
    }))
    .sort((a, b) => b.percentage - a.percentage);

  // Calculate weekly heatmap with time slots
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const timeSlots = ['8-10', '10-12', '12-2', '2-4', '4-6'];
  const slotRanges = [
    { start: 8, end: 10 },
    { start: 10, end: 12 },
    { start: 12, end: 14 },
    { start: 14, end: 16 },
    { start: 16, end: 18 }
  ];

  const weeklyHeatmap = weekDays.map(day => {
    const dayEvents = events.filter(e => {
      const eventDate = new Date(e.startTime || e.start);
      const eventDay = eventDate.toLocaleDateString('en-US', { weekday: 'short' });
      return eventDay === day;
    });

    // Calculate intensity for each time slot
    const slots = timeSlots.map((slot, slotIndex) => {
      const range = slotRanges[slotIndex];
      const slotEvents = dayEvents.filter(e => {
        const eventDate = new Date(e.startTime || e.start);
        const eventHour = eventDate.getHours();
        return eventHour >= range.start && eventHour < range.end;
      });
      // Intensity: 0=free, 1=light, 2=moderate, 3=busy
      const intensity = slotEvents.length === 0 ? 0 : slotEvents.length === 1 ? 1 : slotEvents.length === 2 ? 2 : 3;
      return { slot, intensity };
    });

    return {
      day,
      slots,
      events: dayEvents.length,
      intensity: dayEvents.length > 4 ? 'high' : dayEvents.length > 1 ? 'medium' : 'low'
    };
  });

  // Find busiest day
  const busiestDay = weeklyHeatmap.reduce((busiest, current) =>
    current.events > (busiest?.events || 0) ? current : busiest
  , { day: 'Monday', events: 0 });

  // Calculate schedule stats
  const meetingEvents = events.filter(e => ['meeting', 'presentation', 'interview'].includes(e.type));
  const focusEvents = events.filter(e => e.type === 'focus');
  const avgMeetingDuration = 1; // Default 1 hour
  const scheduleStats = {
    meetingHours: Math.round(meetingEvents.length * avgMeetingDuration),
    focusBlocks: focusEvents.length,
    busiestDay: busiestDay.day,
    preferredMeetingTime: todayEvents.length > 0 && parseInt(todayEvents[0].startTime) < 12 ? 'Morning (9-12pm)' : 'Afternoon (1-5pm)'
  };

  return {
    success: true,
    data: {
      // For reflection prompt
      dayDensity: hasManyMeetings ? 'busy' : events.length > 2 ? 'moderate' : 'light',
      upcomingEventTitle: nextEvent?.title,
      upcomingEventSoon: hasUpcomingSoon,
      eventTypes: meetingTypes,
      hasOpenTime: events.length < 3,
      dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
      // For visualization
      todayEvents,
      upcomingEvents,
      eventTypeDistribution,
      weeklyHeatmap,
      scheduleStats
    }
  };
}
