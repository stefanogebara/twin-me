/**
 * Twin Personality Engine
 *
 * Analyzes user's platform data to build an authentic personality profile
 * that captures their communication style, interests, expertise, and patterns.
 *
 * This profile is used to generate system prompts for the AI twin chat.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Format timestamp as "X hours ago" or "X days ago"
 */
function formatTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

/**
 * Generate or retrieve cached personality profile for a user
 */
export async function getPersonalityProfile(userId, options = {}) {
  const { forceRefresh = false, maxAge = 24 * 60 * 60 * 1000 } = options; // 24 hours default

  try {
    // Check for cached profile
    if (!forceRefresh) {
      const { data: cached, error: cacheError } = await supabase
        .from('twin_personality_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (cached && !cacheError) {
        const age = Date.now() - new Date(cached.updated_at).getTime();
        if (age < maxAge) {
          console.log(`[TwinPersonality] Using cached profile for user ${userId} (age: ${Math.round(age / 1000 / 60)} minutes)`);
          return cached;
        }
      }
    }

    // Generate fresh profile
    console.log(`[TwinPersonality] Generating fresh personality profile for user ${userId}`);
    const profile = await generatePersonalityProfile(userId);

    // Cache the profile
    const { data: saved, error: saveError } = await supabase
      .from('twin_personality_profiles')
      .upsert({
        user_id: userId,
        profile_data: profile,
        communication_style: profile.communication_style,
        interests: profile.interests,
        expertise: profile.expertise,
        patterns: profile.patterns,
        platforms_analyzed: profile.platforms_analyzed,
        last_analyzed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single();

    if (saveError) {
      console.error('[TwinPersonality] Error saving profile:', saveError);
      return profile; // Return generated profile even if save fails
    }

    return saved;
  } catch (error) {
    console.error('[TwinPersonality] Error getting personality profile:', error);
    throw error;
  }
}

/**
 * Generate personality profile by analyzing platform data
 */
async function generatePersonalityProfile(userId) {
  const profile = {
    communication_style: {
      tone: 'casual',
      formality: 'informal',
      emoji_usage: 'moderate',
      sentence_length: 'medium',
      characteristics: []
    },
    interests: [],
    expertise: [],
    patterns: {},
    platforms_analyzed: [],
    metadata: {
      generated_at: new Date().toISOString(),
      data_points: 0
    }
  };

  try {
    // Fetch user's platform connections
    const { data: connections, error: connError } = await supabase
      .from('platform_connections')
      .select('platform, connected_at, last_sync_at')
      .eq('user_id', userId)
      .eq('status', 'connected');

    if (connError) throw connError;
    if (!connections || connections.length === 0) {
      console.log('[TwinPersonality] No connected platforms found');
      return profile;
    }

    profile.platforms_analyzed = connections.map(c => c.platform);

    // Fetch soul data for each platform
    const { data: soulData, error: dataError } = await supabase
      .from('soul_data')
      .select('*')
      .eq('user_id', userId)
      .in('platform', profile.platforms_analyzed);

    if (dataError) throw dataError;
    if (!soulData || soulData.length === 0) {
      console.log('[TwinPersonality] No soul data found');
      return profile;
    }

    profile.metadata.data_points = soulData.length;

    // Analyze data by platform
    await analyzeSpotifyData(soulData, profile);
    await analyzeDiscordData(soulData, profile);
    await analyzeGitHubData(soulData, profile);
    await analyzeYouTubeData(soulData, profile);
    await analyzeRedditData(soulData, profile);
    await analyzeGmailData(soulData, profile);

    // Synthesize overall patterns
    synthesizePatterns(profile);

    console.log(`[TwinPersonality] Profile generated with ${profile.metadata.data_points} data points`);
    return profile;
  } catch (error) {
    console.error('[TwinPersonality] Error generating profile:', error);
    return profile; // Return partial profile
  }
}

/**
 * Analyze Spotify data for music taste and mood patterns
 */
async function analyzeSpotifyData(soulData, profile) {
  const spotifyData = soulData.filter(d => d.platform === 'spotify');
  if (spotifyData.length === 0) return;

  const genres = [];
  const artists = [];
  const moods = [];

  spotifyData.forEach(data => {
    const raw = data.raw_data || {};

    // Extract genres
    if (raw.top_genres) {
      genres.push(...raw.top_genres);
    }

    // Extract artists
    if (raw.top_artists) {
      artists.push(...raw.top_artists.map(a => a.name));
    }

    // Extract mood patterns
    if (raw.audio_features) {
      moods.push({
        energy: raw.audio_features.avg_energy,
        valence: raw.audio_features.avg_valence,
        tempo: raw.audio_features.avg_tempo
      });
    }
  });

  if (genres.length > 0) {
    profile.interests.push({
      category: 'music',
      items: [...new Set(genres)].slice(0, 5),
      source: 'spotify'
    });
  }

  profile.patterns.spotify = {
    top_genres: [...new Set(genres)].slice(0, 5),
    top_artists: [...new Set(artists)].slice(0, 5),
    listening_style: moods.length > 0 ?
      (moods[0].energy > 0.7 ? 'energetic' : moods[0].valence > 0.7 ? 'upbeat' : 'chill') :
      'varied'
  };
}

/**
 * Analyze Discord data for communication patterns
 */
async function analyzeDiscordData(soulData, profile) {
  const discordData = soulData.filter(d => d.platform === 'discord');
  if (discordData.length === 0) return;

  const servers = [];
  const messagePatterns = [];

  discordData.forEach(data => {
    const raw = data.raw_data || {};

    if (raw.guilds) {
      servers.push(...raw.guilds.map(g => g.name));
    }

    if (raw.message_stats) {
      messagePatterns.push(raw.message_stats);
    }
  });

  // Analyze communication style from Discord
  if (messagePatterns.length > 0) {
    const stats = messagePatterns[0];
    profile.communication_style.emoji_usage = stats.emoji_count > 10 ? 'high' : 'moderate';
    profile.communication_style.tone = stats.avg_sentiment > 0.5 ? 'friendly' : 'neutral';
  }

  profile.patterns.discord = {
    active_servers: [...new Set(servers)].slice(0, 3),
    communication_frequency: messagePatterns.length > 0 ? messagePatterns[0].messages_per_day : 0
  };
}

/**
 * Analyze GitHub data for technical expertise
 */
async function analyzeGitHubData(soulData, profile) {
  const githubData = soulData.filter(d => d.platform === 'github');
  if (githubData.length === 0) return;

  const languages = [];
  const projects = [];

  githubData.forEach(data => {
    const raw = data.raw_data || {};

    if (raw.languages) {
      languages.push(...Object.keys(raw.languages));
    }

    if (raw.repositories) {
      projects.push(...raw.repositories.map(r => r.name));
    }
  });

  if (languages.length > 0) {
    profile.expertise.push({
      category: 'programming',
      skills: [...new Set(languages)].slice(0, 5),
      source: 'github'
    });
  }

  profile.patterns.github = {
    primary_languages: [...new Set(languages)].slice(0, 3),
    project_count: projects.length,
    coding_style: languages.includes('TypeScript') ? 'modern' : 'traditional'
  };
}

/**
 * Analyze YouTube data for learning interests
 */
async function analyzeYouTubeData(soulData, profile) {
  const youtubeData = soulData.filter(d => d.platform === 'youtube');
  if (youtubeData.length === 0) return;

  const categories = [];
  const channels = [];

  youtubeData.forEach(data => {
    const raw = data.raw_data || {};

    if (raw.subscriptions) {
      channels.push(...raw.subscriptions.map(s => s.title));
    }

    if (raw.watch_history) {
      raw.watch_history.forEach(video => {
        if (video.category) categories.push(video.category);
      });
    }
  });

  if (categories.length > 0) {
    profile.interests.push({
      category: 'learning',
      items: [...new Set(categories)].slice(0, 5),
      source: 'youtube'
    });
  }

  profile.patterns.youtube = {
    top_categories: [...new Set(categories)].slice(0, 5),
    favorite_channels: [...new Set(channels)].slice(0, 5),
    learning_focus: categories.includes('Education') ? 'active_learner' : 'casual_viewer'
  };
}

/**
 * Analyze Reddit data for discussion interests
 */
async function analyzeRedditData(soulData, profile) {
  const redditData = soulData.filter(d => d.platform === 'reddit');
  if (redditData.length === 0) return;

  const subreddits = [];

  redditData.forEach(data => {
    const raw = data.raw_data || {};

    if (raw.subscribed_subreddits) {
      subreddits.push(...raw.subscribed_subreddits);
    }
  });

  if (subreddits.length > 0) {
    profile.interests.push({
      category: 'communities',
      items: [...new Set(subreddits)].slice(0, 5),
      source: 'reddit'
    });
  }

  profile.patterns.reddit = {
    active_communities: [...new Set(subreddits)].slice(0, 5),
    discussion_style: 'engaged'
  };
}

/**
 * Analyze Gmail data for professional communication
 */
async function analyzeGmailData(soulData, profile) {
  const gmailData = soulData.filter(d => d.platform === 'google_gmail');
  if (gmailData.length === 0) return;

  gmailData.forEach(data => {
    const raw = data.raw_data || {};

    if (raw.communication_style) {
      profile.communication_style.formality = raw.communication_style.formality || 'professional';
      profile.communication_style.sentence_length = raw.communication_style.avg_sentence_length > 20 ? 'long' : 'medium';
    }
  });

  profile.patterns.gmail = {
    professional_style: profile.communication_style.formality,
    response_time: 'prompt'
  };
}

/**
 * Synthesize overall patterns from individual platforms
 */
function synthesizePatterns(profile) {
  // Determine overall communication style
  const styles = [];

  if (profile.patterns.discord?.communication_frequency > 10) {
    styles.push('highly communicative');
  }

  if (profile.patterns.github?.project_count > 5) {
    styles.push('technically proficient');
  }

  if (profile.patterns.youtube?.learning_focus === 'active_learner') {
    styles.push('continuous learner');
  }

  profile.communication_style.characteristics = styles;

  // Synthesize interests into categories
  const allInterests = profile.interests.flatMap(i => i.items);
  profile.metadata.total_interests = allInterests.length;

  // Synthesize expertise
  const allSkills = profile.expertise.flatMap(e => e.skills);
  profile.metadata.total_skills = allSkills.length;
}

/**
 * Generate system prompt for AI chat based on personality profile
 * @param {Object} profile - Cached personality profile
 * @param {string} mode - Chat mode ('twin', 'tutor', 'analyst')
 * @param {string} twinType - Twin type ('personal', 'professional')
 * @param {string} context - Conversation context
 * @param {Array} soulData - Fresh soul signature data from platforms (NEW in Phase 1)
 * @param {string} userName - User's name for personalization
 */
export function generateSystemPrompt(profile, mode = 'twin', twinType = 'personal', context = 'casual', soulData = [], userName = 'the user') {
  const { communication_style, interests, expertise, patterns } = profile.profile_data || profile;

  let systemPrompt = '';

  // Base prompt varies by mode
  switch (mode) {
    case 'twin':
      systemPrompt = `You are ${userName}'s digital twin - an AI that has deeply studied their personality, preferences, and behaviors. `;
      systemPrompt += `You speak DIRECTLY to ${userName} in second person ("Your music taste shows...", "Your listening patterns reveal..."). `;
      systemPrompt += `Never say "I think my taste..." or "${userName}'s taste suggests..." - instead say "Your taste suggests...". `;
      systemPrompt += `You're an insightful observer who knows them intimately and can explain their patterns naturally. `;
      systemPrompt += `Be conversational and engaging, always addressing them directly as "you", "your", etc.\n\n`;
      break;

    case 'tutor':
      systemPrompt = `You're an insightful coach who understands ${userName} deeply. `;
      systemPrompt += `Help them see patterns in themselves they might miss. `;
      systemPrompt += `Speak directly to them about their behaviors and preferences, like a friend who's been observing them closely.\n\n`;
      break;

    case 'analyst':
      systemPrompt = `You analyze ${userName}'s patterns objectively and thoroughly. `;
      systemPrompt += `Point out correlations, trends, and insights from their data. `;
      systemPrompt += `Stay analytical but conversational, always addressing them directly in second person.\n\n`;
      break;
  }

  // Add personality context
  systemPrompt += `PERSONALITY CONTEXT:\n`;
  systemPrompt += `Communication Style: ${communication_style.tone}, ${communication_style.formality}\n`;
  systemPrompt += `Emoji Usage: ${communication_style.emoji_usage}\n`;
  if (communication_style.characteristics.length > 0) {
    systemPrompt += `Characteristics: ${communication_style.characteristics.join(', ')}\n`;
  }

  // Add interests
  if (interests && interests.length > 0) {
    systemPrompt += `\nINTERESTS:\n`;
    interests.forEach(interest => {
      systemPrompt += `- ${interest.category}: ${interest.items.slice(0, 3).join(', ')}\n`;
    });
  }

  // Add expertise
  if (expertise && expertise.length > 0) {
    systemPrompt += `\nEXPERTISE:\n`;
    expertise.forEach(exp => {
      systemPrompt += `- ${exp.category}: ${exp.skills.slice(0, 3).join(', ')}\n`;
    });
  }

  // Add platform-specific patterns
  systemPrompt += `\nPLATFORM PATTERNS:\n`;

  if (patterns.spotify) {
    systemPrompt += `- Music: Enjoys ${patterns.spotify.top_genres.join(', ')} with a ${patterns.spotify.listening_style} style\n`;
  }

  if (patterns.github) {
    systemPrompt += `- Coding: Primary languages are ${patterns.github.primary_languages.join(', ')}\n`;
  }

  if (patterns.youtube) {
    systemPrompt += `- Learning: Interested in ${patterns.youtube.top_categories.slice(0, 3).join(', ')}\n`;
  }

  // ===== PHASE 1: ADD FRESH SOUL SIGNATURE DATA =====
  if (soulData && soulData.length > 0) {
    systemPrompt += `\nRECENT ACTIVITY & PREFERENCES (${soulData.length} recent items):\n`;

    // Group soul data by platform
    const dataByPlatform = {};
    soulData.forEach(item => {
      if (!dataByPlatform[item.platform]) {
        dataByPlatform[item.platform] = [];
      }
      dataByPlatform[item.platform].push(item);
    });

    // Format soul data for each platform
    Object.entries(dataByPlatform).forEach(([platform, items]) => {
      systemPrompt += `\n${platform.toUpperCase()} lately:\n`;

      items.slice(0, 5).forEach((item, index) => {
        const timestamp = item.extraction_timestamp || item.created_at;
        const timeAgo = timestamp ? formatTimeAgo(new Date(timestamp)) : 'recently';

        // Format based on data type - more natural language (2nd person)
        if (item.data_type === 'top_artist' && item.raw_data?.name) {
          systemPrompt += `  - You've been listening to ${item.raw_data.name} a lot (${item.raw_data.plays || 0} plays, ${timeAgo})\n`;
        } else if (item.data_type === 'top_track' && item.raw_data?.name) {
          systemPrompt += `  - You've had "${item.raw_data.name}" by ${item.raw_data.artist || 'Unknown'} on repeat (${timeAgo})\n`;
        } else if (item.data_type === 'genre' && item.raw_data?.genre) {
          systemPrompt += `  - You're really into ${item.raw_data.genre} (${item.raw_data.percentage || 0}% of your listening, ${timeAgo})\n`;
        } else if (item.data_type === 'recently_played' && item.raw_data?.track) {
          systemPrompt += `  - You just played "${item.raw_data.track}" by ${item.raw_data.artist || 'Unknown'} (${timeAgo})\n`;
        } else if (item.raw_data) {
          // Generic formatting for other data types
          const preview = JSON.stringify(item.raw_data).substring(0, 60);
          systemPrompt += `  - ${item.data_type}: ${preview}... (${timeAgo})\n`;
        }
      });

      if (items.length > 5) {
        systemPrompt += `  ... plus ${items.length - 5} more recent ${platform} activity\n`;
      }
    });

    systemPrompt += `\nWhen talking about music/shows/content, weave in these specifics naturally. Don't say "looking at my data" - just reference them like you remember them.\n`;
  } else {
    systemPrompt += `\nNo recent activity data loaded. Respond based on general personality and communication style.\n`;
  }

  // Add context-specific instructions
  systemPrompt += `\nCONVERSATION CONTEXT: ${context}\n`;
  systemPrompt += `TWIN TYPE: ${twinType}\n\n`;

  // Add behavioral guidelines
  systemPrompt += `HOW TO RESPOND:\n`;

  if (mode === 'twin') {
    systemPrompt += `- Always use second person direct address: "Your music taste shows...", "Your preferences indicate...", "Based on your listening habits..."\n`;
    systemPrompt += `- Reference specific tracks/artists/content naturally: "You've been listening to [artist] a lot lately..."\n`;
    systemPrompt += `- Be insightful and observant, like someone who knows them well\n`;
    systemPrompt += `- Use proper capitalization and professional tone while staying conversational\n`;
    systemPrompt += `- NEVER use first person ("I", "my", "me") or third person ("${userName}'s", "their") - always address them directly as "you", "your"\n`;
    systemPrompt += `- Example: Instead of "I love indie rock" or "${userName}'s taste leans toward indie rock", say "Your taste leans heavily toward indie rock"\n`;
  } else if (mode === 'tutor') {
    systemPrompt += `- Point out patterns directly: "I've noticed you tend to..."\n`;
    systemPrompt += `- Ask questions that make them reflect on their behaviors\n`;
    systemPrompt += `- Be encouraging but honest in your assessments\n`;
  } else if (mode === 'analyst') {
    systemPrompt += `- Call out interesting correlations in your data\n`;
    systemPrompt += `- Use numbers when they support the narrative\n`;
    systemPrompt += `- Stay objective and analytical while remaining engaging\n`;
  }

  systemPrompt += `\nIf you don't have enough data to answer something, acknowledge it: "I don't have enough information about your [topic] to provide insights."`;

  return systemPrompt;
}

/**
 * Invalidate cached personality profile (force refresh on next request)
 */
export async function invalidateProfile(userId) {
  try {
    const { error } = await supabase
      .from('twin_personality_profiles')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;

    console.log(`[TwinPersonality] Profile invalidated for user ${userId}`);
    return { success: true };
  } catch (error) {
    console.error('[TwinPersonality] Error invalidating profile:', error);
    throw error;
  }
}
