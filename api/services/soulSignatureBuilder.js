/**
 * Soul Signature Builder
 * Builds authentic soul signatures from extracted platform data
 */

import { createClient } from '@supabase/supabase-js';
import { complete, TIER_ANALYSIS } from './llmGateway.js';
import wearableFeatureExtractor from './featureExtractors/wearableFeatureExtractor.js';
import professionalUniverseBuilder from './professionalUniverseBuilder.js';

// Use SUPABASE_URL (backend) - fallback to VITE_ prefix for compatibility
// Lazy initialization to avoid crashes if env vars not loaded yet
let supabase = null;
function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}


class SoulSignatureBuilder {
  /**
   * Build complete soul signature from all extracted data
   */
  async buildSoulSignature(userId) {
    console.log(`[SoulSignature] Building soul signature for user: ${userId}`);

    try {
      // 1. Get all extracted data
      const extractedData = await this.getExtractedData(userId);

      if (!extractedData || Object.keys(extractedData).length === 0) {
        console.warn('[SoulSignature] No extracted data found');
        return {
          success: false,
          message: 'No platform data available. Please connect platforms first.',
          soulSignature: null
        };
      }

      // 2. Get style profile (if exists)
      const styleProfile = await this.getStyleProfile(userId);

      // 3. Analyze music taste (Spotify)
      const musicSignature = await this.analyzeMusicSignature(extractedData.spotify);

      // 4. Analyze communication patterns (Discord, GitHub, Reddit)
      const communicationSignature = await this.analyzeCommunicationSignature(
        extractedData.discord,
        extractedData.github,
        extractedData.reddit
      );

      // 5. Extract interests and curiosities (all platforms)
      const interests = await this.extractInterests(extractedData);

      // 6. Analyze viewing patterns (YouTube)
      const viewingSignature = await this.analyzeViewingSignature(extractedData.youtube);

      // 7. Analyze discussion patterns (Reddit)
      const discussionSignature = await this.analyzeDiscussionSignature(extractedData.reddit);

      // 7b. Analyze streaming/gaming patterns (Twitch)
      const twitchSignature = await this.analyzeTwitchSignature(extractedData.twitch);

      // 8. Analyze wearable/health data (Garmin, Polar, Suunto, Whoop, Apple Health)
      const wearableSignature = await this.analyzeWearableSignature(userId);

      // 8b. Analyze journal entries (self-perception data)
      const journalSignature = await this.analyzeJournalSignature(userId);

      // 8c. Analyze web browsing patterns (extension data)
      const browsingSignature = await this.analyzeWebBrowsingSignature(userId);

      // 9. Build professional universe (LinkedIn + Origin + GitHub + Calendar)
      const professionalUniverse = await professionalUniverseBuilder.buildProfessionalUniverse(userId);

      // 10. Use AI to generate personality insights
      const personalityInsights = await this.generatePersonalityInsights(
        extractedData,
        styleProfile,
        musicSignature,
        communicationSignature,
        viewingSignature,
        discussionSignature,
        wearableSignature,
        professionalUniverse,
        journalSignature,
        browsingSignature
      );

      // 9. Extract common phrases and analogies
      const languagePatterns = await this.extractLanguagePatterns(extractedData);

      // 11. Build complete soul signature
      const soulSignature = {
        personality_traits: personalityInsights.traits,
        communication_style: communicationSignature.style || styleProfile?.communication_style || 'balanced',
        music_taste: musicSignature,
        viewing_patterns: viewingSignature,
        twitch_signature: twitchSignature,
        discussion_style: discussionSignature,
        health_signature: wearableSignature,  // Wearable-derived insights
        journal_signature: journalSignature,  // Self-perception from journal entries
        browsing_signature: browsingSignature,  // Web browsing patterns from extension
        professional_universe: professionalUniverse?.available ? professionalUniverse : null,
        origin_context: professionalUniverse?.origin_context || null,
        interests: interests,
        common_phrases: languagePatterns.phrases,
        favorite_analogies: languagePatterns.analogies,
        uniqueness_markers: personalityInsights.uniqueness_markers,
        authenticity_score: this.calculateAuthenticityScore(extractedData, wearableSignature, professionalUniverse, journalSignature, browsingSignature, viewingSignature, twitchSignature),
        data_sources: [
          ...Object.keys(extractedData),
          ...(wearableSignature?.available ? ['wearable'] : []),
          ...(professionalUniverse?.data_sources || []),
          ...(journalSignature?.available ? ['journal'] : []),
          ...(browsingSignature?.available ? ['web_browsing'] : [])
        ],
        generated_at: new Date().toISOString()
      };

      // 9. Store soul signature
      await this.storeSoulSignature(userId, soulSignature);

      console.log('[SoulSignature] Soul signature built successfully');
      return {
        success: true,
        soulSignature
      };
    } catch (error) {
      console.error('[SoulSignature] Error building soul signature:', error);
      throw error;
    }
  }

  /**
   * Get all extracted data from database
   */
  async getExtractedData(userId) {
    try {
      const { data, error } = await getSupabaseClient()
        .from('user_platform_data')
        .select('platform, data_type, raw_data')
        .eq('user_id', userId);

      if (error) {
        console.error('[SoulSignature] Error fetching data:', error);
        return {};
      }

      if (!data || data.length === 0) {
        return {};
      }

      // Group data by platform
      const groupedData = {};
      for (const item of data) {
        if (!groupedData[item.platform]) {
          groupedData[item.platform] = [];
        }
        groupedData[item.platform].push({
          type: item.data_type,
          data: item.raw_data
        });
      }

      return groupedData;
    } catch (error) {
      console.error('[SoulSignature] Exception fetching data:', error);
      return {};
    }
  }

  /**
   * Get user's style profile
   */
  async getStyleProfile(userId) {
    try {
      const { data, error } = await getSupabaseClient()
        .from('user_style_profile')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        return null;
      }

      return data;
    } catch (error) {
      console.error('[SoulSignature] Error fetching style profile:', error);
      return null;
    }
  }

  /**
   * Analyze music signature from Spotify data
   */
  async analyzeMusicSignature(spotifyData) {
    if (!spotifyData || spotifyData.length === 0) {
      return { no_data: true };
    }

    try {
      // Extract top genres
      const topArtists = spotifyData.filter(item => item.type === 'top_artist');
      const allGenres = topArtists.flatMap(item => item.data.genres || []);
      const genreCounts = {};
      allGenres.forEach(genre => {
        genreCounts[genre] = (genreCounts[genre] || 0) + 1;
      });

      const topGenres = Object.entries(genreCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([genre, count]) => ({ genre, count }));

      // Analyze listening patterns
      const recentlyPlayed = spotifyData.filter(item => item.type === 'recently_played');
      const playedAt = recentlyPlayed.map(item => new Date(item.data.played_at));

      // Calculate listening times
      const hourCounts = {};
      playedAt.forEach(date => {
        const hour = date.getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      });

      const peakHours = Object.entries(hourCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([hour]) => parseInt(hour));

      // Diversity score (how varied are the genres)
      const diversityScore = Object.keys(genreCounts).length / Math.max(allGenres.length, 1);

      return {
        top_genres: topGenres.map(g => g.genre),
        music_diversity: diversityScore,
        peak_listening_hours: peakHours,
        total_tracks_analyzed: spotifyData.length,
        listening_mood: diversityScore > 0.3 ? 'eclectic' : 'focused'
      };
    } catch (error) {
      console.error('[SoulSignature] Error analyzing music:', error);
      return {};
    }
  }

  /**
   * Analyze communication signature
   */
  async analyzeCommunicationSignature(discordData, githubData, redditData) {
    const patterns = {
      style: 'balanced',
      platforms_used: [],
      engagement_level: 'moderate'
    };

    if (discordData && discordData.length > 0) {
      patterns.platforms_used.push('discord');
      // Discord analysis would go here
      const guilds = discordData.filter(item => item.type === 'guild');
      if (guilds.length > 10) {
        patterns.engagement_level = 'high';
      }
    }

    if (githubData && githubData.length > 0) {
      patterns.platforms_used.push('github');
      // GitHub analysis would go here
      const commits = githubData.filter(item => item.type === 'commit');
      if (commits.length > 50) {
        patterns.engagement_level = 'high';
      }
    }

    if (redditData && redditData.length > 0) {
      patterns.platforms_used.push('reddit');
      const comments = redditData.filter(item => item.type === 'comment');
      if (comments.length > 100) {
        patterns.engagement_level = 'very high';
        patterns.style = 'discussion-driven';
      }
    }

    return patterns;
  }

  /**
   * Extract interests from all data
   */
  async extractInterests(extractedData) {
    const interests = [];

    // From Spotify
    if (extractedData.spotify) {
      const topArtists = extractedData.spotify
        .filter(item => item.type === 'top_artist')
        .slice(0, 5);

      topArtists.forEach(item => {
        if (item.data.genres) {
          item.data.genres.forEach(genre => {
            if (!interests.includes(genre)) {
              interests.push(genre);
            }
          });
        }
      });
    }

    // From GitHub
    if (extractedData.github) {
      const repos = extractedData.github.filter(item => item.type === 'repository');
      repos.forEach(item => {
        if (item.data.language && !interests.includes(item.data.language)) {
          interests.push(item.data.language);
        }
      });
    }

    // From Reddit
    if (extractedData.reddit) {
      const subreddits = extractedData.reddit.filter(item => item.type === 'subreddit').slice(0, 10);
      subreddits.forEach(item => {
        const name = item.data.name;
        if (name && !interests.includes(name)) {
          interests.push(`r/${name}`);
        }
      });
    }

    // From YouTube (handles both Nango format, legacy format, and extension data)
    if (extractedData.youtube) {
      // Nango format: { type: 'subscriptions', data: { items: [...] } }
      const subsRow = extractedData.youtube.find(item => item.type === 'subscriptions');
      if (subsRow?.data?.items) {
        subsRow.data.items.slice(0, 10).forEach(sub => {
          const channel = sub.snippet?.title;
          if (channel && !interests.includes(channel)) {
            interests.push(channel);
          }
        });
      } else {
        // Legacy format: { type: 'subscription', data: { channel_title: '...' } }
        const subscriptions = extractedData.youtube.filter(item => item.type === 'subscription').slice(0, 10);
        subscriptions.forEach(item => {
          const channel = item.data.channel_title;
          if (channel && !interests.includes(channel)) {
            interests.push(channel);
          }
        });
      }
      // Extension: watched channels
      const extensionWatches = extractedData.youtube.filter(item => item.type === 'extension_video_watch' && item.data?.action === 'end');
      const channelCounts = {};
      extensionWatches.forEach(w => {
        if (w.data?.channel) channelCounts[w.data.channel] = (channelCounts[w.data.channel] || 0) + 1;
      });
      Object.entries(channelCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([ch]) => {
        if (!interests.includes(ch)) interests.push(ch);
      });
      // Extension: search queries reveal curiosity
      const extensionSearches = extractedData.youtube.filter(item => item.type === 'extension_search');
      extensionSearches.slice(0, 5).forEach(s => {
        const query = s.data?.query;
        if (query && !interests.includes(query)) interests.push(query);
      });
    }

    // From Web Browsing (extension data - authentic private interests)
    if (extractedData.web) {
      const webVisits = extractedData.web.filter(item =>
        ['extension_page_visit', 'extension_article_read'].includes(item.type)
      );
      // Extract topics from browsing metadata
      const topicCounts = {};
      webVisits.forEach(item => {
        (item.data?.metadata?.topics || []).forEach(t => {
          topicCounts[t] = (topicCounts[t] || 0) + 1;
        });
      });
      Object.entries(topicCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .forEach(([topic]) => {
          if (!interests.includes(topic)) {
            interests.push(topic);
          }
        });
    }

    // From Twitch (API + extension data)
    if (extractedData.twitch) {
      const followedRow = extractedData.twitch.find(item => item.type === 'followedChannels');
      const followedChannels = followedRow?.data?.data || [];
      const gameCounts = {};
      followedChannels.forEach(c => {
        if (c.game_name) {
          gameCounts[c.game_name] = (gameCounts[c.game_name] || 0) + 1;
        }
      });
      // Extension: watched stream games
      const extensionStreams = extractedData.twitch.filter(item => item.type === 'extension_stream_watch' && item.data?.action === 'end');
      extensionStreams.forEach(w => {
        if (w.data?.gameName) gameCounts[w.data.gameName] = (gameCounts[w.data.gameName] || 0) + 1;
      });
      // Extension: browsed categories
      const extensionBrowses = extractedData.twitch.filter(item => item.type === 'extension_browse');
      extensionBrowses.forEach(b => {
        if (b.data?.category && b.data.category !== 'directory_home') {
          gameCounts[b.data.category] = (gameCounts[b.data.category] || 0) + 1;
        }
      });
      // Add top games as interests
      Object.entries(gameCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([game]) => {
          if (!interests.includes(game)) {
            interests.push(game);
          }
        });
    }

    return interests;
  }

  /**
   * Generate personality insights using AI
   */
  async generatePersonalityInsights(extractedData, styleProfile, musicSignature, communicationSignature, viewingSignature, discussionSignature, wearableSignature, professionalUniverse, journalSignature = null, browsingSignature = null) {
    try {
      // Build context from data
      const context = this.buildAIContext(extractedData, styleProfile, musicSignature, communicationSignature, professionalUniverse, journalSignature, browsingSignature, viewingSignature);

      // Call Claude to generate insights
      const result = await complete({
        tier: TIER_ANALYSIS,
        messages: [{
          role: 'user',
          content: `Analyze this person's digital footprint and provide personality insights in JSON format.

Context:
${context}

Provide a JSON response with:
1. traits: Big Five personality traits (openness, conscientiousness, extraversion, agreeableness, neuroticism) as 0-1 values
2. uniqueness_markers: Array of 3-5 unique characteristics that make this person distinct
3. core_values: Array of 3-5 inferred core values

Respond ONLY with valid JSON, no explanation.`
        }],
        maxTokens: 1500,
        serviceName: 'soulSignatureBuilder'
      });

      // Parse AI response - strip markdown code fences if present
      let responseText = result.content.trim();
      if (responseText.startsWith('```')) {
        responseText = responseText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      }
      const insights = JSON.parse(responseText);

      return insights;
    } catch (error) {
      console.error('[SoulSignature] Error generating AI insights:', error);

      // Fallback to style profile or defaults
      return {
        traits: styleProfile?.personality_traits || {
          openness: 0.7,
          conscientiousness: 0.6,
          extraversion: 0.5,
          agreeableness: 0.7,
          neuroticism: 0.4
        },
        uniqueness_markers: ['creative', 'tech-savvy', 'curious'],
        core_values: ['authenticity', 'growth', 'connection']
      };
    }
  }

  /**
   * Build context for AI analysis
   */
  buildAIContext(extractedData, styleProfile, musicSignature, communicationSignature, professionalUniverse = null, journalSignature = null, browsingSignature = null, viewingSignature = null) {
    let context = '';

    // Music taste
    if (musicSignature && musicSignature.top_genres) {
      context += `Music taste: ${musicSignature.top_genres.join(', ')}. `;
      context += `Listening style: ${musicSignature.listening_mood}. `;
    }

    // YouTube/Twitch viewing patterns (enriched with extension data)
    if (viewingSignature && !viewingSignature.no_data) {
      if (viewingSignature.top_channels?.length > 0) {
        context += `YouTube channels: ${viewingSignature.top_channels.slice(0, 8).join(', ')}. `;
      }
      if (viewingSignature.viewing_style) {
        context += `Viewing style: ${viewingSignature.viewing_style}. `;
      }
      if (viewingSignature.has_extension_data) {
        context += `Watched ${viewingSignature.extension_watch_count} videos (${viewingSignature.completion_rate}% completion rate, avg ${Math.round((viewingSignature.avg_watch_duration_seconds || 0) / 60)}min). `;
        if (viewingSignature.search_queries?.length > 0) {
          context += `YouTube searches: ${viewingSignature.search_queries.slice(0, 5).join(', ')}. `;
        }
      }
    }

    // Communication
    if (communicationSignature) {
      context += `Communication platforms: ${communicationSignature.platforms_used.join(', ')}. `;
      context += `Engagement level: ${communicationSignature.engagement_level}. `;
    }

    // Style profile
    if (styleProfile) {
      context += `Writing style: ${styleProfile.communication_style}. `;
      if (styleProfile.vocabulary_richness) {
        context += `Vocabulary richness: ${(styleProfile.vocabulary_richness * 100).toFixed(0)}%. `;
      }
    }

    // Professional universe
    if (professionalUniverse?.available) {
      if (professionalUniverse.career_trajectory?.current_stage) {
        context += `Career stage: ${professionalUniverse.career_trajectory.current_stage}. `;
      }
      if (professionalUniverse.career_trajectory?.industry) {
        context += `Industry: ${professionalUniverse.career_trajectory.industry}. `;
      }
      if (professionalUniverse.professional_style?.work_preference) {
        context += `Work style: ${professionalUniverse.professional_style.work_preference}. `;
      }
      if (professionalUniverse.industry_expertise?.technical_skills?.length > 0) {
        context += `Technical skills: ${professionalUniverse.industry_expertise.technical_skills.join(', ')}. `;
      }
      if (professionalUniverse.growth_mindset?.overall) {
        context += `Growth mindset: ${professionalUniverse.growth_mindset.overall}. `;
      }
    }

    // Origin context (user-provided values and background)
    if (professionalUniverse?.origin_context) {
      const origin = professionalUniverse.origin_context;
      if (origin.values?.core_values?.length > 0) {
        context += `Core values: ${origin.values.core_values.join(', ')}. `;
      }
      if (origin.education?.learning_style) {
        context += `Learning style: ${origin.education.learning_style}. `;
      }
      if (origin.geographic?.cultural_influences?.length > 0) {
        context += `Cultural influences: ${origin.geographic.cultural_influences.join(', ')}. `;
      }
      if (origin.values?.life_motto) {
        context += `Life motto: "${origin.values.life_motto}". `;
      }
    }

    // Journal self-perception (first-person data - how user sees themselves)
    if (journalSignature?.available) {
      if (journalSignature.topThemes?.length > 0) {
        context += `Journal themes (what they write about): ${journalSignature.topThemes.slice(0, 5).join(', ')}. `;
      }
      if (journalSignature.dominantEmotions?.length > 0) {
        const emotionStr = journalSignature.dominantEmotions.slice(0, 4)
          .map(e => `${e.emotion} (${(e.avgIntensity * 100).toFixed(0)}%)`)
          .join(', ');
        context += `Dominant emotions from journal: ${emotionStr}. `;
      }
      if (journalSignature.personalitySignals?.length > 0) {
        const signalStr = journalSignature.personalitySignals.slice(0, 4)
          .map(s => `${s.direction} ${s.trait}`)
          .join(', ');
        context += `Self-revealed personality signals: ${signalStr}. `;
      }
      if (journalSignature.selfPerception?.values?.length > 0) {
        context += `Values expressed in journal: ${journalSignature.selfPerception.values.slice(0, 5).join(', ')}. `;
      }
      if (journalSignature.selfPerception?.selfDescriptions?.length > 0) {
        context += `How they see themselves: "${journalSignature.selfPerception.selfDescriptions[0]}". `;
      }
      if (journalSignature.avgEnergy) {
        context += `Average self-reported energy: ${journalSignature.avgEnergy.toFixed(1)}/5. `;
      }
      context += `Journal entries analyzed: ${journalSignature.analyzedCount}. `;
    }

    // Web browsing patterns (from browser extension - authentic private behavior)
    if (browsingSignature?.available) {
      if (browsingSignature.topCategories?.length > 0) {
        context += `Web browsing interests: ${browsingSignature.topCategories.slice(0, 5).map(c => c.category).join(', ')}. `;
      }
      if (browsingSignature.topDomains?.length > 0) {
        context += `Most visited sites: ${browsingSignature.topDomains.slice(0, 6).map(d => d.domain).join(', ')}. `;
      }
      if (browsingSignature.topTopics?.length > 0) {
        context += `Recurring browsing topics: ${browsingSignature.topTopics.slice(0, 8).join(', ')}. `;
      }
      if (browsingSignature.readingStyle) {
        context += `Reading behavior: ${browsingSignature.readingStyle}. `;
      }
      if (browsingSignature.recentSearches?.length > 0) {
        context += `Recent searches reveal curiosity about: ${browsingSignature.recentSearches.slice(0, 5).join(', ')}. `;
      }
      context += `Web pages tracked: ${browsingSignature.totalPageVisits || 0}. `;
    }

    // Data sources
    const allSources = [...Object.keys(extractedData)];
    if (journalSignature?.available) allSources.push('journal');
    if (browsingSignature?.available) allSources.push('web_browsing');
    context += `Data sources analyzed: ${allSources.join(', ')}. `;

    return context;
  }

  /**
   * Extract language patterns (phrases and analogies)
   */
  async extractLanguagePatterns(extractedData) {
    const patterns = {
      phrases: [],
      analogies: []
    };

    // Extract from GitHub commit messages
    if (extractedData.github) {
      const commits = extractedData.github.filter(item => item.type === 'commit');

      // Find common commit message patterns
      const messages = commits.map(c => c.data.message).filter(m => m && m.length > 10);

      // Simple phrase extraction (first 50 chars of frequent patterns)
      const uniqueMessages = [...new Set(messages)];
      patterns.phrases = uniqueMessages.slice(0, 5).map(m => m.substring(0, 50));
    }

    // Default fallback
    if (patterns.phrases.length === 0) {
      patterns.phrases = ['Working on something interesting', 'Always learning'];
    }

    if (patterns.analogies.length === 0) {
      patterns.analogies = ['Like searching in the branches for what we find in the roots'];
    }

    return patterns;
  }

  /**
   * Analyze YouTube viewing signature
   */
  async analyzeViewingSignature(youtubeData) {
    if (!youtubeData || youtubeData.length === 0) {
      return { no_data: true };
    }

    try {
      // Extract API-sourced data
      const subscriptions = youtubeData.filter(item => item.type === 'subscription');
      const channelTitles = subscriptions.map(s => s.data.channel_title);
      const likedVideos = youtubeData.filter(item => item.type === 'liked_video');
      const categories = new Set(likedVideos.map(v => v.data.category_id).filter(Boolean));
      const playlists = youtubeData.filter(item => item.type === 'playlist');

      // Extract extension-sourced watch data
      const extensionWatches = youtubeData.filter(item => item.type === 'extension_video_watch');
      const completedWatches = extensionWatches.filter(w => w.data?.action === 'end');
      const extensionSearches = youtubeData.filter(item => item.type === 'extension_search');
      const extensionRecs = youtubeData.filter(item => item.type === 'extension_recommendation');

      // Analyze watch patterns from extension
      const watchedChannels = {};
      const watchDurations = [];
      completedWatches.forEach(w => {
        if (w.data?.channel) {
          watchedChannels[w.data.channel] = (watchedChannels[w.data.channel] || 0) + 1;
        }
        if (w.data?.watchDurationSeconds) {
          watchDurations.push(w.data.watchDurationSeconds);
        }
      });
      const topWatchedChannels = Object.entries(watchedChannels)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([ch]) => ch);

      const avgWatchDuration = watchDurations.length > 0
        ? Math.round(watchDurations.reduce((a, b) => a + b, 0) / watchDurations.length)
        : 0;
      const completionRate = completedWatches.length > 0
        ? Math.round(completedWatches.filter(w => w.data?.completed).length / completedWatches.length * 100)
        : 0;

      // Combine channels from API + extension
      const allChannels = [...new Set([...channelTitles.slice(0, 10), ...topWatchedChannels])].slice(0, 15);
      const searchQueries = extensionSearches.map(s => s.data?.query).filter(Boolean).slice(0, 10);

      return {
        subscription_count: subscriptions.length,
        liked_videos_count: likedVideos.length,
        playlists_count: playlists.length,
        top_channels: allChannels,
        content_categories: Array.from(categories),
        viewing_style: (likedVideos.length + completedWatches.length) > 100 ? 'avid watcher' :
          (likedVideos.length + completedWatches.length) > 20 ? 'regular viewer' : 'casual viewer',
        // Extension-enriched fields
        extension_watch_count: completedWatches.length,
        avg_watch_duration_seconds: avgWatchDuration,
        completion_rate: completionRate,
        search_queries: searchQueries,
        has_extension_data: completedWatches.length > 0
      };
    } catch (error) {
      console.error('[SoulSignature] Error analyzing YouTube:', error);
      return {};
    }
  }

  /**
   * Analyze Twitch streaming/gaming signature
   */
  async analyzeTwitchSignature(twitchData) {
    if (!twitchData || twitchData.length === 0) {
      return { no_data: true };
    }

    try {
      // Extract API-sourced data
      const followedRow = twitchData.find(item => item.type === 'followedChannels');
      const followedChannels = followedRow?.data?.data || [];
      const userRow = twitchData.find(item => item.type === 'user');
      const userData = userRow?.data?.data?.[0] || {};

      // Collect unique game categories from API
      const gameCounts = {};
      followedChannels.forEach(c => {
        if (c.game_name) {
          gameCounts[c.game_name] = (gameCounts[c.game_name] || 0) + 1;
        }
      });

      // Extract extension-sourced stream watch data
      const extensionStreamWatches = twitchData.filter(item => item.type === 'extension_stream_watch');
      const completedStreams = extensionStreamWatches.filter(w => w.data?.action === 'end');
      const extensionBrowses = twitchData.filter(item => item.type === 'extension_browse');
      const extensionClips = twitchData.filter(item => item.type === 'extension_clip_view');
      const extensionChat = twitchData.filter(item => item.type === 'extension_chat');

      // Merge extension game data into gameCounts
      completedStreams.forEach(w => {
        if (w.data?.gameName) {
          gameCounts[w.data.gameName] = (gameCounts[w.data.gameName] || 0) + 1;
        }
      });

      // Analyze watch durations from extension
      const streamDurations = completedStreams
        .map(w => w.data?.watchDurationSeconds)
        .filter(d => d && d > 0);
      const avgStreamDuration = streamDurations.length > 0
        ? Math.round(streamDurations.reduce((a, b) => a + b, 0) / streamDurations.length)
        : 0;

      // Watched channels from extension
      const watchedChannelCounts = {};
      completedStreams.forEach(w => {
        if (w.data?.channelName) {
          watchedChannelCounts[w.data.channelName] = (watchedChannelCounts[w.data.channelName] || 0) + 1;
        }
      });
      const topWatchedChannels = Object.entries(watchedChannelCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([ch]) => ch);

      // Browse categories from extension
      const browsedCategories = extensionBrowses
        .map(b => b.data?.category)
        .filter(c => c && c !== 'directory_home');

      const topGames = Object.entries(gameCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([game]) => game);

      const channelNames = followedChannels
        .map(c => c.broadcaster_name || c.broadcaster_login)
        .filter(Boolean)
        .slice(0, 15);

      // Combine channels from API + extension
      const allChannels = [...new Set([...channelNames, ...topWatchedChannels])].slice(0, 20);

      // Chat engagement from extension
      const totalChatDuration = extensionChat
        .map(c => c.data?.chatDurationSeconds || 0)
        .reduce((a, b) => a + b, 0);

      return {
        followed_channel_count: followedChannels.length,
        top_channels: allChannels,
        top_games: topGames,
        game_diversity: Object.keys(gameCounts).length,
        is_broadcaster: !!userData.broadcaster_type,
        streaming_style: (followedChannels.length + completedStreams.length) > 50 ? 'avid follower' :
          (followedChannels.length + completedStreams.length) > 20 ? 'active follower' : 'selective follower',
        // Extension-enriched fields
        extension_stream_count: completedStreams.length,
        avg_stream_duration_seconds: avgStreamDuration,
        clips_viewed: extensionClips.length,
        browsed_categories: browsedCategories,
        chat_engagement_seconds: totalChatDuration,
        has_extension_data: completedStreams.length > 0
      };
    } catch (error) {
      console.error('[SoulSignature] Error analyzing Twitch:', error);
      return {};
    }
  }

  /**
   * Analyze Reddit discussion signature
   */
  async analyzeDiscussionSignature(redditData) {
    if (!redditData || redditData.length === 0) {
      return { no_data: true };
    }

    try {
      // Extract subreddits
      const subreddits = redditData.filter(item => item.type === 'subreddit');
      const subredditNames = subreddits.map(s => s.data.name);

      // Extract comments
      const comments = redditData.filter(item => item.type === 'comment');
      const avgCommentLength = comments.length > 0
        ? comments.reduce((sum, c) => sum + (c.data.body?.length || 0), 0) / comments.length
        : 0;

      // Extract posts
      const posts = redditData.filter(item => item.type === 'post');
      const totalKarma = redditData.find(item => item.type === 'user_profile')?.data.total_karma || 0;

      return {
        subreddit_count: subreddits.length,
        top_subreddits: subredditNames.slice(0, 10),
        comment_count: comments.length,
        post_count: posts.length,
        avg_comment_length: avgCommentLength,
        total_karma: totalKarma,
        discussion_style: avgCommentLength > 200 ? 'detailed' : avgCommentLength > 50 ? 'balanced' : 'concise',
        engagement_type: comments.length > posts.length ? 'commenter' : 'poster'
      };
    } catch (error) {
      console.error('[SoulSignature] Error analyzing Reddit:', error);
      return {};
    }
  }

  /**
   * Analyze wearable/health signature using the wearable feature extractor
   * @param {string} userId - User ID to analyze
   * @returns {Object} Wearable-derived personality insights
   */
  async analyzeWearableSignature(userId) {
    try {
      console.log('[SoulSignature] Analyzing wearable data for user:', userId);

      // Use the wearable feature extractor to get personality insights
      const wearableSummary = await wearableFeatureExtractor.getPersonalitySummary(userId);

      if (!wearableSummary.available) {
        console.log('[SoulSignature] No wearable data available');
        return { available: false, message: wearableSummary.message };
      }

      console.log('[SoulSignature] Wearable features extracted:', {
        hasFeatures: !!wearableSummary.features,
        hasPersonality: !!wearableSummary.personality
      });

      return {
        available: true,
        features: wearableSummary.features,
        personality: wearableSummary.personality,
        insights: {
          conscientiousness: wearableSummary.personality?.conscientiousness?.insights || [],
          neuroticism: wearableSummary.personality?.neuroticism?.insights || [],
          extraversion: wearableSummary.personality?.extraversion?.insights || []
        },
        health_metrics: {
          avg_steps: wearableSummary.features?.averageSteps,
          avg_sleep_hours: wearableSummary.features?.averageSleepDuration,
          resting_hr: wearableSummary.features?.restingHeartRate,
          hrv: wearableSummary.features?.heartRateVariability,
          workout_frequency: wearableSummary.features?.workoutRegularity
        },
        dataSource: 'wearable',
        lastUpdated: wearableSummary.lastUpdated
      };
    } catch (error) {
      console.error('[SoulSignature] Error analyzing wearable data:', error);
      return { available: false, error: error.message };
    }
  }

  /**
   * Analyze web browsing patterns from extension data
   * Browsing data reveals authentic private interests and curiosities
   */
  async analyzeWebBrowsingSignature(userId) {
    try {
      console.log('[SoulSignature] Analyzing web browsing data for user:', userId);

      const db = getSupabaseClient();

      // Get web browsing data from extension (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: webData, error } = await db
        .from('user_platform_data')
        .select('raw_data, data_type, extracted_at')
        .eq('user_id', userId)
        .eq('platform', 'web')
        .gte('extracted_at', thirtyDaysAgo.toISOString())
        .order('extracted_at', { ascending: false })
        .limit(500);

      if (error || !webData || webData.length === 0) {
        console.log('[SoulSignature] No web browsing data available');
        return { available: false, message: 'No web browsing data' };
      }

      // Page visits and article reads
      const pageVisits = webData.filter(d =>
        ['extension_page_visit', 'extension_article_read', 'extension_web_video'].includes(d.data_type)
      );

      // Search queries
      const searchEvents = webData.filter(d => d.data_type === 'extension_search_query');
      const recentSearches = searchEvents
        .slice(0, 20)
        .map(d => d.raw_data?.searchQuery)
        .filter(Boolean);

      // Top categories
      const categoryCounts = {};
      pageVisits.forEach(d => {
        const cat = d.raw_data?.category || 'Other';
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      });
      const totalVisits = pageVisits.length || 1;
      const topCategories = Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([category, count]) => ({
          category,
          count,
          percentage: Math.round((count / totalVisits) * 100)
        }));

      // Top domains
      const domainCounts = {};
      pageVisits.forEach(d => {
        const domain = d.raw_data?.domain;
        if (domain) domainCounts[domain] = (domainCounts[domain] || 0) + 1;
      });
      const topDomains = Object.entries(domainCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([domain, count]) => ({ domain, count }));

      // Top topics from metadata
      const topicCounts = {};
      pageVisits.forEach(d => {
        (d.raw_data?.metadata?.topics || []).forEach(t => {
          topicCounts[t] = (topicCounts[t] || 0) + 1;
        });
      });
      const topTopics = Object.entries(topicCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([topic]) => topic);

      // Reading behavior analysis
      const engagementScores = pageVisits
        .map(d => d.raw_data?.engagement?.engagementScore)
        .filter(s => s != null);
      const avgEngagement = engagementScores.length > 0
        ? Math.round(engagementScores.reduce((a, b) => a + b, 0) / engagementScores.length)
        : null;

      const readingBehaviors = {};
      pageVisits.forEach(d => {
        const behavior = d.raw_data?.engagement?.readingBehavior;
        if (behavior) readingBehaviors[behavior] = (readingBehaviors[behavior] || 0) + 1;
      });
      const dominantBehavior = Object.entries(readingBehaviors)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

      const timeOnPages = pageVisits
        .map(d => d.raw_data?.engagement?.timeOnPage)
        .filter(t => t != null && t > 0);
      const avgTimeOnPage = timeOnPages.length > 0
        ? Math.round(timeOnPages.reduce((a, b) => a + b, 0) / timeOnPages.length)
        : null;

      // Derive reading style label
      let readingStyle = 'varied';
      if (dominantBehavior === 'deep_reader') readingStyle = 'deep reader - spends time absorbing content';
      else if (dominantBehavior === 'skimmer') readingStyle = 'skimmer - scans for key information quickly';
      else if (dominantBehavior === 'engaged_reader') readingStyle = 'engaged reader - moderate depth';
      else if (avgTimeOnPage && avgTimeOnPage > 120) readingStyle = 'thorough - averages over 2 min per page';
      else if (avgTimeOnPage && avgTimeOnPage < 30) readingStyle = 'scanner - quick passes through content';

      console.log(`[SoulSignature] Browsing signature: ${pageVisits.length} visits, ${searchEvents.length} searches, ${topCategories.length} categories, ${topTopics.length} topics`);

      return {
        available: true,
        totalPageVisits: pageVisits.length,
        totalSearches: searchEvents.length,
        topCategories,
        topDomains,
        topTopics,
        recentSearches,
        readingStyle,
        avgEngagement,
        avgTimeOnPage,
        dominantBehavior,
        dataSource: 'browser_extension',
        lastUpdated: webData[0]?.extracted_at
      };
    } catch (error) {
      console.error('[SoulSignature] Error analyzing web browsing:', error);
      return { available: false, error: error.message };
    }
  }

  /**
   * Analyze journal entries for self-perception signals
   * Journal data is first-person data - how the user sees themselves
   */
  async analyzeJournalSignature(userId) {
    try {
      console.log('[SoulSignature] Analyzing journal entries for user:', userId);

      const db = getSupabaseClient();

      // Get recent journal analyses (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: analyses, error: analysesError } = await db
        .from('journal_analyses')
        .select('themes, emotions, personality_signals, self_perception, summary, created_at')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      if (analysesError || !analyses || analyses.length === 0) {
        console.log('[SoulSignature] No journal analyses found');
        return { available: false, message: 'No journal analyses available' };
      }

      // Get mood/energy stats from entries
      const { data: entries, error: entriesError } = await db
        .from('journal_entries')
        .select('mood, energy_level, created_at')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo.toISOString());

      // Aggregate personality signals across all entries
      const traitSignals = {};
      const allThemes = {};
      const allEmotions = {};
      const allValues = new Set();
      const selfPerceptions = [];

      analyses.forEach(a => {
        // Aggregate personality signals (Big Five traits)
        (a.personality_signals || []).forEach(signal => {
          const key = `${signal.trait}_${signal.direction}`;
          if (!traitSignals[key]) {
            traitSignals[key] = { trait: signal.trait, direction: signal.direction, count: 0, evidence: [] };
          }
          traitSignals[key].count++;
          if (signal.evidence) traitSignals[key].evidence.push(signal.evidence);
        });

        // Aggregate themes
        (a.themes || []).forEach(t => {
          allThemes[t] = (allThemes[t] || 0) + 1;
        });

        // Aggregate emotions
        (a.emotions || []).forEach(e => {
          if (!allEmotions[e.emotion]) allEmotions[e.emotion] = [];
          allEmotions[e.emotion].push(e.intensity);
        });

        // Collect values and self-perceptions
        if (a.self_perception?.values_expressed) {
          a.self_perception.values_expressed.forEach(v => allValues.add(v));
        }
        if (a.self_perception?.how_they_see_themselves) {
          selfPerceptions.push(a.self_perception.how_they_see_themselves);
        }
      });

      // Top themes
      const topThemes = Object.entries(allThemes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([theme, count]) => ({ theme, count }));

      // Dominant emotions
      const dominantEmotions = Object.entries(allEmotions)
        .map(([emotion, intensities]) => ({
          emotion,
          avgIntensity: intensities.reduce((a, b) => a + b, 0) / intensities.length,
          occurrences: intensities.length
        }))
        .sort((a, b) => b.occurrences - a.occurrences)
        .slice(0, 6);

      // Strongest personality signals (most frequently appearing)
      const strongestSignals = Object.values(traitSignals)
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      // Mood distribution
      const moodDist = {};
      const energyValues = [];
      (entries || []).forEach(e => {
        if (e.mood) moodDist[e.mood] = (moodDist[e.mood] || 0) + 1;
        if (e.energy_level) energyValues.push(e.energy_level);
      });
      const avgEnergy = energyValues.length > 0
        ? energyValues.reduce((a, b) => a + b, 0) / energyValues.length
        : null;

      console.log(`[SoulSignature] Journal signature: ${analyses.length} analyses, ${topThemes.length} themes, ${strongestSignals.length} personality signals`);

      return {
        available: true,
        entryCount: (entries || []).length,
        analyzedCount: analyses.length,
        personalitySignals: strongestSignals,
        topThemes: topThemes.map(t => t.theme),
        dominantEmotions,
        selfPerception: {
          values: Array.from(allValues).slice(0, 10),
          selfDescriptions: selfPerceptions.slice(0, 5)
        },
        moodDistribution: moodDist,
        avgEnergy,
        dataSource: 'journal',
        lastUpdated: analyses[0]?.created_at
      };
    } catch (error) {
      console.error('[SoulSignature] Error analyzing journal:', error);
      return { available: false, error: error.message };
    }
  }

  /**
   * Calculate authenticity score based on data breadth
   */
  calculateAuthenticityScore(extractedData, wearableSignature = null, professionalUniverse = null, journalSignature = null, browsingSignature = null, viewingSignature = null, twitchSignature = null) {
    const platformCount = Object.keys(extractedData).length;
    const totalDataPoints = Object.values(extractedData).reduce((sum, items) => sum + items.length, 0);

    // More platforms and data points = higher authenticity
    let score = 0.3; // Base score

    if (platformCount >= 1) score += 0.12;
    if (platformCount >= 2) score += 0.12;
    if (platformCount >= 3) score += 0.08;

    if (totalDataPoints >= 50) score += 0.08;
    if (totalDataPoints >= 200) score += 0.08;

    // Bonus for wearable/health data (adds physical dimension to digital twin)
    if (wearableSignature?.available) {
      score += 0.12;
      console.log('[SoulSignature] Authenticity boosted by wearable data');
    }

    // Bonus for professional universe (adds career/professional dimension)
    if (professionalUniverse?.available) {
      score += 0.1;
      console.log('[SoulSignature] Authenticity boosted by professional universe');

      // Extra boost for origin data (user-provided context is valuable)
      if (professionalUniverse.origin_context) {
        score += 0.1;
        console.log('[SoulSignature] Authenticity boosted by origin context');
      }
    }

    // Bonus for journal data (first-person self-perception is highly authentic)
    if (journalSignature?.available) {
      score += 0.15;
      console.log('[SoulSignature] Authenticity boosted by journal self-perception data');
    }

    // Bonus for web browsing data (private behavior reveals authentic interests)
    if (browsingSignature?.available) {
      score += 0.12;
      console.log('[SoulSignature] Authenticity boosted by web browsing data');
    }

    // Bonus for YouTube extension data (real watch behavior vs just subscriptions)
    if (viewingSignature?.has_extension_data) {
      score += 0.08;
      console.log('[SoulSignature] Authenticity boosted by YouTube extension data');
    }

    // Bonus for Twitch extension data (real stream watch behavior)
    if (twitchSignature?.has_extension_data) {
      score += 0.08;
      console.log('[SoulSignature] Authenticity boosted by Twitch extension data');
    }

    return Math.min(score, 1.0);
  }

  /**
   * Store soul signature in database
   */
  async storeSoulSignature(userId, soulSignature) {
    try {
      const { error } = await getSupabaseClient()
        .from('soul_signature_profile')
        .upsert({
          user_id: userId,
          music_signature: soulSignature.music_taste,
          health_signature: soulSignature.health_signature,  // Wearable-derived insights
          journal_signature: soulSignature.journal_signature,  // Self-perception from journal entries
          browsing_signature: soulSignature.browsing_signature,  // Web browsing patterns
          professional_universe: soulSignature.professional_universe,  // Professional context
          origin_context: soulSignature.origin_context,  // User-provided origin data
          communication_signature: {
            style: soulSignature.communication_style,
            common_phrases: soulSignature.common_phrases
          },
          curiosity_profile: {
            interests: soulSignature.interests
          },
          authenticity_score: soulSignature.authenticity_score,
          uniqueness_markers: soulSignature.uniqueness_markers,
          data_completeness: soulSignature.authenticity_score,
          confidence_score: soulSignature.authenticity_score,
          last_updated: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error('[SoulSignature] Error storing signature:', error);
      }
    } catch (error) {
      console.error('[SoulSignature] Exception storing signature:', error);
    }
  }
}

export default new SoulSignatureBuilder();
