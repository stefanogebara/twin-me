/**
 * YouTube Data Extraction & Soul Signature Analysis
 *
 * Extracts learning interests, content preferences, and calculates Big Five personality traits
 * based on watch history, subscriptions, and engagement patterns.
 */

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { decryptToken } from './encryption.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Main extraction function - retrieves all YouTube data
 */
export async function extractYouTubeData(userId) {
  try {
    // Get platform connection with encrypted tokens
    const { data: connection, error: connectionError } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'youtube')
      .single();

    if (connectionError || !connection) {
      throw new Error('YouTube not connected for this user');
    }

    if (!connection.access_token) {
      throw new Error('No access token found for YouTube');
    }

    // Decrypt access token
    const accessToken = decryptToken(connection.access_token);

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    };

    console.log(`📺 Extracting YouTube data for user ${userId}...`);

    // Extract multiple data types in parallel for performance
    const [
      channelResponse,
      subscriptionsResponse,
      playlistsResponse,
      likedVideosPlaylistResponse,
      activitiesResponse
    ] = await Promise.all([
      // Get user's channel info
      axios.get('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true', { headers }),

      // Get subscriptions (channels the user follows)
      axios.get('https://www.googleapis.com/youtube/v3/subscriptions?part=snippet,contentDetails&mine=true&maxResults=50', { headers }),

      // Get user's playlists
      axios.get('https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=50', { headers }),

      // Get liked videos playlist ID
      axios.get('https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true', { headers }),

      // Get recent activities (uploads, likes, etc.)
      axios.get('https://www.googleapis.com/youtube/v3/activities?part=snippet,contentDetails&mine=true&maxResults=50', { headers })
    ]);

    // Get liked videos using the likes playlist
    let likedVideos = [];
    if (likedVideosPlaylistResponse.data.items?.[0]?.contentDetails?.relatedPlaylists?.likes) {
      const likesPlaylistId = likedVideosPlaylistResponse.data.items[0].contentDetails.relatedPlaylists.likes;
      const likedVideosResponse = await axios.get(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${likesPlaylistId}&maxResults=50`,
        { headers }
      );
      likedVideos = likedVideosResponse.data.items || [];
    }

    // Get watch history from uploads playlist (recent uploads to personal channel) and activities
    const channel = channelResponse.data.items?.[0];
    const uploadsPlaylistId = channel?.contentDetails?.relatedPlaylists?.uploads;

    let uploadedVideos = [];
    if (uploadsPlaylistId) {
      const uploadsResponse = await axios.get(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50`,
        { headers }
      );
      uploadedVideos = uploadsResponse.data.items || [];
    }

    // Transform to soul signature format
    const soulData = transformYouTubeToSoulSignature({
      channel: channel || {},
      subscriptions: subscriptionsResponse.data.items || [],
      playlists: playlistsResponse.data.items || [],
      likedVideos,
      activities: activitiesResponse.data.items || [],
      uploadedVideos
    });

    // Calculate total items extracted
    const totalItems =
      soulData.subscriptions.length +
      soulData.playlists.length +
      soulData.likedVideos.length +
      soulData.activities.length;

    console.log(`✅ Extracted ${totalItems} YouTube items`);

    // Save extracted data to soul_data table
    const { error: insertError } = await supabase
      .from('soul_data')
      .insert({
        user_id: userId,
        platform: 'youtube',
        data_type: 'comprehensive_youtube_profile',
        raw_data: {
          channel: channelResponse.data,
          subscriptions: subscriptionsResponse.data,
          playlists: playlistsResponse.data,
          likedVideos,
          activities: activitiesResponse.data,
          uploadedVideos
        },
        extracted_patterns: soulData,
        extracted_at: new Date()
      });

    if (insertError) {
      console.error('Error saving YouTube data:', insertError);
    }

    // Update connection status
    await supabase
      .from('platform_connections')
      .update({
        last_synced_at: new Date(),
        last_sync_status: 'success'
      })
      .eq('user_id', userId)
      .eq('platform', 'youtube');

    return {
      success: true,
      itemsExtracted: totalItems,
      platform: 'youtube',
      insights: soulData.insights,
      profile: soulData.profile
    };

  } catch (error) {
    console.error('YouTube extraction error:', error);

    // Handle token expiration
    if (error.response?.status === 401) {
      await supabase
        .from('platform_connections')
        .update({
          last_sync_status: 'requires_reauth'
        })
        .eq('user_id', userId)
        .eq('platform', 'youtube');

      return {
        success: false,
        requiresReauth: true,
        error: 'Token expired - reconnection required'
      };
    }

    // Handle rate limiting
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      return {
        success: false,
        rateLimited: true,
        retryAfter: parseInt(retryAfter) || 60,
        error: 'Rate limit exceeded'
      };
    }

    // Update connection with error status
    await supabase
      .from('platform_connections')
      .update({
        last_sync_status: 'failed'
      })
      .eq('user_id', userId)
      .eq('platform', 'youtube');

    throw error;
  }
}

/**
 * Transform YouTube data to soul signature format with Big Five personality traits
 */
function transformYouTubeToSoulSignature(youtubeData) {
  const {
    channel,
    subscriptions,
    playlists,
    likedVideos,
    activities,
    uploadedVideos
  } = youtubeData;

  // Extract categories from subscriptions and liked videos
  const subscribedChannels = subscriptions.map(sub => ({
    channelId: sub.snippet.resourceId.channelId,
    title: sub.snippet.title,
    description: sub.snippet.description,
    publishedAt: sub.snippet.publishedAt
  }));

  // Analyze content categories from activities and likes
  const contentCategories = extractContentCategories(likedVideos, activities);

  // Analyze learning patterns
  const learningPatterns = analyzeLearningPatterns(likedVideos, subscriptions, activities);

  return {
    profile: {
      channelId: channel.id,
      channelTitle: channel.snippet?.title,
      description: channel.snippet?.description,
      subscriberCount: parseInt(channel.statistics?.subscriberCount || 0),
      videoCount: parseInt(channel.statistics?.videoCount || 0),
      viewCount: parseInt(channel.statistics?.viewCount || 0)
    },

    subscriptions: subscribedChannels,

    playlists: playlists.map(playlist => ({
      id: playlist.id,
      title: playlist.snippet.title,
      description: playlist.snippet.description,
      itemCount: playlist.contentDetails?.itemCount || 0,
      publishedAt: playlist.snippet.publishedAt
    })),

    likedVideos: likedVideos.map(item => ({
      videoId: item.contentDetails?.videoId || item.snippet?.resourceId?.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt
    })).slice(0, 50), // Limit to recent 50

    activities: activities.map(activity => ({
      type: activity.snippet.type,
      title: activity.snippet.title,
      description: activity.snippet.description,
      publishedAt: activity.snippet.publishedAt,
      channelTitle: activity.snippet.channelTitle
    })),

    insights: {
      totalSubscriptions: subscriptions.length,
      totalPlaylists: playlists.length,
      totalLikedVideos: likedVideos.length,
      totalUploads: uploadedVideos.length,

      topCategories: contentCategories.slice(0, 10),

      learningStyle: learningPatterns.learningStyle,
      curiosityScore: learningPatterns.curiosityScore,
      engagementLevel: learningPatterns.engagementLevel,

      // Big Five Personality Traits (0-100 scale)
      traits: {
        openness: calculateOpenness(contentCategories, subscriptions),
        extraversion: calculateExtraversion(activities, uploadedVideos),
        agreeableness: calculateAgreeableness(activities),
        conscientiousness: calculateConscientiousness(playlists, likedVideos),
        neuroticism: calculateNeuroticism(contentCategories)
      },

      // Additional personality indicators
      contentPersonality: determineContentPersonality({
        categories: contentCategories,
        subscriptions: subscriptions.length,
        uploads: uploadedVideos.length,
        engagement: learningPatterns.engagementLevel
      })
    }
  };
}

/**
 * Extract content categories from videos and activities
 */
function extractContentCategories(likedVideos, activities) {
  const categories = {};

  // Analyze video titles and channel names for keywords
  const allContent = [
    ...likedVideos.map(v => ({ title: v.snippet.title, channel: v.snippet.channelTitle })),
    ...activities.map(a => ({ title: a.snippet.title, channel: a.snippet.channelTitle }))
  ];

  const categoryKeywords = {
    'Education': ['tutorial', 'learn', 'education', 'course', 'lecture', 'lesson', 'how to', 'explained'],
    'Technology': ['tech', 'programming', 'coding', 'software', 'developer', 'computer', 'ai', 'technology'],
    'Gaming': ['gaming', 'gameplay', 'game', 'gamer', 'walkthrough', 'playthrough', 'lets play'],
    'Music': ['music', 'song', 'official video', 'mv', 'audio', 'lyrics', 'cover'],
    'Entertainment': ['vlog', 'comedy', 'funny', 'entertainment', 'challenge', 'prank'],
    'News': ['news', 'breaking', 'politics', 'current events', 'journalism'],
    'Science': ['science', 'research', 'experiment', 'physics', 'chemistry', 'biology'],
    'Fitness': ['workout', 'fitness', 'exercise', 'health', 'gym', 'training'],
    'Cooking': ['recipe', 'cooking', 'food', 'chef', 'kitchen', 'baking'],
    'Travel': ['travel', 'vlog', 'destination', 'trip', 'adventure', 'exploring']
  };

  allContent.forEach(content => {
    const text = `${content.title} ${content.channel}`.toLowerCase();

    Object.entries(categoryKeywords).forEach(([category, keywords]) => {
      const matchCount = keywords.filter(keyword => text.includes(keyword)).length;
      if (matchCount > 0) {
        categories[category] = (categories[category] || 0) + matchCount;
      }
    });
  });

  return Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({ category, count }));
}

/**
 * Analyze learning patterns from user behavior
 */
function analyzeLearningPatterns(likedVideos, subscriptions, activities) {
  const educationalKeywords = ['tutorial', 'learn', 'education', 'course', 'how to', 'explained'];

  const educationalContent = likedVideos.filter(video => {
    const text = video.snippet.title.toLowerCase();
    return educationalKeywords.some(keyword => text.includes(keyword));
  });

  const educationalRatio = educationalContent.length / Math.max(likedVideos.length, 1);

  let learningStyle = 'Casual Consumer';
  if (educationalRatio > 0.5) learningStyle = 'Active Learner';
  if (educationalRatio > 0.7) learningStyle = 'Knowledge Seeker';
  if (educationalRatio > 0.9) learningStyle = 'Dedicated Student';

  const curiosityScore = Math.min(Math.round((subscriptions.length / 50 + educationalRatio) * 50), 100);

  const engagementLevel = activities.length > 30 ? 'High' : activities.length > 15 ? 'Medium' : 'Low';

  return {
    learningStyle,
    curiosityScore,
    engagementLevel
  };
}

/**
 * Big Five Personality Trait: Openness to Experience
 * Based on content diversity and educational engagement
 */
function calculateOpenness(contentCategories, subscriptions) {
  const categoryDiversity = contentCategories.length;
  const diversityScore = Math.min((categoryDiversity / 10) * 60, 60); // Max 10 categories = 60 points

  const subscriptionScore = Math.min((subscriptions.length / 50) * 40, 40); // Max 50 subs = 40 points

  return Math.round(diversityScore + subscriptionScore);
}

/**
 * Big Five Personality Trait: Extraversion
 * Based on content creation and social engagement
 */
function calculateExtraversion(activities, uploadedVideos) {
  const uploadScore = Math.min((uploadedVideos.length / 20) * 50, 50); // Content creation
  const activityScore = Math.min((activities.length / 40) * 50, 50); // Overall engagement

  return Math.round((uploadScore + activityScore) / 2);
}

/**
 * Big Five Personality Trait: Agreeableness
 * Based on likes and positive engagement
 */
function calculateAgreeableness(activities) {
  const likeActivities = activities.filter(a => a.snippet.type === 'like').length;
  const totalActivities = Math.max(activities.length, 1);

  return Math.round((likeActivities / totalActivities) * 100);
}

/**
 * Big Five Personality Trait: Conscientiousness
 * Based on playlist organization and curation
 */
function calculateConscientiousness(playlists, likedVideos) {
  const playlistScore = Math.min((playlists.length / 10) * 50, 50); // Organization
  const curationScore = Math.min((likedVideos.length / 100) * 50, 50); // Curation

  return Math.round(playlistScore + curationScore);
}

/**
 * Big Five Personality Trait: Neuroticism
 * Based on negative or intense content preferences
 */
function calculateNeuroticism(contentCategories) {
  const intensiveCategories = ['News', 'Politics', 'True Crime', 'Horror'];
  const intensiveContent = contentCategories.filter(cat =>
    intensiveCategories.includes(cat.category)
  ).reduce((sum, cat) => sum + cat.count, 0);

  const totalContent = contentCategories.reduce((sum, cat) => sum + cat.count, 0);
  const intensiveRatio = intensiveContent / Math.max(totalContent, 1);

  return Math.round(intensiveRatio * 100);
}

/**
 * Helper: Determine overall content personality archetype
 */
function determineContentPersonality(metrics) {
  const { categories, subscriptions, uploads, engagement } = metrics;

  const topCategory = categories[0]?.category || '';

  if (topCategory === 'Education' && subscriptions > 30) return 'Lifelong Learner';
  if (uploads > 10) return 'Content Creator';
  if (topCategory === 'Gaming' && engagement === 'High') return 'Gaming Enthusiast';
  if (topCategory === 'Technology') return 'Tech Explorer';
  if (categories.length > 8) return 'Eclectic Viewer';
  if (topCategory === 'Entertainment') return 'Entertainment Seeker';

  return 'Balanced Consumer';
}

export default {
  extractYouTubeData
};
