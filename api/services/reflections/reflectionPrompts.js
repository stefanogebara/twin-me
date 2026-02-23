/**
 * Reflection Prompts
 *
 * Builds platform-specific prompts for AI-generated reflections.
 * Each prompt combines dynamic context (life events, personality) with platform data.
 */

/**
 * Get platform-specific prompt for reflection generation
 *
 * @param {string} platform - Platform name
 * @param {Object} data - Platform data
 * @param {Object|null} lifeContext - Life context (events, status)
 * @param {Object|null} personalityQuiz - Personality quiz results
 * @returns {string} Prompt text
 */
export function getPromptForPlatform(platform, data, lifeContext = null, personalityQuiz = null) {
  // Build life context prompt section
  let lifeContextSection = '';
  if (lifeContext && lifeContext.promptSummary && lifeContext.currentStatus !== 'normal') {
    lifeContextSection = `
IMPORTANT LIFE CONTEXT:
${lifeContext.promptSummary}

This life context should inform your observation - consider how it affects their patterns.
`;
  }

  // Build personality quiz section
  let personalitySection = '';
  if (personalityQuiz && personalityQuiz.summary) {
    personalitySection = `
WHO THIS PERSON IS (from their personality quiz):
${personalityQuiz.summary}

Key traits to incorporate:
- Morning/evening person: ${personalityQuiz.morningPerson === true ? 'Morning person' : personalityQuiz.morningPerson === false ? 'Not a morning person' : 'Unknown'}
- Peak productivity: ${personalityQuiz.peakHours || 'Unknown'}
- Introversion level: ${personalityQuiz.introversion !== undefined ? (personalityQuiz.introversion > 0.6 ? 'Introverted' : personalityQuiz.introversion < 0.4 ? 'Extroverted' : 'Balanced') : 'Unknown'}
- Music strategy: ${personalityQuiz.musicEmotionalStrategy || 'Unknown'} (match moods vs change moods)
- Stress coping: ${personalityQuiz.stressCoping || 'Unknown'}
- Novelty seeking: ${personalityQuiz.noveltySeeking !== undefined ? (personalityQuiz.noveltySeeking > 0.6 ? 'High - loves new discoveries' : personalityQuiz.noveltySeeking < 0.4 ? 'Low - prefers familiar' : 'Moderate') : 'Unknown'}
- Pre-event strategy: ${personalityQuiz.preEventStrategy || 'Unknown'}

Use this personality context to make your observations more personal and insightful. Connect platform behaviors to their personality traits.
`;
  }

  // Dynamic context sections (life context + personality) - appended to user message
  const dynamicContext = `${lifeContextSection}${personalitySection}`.trim();

  switch (platform) {
    case 'spotify':
      return buildSpotifyPrompt(dynamicContext, data);
    case 'whoop':
      return buildWhoopPrompt(dynamicContext, data);
    case 'calendar':
      return buildCalendarPrompt(dynamicContext, data);
    case 'youtube':
      return buildYouTubePrompt(dynamicContext, data);
    case 'twitch':
      return buildTwitchPrompt(dynamicContext, data);
    case 'web':
      return buildWebPrompt(dynamicContext, data);
    case 'discord':
      return buildDiscordPrompt(dynamicContext, data);
    case 'linkedin':
      return buildLinkedInPrompt(dynamicContext, data);
    default:
      return `${dynamicContext ? dynamicContext + '\n\n' : ''}Generate a reflection about this person's digital patterns.`;
  }
}

function buildSpotifyPrompt(dynamicContext, data) {
  // Calculate peak listening times from listeningHours data
  const peakHours = data.listeningHours
    ?.filter(h => h.plays > 0)
    ?.sort((a, b) => b.plays - a.plays)
    ?.slice(0, 3)
    ?.map(h => {
      if (h.hour >= 5 && h.hour < 12) return 'morning';
      if (h.hour >= 12 && h.hour < 17) return 'afternoon';
      if (h.hour >= 17 && h.hour < 21) return 'evening';
      return 'late night';
    }) || [];
  const uniquePeakPeriods = [...new Set(peakHours)];
  const listeningTimePattern = uniquePeakPeriods.length > 0
    ? `Peak listening times: ${uniquePeakPeriods.join(', ')}`
    : '';

  // Genre diversity
  const genreCount = data.topGenres?.length || 0;
  const genreDiversity = genreCount > 4 ? 'very diverse musical taste' :
    genreCount > 2 ? 'focused but varied taste' : 'concentrated on specific genres';

  return `${dynamicContext ? dynamicContext + '\n\n' : ''}PLATFORM: SPOTIFY (Music)

Data about this person (USE THIS TO INFORM YOUR OBSERVATION, don't list it):
- Artists they gravitate toward: ${data.topArtists?.join(', ') || 'various'}
- Recent listening includes: ${data.recentTrackNames?.slice(0, 5).join(', ') || 'various tracks'}
- Their music tends toward: ${data.averageEnergy > 0.6 ? 'higher energy' : data.averageEnergy < 0.4 ? 'calmer sounds' : 'balanced energy'}
- Emotional tone: ${data.averageValence > 0.6 ? 'more upbeat' : data.averageValence < 0.4 ? 'more melancholic' : 'varied'}
${listeningTimePattern ? `- ${listeningTimePattern}` : ''}
- Genre breadth: ${genreDiversity}

Write an observation about what their music choices reveal about them.`;
}

function buildWhoopPrompt(dynamicContext, data) {
  // Build historical context section if available
  const historicalSection = data.historicalContext?.summary
    ? `\nHISTORICAL PATTERNS (use this to make observations more insightful):
${data.historicalContext.summary}
- Recovery consistency: ${data.historicalContext.recoveryConsistency || 'unknown'}
${data.historicalContext.bestDay ? `- Best recovery days tend to be: ${data.historicalContext.bestDay}s` : ''}
`
    : '';

  return `${dynamicContext ? dynamicContext + '\n\n' : ''}PLATFORM: WHOOP (Body/Health)

Data about this person (USE THIS TO INFORM YOUR OBSERVATION, don't state it):
- Recovery trending: ${data.recoveryTrending}
- Current recovery level: ${data.recoveryLevel}
- Sleep lately: ${data.sleepQuality}
- Physical strain: ${data.strainLevel}
- HRV trend: ${data.hrvTrend}
${historicalSection}
Write an observation about what their body is telling them.`;
}

function buildCalendarPrompt(dynamicContext, data) {
  // Build weekly pattern insights
  const weeklyPatternSection = data.scheduleStats ? `
WEEKLY PATTERNS:
- Busiest day: ${data.scheduleStats.busiestDay || 'varies'}
- Protected focus blocks: ${data.scheduleStats.focusBlocks > 0 ? `${data.scheduleStats.focusBlocks} scheduled` : 'none visible'}
- Meeting preference: ${data.scheduleStats.preferredMeetingTime || 'varies'}
` : '';

  return `${dynamicContext ? dynamicContext + '\n\n' : ''}PLATFORM: CALENDAR (Time)

Data about this person (USE THIS TO INFORM YOUR OBSERVATION, don't list it):
- Today's density: ${data.dayDensity}
- Day of week: ${data.dayOfWeek}
- Types of events: ${data.eventTypes?.join(', ') || 'various'}
- Has protected open time: ${data.hasOpenTime ? 'yes' : 'limited'}
${data.upcomingEventTitle ? `- Coming up soon: "${data.upcomingEventTitle}"` : ''}
${weeklyPatternSection}
Write an observation about how they structure their time.`;
}

function buildYouTubePrompt(dynamicContext, data) {
  // Build extension data section
  const ytExtensionSection = data.hasExtensionData ? `
WATCH BEHAVIOR (from browser extension - actual viewing, not just likes):
- Recent watches: ${data.recentWatchHistory?.slice(0, 5).map(w => w.title).filter(Boolean).join(', ') || 'various'}
- Average watch completion: ${data.recentWatchHistory?.length > 0 ? Math.round(data.recentWatchHistory.filter(w => w.watchPercentage).reduce((a, w) => a + w.watchPercentage, 0) / data.recentWatchHistory.length) + '%' : 'unknown'}
- Recent searches: ${data.searchQueries?.slice(0, 5).join(', ') || 'none captured'}
` : '';

  return `${dynamicContext ? dynamicContext + '\n\n' : ''}PLATFORM: YOUTUBE (Content)

Data about this person (USE THIS TO INFORM YOUR OBSERVATION, don't list it):
- Channels they subscribe to: ${data.topChannelNames?.slice(0, 8).join(', ') || 'various'}
- Recently liked videos include: ${data.recentLiked?.slice(0, 5).map(v => v.title).join(', ') || 'various content'}
- Content categories: ${data.contentCategories?.map(c => c.category).join(', ') || 'diverse'}
- Learning vs Entertainment ratio: ${data.learningRatio || 50}% learning / ${data.entertainmentRatio || 50}% entertainment
${ytExtensionSection}
Write an observation about what their content choices reveal about them.`;
}

function buildTwitchPrompt(dynamicContext, data) {
  // Build extension data section for Twitch
  const twitchExtensionSection = data.hasExtensionData ? `
VIEWING BEHAVIOR (from browser extension - actual stream watching):
- Recent streams watched: ${data.recentStreamWatches?.slice(0, 5).map(w => `${w.channelName}${w.gameName ? ` (${w.gameName})` : ''}`).join(', ') || 'various'}
- Categories browsed: ${data.browseCategories?.slice(0, 5).join(', ') || 'none captured'}
` : '';

  return `${dynamicContext ? dynamicContext + '\n\n' : ''}PLATFORM: TWITCH (Gaming/Streaming)

Data about this person (USE THIS TO INFORM YOUR OBSERVATION, don't list it):
- Channels they follow: ${data.topChannelNames?.slice(0, 8).join(', ') || 'various'}
- Game preferences: ${data.gamingCategories?.map(g => g.game).join(', ') || 'diverse'}
- Number of followed channels: ${data.followedChannelCount || 0}
${data.broadcasterType ? `- They are a ${data.broadcasterType} broadcaster themselves` : '- Primarily a viewer/follower'}
${twitchExtensionSection}
Write an observation about what their streaming habits reveal about them.`;
}

function buildDiscordPrompt(dynamicContext, data) {
  const serverList = data.servers?.map(s => s.name).join(', ') || 'various communities';
  const categories = data.categoryBreakdown?.map(c => `${c.category} (${c.count})`).join(', ') || 'mixed';

  return `${dynamicContext ? dynamicContext + '\n\n' : ''}PLATFORM: DISCORD (Communities & Social)

Data about this person (USE THIS TO INFORM YOUR OBSERVATION, don't list it):
- Member of ${data.totalServers || data.servers?.length || 'several'} Discord communities
- Communities include: ${serverList}
- Community categories: ${categories}
${data.topCategories?.length > 0 ? `- Their strongest community focus: ${data.topCategories.join(', ')}` : ''}

Write an observation about what their community choices reveal about who they are — how they connect with others, what they care about, and the kind of belonging they seek.`;
}

function buildLinkedInPrompt(dynamicContext, data) {
  const skillsList = data.skills?.slice(0, 6).join(', ') || 'various skills';

  return `${dynamicContext ? dynamicContext + '\n\n' : ''}PLATFORM: LINKEDIN (Professional Identity)

Data about this person (USE THIS TO INFORM YOUR OBSERVATION, don't list it):
${data.headline ? `- Professional headline: "${data.headline}"` : ''}
${data.industry ? `- Works in: ${data.industry}` : ''}
${data.locale ? `- Location/locale: ${data.locale}` : ''}
${data.connectionCount ? `- Network size: ${data.connectionCount}+ connections` : ''}
${data.skills?.length > 0 ? `- Their listed skills: ${skillsList}` : ''}

Write an observation about what their professional identity and positioning reveals about them as a person — their ambitions, values, and how they want to be seen professionally.`;
}

function buildWebPrompt(dynamicContext, data) {
  return `${dynamicContext ? dynamicContext + '\n\n' : ''}PLATFORM: WEB BROWSING (Digital Life)

Data about this person (USE THIS TO INFORM YOUR OBSERVATION, don't list it):
- Top interest categories: ${data.topCategories?.map(c => c.category).join(', ') || 'diverse'}
- Most visited domains: ${data.topDomains?.slice(0, 8).map(d => d.domain).join(', ') || 'various'}
- Topics that keep appearing: ${data.topTopics?.slice(0, 10).join(', ') || 'varied interests'}
- Recent searches: ${data.recentSearches?.slice(0, 8).join(', ') || 'none captured yet'}
- Reading style: ${data.readingProfile?.dominantBehavior || 'varied'} reader
- Average time per page: ${data.readingProfile?.avgTimeOnPage ? data.readingProfile.avgTimeOnPage + ' seconds' : 'varies'}
- Content they engage with most: ${Object.entries(data.readingProfile?.contentTypeDistribution || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k).join(', ') || 'mixed'}

Write an observation about what their browsing patterns reveal about their soul.`;
}
