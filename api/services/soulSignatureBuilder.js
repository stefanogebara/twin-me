/**
 * Soul Signature Builder
 * Builds authentic soul signatures from extracted platform data
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

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

      // 8. Use AI to generate personality insights
      const personalityInsights = await this.generatePersonalityInsights(
        extractedData,
        styleProfile,
        musicSignature,
        communicationSignature,
        viewingSignature,
        discussionSignature
      );

      // 9. Extract common phrases and analogies
      const languagePatterns = await this.extractLanguagePatterns(extractedData);

      // 10. Build complete soul signature
      const soulSignature = {
        personality_traits: personalityInsights.traits,
        communication_style: communicationSignature.style || styleProfile?.communication_style || 'balanced',
        music_taste: musicSignature,
        viewing_patterns: viewingSignature,
        discussion_style: discussionSignature,
        interests: interests,
        common_phrases: languagePatterns.phrases,
        favorite_analogies: languagePatterns.analogies,
        uniqueness_markers: personalityInsights.uniqueness_markers,
        authenticity_score: this.calculateAuthenticityScore(extractedData),
        data_sources: Object.keys(extractedData),
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
      const { data, error } = await supabase
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
      const { data, error } = await supabase
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

    // From YouTube
    if (extractedData.youtube) {
      const subscriptions = extractedData.youtube.filter(item => item.type === 'subscription').slice(0, 10);
      subscriptions.forEach(item => {
        const channel = item.data.channel_title;
        if (channel && !interests.includes(channel)) {
          interests.push(channel);
        }
      });
    }

    return interests;
  }

  /**
   * Generate personality insights using AI
   */
  async generatePersonalityInsights(extractedData, styleProfile, musicSignature, communicationSignature) {
    try {
      // Build context from data
      const context = this.buildAIContext(extractedData, styleProfile, musicSignature, communicationSignature);

      // Call Claude to generate insights
      const message = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1500,
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
        }]
      });

      // Parse AI response
      const responseText = message.content[0].text;
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
  buildAIContext(extractedData, styleProfile, musicSignature, communicationSignature) {
    let context = '';

    // Music taste
    if (musicSignature && musicSignature.top_genres) {
      context += `Music taste: ${musicSignature.top_genres.join(', ')}. `;
      context += `Listening style: ${musicSignature.listening_mood}. `;
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

    // Data sources
    context += `Data sources analyzed: ${Object.keys(extractedData).join(', ')}. `;

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
      // Extract subscriptions
      const subscriptions = youtubeData.filter(item => item.type === 'subscription');
      const channelTitles = subscriptions.map(s => s.data.channel_title);

      // Extract liked videos
      const likedVideos = youtubeData.filter(item => item.type === 'liked_video');
      const categories = new Set(likedVideos.map(v => v.data.category_id).filter(Boolean));

      // Analyze playlists
      const playlists = youtubeData.filter(item => item.type === 'playlist');

      return {
        subscription_count: subscriptions.length,
        liked_videos_count: likedVideos.length,
        playlists_count: playlists.length,
        top_channels: channelTitles.slice(0, 10),
        content_categories: Array.from(categories),
        viewing_style: likedVideos.length > 100 ? 'avid watcher' : 'casual viewer'
      };
    } catch (error) {
      console.error('[SoulSignature] Error analyzing YouTube:', error);
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
   * Calculate authenticity score based on data breadth
   */
  calculateAuthenticityScore(extractedData) {
    const platformCount = Object.keys(extractedData).length;
    const totalDataPoints = Object.values(extractedData).reduce((sum, items) => sum + items.length, 0);

    // More platforms and data points = higher authenticity
    let score = 0.3; // Base score

    if (platformCount >= 1) score += 0.2;
    if (platformCount >= 2) score += 0.2;
    if (platformCount >= 3) score += 0.1;

    if (totalDataPoints >= 50) score += 0.1;
    if (totalDataPoints >= 200) score += 0.1;

    return Math.min(score, 1.0);
  }

  /**
   * Store soul signature in database
   */
  async storeSoulSignature(userId, soulSignature) {
    try {
      const { error } = await supabase
        .from('soul_signature_profile')
        .upsert({
          user_id: userId,
          music_signature: soulSignature.music_taste,
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
