/**
 * Arctic Platform Data Extraction Service
 * Extracts soul signature data from Arctic OAuth connected platforms
 * Supports: Spotify, Discord, GitHub, Reddit, Twitch, YouTube
 */

import { createClient } from '@supabase/supabase-js';
import { decryptToken } from './encryption.js';

// Lazy initialize Supabase
let supabase = null;
function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

/**
 * Main extraction function called by Arctic OAuth callback
 * @param {string} provider - Platform name (spotify, discord, github, etc.)
 * @param {string} userId - User ID
 * @param {string} accessToken - Fresh access token (not encrypted)
 * @returns {Promise<{success: boolean, extractedItems: number, errors: string[]}>}
 */
export async function extractPlatformDataDirect(provider, userId, accessToken) {
  console.log(`[Arctic Extraction] Starting extraction for ${provider}, user ${userId}`);

  try {
    let result;

    switch (provider) {
      case 'spotify':
        result = await extractSpotifyData(userId, accessToken);
        break;
      case 'youtube':
      case 'google_youtube':
        result = await extractYouTubeData(userId, accessToken);
        break;
      case 'discord':
        result = await extractDiscordData(userId, accessToken);
        break;
      case 'github':
        result = await extractGitHubData(userId, accessToken);
        break;
      case 'reddit':
        result = await extractRedditData(userId, accessToken);
        break;
      case 'twitch':
        result = await extractTwitchData(userId, accessToken);
        break;
      default:
        throw new Error(`Extraction not implemented for ${provider}`);
    }

    // Update last sync time
    await updateLastSync(userId, provider);

    console.log(`[Arctic Extraction] ✅ Completed for ${provider}: ${result.extractedItems} items`);
    return result;

  } catch (error) {
    console.error(`[Arctic Extraction] ❌ Failed for ${provider}:`, error.message);
    return {
      success: false,
      extractedItems: 0,
      errors: [error.message]
    };
  }
}

/**
 * Extract Spotify listening data
 */
async function extractSpotifyData(userId, accessToken) {
  console.log('[Spotify Extraction] Fetching user data...');

  const errors = [];
  let extractedItems = 0;

  try {
    // Fetch top tracks (short, medium, long term)
    const topTracksShort = await fetchSpotifyAPI('https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=50', accessToken);
    const topTracksMedium = await fetchSpotifyAPI('https://api.spotify.com/v1/me/top/tracks?time_range=medium_term&limit=50', accessToken);
    const topTracksLong = await fetchSpotifyAPI('https://api.spotify.com/v1/me/top/tracks?time_range=long_term&limit=50', accessToken);

    // Fetch top artists
    const topArtistsShort = await fetchSpotifyAPI('https://api.spotify.com/v1/me/top/artists?time_range=short_term&limit=50', accessToken);
    const topArtistsMedium = await fetchSpotifyAPI('https://api.spotify.com/v1/me/top/artists?time_range=medium_term&limit=50', accessToken);
    const topArtistsLong = await fetchSpotifyAPI('https://api.spotify.com/v1/me/top/artists?time_range=long_term&limit=50', accessToken);

    // Fetch recently played
    const recentlyPlayed = await fetchSpotifyAPI('https://api.spotify.com/v1/me/player/recently-played?limit=50', accessToken);

    // Fetch saved tracks
    const savedTracks = await fetchSpotifyAPI('https://api.spotify.com/v1/me/tracks?limit=50', accessToken);

    // Fetch user playlists
    const playlists = await fetchSpotifyAPI('https://api.spotify.com/v1/me/playlists?limit=50', accessToken);

    // Store top tracks
    if (topTracksShort?.items) {
      await storeSoulData(userId, 'spotify', 'top_tracks_short_term', {
        items: topTracksShort.items,
        extractedAt: new Date().toISOString()
      });
      extractedItems += topTracksShort.items.length;
    }

    if (topTracksMedium?.items) {
      await storeSoulData(userId, 'spotify', 'top_tracks_medium_term', {
        items: topTracksMedium.items,
        extractedAt: new Date().toISOString()
      });
      extractedItems += topTracksMedium.items.length;
    }

    if (topTracksLong?.items) {
      await storeSoulData(userId, 'spotify', 'top_tracks_long_term', {
        items: topTracksLong.items,
        extractedAt: new Date().toISOString()
      });
      extractedItems += topTracksLong.items.length;
    }

    // Store top artists
    if (topArtistsShort?.items) {
      await storeSoulData(userId, 'spotify', 'top_artists_short_term', {
        items: topArtistsShort.items,
        extractedAt: new Date().toISOString()
      });
      extractedItems += topArtistsShort.items.length;
    }

    if (topArtistsMedium?.items) {
      await storeSoulData(userId, 'spotify', 'top_artists_medium_term', {
        items: topArtistsMedium.items,
        extractedAt: new Date().toISOString()
      });
      extractedItems += topArtistsMedium.items.length;
    }

    if (topArtistsLong?.items) {
      await storeSoulData(userId, 'spotify', 'top_artists_long_term', {
        items: topArtistsLong.items,
        extractedAt: new Date().toISOString()
      });
      extractedItems += topArtistsLong.items.length;
    }

    // Store recently played
    if (recentlyPlayed?.items) {
      await storeSoulData(userId, 'spotify', 'recently_played', {
        items: recentlyPlayed.items,
        extractedAt: new Date().toISOString()
      });
      extractedItems += recentlyPlayed.items.length;
    }

    // Store saved tracks
    if (savedTracks?.items) {
      await storeSoulData(userId, 'spotify', 'saved_tracks', {
        items: savedTracks.items,
        total: savedTracks.total,
        extractedAt: new Date().toISOString()
      });
      extractedItems += savedTracks.items.length;
    }

    // Store playlists
    if (playlists?.items) {
      await storeSoulData(userId, 'spotify', 'playlists', {
        items: playlists.items,
        total: playlists.total,
        extractedAt: new Date().toISOString()
      });
      extractedItems += playlists.items.length;
    }

    console.log(`[Spotify Extraction] ✅ Extracted ${extractedItems} items`);

    return {
      success: true,
      extractedItems,
      errors
    };

  } catch (error) {
    console.error('[Spotify Extraction] Error:', error);
    errors.push(error.message);
    return {
      success: false,
      extractedItems,
      errors
    };
  }
}

/**
 * Extract YouTube data
 */
async function extractYouTubeData(userId, accessToken) {
  console.log('[YouTube Extraction] Fetching user data...');

  const errors = [];
  let extractedItems = 0;

  try {
    // Fetch subscriptions
    const subscriptions = await fetchYouTubeAPI('https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=50', accessToken);

    // Fetch liked videos
    const likedVideos = await fetchYouTubeAPI('https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&myRating=like&maxResults=50', accessToken);

    // Fetch user's playlists
    const playlists = await fetchYouTubeAPI('https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50', accessToken);

    // Store subscriptions
    if (subscriptions?.items) {
      await storeSoulData(userId, 'youtube', 'subscriptions', {
        items: subscriptions.items,
        totalResults: subscriptions.pageInfo?.totalResults,
        extractedAt: new Date().toISOString()
      });
      extractedItems += subscriptions.items.length;
    }

    // Store liked videos
    if (likedVideos?.items) {
      await storeSoulData(userId, 'youtube', 'liked_videos', {
        items: likedVideos.items,
        extractedAt: new Date().toISOString()
      });
      extractedItems += likedVideos.items.length;
    }

    // Store playlists
    if (playlists?.items) {
      await storeSoulData(userId, 'youtube', 'playlists', {
        items: playlists.items,
        totalResults: playlists.pageInfo?.totalResults,
        extractedAt: new Date().toISOString()
      });
      extractedItems += playlists.items.length;
    }

    console.log(`[YouTube Extraction] ✅ Extracted ${extractedItems} items`);

    return {
      success: true,
      extractedItems,
      errors
    };

  } catch (error) {
    console.error('[YouTube Extraction] Error:', error);
    errors.push(error.message);
    return {
      success: false,
      extractedItems,
      errors
    };
  }
}

/**
 * Extract Discord data
 */
async function extractDiscordData(userId, accessToken) {
  console.log('[Discord Extraction] Fetching user data...');

  const errors = [];
  let extractedItems = 0;

  try {
    // Fetch user's guilds (servers)
    const guilds = await fetchDiscordAPI('https://discord.com/api/users/@me/guilds', accessToken);

    // Fetch user connections
    const connections = await fetchDiscordAPI('https://discord.com/api/users/@me/connections', accessToken);

    // Store guilds
    if (guilds && Array.isArray(guilds)) {
      await storeSoulData(userId, 'discord', 'guilds', {
        items: guilds,
        extractedAt: new Date().toISOString()
      });
      extractedItems += guilds.length;
    }

    // Store connections
    if (connections && Array.isArray(connections)) {
      await storeSoulData(userId, 'discord', 'connections', {
        items: connections,
        extractedAt: new Date().toISOString()
      });
      extractedItems += connections.length;
    }

    console.log(`[Discord Extraction] ✅ Extracted ${extractedItems} items`);

    return {
      success: true,
      extractedItems,
      errors
    };

  } catch (error) {
    console.error('[Discord Extraction] Error:', error);
    errors.push(error.message);
    return {
      success: false,
      extractedItems,
      errors
    };
  }
}

/**
 * Extract GitHub data
 */
async function extractGitHubData(userId, accessToken) {
  console.log('[GitHub Extraction] Fetching user data...');

  const errors = [];
  let extractedItems = 0;

  try {
    // First, fetch user profile to get username
    const userProfile = await fetchGitHubAPI('https://api.github.com/user', accessToken);
    const username = userProfile.login;

    // Fetch user's repositories
    const repos = await fetchGitHubAPI('https://api.github.com/user/repos?per_page=100&sort=updated', accessToken);

    // Fetch starred repositories
    const starred = await fetchGitHubAPI('https://api.github.com/user/starred?per_page=100', accessToken);

    // Fetch user events (activity)
    const events = await fetchGitHubAPI(`https://api.github.com/users/${username}/events?per_page=100`, accessToken);

    // Fetch following
    const following = await fetchGitHubAPI('https://api.github.com/user/following?per_page=100', accessToken);

    // Store repositories
    if (repos && Array.isArray(repos)) {
      await storeSoulData(userId, 'github', 'repositories', {
        items: repos,
        extractedAt: new Date().toISOString()
      });
      extractedItems += repos.length;
    }

    // Store starred repos
    if (starred && Array.isArray(starred)) {
      await storeSoulData(userId, 'github', 'starred', {
        items: starred,
        extractedAt: new Date().toISOString()
      });
      extractedItems += starred.length;
    }

    // Store events
    if (events && Array.isArray(events)) {
      await storeSoulData(userId, 'github', 'events', {
        items: events,
        extractedAt: new Date().toISOString()
      });
      extractedItems += events.length;
    }

    // Store following
    if (following && Array.isArray(following)) {
      await storeSoulData(userId, 'github', 'following', {
        items: following,
        extractedAt: new Date().toISOString()
      });
      extractedItems += following.length;
    }

    console.log(`[GitHub Extraction] ✅ Extracted ${extractedItems} items`);

    return {
      success: true,
      extractedItems,
      errors
    };

  } catch (error) {
    console.error('[GitHub Extraction] Error:', error);
    errors.push(error.message);
    return {
      success: false,
      extractedItems,
      errors
    };
  }
}

/**
 * Extract Reddit data
 */
async function extractRedditData(userId, accessToken) {
  console.log('[Reddit Extraction] Fetching user data...');

  const errors = [];
  let extractedItems = 0;

  try {
    // Fetch user info
    const userInfo = await fetchRedditAPI('https://oauth.reddit.com/api/v1/me', accessToken);

    // Fetch subscribed subreddits
    const subreddits = await fetchRedditAPI('https://oauth.reddit.com/subreddits/mine/subscriber?limit=100', accessToken);

    // Fetch saved posts
    const saved = await fetchRedditAPI('https://oauth.reddit.com/user/' + userInfo.name + '/saved?limit=100', accessToken);

    // Fetch user's posts
    const submitted = await fetchRedditAPI('https://oauth.reddit.com/user/' + userInfo.name + '/submitted?limit=100', accessToken);

    // Fetch user's comments
    const comments = await fetchRedditAPI('https://oauth.reddit.com/user/' + userInfo.name + '/comments?limit=100', accessToken);

    // Store subreddits
    if (subreddits?.data?.children) {
      await storeSoulData(userId, 'reddit', 'subreddits', {
        items: subreddits.data.children,
        extractedAt: new Date().toISOString()
      });
      extractedItems += subreddits.data.children.length;
    }

    // Store saved posts
    if (saved?.data?.children) {
      await storeSoulData(userId, 'reddit', 'saved', {
        items: saved.data.children,
        extractedAt: new Date().toISOString()
      });
      extractedItems += saved.data.children.length;
    }

    // Store submitted posts
    if (submitted?.data?.children) {
      await storeSoulData(userId, 'reddit', 'submitted', {
        items: submitted.data.children,
        extractedAt: new Date().toISOString()
      });
      extractedItems += submitted.data.children.length;
    }

    // Store comments
    if (comments?.data?.children) {
      await storeSoulData(userId, 'reddit', 'comments', {
        items: comments.data.children,
        extractedAt: new Date().toISOString()
      });
      extractedItems += comments.data.children.length;
    }

    console.log(`[Reddit Extraction] ✅ Extracted ${extractedItems} items`);

    return {
      success: true,
      extractedItems,
      errors
    };

  } catch (error) {
    console.error('[Reddit Extraction] Error:', error);
    errors.push(error.message);
    return {
      success: false,
      extractedItems,
      errors
    };
  }
}

/**
 * Extract Twitch data
 */
async function extractTwitchData(userId, accessToken) {
  console.log('[Twitch Extraction] Fetching user data...');

  const errors = [];
  let extractedItems = 0;

  try {
    // Fetch user info
    const userResponse = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Client-ID': process.env.TWITCH_CLIENT_ID
      }
    });

    if (!userResponse.ok) {
      throw new Error(`Twitch API error: ${userResponse.statusText}`);
    }

    const userData = await userResponse.json();
    const twitchUserId = userData.data[0]?.id;

    if (!twitchUserId) {
      throw new Error('Could not get Twitch user ID');
    }

    // Fetch followed channels
    const followedResponse = await fetch(`https://api.twitch.tv/helix/channels/followed?user_id=${twitchUserId}&first=100`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Client-ID': process.env.TWITCH_CLIENT_ID
      }
    });

    if (followedResponse.ok) {
      const followedData = await followedResponse.json();

      if (followedData?.data) {
        await storeSoulData(userId, 'twitch', 'followed_channels', {
          items: followedData.data,
          total: followedData.total,
          extractedAt: new Date().toISOString()
        });
        extractedItems += followedData.data.length;
      }
    }

    // Fetch user's subscriptions
    const subsResponse = await fetch(`https://api.twitch.tv/helix/subscriptions/user?user_id=${twitchUserId}&first=100`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Client-ID': process.env.TWITCH_CLIENT_ID
      }
    });

    if (subsResponse.ok) {
      const subsData = await subsResponse.json();

      if (subsData?.data) {
        await storeSoulData(userId, 'twitch', 'subscriptions', {
          items: subsData.data,
          extractedAt: new Date().toISOString()
        });
        extractedItems += subsData.data.length;
      }
    }

    console.log(`[Twitch Extraction] ✅ Extracted ${extractedItems} items`);

    return {
      success: true,
      extractedItems,
      errors
    };

  } catch (error) {
    console.error('[Twitch Extraction] Error:', error);
    errors.push(error.message);
    return {
      success: false,
      extractedItems,
      errors
    };
  }
}

/**
 * Helper: Fetch from Spotify API
 */
async function fetchSpotifyAPI(url, accessToken) {
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Spotify API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Helper: Fetch from YouTube API
 */
async function fetchYouTubeAPI(url, accessToken) {
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`YouTube API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Helper: Fetch from Discord API
 */
async function fetchDiscordAPI(url, accessToken) {
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Discord API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Helper: Fetch from GitHub API
 */
async function fetchGitHubAPI(url, accessToken) {
  const response = await fetch(url, {
    headers: {
      'Authorization': `token ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Helper: Fetch from Reddit API
 */
async function fetchRedditAPI(url, accessToken) {
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TwinAILearn/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Reddit API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Store extracted data in soul_data table
 */
async function storeSoulData(userId, platform, dataType, rawData) {
  try {
    const { error } = await getSupabase()
      .from('soul_data')
      .upsert({
        user_id: userId,
        platform,
        data_type: dataType,
        raw_data: rawData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,platform,data_type'
      });

    if (error) {
      console.error(`[Storage] Error storing ${platform} ${dataType}:`, error);
      throw error;
    }

    console.log(`[Storage] ✅ Stored ${platform} ${dataType}`);
  } catch (error) {
    console.error(`[Storage] Failed to store ${platform} ${dataType}:`, error);
    throw error;
  }
}

/**
 * Update last sync timestamp for platform connection
 */
async function updateLastSync(userId, platform) {
  try {
    const { error } = await getSupabase()
      .from('platform_connections')
      .update({
        last_sync: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('platform', platform);

    if (error) {
      console.error(`[Update Sync] Error updating ${platform}:`, error);
    } else {
      console.log(`[Update Sync] ✅ Updated ${platform} last_sync`);
    }
  } catch (error) {
    console.error(`[Update Sync] Failed for ${platform}:`, error);
  }
}

export default {
  extractPlatformDataDirect
};
