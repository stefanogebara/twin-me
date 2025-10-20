/**
 * Platform Data Extraction Service
 * Extracts soul signature data from entertainment and social platforms
 * "We search in the branches for what we only find in the roots"
 */

import { serverDb } from './database.js';

class PlatformDataExtraction {
  constructor() {
    this.extractors = {
      spotify: this.extractSpotifyData.bind(this),
      youtube: this.extractYouTubeData.bind(this),
      discord: this.extractDiscordData.bind(this),
      github: this.extractGitHubData.bind(this),
      netflix: this.extractNetflixData.bind(this),
      instagram: this.extractInstagramData.bind(this),
      twitter: this.extractTwitterData.bind(this)
    };
  }

  /**
   * Main extraction orchestrator - extracts data from a specific platform
   */
  async extractPlatformData(userId, provider, accessToken, connectorId) {
    try {
      console.log(`📊 Starting ${provider} data extraction for user ${userId}`);

      // Check if extractor exists for this provider
      const extractor = this.extractors[provider];
      if (!extractor) {
        throw new Error(`No extractor available for provider: ${provider}`);
      }

      // Update extraction status to in_progress
      await this.updateExtractionStatus(userId, connectorId, provider, 'initial_extraction');

      // Extract data using platform-specific extractor
      const extractedData = await extractor(userId, accessToken, connectorId);

      // Update extraction status to ongoing_sync
      await this.updateExtractionStatus(userId, connectorId, provider, 'ongoing_sync', extractedData.itemCount);

      // Generate soul signature insights from extracted data
      await this.generateSoulSignatureInsights(userId, provider, extractedData);

      console.log(`✅ ${provider} extraction complete: ${extractedData.itemCount} items extracted`);

      return {
        success: true,
        provider,
        itemsExtracted: extractedData.itemCount,
        insights: extractedData.insights
      };
    } catch (error) {
      console.error(`❌ ${provider} extraction failed:`, error);

      // Update extraction status to failed
      await this.updateExtractionStatus(userId, connectorId, provider, 'failed', 0, error.message);

      throw error;
    }
  }

  /**
   * SPOTIFY DATA EXTRACTION
   * Extracts: recently played tracks, top tracks, playlists, audio features
   */
  async extractSpotifyData(userId, accessToken, connectorId) {
    const insights = {
      totalTracks: 0,
      topGenres: [],
      audioFeaturesSummary: {},
      listeningPatterns: {}
    };

    try {
      // 1. Get recently played tracks (last 50)
      const recentlyPlayed = await this.spotifyAPI('https://api.spotify.com/v1/me/player/recently-played?limit=50', accessToken);

      if (recentlyPlayed?.items) {
        for (const item of recentlyPlayed.items) {
          const track = item.track;

          // Get audio features for this track
          const audioFeatures = await this.spotifyAPI(`https://api.spotify.com/v1/audio-features/${track.id}`, accessToken);

          // Store in database
          await serverDb.query(`
            INSERT INTO spotify_listening_data (user_id, connector_id, track_id, track_name, artist_name, album_name, played_at, duration_ms, audio_features, genres)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT DO NOTHING
          `, [
            userId,
            connectorId,
            track.id,
            track.name,
            track.artists[0]?.name || 'Unknown',
            track.album?.name || '',
            item.played_at,
            track.duration_ms,
            JSON.stringify(audioFeatures),
            track.artists[0]?.genres || []
          ]);

          insights.totalTracks++;
        }
      }

      // 2. Get top tracks (short, medium, long term)
      const timeRanges = ['short_term', 'medium_term', 'long_term'];
      for (const timeRange of timeRanges) {
        const topTracks = await this.spotifyAPI(`https://api.spotify.com/v1/me/top/tracks?time_range=${timeRange}&limit=50`, accessToken);

        if (topTracks?.items) {
          for (const track of topTracks.items) {
            await serverDb.query(`
              INSERT INTO spotify_listening_data (user_id, connector_id, track_id, track_name, artist_name, album_name, played_at, duration_ms, listening_context)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              ON CONFLICT DO NOTHING
            `, [
              userId,
              connectorId,
              track.id,
              track.name,
              track.artists[0]?.name || 'Unknown',
              track.album?.name || '',
              new Date(),
              track.duration_ms,
              `top_tracks_${timeRange}`
            ]);
          }
        }
      }

      // 3. Get user playlists
      const playlists = await this.spotifyAPI('https://api.spotify.com/v1/me/playlists?limit=50', accessToken);

      if (playlists?.items) {
        for (const playlist of playlists.items) {
          // Get full playlist details including tracks
          const playlistDetails = await this.spotifyAPI(`https://api.spotify.com/v1/playlists/${playlist.id}`, accessToken);

          await serverDb.query(`
            INSERT INTO spotify_playlists (user_id, connector_id, playlist_id, playlist_name, playlist_description, is_collaborative, is_public, owner, total_tracks, followers_count, tracks, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
            ON CONFLICT (user_id, playlist_id) DO UPDATE SET
              playlist_name = EXCLUDED.playlist_name,
              total_tracks = EXCLUDED.total_tracks,
              followers_count = EXCLUDED.followers_count
          `, [
            userId,
            connectorId,
            playlist.id,
            playlist.name,
            playlist.description || '',
            playlist.collaborative || false,
            playlist.public || false,
            playlist.owner?.display_name || '',
            playlist.tracks?.total || 0,
            playlist.followers?.total || 0,
            JSON.stringify(playlistDetails.tracks?.items || [])
          ]);
        }
      }

      // 4. Get top artists for genre insights
      const topArtists = await this.spotifyAPI('https://api.spotify.com/v1/me/top/artists?limit=50', accessToken);

      if (topArtists?.items) {
        const genreCounts = {};
        topArtists.items.forEach(artist => {
          artist.genres?.forEach(genre => {
            genreCounts[genre] = (genreCounts[genre] || 0) + 1;
          });
        });

        insights.topGenres = Object.entries(genreCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([genre]) => genre);
      }

      return {
        itemCount: insights.totalTracks,
        insights
      };
    } catch (error) {
      console.error('Spotify extraction error:', error);
      throw new Error(`Spotify extraction failed: ${error.message}`);
    }
  }

  /**
   * YOUTUBE DATA EXTRACTION
   * Extracts: subscriptions, activities (likes, comments, uploads)
   */
  async extractYouTubeData(userId, accessToken, connectorId) {
    const insights = {
      totalSubscriptions: 0,
      totalActivities: 0,
      topCategories: []
    };

    try {
      // 1. Get user subscriptions
      const subscriptions = await this.youtubeAPI('https://www.googleapis.com/youtube/v3/subscriptions?part=snippet,contentDetails&mine=true&maxResults=50', accessToken);

      if (subscriptions?.items) {
        for (const sub of subscriptions.items) {
          const channel = sub.snippet;

          await serverDb.query(`
            INSERT INTO youtube_subscriptions (user_id, connector_id, channel_id, channel_title, channel_description, subscribed_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT DO NOTHING
          `, [
            userId,
            connectorId,
            channel.resourceId?.channelId || '',
            channel.title || '',
            channel.description || '',
            sub.snippet.publishedAt
          ]);

          insights.totalSubscriptions++;
        }
      }

      // 2. Get user activities (likes, uploads, etc.)
      const activities = await this.youtubeAPI('https://www.googleapis.com/youtube/v3/activities?part=snippet,contentDetails&mine=true&maxResults=50', accessToken);

      if (activities?.items) {
        for (const activity of activities.items) {
          const activityType = activity.snippet.type; // upload, like, favorite, subscription, etc.

          await serverDb.query(`
            INSERT INTO youtube_activity (user_id, connector_id, activity_type, video_id, video_title, channel_id, channel_title, activity_timestamp)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT DO NOTHING
          `, [
            userId,
            connectorId,
            activityType,
            activity.contentDetails?.upload?.videoId || activity.contentDetails?.like?.resourceId?.videoId || '',
            activity.snippet.title || '',
            activity.snippet.channelId || '',
            activity.snippet.channelTitle || '',
            activity.snippet.publishedAt
          ]);

          insights.totalActivities++;
        }
      }

      return {
        itemCount: insights.totalSubscriptions + insights.totalActivities,
        insights
      };
    } catch (error) {
      console.error('YouTube extraction error:', error);
      throw new Error(`YouTube extraction failed: ${error.message}`);
    }
  }

  /**
   * DISCORD DATA EXTRACTION
   * Extracts: servers (guilds), roles, aggregated interaction patterns
   */
  async extractDiscordData(userId, accessToken, connectorId) {
    const insights = {
      totalServers: 0,
      serverCategories: []
    };

    try {
      // Get user's guilds (servers)
      const guilds = await this.discordAPI('https://discord.com/api/v10/users/@me/guilds', accessToken);

      if (guilds && Array.isArray(guilds)) {
        for (const guild of guilds) {
          // Infer server categories from name
          const categories = this.inferDiscordCategories(guild.name);

          await serverDb.query(`
            INSERT INTO discord_servers (user_id, connector_id, server_id, server_name, server_icon, member_count, joined_at, server_categories, is_owner)
            VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8)
            ON CONFLICT DO NOTHING
          `, [
            userId,
            connectorId,
            guild.id,
            guild.name,
            guild.icon || '',
            guild.approximate_member_count || 0,
            categories,
            guild.owner || false
          ]);

          insights.totalServers++;
          insights.serverCategories.push(...categories);
        }
      }

      // Note: Individual messages are NOT extracted for privacy
      // Only aggregated patterns would be extracted with proper permissions

      return {
        itemCount: insights.totalServers,
        insights
      };
    } catch (error) {
      console.error('Discord extraction error:', error);
      throw new Error(`Discord extraction failed: ${error.message}`);
    }
  }

  /**
   * GITHUB DATA EXTRACTION
   * Extracts: repositories, contributions, languages
   */
  async extractGitHubData(userId, accessToken, connectorId) {
    const insights = {
      totalRepos: 0,
      topLanguages: [],
      contributionStats: {}
    };

    try {
      // 1. Get user repositories
      const repos = await this.githubAPI('https://api.github.com/user/repos?per_page=100&sort=updated', accessToken);

      if (repos && Array.isArray(repos)) {
        for (const repo of repos) {
          // Get language breakdown
          const languages = await this.githubAPI(repo.languages_url, accessToken);

          await serverDb.query(`
            INSERT INTO github_repositories (user_id, connector_id, repo_id, repo_name, repo_url, is_owner, is_fork, primary_language, languages_used, stars_count, forks_count, watchers_count, topics, description, created_at, last_updated, last_pushed)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            ON CONFLICT DO NOTHING
          `, [
            userId,
            connectorId,
            repo.id.toString(),
            repo.name,
            repo.html_url,
            repo.owner?.login === repo.login,
            repo.fork,
            repo.language || 'Unknown',
            JSON.stringify(languages),
            repo.stargazers_count || 0,
            repo.forks_count || 0,
            repo.watchers_count || 0,
            repo.topics || [],
            repo.description || '',
            repo.created_at,
            repo.updated_at,
            repo.pushed_at
          ]);

          insights.totalRepos++;
        }
      }

      // 2. Get contribution graph using GraphQL
      const contributionsQuery = `
        query {
          viewer {
            contributionsCollection {
              contributionCalendar {
                totalContributions
                weeks {
                  contributionDays {
                    contributionCount
                    date
                  }
                }
              }
            }
          }
        }
      `;

      const contributionsData = await this.githubGraphQL(contributionsQuery, accessToken);

      if (contributionsData?.data?.viewer?.contributionsCollection) {
        const calendar = contributionsData.data.viewer.contributionsCollection.contributionCalendar;
        insights.contributionStats.totalContributions = calendar.totalContributions;

        // Store daily contributions
        for (const week of calendar.weeks) {
          for (const day of week.contributionDays) {
            if (day.contributionCount > 0) {
              await serverDb.query(`
                INSERT INTO github_contributions (user_id, connector_id, contribution_date, contribution_count, commit_count)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (user_id, contribution_date) DO UPDATE SET
                  contribution_count = EXCLUDED.contribution_count
              `, [
                userId,
                connectorId,
                day.date,
                day.contributionCount,
                day.contributionCount // Approximation - could be refined with more API calls
              ]);
            }
          }
        }
      }

      return {
        itemCount: insights.totalRepos,
        insights
      };
    } catch (error) {
      console.error('GitHub extraction error:', error);
      throw new Error(`GitHub extraction failed: ${error.message}`);
    }
  }

  /**
   * NETFLIX DATA EXTRACTION
   * Currently supports CSV import - DOM extraction would go here
   */
  async extractNetflixData(userId, csvData, connectorId) {
    const insights = {
      totalViewed: 0,
      topGenres: [],
      bingePatterns: {}
    };

    try {
      if (!csvData || !Array.isArray(csvData)) {
        throw new Error('Netflix CSV data is required');
      }

      for (const item of csvData) {
        const genres = this.inferNetflixGenre(item.title);
        const emotionalArc = this.inferEmotionalArc(genres);

        await serverDb.query(`
          INSERT INTO netflix_viewing_history (user_id, title, series_or_movie, watched_at, duration_watched_minutes, genre, sub_genres, emotional_arc, import_source)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT DO NOTHING
        `, [
          userId,
          item.title,
          item.type || 'movie',
          item.watchedAt,
          item.duration || 0,
          genres[0] || 'Unknown',
          genres,
          emotionalArc,
          'csv'
        ]);

        insights.totalViewed++;
      }

      return {
        itemCount: insights.totalViewed,
        insights
      };
    } catch (error) {
      console.error('Netflix extraction error:', error);
      throw new Error(`Netflix extraction failed: ${error.message}`);
    }
  }

  /**
   * INSTAGRAM DATA EXTRACTION
   * Limited due to Basic Display API deprecation
   */
  async extractInstagramData(userId, accessToken, connectorId) {
    // Instagram Basic Display API was deprecated Dec 2024
    // Only works with Business/Creator accounts via Instagram Graph API

    console.warn('Instagram Basic Display API is deprecated. Use Graph API with Business account.');

    return {
      itemCount: 0,
      insights: {
        message: 'Instagram Basic Display API deprecated. Requires Business/Creator account with Graph API.'
      }
    };
  }

  /**
   * TWITTER DATA EXTRACTION
   * Limited due to API v2 pricing ($100/month minimum)
   */
  async extractTwitterData(userId, accessToken, connectorId) {
    // Twitter API v2 requires minimum $100/month
    // This would only work if user has paid Twitter API access

    console.warn('Twitter API v2 requires paid access ($100/month minimum)');

    return {
      itemCount: 0,
      insights: {
        message: 'Twitter API v2 requires paid subscription ($100/month). Consider manual data import.'
      }
    };
  }

  /**
   * HELPER: Update extraction status
   */
  async updateExtractionStatus(userId, connectorId, provider, stage, itemCount = 0, errorMessage = null) {
    try {
      await serverDb.query(`
        INSERT INTO extraction_status (user_id, connector_id, provider, extraction_stage, total_items_extracted, last_extraction_count, last_error_message, last_error_timestamp, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (user_id, platform) DO UPDATE SET
          extraction_stage = EXCLUDED.extraction_stage,
          total_items_extracted = extraction_status.total_items_extracted + EXCLUDED.last_extraction_count,
          last_extraction_count = EXCLUDED.last_extraction_count,
          last_error_message = EXCLUDED.last_error_message,
          last_error_timestamp = EXCLUDED.last_error_timestamp,
          consecutive_errors = CASE WHEN EXCLUDED.extraction_stage = 'failed' THEN extraction_status.consecutive_errors + 1 ELSE 0 END,
          updated_at = NOW()
      `, [
        userId,
        connectorId,
        provider,
        stage,
        itemCount,
        itemCount,
        errorMessage,
        errorMessage ? new Date() : null
      ]);
    } catch (error) {
      console.error('Failed to update extraction status:', error);
    }
  }

  /**
   * HELPER: Generate soul signature insights from extracted data
   */
  async generateSoulSignatureInsights(userId, provider, extractedData) {
    // This would analyze the extracted data and generate insights
    // For now, just log that insights generation would happen here
    console.log(`📊 Generating soul signature insights for ${provider}...`);

    // TODO: Implement soul signature aggregation logic
    // This would:
    // 1. Analyze patterns in the extracted data
    // 2. Generate personality insights
    // 3. Store in soul_signature_profile table
    // 4. Generate LLM training context
  }

  /**
   * API HELPERS
   */

  async spotifyAPI(url, accessToken) {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Spotify API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async youtubeAPI(url, accessToken) {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async discordAPI(url, accessToken) {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Discord API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async githubAPI(url, accessToken) {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Twin-AI-Learn'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async githubGraphQL(query, accessToken) {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Twin-AI-Learn'
      },
      body: JSON.stringify({ query })
    });

    if (!response.ok) {
      throw new Error(`GitHub GraphQL error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * INFERENCE HELPERS
   */

  inferDiscordCategories(serverName) {
    const categories = [];
    const name = serverName.toLowerCase();

    if (name.includes('game') || name.includes('gaming')) categories.push('gaming');
    if (name.includes('tech') || name.includes('dev') || name.includes('code')) categories.push('tech');
    if (name.includes('art') || name.includes('creative')) categories.push('art');
    if (name.includes('music')) categories.push('music');
    if (name.includes('learn') || name.includes('edu')) categories.push('education');
    if (name.includes('social') || name.includes('friends')) categories.push('social');

    return categories.length > 0 ? categories : ['general'];
  }

  inferNetflixGenre(title) {
    // Very basic genre inference - in production, use TMDB or similar API
    const titleLower = title.toLowerCase();
    const genres = [];

    if (titleLower.includes('comedy')) genres.push('comedy');
    if (titleLower.includes('drama')) genres.push('drama');
    if (titleLower.includes('action')) genres.push('action');
    if (titleLower.includes('horror') || titleLower.includes('thriller')) genres.push('thriller');
    if (titleLower.includes('documentary') || titleLower.includes('doc')) genres.push('documentary');

    return genres.length > 0 ? genres : ['unknown'];
  }

  inferEmotionalArc(genres) {
    if (genres.includes('comedy')) return 'comedy';
    if (genres.includes('drama')) return 'drama';
    if (genres.includes('thriller')) return 'thriller';
    if (genres.includes('documentary')) return 'documentary';
    return 'mixed';
  }
}

export default new PlatformDataExtraction();
