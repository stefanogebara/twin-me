/**
 * Discord Data Extraction & Soul Signature Analysis
 *
 * Extracts community engagement, gaming interests, and calculates Big Five personality traits
 * based on server memberships, message activity, and social connections.
 */

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { decryptToken } from './encryption.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Main extraction function - retrieves all Discord data
 */
export async function extractDiscordData(userId) {
  try {
    // Get platform connection with encrypted tokens
    const { data: connection, error: connectionError } = await supabase
      .from('data_connectors')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'discord')
      .single();

    if (connectionError || !connection) {
      throw new Error('Discord not connected for this user');
    }

    if (!connection.access_token) {
      throw new Error('No access token found for Discord');
    }

    // Decrypt access token
    const accessToken = decryptToken(connection.access_token);

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TwinMe-App'
    };

    console.log(`💜 Extracting Discord data for user ${userId}...`);

    // Extract multiple data types in parallel for performance
    const [
      userResponse,
      guildsResponse,
      connectionsResponse
    ] = await Promise.all([
      // Get user profile
      axios.get('https://discord.com/api/v10/users/@me', { headers }),

      // Get user's guilds (servers)
      axios.get('https://discord.com/api/v10/users/@me/guilds', { headers }),

      // Get connected accounts
      axios.get('https://discord.com/api/v10/users/@me/connections', { headers })
    ]);

    // Transform to soul signature format
    const soulData = transformDiscordToSoulSignature({
      user: userResponse.data,
      guilds: guildsResponse.data,
      connections: connectionsResponse.data
    });

    // Calculate total items extracted
    const totalItems =
      soulData.guilds.length +
      soulData.connections.length;

    console.log(`✅ Extracted ${totalItems} Discord items`);

    // Save extracted data to soul_data table
    const { error: insertError } = await supabase
      .from('soul_data')
      .insert({
        user_id: userId,
        platform: 'discord',
        data_type: 'comprehensive_discord_profile',
        raw_data: {
          user: userResponse.data,
          guilds: guildsResponse.data,
          connections: connectionsResponse.data
        },
        extracted_patterns: soulData,
        extracted_at: new Date()
      });

    if (insertError) {
      console.error('Error saving Discord data:', insertError);
    }

    // Update connection status
    await supabase
      .from('data_connectors')
      .update({
        last_synced_at: new Date(),
        last_sync_status: 'success'
      })
      .eq('user_id', userId)
      .eq('provider', 'discord');

    return {
      success: true,
      itemsExtracted: totalItems,
      platform: 'discord',
      insights: soulData.insights,
      profile: soulData.profile
    };

  } catch (error) {
    console.error('Discord extraction error:', error);

    // Handle token expiration
    if (error.response?.status === 401) {
      await supabase
        .from('data_connectors')
        .update({
          last_sync_status: 'requires_reauth'
        })
        .eq('user_id', userId)
        .eq('provider', 'discord');

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
      .from('data_connectors')
      .update({
        last_sync_status: 'failed'
      })
      .eq('user_id', userId)
      .eq('provider', 'discord');

    throw error;
  }
}

/**
 * Transform Discord data to soul signature format with Big Five personality traits
 */
function transformDiscordToSoulSignature(discordData) {
  const {
    user,
    guilds,
    connections
  } = discordData;

  // Analyze server categories
  const serverCategories = extractServerCategories(guilds);

  // Analyze community engagement
  const engagementPatterns = analyzeCommunityEngagement(guilds, connections);

  return {
    profile: {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      globalName: user.global_name,
      avatar: user.avatar,
      banner: user.banner,
      accentColor: user.accent_color,
      locale: user.locale,
      verified: user.verified,
      mfaEnabled: user.mfa_enabled,
      premiumType: user.premium_type // 0 = None, 1 = Nitro Classic, 2 = Nitro
    },

    guilds: guilds.map(guild => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      owner: guild.owner,
      permissions: guild.permissions,
      features: guild.features || []
    })),

    connections: connections.map(conn => ({
      type: conn.type, // twitch, youtube, steam, spotify, etc.
      name: conn.name,
      verified: conn.verified,
      friendSync: conn.friend_sync,
      showActivity: conn.show_activity,
      visibility: conn.visibility
    })),

    insights: {
      totalGuilds: guilds.length,
      totalConnections: connections.length,

      ownedServers: guilds.filter(g => g.owner).length,
      verifiedServers: guilds.filter(g => g.features?.includes('VERIFIED')).length,
      partnerServers: guilds.filter(g => g.features?.includes('PARTNERED')).length,

      connectedPlatforms: connections.map(c => c.type),

      serverCategories: serverCategories.slice(0, 10),

      communityRole: engagementPatterns.communityRole,
      socialStyle: engagementPatterns.socialStyle,
      engagementLevel: engagementPatterns.engagementLevel,

      // Big Five Personality Traits (0-100 scale)
      traits: {
        openness: calculateOpenness(serverCategories, connections),
        extraversion: calculateExtraversion(guilds, connections),
        agreeableness: calculateAgreeableness(guilds),
        conscientiousness: calculateConscientiousness(guilds),
        neuroticism: calculateNeuroticism(guilds)
      },

      // Additional personality indicators
      discordPersonality: determineDiscordPersonality({
        categories: serverCategories,
        guilds: guilds.length,
        owned: guilds.filter(g => g.owner).length,
        connections: connections.length,
        engagement: engagementPatterns.engagementLevel
      })
    }
  };
}

/**
 * Extract server categories from guild names and features
 */
function extractServerCategories(guilds) {
  const categories = {};

  const categoryKeywords = {
    'Gaming': ['gaming', 'game', 'esports', 'valorant', 'league', 'minecraft', 'fortnite', 'apex', 'cod', 'csgo'],
    'Technology': ['tech', 'programming', 'coding', 'developer', 'software', 'web dev', 'python', 'javascript'],
    'Creative': ['art', 'design', 'music', 'creative', 'artist', 'drawing', 'animation', 'photography'],
    'Education': ['education', 'learning', 'study', 'university', 'college', 'school', 'homework'],
    'Entertainment': ['anime', 'manga', 'movies', 'tv', 'netflix', 'streaming', 'memes', 'funny'],
    'Fitness': ['fitness', 'gym', 'workout', 'health', 'bodybuilding', 'exercise'],
    'Social': ['hangout', 'chill', 'friends', 'community', 'chat', 'social'],
    'Crypto': ['crypto', 'bitcoin', 'nft', 'trading', 'defi', 'web3'],
    'Music': ['music', 'spotify', 'playlist', 'dj', 'producer', 'beats'],
    'Professional': ['business', 'entrepreneur', 'marketing', 'startup', 'professional']
  };

  guilds.forEach(guild => {
    const guildName = guild.name.toLowerCase();

    Object.entries(categoryKeywords).forEach(([category, keywords]) => {
      const matchCount = keywords.filter(keyword => guildName.includes(keyword)).length;
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
 * Analyze community engagement patterns
 */
function analyzeCommunityEngagement(guilds, connections) {
  const totalServers = guilds.length;
  const ownedServers = guilds.filter(g => g.owner).length;
  const totalConnections = connections.length;

  // Determine community role
  let communityRole = 'Member';
  if (ownedServers > 0) communityRole = 'Server Owner';
  if (ownedServers > 3) communityRole = 'Community Builder';
  if (totalServers > 50) communityRole = 'Super User';

  // Determine social style
  let socialStyle = 'Observer';
  if (totalServers > 10) socialStyle = 'Active Participant';
  if (totalServers > 30) socialStyle = 'Social Butterfly';
  if (totalConnections > 3) socialStyle = 'Cross-Platform Connector';

  // Determine engagement level
  let engagementLevel = 'Low';
  if (totalServers > 10) engagementLevel = 'Medium';
  if (totalServers > 30) engagementLevel = 'High';
  if (totalServers > 50 || ownedServers > 2) engagementLevel = 'Very High';

  return {
    communityRole,
    socialStyle,
    engagementLevel
  };
}

/**
 * Big Five Personality Trait: Openness to Experience
 * Based on server diversity and connected platforms
 */
function calculateOpenness(serverCategories, connections) {
  const categoryDiversity = serverCategories.length;
  const diversityScore = Math.min((categoryDiversity / 8) * 60, 60); // Max 8 categories = 60 points

  const connectionScore = Math.min((connections.length / 5) * 40, 40); // Max 5 connections = 40 points

  return Math.round(diversityScore + connectionScore);
}

/**
 * Big Five Personality Trait: Extraversion
 * Based on number of servers and connected platforms
 */
function calculateExtraversion(guilds, connections) {
  const serverScore = Math.min((guilds.length / 50) * 70, 70); // Social engagement
  const connectionScore = Math.min((connections.length / 5) * 30, 30); // Cross-platform social

  return Math.round(serverScore + connectionScore);
}

/**
 * Big Five Personality Trait: Agreeableness
 * Based on community-oriented servers and partnerships
 */
function calculateAgreeableness(guilds) {
  const communityFeatures = guilds.filter(g =>
    g.features?.includes('COMMUNITY') ||
    g.features?.includes('WELCOME_SCREEN_ENABLED')
  ).length;

  const communityRatio = communityFeatures / Math.max(guilds.length, 1);

  return Math.round(communityRatio * 100);
}

/**
 * Big Five Personality Trait: Conscientiousness
 * Based on server ownership and organization
 */
function calculateConscientiousness(guilds) {
  const ownedServers = guilds.filter(g => g.owner).length;
  const organizationScore = Math.min((ownedServers / 5) * 100, 100);

  return Math.round(organizationScore);
}

/**
 * Big Five Personality Trait: Neuroticism
 * Based on server volatility indicators
 */
function calculateNeuroticism(guilds) {
  // More servers with moderation features = lower neuroticism (more stable communities)
  const moderatedServers = guilds.filter(g =>
    g.features?.includes('MODERATION') ||
    g.features?.includes('AUTO_MODERATION')
  ).length;

  const moderationRatio = moderatedServers / Math.max(guilds.length, 1);

  // Invert: high moderation = low neuroticism
  return Math.round((1 - moderationRatio) * 100);
}

/**
 * Helper: Determine overall Discord personality archetype
 */
function determineDiscordPersonality(metrics) {
  const { categories, guilds, owned, connections, engagement } = metrics;

  const topCategory = categories[0]?.category || '';

  if (topCategory === 'Gaming' && guilds > 20) return 'Gaming Community Member';
  if (owned > 2) return 'Community Leader';
  if (topCategory === 'Technology') return 'Tech Community Enthusiast';
  if (categories.length > 6) return 'Diverse Community Participant';
  if (connections > 3) return 'Cross-Platform Socializer';
  if (topCategory === 'Creative') return 'Creative Community Member';
  if (engagement === 'Very High') return 'Discord Power User';
  if (guilds > 30) return 'Super Networker';

  return 'Community Participant';
}

export default {
  extractDiscordData
};
