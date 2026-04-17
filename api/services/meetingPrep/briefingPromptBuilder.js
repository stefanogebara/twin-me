/**
 * Briefing Prompt Builder
 * ========================
 * Builds the LLM prompt for generating a structured meeting briefing.
 * Output JSON schema:
 *   {
 *     headline: string,            // 1-line meeting-in-a-nutshell
 *     attendees: [{
 *       name, company, title,
 *       whoTheyAre: string,        // 2-3 sentences about them
 *       lastTouchpoint: string,    // most recent interaction context (or null)
 *     }],
 *     companyContext: string,      // key company info (1-2 sentences per org)
 *     talkingPoints: string[],     // 3-5 actionable points to raise
 *     watchOuts: string[],         // 1-3 things to be careful about
 *     myContext: string,           // user's own relevant context for this meeting
 *   }
 */

export function buildBriefingPrompt({ event, attendeeResearch, userContext }) {
  const attendeeSections = attendeeResearch.map(a => {
    const parts = [];
    parts.push(`Attendee: ${a.name}${a.company ? ` (${a.company}${a.title ? ', ' + a.title : ''})` : ''}`);
    parts.push(`Email: ${a.email}`);

    if (a.pastInteractions.length > 0) {
      parts.push(`Past interactions:\n${a.pastInteractions.map(m => `  - ${m}`).join('\n')}`);
    } else {
      parts.push('Past interactions: none found');
    }

    if (a.personBackground.length > 0) {
      parts.push(`Web background:\n${a.personBackground.slice(0, 2).map(b => `  - ${b}`).join('\n')}`);
    }

    if (a.companyContext.length > 0) {
      parts.push(`Company context:\n${a.companyContext.slice(0, 2).map(c => `  - ${c}`).join('\n')}`);
    }

    return parts.join('\n');
  }).join('\n\n---\n\n');

  return `You are preparing a pre-meeting briefing for ${userContext.name || 'the user'}.

MEETING DETAILS
Title: ${event.summary || 'Untitled meeting'}
Time: ${event.startTime}
Duration: ${event.durationMinutes} minutes
Description: ${event.description || 'None'}

ATTENDEE RESEARCH
${attendeeSections || 'No external attendees found.'}

USER CONTEXT
${userContext.recentMemories.length > 0
  ? `Recent relevant context from the user's memory:\n${userContext.recentMemories.map(m => `- ${m}`).join('\n')}`
  : 'No specific prior context found.'}

Generate a meeting briefing as a JSON object with EXACTLY this structure:
{
  "headline": "<1-line summary of what this meeting is about and what's at stake>",
  "attendees": [
    {
      "name": "<full name>",
      "company": "<company or null>",
      "title": "<title or null>",
      "whoTheyAre": "<2-3 sentences from research — who are they, what do they care about, what's their context>",
      "lastTouchpoint": "<most recent interaction summary, or null if first meeting>"
    }
  ],
  "companyContext": "<key info about the company/companies involved — 1-2 sentences>",
  "talkingPoints": [
    "<specific, actionable talking point 1>",
    "<specific, actionable talking point 2>",
    "<specific, actionable talking point 3>"
  ],
  "watchOuts": [
    "<something to be careful about — a sensitive topic, a known blocker, a past tension>"
  ],
  "myContext": "<1-2 sentences about what the user brings to this meeting — relevant work, past decisions, current priorities>"
}

Rules:
- Be specific and actionable, not generic platitudes
- Use actual names and company names from the research
- If you have no data for a field, use null (not empty strings)
- talkingPoints: 3-5 items
- watchOuts: 1-3 items (skip if genuinely nothing notable)
- Output ONLY the JSON object, no markdown, no preamble`;
}
