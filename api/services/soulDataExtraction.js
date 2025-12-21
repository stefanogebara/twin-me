/**
 * Soul Data Extraction Service
 *
 * Comprehensive entertainment/lifestyle platform extraction for Soul Signature discovery.
 * Extracts personality signatures from Spotify, YouTube, GitHub, Discord, and Netflix.
 *
 * Architecture:
 * - Each extraction function is async and handles rate limits
 * - Returns standardized SoulDataPoint objects
 * - Graceful degradation with try-catch
 * - No fake fallbacks - returns null for missing data
 * - Caches API responses to avoid rate limits
 */

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { decryptToken } from './encryption.js';

// API rate limit cache
const apiCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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

/**
 * Get cached API response or fetch fresh data
 */
function getCachedOrFetch(cacheKey, fetchFn) {
  const cached = apiCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`📦 Using cached data for ${cacheKey}`);
    return Promise.resolve(cached.data);
  }

  return fetchFn().then(data => {
    apiCache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  });
}

// ============================================================================
// SPOTIFY EXTRACTION
// ============================================================================

/**
 * Extract Spotify data - musical taste, mood patterns, discovery behavior
 *
 * API Endpoints:
 * - GET /v1/me/top/artists?time_range=long_term&limit=50
 * - GET /v1/me/top/tracks?time_range=long_term&limit=50
 * - GET /v1/me/player/recently-played?limit=50
 * - GET /v1/me/playlists?limit=50
 */
export async function extractSpotifyData(accessToken) {
  try {
    console.log('🎵 Starting Spotify extraction...');

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    };

    const baseUrl = 'https://api.spotify.com/v1';

    // Parallel extraction for performance
    const [topArtists, topTracks, recentTracks, playlists, audioFeatures] = await Promise.all([
      // Top artists (long-term = several years)
      getCachedOrFetch('spotify-top-artists', () =>
        axios.get(`${baseUrl}/me/top/artists?time_range=long_term&limit=50`, { headers })
          .then(res => res.data.items)
      ),

      // Top tracks (long-term)
      getCachedOrFetch('spotify-top-tracks', () =>
        axios.get(`${baseUrl}/me/top/tracks?time_range=long_term&limit=50`, { headers })
          .then(res => res.data.items)
      ),

      // Recently played
      getCachedOrFetch('spotify-recent-tracks', () =>
        axios.get(`${baseUrl}/me/player/recently-played?limit=50`, { headers })
          .then(res => res.data.items)
      ),

      // User playlists (curation style)
      getCachedOrFetch('spotify-playlists', () =>
        axios.get(`${baseUrl}/me/playlists?limit=50`, { headers })
          .then(res => res.data.items)
      ),

      // Audio features for top tracks (energy, valence, tempo)
      getCachedOrFetch('spotify-audio-features', async () => {
        const tracks = await axios.get(`${baseUrl}/me/top/tracks?time_range=long_term&limit=50`, { headers })
          .then(res => res.data.items);
        const trackIds = tracks.map(t => t.id).join(',');
        return axios.get(`${baseUrl}/audio-features?ids=${trackIds}`, { headers })
          .then(res => res.data.audio_features);
      })
    ]);

    // Extract genres from artists
    const genres = topArtists.flatMap(artist => artist.genres || []);
    const genreFrequency = genres.reduce((acc, genre) => {
      acc[genre] = (acc[genre] || 0) + 1;
      return acc;
    }, {});

    // Calculate diversity (Shannon entropy)
    const genreDiversity = calculateDiversity(Object.values(genreFrequency));

    // Calculate average audio features
    const avgAudioFeatures = audioFeatures.reduce((acc, f) => {
      if (f) {
        acc.valence += f.valence || 0;
        acc.energy += f.energy || 0;
        acc.danceability += f.danceability || 0;
        acc.tempo += f.tempo || 0;
        acc.acousticness += f.acousticness || 0;
        acc.count += 1;
      }
      return acc;
    }, { valence: 0, energy: 0, danceability: 0, tempo: 0, acousticness: 0, count: 0 });

    Object.keys(avgAudioFeatures).forEach(key => {
      if (key !== 'count') {
        avgAudioFeatures[key] /= avgAudioFeatures.count;
      }
    });

    // Determine listening time patterns
    const listeningPattern = analyzeListeningTimes(recentTracks);

    // Calculate obscurity score (artists with low followers)
    const obscureArtists = topArtists.filter(a => a.followers.total < 50000).length;
    const obscurityScore = obscureArtists / topArtists.length;

    const extractedPatterns = {
      // Musical identity
      topGenres: Object.entries(genreFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([genre, count]) => ({ genre, count })),
      genreDiversity: genreDiversity,
      totalGenres: Object.keys(genreFrequency).length,

      // Mood patterns (valence: 0=sad, 1=happy)
      moodScore: avgAudioFeatures.valence,
      emotionalLandscape: classifyEmotionalLandscape(avgAudioFeatures),

      // Energy & tempo patterns
      energyLevel: avgAudioFeatures.energy,
      danceability: avgAudioFeatures.danceability,
      averageTempo: avgAudioFeatures.tempo,
      acousticPreference: avgAudioFeatures.acousticness,

      // Discovery patterns
      diversityScore: genreDiversity,
      obscurityScore: obscurityScore,
      discoveryVsFamiliar: obscurityScore > 0.3 ? 'discovery-focused' : 'familiar-focused',

      // Listening habits
      temporalPattern: listeningPattern,
      playlistCount: playlists.length,
      curationStyle: determineCurationStyle(playlists),

      // Artist analysis
      topArtistNames: topArtists.slice(0, 10).map(a => a.name),
      artistPopularityAvg: topArtists.reduce((sum, a) => sum + a.popularity, 0) / topArtists.length
    };

    console.log(`✅ Spotify extraction complete: ${topTracks.length} tracks, ${topArtists.length} artists`);

    return {
      platform: 'spotify',
      category: 'entertainment',
      dataType: 'musical_taste',
      rawData: {
        topArtists: topArtists.slice(0, 20), // Store subset to avoid huge payloads
        topTracks: topTracks.slice(0, 20),
        recentTracks: recentTracks.slice(0, 20),
        playlists: playlists.slice(0, 10)
      },
      extractedPatterns,
      timestamp: Date.now(),
      quality: topTracks.length > 30 ? 'high' : topTracks.length > 10 ? 'medium' : 'low'
    };

  } catch (error) {
    console.error('❌ Spotify extraction error:', error.response?.data || error.message);

    // Handle rate limiting
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'] || 60;
      console.warn(`⏳ Spotify rate limited. Retry after ${retryAfter}s`);
      return {
        platform: 'spotify',
        error: 'RATE_LIMITED',
        retryAfter: parseInt(retryAfter),
        timestamp: Date.now()
      };
    }

    // Handle token expiration
    if (error.response?.status === 401) {
      console.warn('🔐 Spotify token expired');
      return {
        platform: 'spotify',
        error: 'TOKEN_EXPIRED',
        timestamp: Date.now()
      };
    }

    return null;
  }
}

// ============================================================================
// YOUTUBE EXTRACTION
// ============================================================================

/**
 * Extract YouTube data - learning interests, curiosity profile, creator loyalty
 *
 * API Endpoints:
 * - GET /youtube/v3/subscriptions?part=snippet&mine=true&maxResults=50
 * - GET /youtube/v3/playlistItems?part=snippet&playlistId=WL&maxResults=50
 * - GET /youtube/v3/activities?part=snippet&mine=true&maxResults=50
 */
export async function extractYouTubeData(accessToken) {
  try {
    console.log('📺 Starting YouTube extraction...');

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    };

    const baseUrl = 'https://www.googleapis.com/youtube/v3';

    // Get channel info first to access playlists
    const channelResponse = await getCachedOrFetch('youtube-channel', () =>
      axios.get(`${baseUrl}/channels?part=snippet,statistics,contentDetails&mine=true`, { headers })
        .then(res => res.data.items[0])
    );

    const likesPlaylistId = channelResponse?.contentDetails?.relatedPlaylists?.likes;

    // Parallel extraction
    const [subscriptions, activities, likedVideos] = await Promise.all([
      // Subscriptions (creator loyalty)
      getCachedOrFetch('youtube-subscriptions', () =>
        axios.get(`${baseUrl}/subscriptions?part=snippet&mine=true&maxResults=50`, { headers })
          .then(res => res.data.items)
      ),

      // Recent activities
      getCachedOrFetch('youtube-activities', () =>
        axios.get(`${baseUrl}/activities?part=snippet,contentDetails&mine=true&maxResults=50`, { headers })
          .then(res => res.data.items)
      ),

      // Liked videos
      likesPlaylistId ? getCachedOrFetch('youtube-liked', () =>
        axios.get(`${baseUrl}/playlistItems?part=snippet,contentDetails&playlistId=${likesPlaylistId}&maxResults=50`, { headers })
          .then(res => res.data.items)
      ) : Promise.resolve([])
    ]);

    // Categorize subscriptions
    const categories = categorizeYouTubeChannels(subscriptions);

    // Analyze content depth (video title lengths as proxy)
    const videoTitles = [...likedVideos, ...activities
      .filter(a => a.snippet?.title)
      .map(a => ({ title: a.snippet.title }))]
      .map(v => v.snippet?.title || v.title);

    const avgTitleLength = videoTitles.reduce((sum, t) => sum + (t?.length || 0), 0) / videoTitles.length;
    const contentDepth = avgTitleLength > 60 ? 'long-form' : 'short-clips';

    // Calculate diversity
    const categoryCount = Object.keys(categories).filter(k => categories[k] > 0).length;
    const diversityScore = Math.min(categoryCount / 10, 1); // Normalize to 0-1

    const extractedPatterns = {
      // Creator loyalty
      subscriptionCount: subscriptions.length,
      topChannels: subscriptions.slice(0, 15).map(s => ({
        channel: s.snippet.title,
        subscribedAt: s.snippet.publishedAt
      })),

      // Learning vs entertainment
      contentMix: categories,
      learningVsEntertainment: calculateLearningRatio(categories),

      // Curiosity profile
      topicDiversity: diversityScore,
      categoryCount: categoryCount,
      curiosityProfile: determineCuriosityProfile(categories, diversityScore),

      // Content depth preference
      contentDepth: contentDepth,
      avgTitleLength: Math.round(avgTitleLength),

      // Engagement patterns
      likesCount: likedVideos.length,
      recentActivityCount: activities.length,
      engagementLevel: likedVideos.length > 30 ? 'high' : likedVideos.length > 15 ? 'medium' : 'low'
    };

    console.log(`✅ YouTube extraction complete: ${subscriptions.length} subscriptions, ${likedVideos.length} liked videos`);

    return {
      platform: 'youtube',
      category: 'entertainment',
      dataType: 'learning_interests',
      rawData: {
        subscriptions: subscriptions.slice(0, 20),
        likedVideos: likedVideos.slice(0, 20),
        activities: activities.slice(0, 20)
      },
      extractedPatterns,
      timestamp: Date.now(),
      quality: subscriptions.length > 20 ? 'high' : subscriptions.length > 5 ? 'medium' : 'low'
    };

  } catch (error) {
    console.error('❌ YouTube extraction error:', error.response?.data || error.message);

    if (error.response?.status === 429) {
      console.warn('⏳ YouTube rate limited');
      return {
        platform: 'youtube',
        error: 'RATE_LIMITED',
        timestamp: Date.now()
      };
    }

    if (error.response?.status === 401) {
      console.warn('🔐 YouTube token expired');
      return {
        platform: 'youtube',
        error: 'TOKEN_EXPIRED',
        timestamp: Date.now()
      };
    }

    return null;
  }
}

// ============================================================================
// GITHUB EXTRACTION
// ============================================================================

/**
 * Extract GitHub data - technical skills, contribution patterns, project interests
 *
 * API Endpoints:
 * - GET /user/repos?sort=updated&per_page=100
 * - GET /user/following
 * - GET /search/issues?q=author:username&sort=created
 */
export async function extractGitHubData(accessToken) {
  try {
    console.log('🐙 Starting GitHub extraction...');

    const headers = {
      'Authorization': `token ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'TwinMe-SoulSignature'
    };

    const baseUrl = 'https://api.github.com';

    // Get user profile first
    const userProfile = await getCachedOrFetch('github-profile', () =>
      axios.get(`${baseUrl}/user`, { headers })
        .then(res => res.data)
    );

    // Parallel extraction
    const [repos, starred, following, events] = await Promise.all([
      // User repositories
      getCachedOrFetch('github-repos', () =>
        axios.get(`${baseUrl}/user/repos?sort=updated&per_page=100`, { headers })
          .then(res => res.data)
      ),

      // Starred repositories (interests)
      getCachedOrFetch('github-starred', () =>
        axios.get(`${baseUrl}/user/starred?per_page=100`, { headers })
          .then(res => res.data)
      ),

      // Following (network)
      getCachedOrFetch('github-following', () =>
        axios.get(`${baseUrl}/user/following?per_page=100`, { headers })
          .then(res => res.data)
      ),

      // Recent events (activity)
      getCachedOrFetch('github-events', () =>
        axios.get(`${baseUrl}/users/${userProfile.login}/events?per_page=100`, { headers })
          .then(res => res.data)
      ).catch(() => [])
    ]);

    // Extract languages from repos
    const languages = repos.reduce((acc, repo) => {
      if (repo.language) {
        acc[repo.language] = (acc[repo.language] || 0) + 1;
      }
      return acc;
    }, {});

    // Analyze contribution patterns
    const commitEvents = events.filter(e => e.type === 'PushEvent');
    const commitTimes = commitEvents.map(e => new Date(e.created_at).getHours());
    const avgCommitHour = commitTimes.reduce((sum, h) => sum + h, 0) / commitTimes.length;
    const activityRhythm = avgCommitHour < 12 ? 'morning' : avgCommitHour < 18 ? 'afternoon' : 'night';

    // Project interests (from repo topics)
    const allTopics = repos.flatMap(r => r.topics || []);
    const topicFrequency = allTopics.reduce((acc, topic) => {
      acc[topic] = (acc[topic] || 0) + 1;
      return acc;
    }, {});

    // Solo vs collaborative
    const forkedRepos = repos.filter(r => r.fork).length;
    const originalRepos = repos.length - forkedRepos;
    const collaborationStyle = forkedRepos > originalRepos ? 'collaborative' : 'solo';

    const extractedPatterns = {
      // Technical skills
      primaryLanguages: Object.entries(languages)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([lang, count]) => ({ language: lang, repoCount: count })),
      languageDiversity: Object.keys(languages).length,

      // Project interests
      topTopics: Object.entries(topicFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([topic, count]) => ({ topic, count })),
      projectCategories: categorizeGitHubProjects(allTopics),

      // Contribution patterns
      activityRhythm: activityRhythm,
      avgCommitHour: Math.round(avgCommitHour),
      contributionStyle: collaborationStyle,

      // Stats
      totalRepos: repos.length,
      originalRepos: originalRepos,
      forkedRepos: forkedRepos,
      starredCount: starred.length,
      followingCount: following.length,

      // Engagement
      publicGists: userProfile.public_gists,
      followers: userProfile.followers,
      openSourceContribution: forkedRepos > 10 ? 'active' : forkedRepos > 0 ? 'occasional' : 'minimal'
    };

    console.log(`✅ GitHub extraction complete: ${repos.length} repos, ${languages.length} languages`);

    return {
      platform: 'github',
      category: 'productivity',
      dataType: 'technical_skills',
      rawData: {
        repos: repos.slice(0, 30),
        starred: starred.slice(0, 20),
        languages: languages
      },
      extractedPatterns,
      timestamp: Date.now(),
      quality: repos.length > 10 ? 'high' : repos.length > 3 ? 'medium' : 'low'
    };

  } catch (error) {
    console.error('❌ GitHub extraction error:', error.response?.data || error.message);

    if (error.response?.status === 403) {
      console.warn('⏳ GitHub rate limited');
      return {
        platform: 'github',
        error: 'RATE_LIMITED',
        timestamp: Date.now()
      };
    }

    if (error.response?.status === 401) {
      console.warn('🔐 GitHub token expired');
      return {
        platform: 'github',
        error: 'TOKEN_EXPIRED',
        timestamp: Date.now()
      };
    }

    return null;
  }
}

// ============================================================================
// DISCORD EXTRACTION
// ============================================================================

/**
 * Extract Discord data - community involvement, social circles, engagement level
 *
 * API Endpoints:
 * - GET /users/@me/guilds - Server memberships
 * - GET /users/@me - Profile data
 */
export async function extractDiscordData(accessToken) {
  try {
    console.log('💬 Starting Discord extraction...');

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    };

    const baseUrl = 'https://discord.com/api/v10';

    // Parallel extraction
    const [userProfile, guilds] = await Promise.all([
      // User profile
      getCachedOrFetch('discord-profile', () =>
        axios.get(`${baseUrl}/users/@me`, { headers })
          .then(res => res.data)
      ),

      // Server memberships
      getCachedOrFetch('discord-guilds', () =>
        axios.get(`${baseUrl}/users/@me/guilds`, { headers })
          .then(res => res.data)
      )
    ]);

    // Categorize server types
    const serverCategories = categorizeDiscordServers(guilds);

    // Determine social circles
    const socialCircles = determineSocialCircles(guilds);

    // Calculate engagement level
    const engagementLevel = guilds.length > 20 ? 'very-high' :
                           guilds.length > 10 ? 'high' :
                           guilds.length > 5 ? 'moderate' : 'low';

    const extractedPatterns = {
      // Community involvement
      serverCount: guilds.length,
      serverTypes: serverCategories,
      topServers: guilds.slice(0, 15).map(g => ({
        name: g.name,
        memberCount: g.approximate_member_count,
        icon: g.icon
      })),

      // Social circles
      communityTypes: socialCircles,
      primaryCircle: Object.entries(socialCircles)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'general',

      // Engagement
      engagementLevel: engagementLevel,

      // User profile
      username: `${userProfile.username}#${userProfile.discriminator}`,
      accountAge: calculateAccountAge(userProfile.id)
    };

    console.log(`✅ Discord extraction complete: ${guilds.length} servers`);

    return {
      platform: 'discord',
      category: 'social',
      dataType: 'community_involvement',
      rawData: {
        guilds: guilds.slice(0, 20),
        profile: userProfile
      },
      extractedPatterns,
      timestamp: Date.now(),
      quality: guilds.length > 10 ? 'high' : guilds.length > 3 ? 'medium' : 'low'
    };

  } catch (error) {
    console.error('❌ Discord extraction error:', error.response?.data || error.message);

    if (error.response?.status === 429) {
      console.warn('⏳ Discord rate limited');
      return {
        platform: 'discord',
        error: 'RATE_LIMITED',
        timestamp: Date.now()
      };
    }

    if (error.response?.status === 401) {
      console.warn('🔐 Discord token expired');
      return {
        platform: 'discord',
        error: 'TOKEN_EXPIRED',
        timestamp: Date.now()
      };
    }

    return null;
  }
}

// ============================================================================
// NETFLIX EXTRACTION (from Browser Extension)
// ============================================================================

/**
 * Extract Netflix data - narrative preferences, binge patterns, genre evolution
 *
 * Input: Browser extension sends watch history JSON
 * Format: { viewingActivity: [{ title, date, duration, ... }] }
 */
export async function extractNetflixData(extensionData) {
  try {
    console.log('🎬 Starting Netflix extraction...');

    if (!extensionData || !extensionData.viewingActivity) {
      console.warn('⚠️ No Netflix viewing activity provided');
      return null;
    }

    const viewingActivity = extensionData.viewingActivity;

    // Group by title for series analysis
    const titleGroups = viewingActivity.reduce((acc, item) => {
      const title = item.title;
      if (!acc[title]) {
        acc[title] = [];
      }
      acc[title].push(item);
      return acc;
    }, {});

    // Analyze binge patterns
    const seriesData = Object.entries(titleGroups).map(([title, items]) => {
      const episodes = items.length;
      const dates = items.map(i => new Date(i.date).getTime());
      const daySpan = (Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24);
      const bingeRate = episodes / (daySpan || 1);

      return {
        title,
        episodes,
        daySpan,
        bingeRate,
        completionEstimate: episodes > 10 ? 'completed' : episodes > 5 ? 'in-progress' : 'sampled'
      };
    });

    // Calculate average binge rate
    const avgBingeRate = seriesData.reduce((sum, s) => sum + s.bingeRate, 0) / seriesData.length;

    // Categorize content (basic genre detection from titles)
    const genres = categorizeNetflixContent(viewingActivity);

    // Detect comfort rewatches (same title watched multiple times)
    const rewatches = seriesData.filter(s => s.episodes > 20).map(s => s.title);

    // Analyze viewing times
    const viewingTimes = viewingActivity
      .map(v => new Date(v.date).getHours())
      .filter(h => !isNaN(h));
    const avgViewingHour = viewingTimes.reduce((sum, h) => sum + h, 0) / viewingTimes.length;
    const viewingPattern = avgViewingHour < 12 ? 'morning' :
                          avgViewingHour < 18 ? 'afternoon' :
                          avgViewingHour < 22 ? 'evening' : 'night';

    // Detect emotional journey patterns
    const emotionalJourney = detectEmotionalJourney(viewingActivity);

    const extractedPatterns = {
      // Narrative preferences
      topShows: seriesData
        .sort((a, b) => b.episodes - a.episodes)
        .slice(0, 15)
        .map(s => ({ title: s.title, episodes: s.episodes, status: s.completionEstimate })),

      // Binge patterns
      avgBingeRate: avgBingeRate,
      bingeStyle: avgBingeRate > 2 ? 'heavy-binger' : avgBingeRate > 1 ? 'moderate-binger' : 'casual-viewer',
      completedSeries: seriesData.filter(s => s.completionEstimate === 'completed').length,
      seriesCompletionRate: seriesData.filter(s => s.completionEstimate === 'completed').length / seriesData.length,

      // Genre preferences
      genreDistribution: genres,
      topGenre: Object.entries(genres).sort((a, b) => b[1] - a[1])[0]?.[0] || 'mixed',

      // Emotional patterns
      emotionalJourney: emotionalJourney,
      comfortRewatches: rewatches.length,
      rewatchTitles: rewatches.slice(0, 5),

      // Viewing habits
      totalViewed: viewingActivity.length,
      viewingPattern: viewingPattern,
      avgViewingHour: Math.round(avgViewingHour),

      // Genre evolution (recent vs older viewing)
      recentGenres: categorizeNetflixContent(viewingActivity.slice(0, 50)),
      olderGenres: categorizeNetflixContent(viewingActivity.slice(-50))
    };

    console.log(`✅ Netflix extraction complete: ${viewingActivity.length} items, ${seriesData.length} unique titles`);

    return {
      platform: 'netflix',
      category: 'entertainment',
      dataType: 'viewing_history',
      rawData: {
        viewingActivity: viewingActivity.slice(0, 100), // Store subset
        seriesData: seriesData.slice(0, 30)
      },
      extractedPatterns,
      timestamp: Date.now(),
      quality: viewingActivity.length > 50 ? 'high' : viewingActivity.length > 20 ? 'medium' : 'low'
    };

  } catch (error) {
    console.error('❌ Netflix extraction error:', error.message);
    return null;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate Shannon entropy for diversity measurement
 */
function calculateDiversity(frequencies) {
  const total = frequencies.reduce((sum, f) => sum + f, 0);
  if (total === 0) return 0;

  let entropy = 0;
  for (const freq of frequencies) {
    if (freq > 0) {
      const probability = freq / total;
      entropy -= probability * Math.log2(probability);
    }
  }

  // Normalize to 0-1 scale
  const maxEntropy = Math.log2(frequencies.length);
  return maxEntropy > 0 ? entropy / maxEntropy : 0;
}

/**
 * Classify emotional landscape based on audio features
 */
function classifyEmotionalLandscape(features) {
  const { valence, energy, acousticness } = features;

  if (valence > 0.6 && energy > 0.6) return 'energetic-positive';
  if (valence > 0.6 && energy < 0.4) return 'calm-positive';
  if (valence < 0.4 && energy > 0.6) return 'intense-dramatic';
  if (valence < 0.4 && energy < 0.4) return 'melancholic';
  if (acousticness > 0.6) return 'acoustic-introspective';
  return 'balanced';
}

/**
 * Analyze listening times from recent tracks
 */
function analyzeListeningTimes(recentTracks) {
  if (!recentTracks || recentTracks.length === 0) return 'unknown';

  const hours = recentTracks
    .map(t => new Date(t.played_at).getHours())
    .filter(h => !isNaN(h));

  const avgHour = hours.reduce((sum, h) => sum + h, 0) / hours.length;

  if (avgHour >= 0 && avgHour < 6) return 'night_owl';
  if (avgHour >= 6 && avgHour < 12) return 'morning_person';
  if (avgHour >= 12 && avgHour < 18) return 'afternoon_listener';
  if (avgHour >= 18 && avgHour < 22) return 'evening_listener';
  return 'late_night';
}

/**
 * Determine curation style from playlists
 */
function determineCurationStyle(playlists) {
  if (!playlists || playlists.length === 0) return 'minimal-curator';

  const avgTracksPerPlaylist = playlists.reduce((sum, p) => sum + (p.tracks?.total || 0), 0) / playlists.length;

  if (playlists.length > 20 && avgTracksPerPlaylist > 30) return 'obsessive-curator';
  if (playlists.length > 10) return 'active-curator';
  if (playlists.length > 3) return 'casual-curator';
  return 'minimal-curator';
}

/**
 * Categorize YouTube channels by content type
 */
function categorizeYouTubeChannels(subscriptions) {
  const categories = {
    educational: 0,
    entertainment: 0,
    gaming: 0,
    tech: 0,
    music: 0,
    vlog: 0,
    news: 0,
    cooking: 0,
    fitness: 0,
    other: 0
  };

  const keywords = {
    educational: ['learn', 'tutorial', 'course', 'education', 'academy', 'lecture', 'school'],
    entertainment: ['comedy', 'funny', 'entertainment', 'show', 'podcast'],
    gaming: ['gaming', 'game', 'play', 'esports', 'twitch'],
    tech: ['tech', 'programming', 'code', 'software', 'developer', 'engineering'],
    music: ['music', 'song', 'artist', 'band', 'official'],
    vlog: ['vlog', 'daily', 'life', 'lifestyle'],
    news: ['news', 'today', 'current', 'report'],
    cooking: ['cook', 'recipe', 'food', 'chef', 'kitchen'],
    fitness: ['fitness', 'workout', 'gym', 'health', 'exercise']
  };

  for (const sub of subscriptions) {
    const title = (sub.snippet?.title || '').toLowerCase();
    const description = (sub.snippet?.description || '').toLowerCase();
    const text = `${title} ${description}`;

    let categorized = false;
    for (const [category, kws] of Object.entries(keywords)) {
      if (kws.some(kw => text.includes(kw))) {
        categories[category]++;
        categorized = true;
        break;
      }
    }
    if (!categorized) {
      categories.other++;
    }
  }

  return categories;
}

/**
 * Calculate learning vs entertainment ratio
 */
function calculateLearningRatio(categories) {
  const learning = (categories.educational || 0) + (categories.tech || 0);
  const entertainment = (categories.entertainment || 0) + (categories.gaming || 0) + (categories.vlog || 0);
  const total = learning + entertainment;

  if (total === 0) return 'balanced';
  const learningRatio = learning / total;

  if (learningRatio > 0.7) return 'learning-focused';
  if (learningRatio > 0.4) return 'balanced-learner';
  return 'entertainment-focused';
}

/**
 * Determine curiosity profile
 */
function determineCuriosityProfile(categories, diversityScore) {
  const totalCategories = Object.values(categories).filter(v => v > 0).length;

  if (totalCategories > 7 && diversityScore > 0.7) return 'omnivorous-curious';
  if (totalCategories > 5) return 'broad-curious';
  if (totalCategories > 3) return 'focused-curious';
  return 'narrow-focused';
}

/**
 * Categorize GitHub projects by topics
 */
function categorizeGitHubProjects(topics) {
  const categories = {
    ai_ml: 0,
    web: 0,
    mobile: 0,
    data: 0,
    devops: 0,
    security: 0,
    other: 0
  };

  const keywords = {
    ai_ml: ['ai', 'ml', 'machine-learning', 'deep-learning', 'neural', 'tensorflow', 'pytorch'],
    web: ['web', 'frontend', 'backend', 'react', 'vue', 'angular', 'node', 'express'],
    mobile: ['mobile', 'android', 'ios', 'react-native', 'flutter'],
    data: ['data', 'database', 'sql', 'analytics', 'visualization'],
    devops: ['devops', 'docker', 'kubernetes', 'ci-cd', 'deployment'],
    security: ['security', 'crypto', 'authentication', 'encryption']
  };

  for (const topic of topics) {
    const topicLower = topic.toLowerCase();
    let categorized = false;

    for (const [category, kws] of Object.entries(keywords)) {
      if (kws.some(kw => topicLower.includes(kw))) {
        categories[category]++;
        categorized = true;
        break;
      }
    }
    if (!categorized) {
      categories.other++;
    }
  }

  return categories;
}

/**
 * Categorize Discord servers by name patterns
 */
function categorizeDiscordServers(guilds) {
  const categories = {
    gaming: 0,
    tech: 0,
    creative: 0,
    social: 0,
    educational: 0,
    other: 0
  };

  const keywords = {
    gaming: ['game', 'gaming', 'clan', 'guild', 'esports', 'minecraft', 'valorant', 'league'],
    tech: ['dev', 'programming', 'code', 'tech', 'software', 'engineer'],
    creative: ['art', 'music', 'design', 'creative', 'artist'],
    social: ['community', 'hangout', 'chill', 'friends', 'chat'],
    educational: ['learn', 'study', 'education', 'university', 'school']
  };

  for (const guild of guilds) {
    const name = (guild.name || '').toLowerCase();
    let categorized = false;

    for (const [category, kws] of Object.entries(keywords)) {
      if (kws.some(kw => name.includes(kw))) {
        categories[category]++;
        categorized = true;
        break;
      }
    }
    if (!categorized) {
      categories.other++;
    }
  }

  return categories;
}

/**
 * Determine social circles from Discord servers
 */
function determineSocialCircles(guilds) {
  const circles = {
    gaming: 0,
    professional: 0,
    hobby: 0,
    social: 0
  };

  for (const guild of guilds) {
    const name = (guild.name || '').toLowerCase();

    if (/game|gaming|clan|guild|esports/.test(name)) {
      circles.gaming++;
    } else if (/dev|tech|professional|work|career/.test(name)) {
      circles.professional++;
    } else if (/art|music|hobby|creative|maker/.test(name)) {
      circles.hobby++;
    } else {
      circles.social++;
    }
  }

  return circles;
}

/**
 * Calculate Discord account age from snowflake ID
 */
function calculateAccountAge(userId) {
  const DISCORD_EPOCH = 1420070400000;
  const timestamp = (BigInt(userId) >> 22n) + BigInt(DISCORD_EPOCH);
  const accountCreated = new Date(Number(timestamp));
  const ageYears = (Date.now() - accountCreated.getTime()) / (1000 * 60 * 60 * 24 * 365);

  return `${Math.floor(ageYears)} years`;
}

/**
 * Categorize Netflix content by genre keywords
 */
function categorizeNetflixContent(viewingActivity) {
  const genres = {
    drama: 0,
    comedy: 0,
    documentary: 0,
    thriller: 0,
    action: 0,
    scifi: 0,
    romance: 0,
    horror: 0,
    other: 0
  };

  const keywords = {
    drama: ['drama', 'story', 'life', 'family'],
    comedy: ['comedy', 'funny', 'sitcom', 'laughs'],
    documentary: ['documentary', 'true', 'history', 'nature', 'planet'],
    thriller: ['thriller', 'mystery', 'crime', 'detective'],
    action: ['action', 'adventure', 'hero', 'battle'],
    scifi: ['sci-fi', 'science', 'future', 'space', 'alien'],
    romance: ['romance', 'love', 'dating', 'relationship'],
    horror: ['horror', 'scary', 'ghost', 'haunted']
  };

  for (const item of viewingActivity) {
    const title = (item.title || '').toLowerCase();
    let categorized = false;

    for (const [genre, kws] of Object.entries(keywords)) {
      if (kws.some(kw => title.includes(kw))) {
        genres[genre]++;
        categorized = true;
        break;
      }
    }
    if (!categorized) {
      genres.other++;
    }
  }

  return genres;
}

/**
 * Detect emotional journey patterns in Netflix viewing
 */
function detectEmotionalJourney(viewingActivity) {
  // Simplified emotion detection based on genre patterns
  const recentViewing = viewingActivity.slice(0, 20);
  const genres = categorizeNetflixContent(recentViewing);

  const thrillerRatio = (genres.thriller + genres.horror) / recentViewing.length;
  const comfortRatio = (genres.comedy + genres.romance) / recentViewing.length;
  const seriousRatio = (genres.documentary + genres.drama) / recentViewing.length;

  if (thrillerRatio > 0.5) return 'seeking-intensity';
  if (comfortRatio > 0.5) return 'comfort-seeking';
  if (seriousRatio > 0.5) return 'intellectual-exploration';
  return 'varied-exploration';
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

/**
 * Extract soul data from a specific platform
 * Routes to the appropriate extraction function
 */
export async function extractPlatformSoulData(platform, userId, accessToken = null, extensionData = null) {
  try {
    console.log(`\n🎯 Starting soul extraction for platform: ${platform}`);

    // Get access token from database if not provided
    if (!accessToken && platform !== 'netflix') {
      const supabase = getSupabaseClient();
      const { data: connection } = await supabase
        .from('platform_connections')
        .select('access_token')
        .eq('user_id', userId)
        .eq('platform', platform)
        .single();

      if (!connection || !connection.access_token) {
        console.warn(`⚠️ No access token found for ${platform}`);
        return null;
      }

      accessToken = decryptToken(connection.access_token);
    }

    // Route to appropriate extractor
    let result;
    switch (platform) {
      case 'spotify':
        result = await extractSpotifyData(accessToken);
        break;
      case 'youtube':
        result = await extractYouTubeData(accessToken);
        break;
      case 'github':
        result = await extractGitHubData(accessToken);
        break;
      case 'discord':
        result = await extractDiscordData(accessToken);
        break;
      case 'netflix':
        result = await extractNetflixData(extensionData);
        break;
      default:
        console.warn(`⚠️ Unknown platform: ${platform}`);
        return null;
    }

    // Save to database if successful
    if (result && !result.error) {
      const supabase = getSupabaseClient();
      await supabase
        .from('soul_data')
        .insert({
          user_id: userId,
          platform: result.platform,
          data_type: result.dataType,
          raw_data: result.rawData,
          extracted_patterns: result.extractedPatterns,
          extraction_quality: result.quality,
          extracted_at: new Date()
        });

      console.log(`✅ Soul data saved to database for ${platform}`);
    }

    return result;

  } catch (error) {
    console.error(`❌ Platform extraction failed for ${platform}:`, error.message);
    return null;
  }
}

export default {
  extractSpotifyData,
  extractYouTubeData,
  extractGitHubData,
  extractDiscordData,
  extractNetflixData,
  extractPlatformSoulData
};
