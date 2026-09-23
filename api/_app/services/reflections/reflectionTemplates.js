import { createLogger } from '../logger.js';

const log = createLogger('Reflectiontemplates');

/**
 * Reflection Templates
 *
 * Template-based reflection generators used as fallback when AI API is unavailable.
 * Also includes the generic fallback reflections for when even templates fail.
 */

/**
 * Generate a template-based reflection from actual platform data.
 * Used as a fallback when the AI API is unavailable.
 * Returns null if insufficient data to generate a meaningful observation.
 *
 * @param {string} platform - Platform name
 * @param {Object|null} data - Platform data
 * @returns {Object|null} Reflection object or null
 */
export function generateTemplateReflection(platform, data) {
  if (!data) return null;

  try {
    switch (platform) {
      case 'spotify':
        return generateSpotifyTemplate(data);
      case 'whoop':
        return generateWhoopTemplate(data);
      case 'calendar':
        return generateCalendarTemplate(data);
      case 'youtube':
        return generateYouTubeTemplate(data);
      case 'twitch':
        return generateTwitchTemplate(data);
      case 'web':
        return generateWebTemplate(data);
      default:
        return null;
    }
  } catch (error) {
    log.error(`Template generation failed for ${platform}:`, error);
    return null;
  }
}

/**
 * Fallback reflection if Claude fails and template also fails
 *
 * @param {string} platform - Platform name
 * @returns {Object} Fallback reflection object
 */
export function getFallbackReflection(platform) {
  const fallbacks = {
    spotify: {
      text: "Your music tells a story I'm still learning to read. The patterns are there - the way certain sounds find you at certain times. Let me observe a bit more.",
      themes: ['discovery'],
      confidence: 'low',
      patterns: []
    },
    whoop: {
      text: "Your body has wisdom that takes time to understand. I'm watching the rhythms, noticing the connections between how you feel and how you move through your days.",
      themes: ['learning'],
      confidence: 'low',
      patterns: []
    },
    calendar: {
      text: "Time reveals priorities. I'm learning the rhythm of your weeks - which hours you protect, which ones you give away, and what that says about what matters to you.",
      themes: ['observation'],
      confidence: 'low',
      patterns: []
    },
    youtube: {
      text: "Your content world is a map of your curiosities. I'm starting to see the threads that connect what you watch - the patterns that reveal what truly fascinates you.",
      themes: ['curiosity'],
      confidence: 'low',
      patterns: []
    },
    twitch: {
      text: "Your streaming world tells me how you unwind and connect. The channels you follow and the games you're drawn to reveal something about how you recharge.",
      themes: ['community'],
      confidence: 'low',
      patterns: []
    },
    web: {
      text: "Your digital footprint is starting to take shape. Every page you visit, every search you run, adds another thread to the story of who you are online. I'm beginning to see patterns in your curiosity.",
      themes: ['discovery'],
      confidence: 'low',
      patterns: []
    }
  };

  return fallbacks[platform] || fallbacks.spotify;
}

// ===== Per-platform template generators =====

function generateSpotifyTemplate(data) {
  const sentences = [];

  // Top artist observation
  const topArtist = data.topArtistsWithPlays?.[0];
  if (topArtist) {
    const totalPlays = data.topArtistsWithPlays.reduce((sum, a) => sum + a.plays, 0);
    const percent = totalPlays > 0 ? Math.round((topArtist.plays / totalPlays) * 100) : 0;
    if (percent > 30) {
      sentences.push(`${topArtist.name} dominates your listening with ${percent}% of your plays - they clearly resonate with something in you.`);
    } else {
      sentences.push(`${topArtist.name} leads your rotation, but you spread your attention across many artists.`);
    }
  }

  // Peak listening time
  const activeHours = data.listeningHours?.filter(h => h.plays > 0)?.sort((a, b) => b.plays - a.plays);
  if (activeHours?.length > 0) {
    const peakHour = activeHours[0].hour;
    const period = peakHour >= 5 && peakHour < 12 ? 'morning' :
                   peakHour >= 12 && peakHour < 17 ? 'afternoon' :
                   peakHour >= 17 && peakHour < 21 ? 'evening' : 'late night';
    sentences.push(`Your peak listening is in the ${period} - that's when music matters most to you.`);
  }

  // Genre diversity
  const genreCount = data.topGenres?.length || 0;
  const topGenre = data.topGenres?.[0]?.genre;
  if (genreCount > 0 && topGenre) {
    if (genreCount >= 4) {
      sentences.push(`You have a diverse taste spanning ${genreCount} genres, with ${topGenre} leading the way.`);
    } else {
      sentences.push(`Your taste centers around ${topGenre}, showing you know what sounds you're drawn to.`);
    }
  }

  if (sentences.length === 0) return null;

  return {
    text: sentences.slice(0, 3).join(' '),
    themes: ['listening patterns', 'musical identity'],
    confidence: 'medium',
    source: 'template',
    evidence: [],
    patterns: []
  };
}

function generateWhoopTemplate(data) {
  const sentences = [];
  const metrics = data.currentMetrics;

  // Recovery observation
  if (metrics?.recovery != null) {
    const score = metrics.recovery;
    if (score >= 67) {
      sentences.push(`Your recovery score is ${score}% - your body is in a strong place today, ready for whatever you throw at it.`);
    } else if (score >= 34) {
      sentences.push(`Your recovery is at ${score}%, sitting in a moderate zone. Your body is asking you to be intentional about how you spend your energy today.`);
    } else {
      sentences.push(`Your recovery is at ${score}%, which is on the lower side. Today might be about rest and letting your body catch up.`);
    }
  }

  // Sleep observation
  const sleepBreakdown = data.sleepBreakdown;
  if (sleepBreakdown?.totalHours) {
    const hours = sleepBreakdown.totalHours;
    if (hours >= 8) {
      sentences.push(`You logged ${hours} hours of sleep last night - that's a solid foundation for today.`);
    } else if (hours >= 6) {
      sentences.push(`You got ${hours} hours of sleep, which is decent but your body would thank you for more.`);
    } else {
      sentences.push(`Only ${hours} hours of sleep last night - that's going to show up in how you feel today.`);
    }
  }

  // HRV / strain observation
  if (metrics?.hrv != null && metrics?.strain != null) {
    const strain = metrics.strain;
    if (strain > 15) {
      sentences.push(`Your strain has been high at ${strain}, so recovery will be key in the coming hours.`);
    } else if (strain < 8) {
      sentences.push(`Your strain is light at ${strain} - there's room to push yourself if you want to.`);
    }
  } else if (metrics?.stressLevel) {
    sentences.push(`Your estimated stress level is ${metrics.stressLevel.toLowerCase()} based on your vitals.`);
  }

  if (sentences.length === 0) return null;

  return {
    text: sentences.slice(0, 3).join(' '),
    themes: ['body awareness', 'recovery'],
    confidence: 'medium',
    source: 'template',
    evidence: [],
    patterns: []
  };
}

function generateCalendarTemplate(data) {
  const sentences = [];

  // Day density
  const todayCount = data.todayEvents?.length || 0;
  const dayOfWeek = data.dayOfWeek || new Date().toLocaleDateString('en-US', { weekday: 'long' });
  if (todayCount > 5) {
    sentences.push(`You have ${todayCount} events today - this ${dayOfWeek} is packed, and protecting any breathing room will matter.`);
  } else if (todayCount > 0) {
    sentences.push(`With ${todayCount} event${todayCount > 1 ? 's' : ''} today, this ${dayOfWeek} has a manageable rhythm to it.`);
  } else {
    sentences.push(`Your ${dayOfWeek} is wide open - a rare chance to focus on what matters most to you.`);
  }

  // Busiest day insight
  const stats = data.scheduleStats;
  if (stats?.busiestDay) {
    sentences.push(`${stats.busiestDay} tends to be your busiest day of the week, so plan your energy accordingly.`);
  }

  // Focus blocks
  if (stats?.focusBlocks > 0) {
    sentences.push(`You have ${stats.focusBlocks} focus block${stats.focusBlocks > 1 ? 's' : ''} scheduled - that tells me you value deep work.`);
  } else if (todayCount > 3) {
    sentences.push(`No dedicated focus blocks visible in your schedule - finding even 30 minutes of uninterrupted time could make a difference.`);
  }

  if (sentences.length === 0) return null;

  return {
    text: sentences.slice(0, 3).join(' '),
    themes: ['time management', 'priorities'],
    confidence: 'medium',
    source: 'template',
    evidence: [],
    patterns: []
  };
}

function generateYouTubeTemplate(data) {
  const sentences = [];

  // Subscription overview
  if (data.subscriptionCount > 0) {
    const topChannels = data.topChannelNames?.slice(0, 3)?.join(', ');
    if (topChannels) {
      sentences.push(`With ${data.subscriptionCount} subscriptions including ${topChannels}, your YouTube paints a picture of your curiosities.`);
    }
  }

  // Learning vs entertainment
  if (data.learningRatio != null) {
    if (data.learningRatio > 60) {
      sentences.push(`About ${data.learningRatio}% of your content leans educational - you use YouTube as a learning tool more than most.`);
    } else if (data.learningRatio < 40) {
      sentences.push(`Your content skews toward entertainment at ${data.entertainmentRatio}%, and there's nothing wrong with that - it's how you recharge.`);
    } else {
      sentences.push(`You balance learning and entertainment almost evenly, mixing growth with relaxation.`);
    }
  }

  // Top category
  const topCat = data.contentCategories?.[0];
  if (topCat) {
    sentences.push(`${topCat.category} content leads your interests at ${topCat.percentage}% of what you engage with.`);
  }

  if (sentences.length === 0) return null;

  return {
    text: sentences.slice(0, 3).join(' '),
    themes: ['curiosity', 'content preferences'],
    confidence: 'medium',
    source: 'template',
    evidence: [],
    patterns: []
  };
}

function generateTwitchTemplate(data) {
  const sentences = [];

  // Following overview
  if (data.followedChannelCount > 0) {
    sentences.push(`You follow ${data.followedChannelCount} channels on Twitch, building a community around your interests.`);
  }

  // Game preferences
  const topGame = data.gamingCategories?.[0];
  if (topGame) {
    const gameCount = data.gamingCategories.length;
    if (gameCount > 3) {
      sentences.push(`Your interests span ${gameCount} different games, with ${topGame.game} at the top - you like variety in your streams.`);
    } else {
      sentences.push(`${topGame.game} dominates your Twitch world, showing a deep commitment to that community.`);
    }
  }

  // Broadcaster type
  if (data.broadcasterType) {
    sentences.push(`As a ${data.broadcasterType} yourself, you're not just a viewer - you're part of the creator community.`);
  }

  if (sentences.length === 0) return null;

  return {
    text: sentences.slice(0, 3).join(' '),
    themes: ['gaming', 'community'],
    confidence: 'medium',
    source: 'template',
    evidence: [],
    patterns: []
  };
}

function generateWebTemplate(data) {
  const sentences = [];

  // Top categories
  const topCat = data.topCategories?.[0];
  if (topCat) {
    sentences.push(`${topCat.category} makes up ${topCat.percentage}% of your browsing - it's clearly where your mind wanders most.`);
  }

  // Reading behavior
  if (data.readingProfile?.dominantBehavior) {
    const behavior = data.readingProfile.dominantBehavior;
    const avgTime = data.readingProfile.avgTimeOnPage;
    if (avgTime && avgTime > 60) {
      sentences.push(`You're a ${behavior} reader, spending an average of ${Math.round(avgTime / 60)} minutes per page - you dive deep into what catches your attention.`);
    } else {
      sentences.push(`Your browsing style is that of a ${behavior} reader, scanning broadly across topics.`);
    }
  }

  // Total activity
  if (data.totalPageVisits > 0) {
    const topDomain = data.topDomains?.[0]?.domain;
    if (topDomain) {
      sentences.push(`Across ${data.totalPageVisits} page visits, ${topDomain} is your most frequented destination.`);
    }
  }

  if (sentences.length === 0) return null;

  return {
    text: sentences.slice(0, 3).join(' '),
    themes: ['digital life', 'curiosity patterns'],
    confidence: 'medium',
    source: 'template',
    evidence: [],
    patterns: []
  };
}
