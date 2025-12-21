/**
 * Calendar Scheduling Pattern Analyzer
 *
 * Uses Anthropic Claude to analyze calendar scheduling patterns and work-life balance
 * Focuses on time management style, meeting preferences, and work patterns
 *
 * PRIVACY: Analyzes scheduling PATTERNS, not event content
 */

import Anthropic from '@anthropic-ai/sdk';
import { calculateSchedulingPatterns } from './calendar-extractor.js';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Analyze calendar patterns using Claude
 *
 * @param {Object} calendarData - Calendar events and metadata from calendar-extractor
 * @returns {Promise<Object>} Pattern analysis including work-life balance, scheduling style
 */
export async function analyzeCalendarPatterns(calendarData) {
  try {
    console.log('🤖 [Calendar Analyzer] Starting Claude analysis for calendar data');

    if (!calendarData || !calendarData.events || calendarData.events.length === 0) {
      return {
        error: 'No calendar data provided',
        analysis: null
      };
    }

    // First, extract scheduling patterns from events
    const patterns = calculateSchedulingPatterns(calendarData);

    // Prepare data for Claude analysis (anonymized)
    const analysisData = {
      totalEvents: patterns.totalEvents,
      daysAnalyzed: patterns.daysAnalyzed,
      eventsByCategory: patterns.eventsByCategory,
      timePatterns: patterns.timePatterns,
      meetingPatterns: patterns.meetingPatterns,
      durationPatterns: patterns.durationPatterns,
      workLifeBalance: patterns.workLifeBalance
    };

    // Create prompt for Claude
    const prompt = buildAnalysisPrompt(analysisData);

    console.log('🤖 [Calendar Analyzer] Sending request to Claude...');

    // Call Claude API
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const analysisText = response.content[0].text;

    console.log('✅ [Calendar Analyzer] Claude analysis complete');

    // Parse Claude's response into structured data
    const structuredAnalysis = parseClaudeResponse(analysisText, patterns);

    return {
      schedulingStyle: structuredAnalysis,
      patterns,
      metadata: {
        analyzedAt: new Date().toISOString(),
        eventCount: calendarData.events.length,
        daysAnalyzed: patterns.daysAnalyzed,
        model: 'claude-sonnet-4-5-20250929'
      }
    };
  } catch (error) {
    console.error('❌ [Calendar Analyzer] Error:', error);

    // Handle rate limiting
    if (error.status === 429) {
      throw new Error('Claude API rate limit exceeded. Please try again in a few minutes.');
    }

    // Handle API key issues
    if (error.status === 401) {
      throw new Error('Invalid Anthropic API key. Please check your configuration.');
    }

    throw new Error(`Calendar analysis failed: ${error.message}`);
  }
}

/**
 * Build analysis prompt for Claude
 *
 * @param {Object} data - Calendar patterns and metadata
 * @returns {string} Formatted prompt
 */
function buildAnalysisPrompt(data) {
  return `You are an expert time management and scheduling pattern analyst. Analyze the following calendar scheduling patterns and provide insights into the person's work style, time management preferences, and work-life balance.

**Calendar Statistics:**
- Total events analyzed: ${data.totalEvents}
- Days analyzed: ${data.daysAnalyzed}
- Time period: Last ${data.daysAnalyzed} days

**Event Distribution by Category:**
- Meetings: ${data.eventsByCategory.meeting}
- Work Events: ${data.eventsByCategory.work}
- Personal Events: ${data.eventsByCategory.personal}
- Social Events: ${data.eventsByCategory.social}
- Other: ${data.eventsByCategory.other}

**Time Patterns:**
- Weekend events: ${data.timePatterns.weekendEvents} (${data.timePatterns.weekendPercentage}%)
- Work hours events: ${data.timePatterns.workHoursEvents} (${data.timePatterns.workHoursPercentage}%)
- Busiest day: ${data.timePatterns.busiestDay}
- Peak scheduling hours: ${data.timePatterns.peakHours.join(', ')}

**Meeting Patterns:**
- Meetings with attendees: ${data.meetingPatterns.meetingsWithAttendees} (${data.meetingPatterns.meetingPercentage}%)
- Average attendees per meeting: ${data.meetingPatterns.avgAttendees}

**Duration Patterns:**
- Average event duration: ${data.durationPatterns.avgDuration} minutes
- Long meetings (>60 min): ${data.durationPatterns.longMeetings}
- Short meetings (≤30 min): ${data.durationPatterns.shortMeetings}

**Work-Life Balance:**
- Work events: ${data.workLifeBalance.workEvents}
- Personal events: ${data.workLifeBalance.personalEvents}
- Balance score: ${data.workLifeBalance.balanceScore}/100

Based on this data, provide a comprehensive analysis of this person's scheduling style and work patterns. Focus on:

1. **Time Management Style**: (Structured, Flexible, Busy, Balanced, etc.)
2. **Meeting Culture**: How they approach meetings and collaboration
3. **Work-Life Balance Assessment**:
   - How well they separate work and personal time
   - Weekend and after-hours work patterns
   - Personal time prioritization
4. **Scheduling Preferences**:
   - Preferred meeting times
   - Meeting length preferences
   - Peak productivity hours (inferred from scheduling)
5. **Characteristic Patterns**:
   - Are they a "calendar blocker" or spontaneous?
   - Group meetings vs. 1-on-1s
   - Time fragmentation (many short meetings vs. longer blocks)
6. **Recommendations for Improvement**:
   - Suggestions for better work-life balance (if needed)
   - Time management optimization tips
   - Meeting efficiency improvements

Provide your analysis in a structured format with clear sections. Be specific and insightful based on the data provided.`;
}

/**
 * Parse Claude's response into structured data
 *
 * @param {string} analysisText - Raw text from Claude
 * @param {Object} patterns - Original scheduling patterns
 * @returns {Object} Structured analysis
 */
function parseClaudeResponse(analysisText, patterns) {
  // Extract key insights from Claude's response

  // Determine time management style
  const managementStyle = extractManagementStyle(analysisText);

  // Categorize work-life balance
  const balanceCategory = categorizeBalance(patterns.workLifeBalance.balanceScore);

  // Determine meeting culture
  const meetingCulture = determineMeetingCulture(patterns);

  return {
    // Core style attributes
    timeManagementStyle: managementStyle || 'Balanced',
    meetingCulture: meetingCulture,

    // Work-life balance assessment
    workLifeBalance: {
      score: patterns.workLifeBalance.balanceScore,
      category: balanceCategory,
      workEvents: patterns.workLifeBalance.workEvents,
      personalEvents: patterns.workLifeBalance.personalEvents,
      weekendWorkPercentage: patterns.timePatterns.weekendPercentage
    },

    // Scheduling preferences
    schedulingPreferences: {
      preferredMeetingTimes: patterns.timePatterns.peakHours,
      busiestDay: patterns.timePatterns.busiestDay,
      avgMeetingDuration: patterns.durationPatterns.avgDuration,
      meetingLengthPreference: determineMeetingLengthPreference(patterns.durationPatterns)
    },

    // Characteristic patterns
    characteristicPatterns: {
      meetingDensity: calculateMeetingDensity(patterns),
      collaborationStyle: determineCollaborationStyle(patterns.meetingPatterns),
      timeFragmentation: assessTimeFragmentation(patterns.durationPatterns),
      weekendWorker: patterns.timePatterns.weekendPercentage > 20
    },

    // Insights and recommendations
    insights: extractInsights(analysisText),
    recommendations: extractRecommendations(analysisText),

    // Raw Claude analysis
    rawAnalysis: analysisText,

    // Summary
    summary: generateSummary(managementStyle, balanceCategory, meetingCulture)
  };
}

/**
 * Extract time management style from Claude's analysis
 */
function extractManagementStyle(text) {
  const styleKeywords = {
    structured: ['structured', 'organized', 'planned', 'systematic'],
    flexible: ['flexible', 'adaptable', 'spontaneous', 'fluid'],
    busy: ['busy', 'packed', 'hectic', 'overbooked'],
    balanced: ['balanced', 'moderate', 'reasonable', 'healthy'],
    efficient: ['efficient', 'optimized', 'streamlined', 'productive']
  };

  const lowerText = text.toLowerCase();
  const foundStyles = [];

  for (const [style, keywords] of Object.entries(styleKeywords)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        foundStyles.push(style);
        break;
      }
    }
  }

  return foundStyles[0] || 'Balanced';
}

/**
 * Categorize work-life balance score
 */
function categorizeBalance(score) {
  if (score >= 80) return 'Excellent Balance';
  if (score >= 60) return 'Good Balance';
  if (score >= 40) return 'Moderate Balance';
  if (score >= 20) return 'Poor Balance';
  return 'Work-Dominated';
}

/**
 * Determine meeting culture
 */
function determineMeetingCulture(patterns) {
  const meetingPercentage = patterns.meetingPatterns.meetingPercentage;
  const avgAttendees = patterns.meetingPatterns.avgAttendees;

  if (meetingPercentage > 60 && avgAttendees > 4) {
    return 'Highly Collaborative (Group-Focused)';
  } else if (meetingPercentage > 60 && avgAttendees <= 4) {
    return 'Highly Collaborative (1-on-1 Focused)';
  } else if (meetingPercentage > 30) {
    return 'Moderately Collaborative';
  } else {
    return 'Independent Worker';
  }
}

/**
 * Determine meeting length preference
 */
function determineMeetingLengthPreference(durationPatterns) {
  const avgDuration = durationPatterns.avgDuration;

  if (avgDuration < 30) return 'Quick Check-ins (< 30 min)';
  if (avgDuration < 45) return 'Standard Meetings (30-45 min)';
  if (avgDuration < 60) return 'Extended Discussions (45-60 min)';
  return 'Deep Dives (> 60 min)';
}

/**
 * Calculate meeting density (events per day)
 */
function calculateMeetingDensity(patterns) {
  const eventsPerDay = patterns.totalEvents / patterns.daysAnalyzed;

  if (eventsPerDay > 5) return 'Very High';
  if (eventsPerDay > 3) return 'High';
  if (eventsPerDay > 1.5) return 'Moderate';
  return 'Low';
}

/**
 * Determine collaboration style
 */
function determineCollaborationStyle(meetingPatterns) {
  const avgAttendees = meetingPatterns.avgAttendees;

  if (avgAttendees > 8) return 'Large Group Meetings';
  if (avgAttendees > 4) return 'Team Meetings';
  if (avgAttendees > 2) return 'Small Group Discussions';
  return '1-on-1 Focused';
}

/**
 * Assess time fragmentation
 */
function assessTimeFragmentation(durationPatterns) {
  const shortMeetings = durationPatterns.shortMeetings;
  const longMeetings = durationPatterns.longMeetings;

  if (shortMeetings > longMeetings * 2) {
    return 'Highly Fragmented (Many Short Meetings)';
  } else if (longMeetings > shortMeetings) {
    return 'Focused Blocks (Longer Meetings)';
  } else {
    return 'Mixed (Various Meeting Lengths)';
  }
}

/**
 * Extract insights from Claude's analysis
 */
function extractInsights(text) {
  // Look for bullet points or numbered lists in Claude's response
  const insights = [];
  const lines = text.split('\n');

  for (const line of lines) {
    if (line.trim().match(/^[-*•]\s/)) {
      insights.push(line.trim().substring(2).trim());
    }
  }

  return insights.slice(0, 5); // Return top 5 insights
}

/**
 * Extract recommendations from Claude's analysis
 */
function extractRecommendations(text) {
  const recommendations = [];

  // Look for recommendations section
  const recIndex = text.toLowerCase().indexOf('recommendation');
  if (recIndex !== -1) {
    const recSection = text.substring(recIndex);
    const lines = recSection.split('\n');

    for (const line of lines) {
      if (line.trim().match(/^[-*•]\s/)) {
        recommendations.push(line.trim().substring(2).trim());
      }
    }
  }

  return recommendations.slice(0, 5); // Return top 5 recommendations
}

/**
 * Generate summary
 */
function generateSummary(style, balance, culture) {
  return `${style} time management style with ${balance.toLowerCase()}. ${culture}.`;
}
