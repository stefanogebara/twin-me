/**
 * Discord Feature Extractor
 *
 * Extracts behavioral features from Discord data that correlate
 * with Big Five personality traits.
 *
 * Key Features Extracted:
 * - Server diversity → Openness (r=0.32)
 * - Role accumulation → Conscientiousness (r=0.28)
 * - Community count → Extraversion (r=0.40)
 * - Activity level → Extraversion (r=0.35)
 * - Server topic diversity → Openness (r=0.30)
 * - Moderation roles → Agreeableness (r=0.25)
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('DiscordExtractor');

class DiscordFeatureExtractor {
  constructor() {
    this.LOOKBACK_DAYS = 90; // Analyze last 3 months of data
  }

  /**
   * Extract all behavioral features from Discord data
   */
  async extractFeatures(userId) {
    log.info(`Extracting features for user ${userId}`);

    try {
      const cutoffDate = new Date(Date.now() - this.LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

      // Fetch from BOTH tables to get all Discord data
      // Primary source: user_platform_data
      const { data: platformData, error: platformError } = await supabaseAdmin
        .from('user_platform_data')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'discord')
        .gte('extracted_at', cutoffDate)
        .order('extracted_at', { ascending: false });

      if (platformError) {
        log.warn('Error fetching user_platform_data:', platformError.message);
      }

      // Secondary source: soul_data (legacy)
      const { data: soulData, error: soulError } = await supabaseAdmin
        .from('soul_data')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'discord')
        .gte('created_at', cutoffDate)
        .order('created_at', { ascending: false });

      if (soulError) {
        log.warn('Error fetching soul_data:', soulError.message);
      }

      // Normalize data from both tables
      const normalizedPlatformData = (platformData || []).map(entry => ({
        ...entry,
        created_at: entry.extracted_at, // Normalize timestamp field
        raw_data: entry.raw_data || {}
      }));

      const normalizedSoulData = (soulData || []).map(entry => ({
        ...entry,
        raw_data: entry.raw_data || {}
      }));

      // Combine all data sources
      const discordData = [...normalizedPlatformData, ...normalizedSoulData];

      if (discordData.length === 0) {
        log.info('No Discord data found for user in either table');
        return [];
      }

      log.info(`Found ${discordData.length} Discord data entries (${normalizedPlatformData.length} from user_platform_data, ${normalizedSoulData.length} from soul_data)`);

      // Extract features
      const features = [];

      // 1. Server Diversity (Openness)
      const serverDiversity = this.calculateServerDiversity(discordData);
      if (serverDiversity !== null) {
        features.push(this.createFeature(userId, 'server_diversity', serverDiversity.value, {
          contributes_to: 'openness',
          contribution_weight: 0.32,
          description: 'Number and variety of Discord servers joined',
          evidence: { correlation: 0.32, note: 'Diverse server membership signals intellectual curiosity' },
          raw_value: serverDiversity.rawValue
        }));
      }

      // 2. Role Accumulation (Conscientiousness)
      const roleAccumulation = this.calculateRoleAccumulation(discordData);
      if (roleAccumulation !== null) {
        features.push(this.createFeature(userId, 'role_accumulation', roleAccumulation.value, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.28,
          description: 'Having roles (moderator, admin) shows commitment to communities',
          evidence: { correlation: 0.28, note: 'Role holders invest more in community organization' },
          raw_value: roleAccumulation.rawValue
        }));
      }

      // 3. Community Count (Extraversion)
      const communityCount = this.calculateCommunityCount(discordData);
      if (communityCount !== null) {
        features.push(this.createFeature(userId, 'community_count', communityCount.value, {
          contributes_to: 'extraversion',
          contribution_weight: 0.40,
          description: 'Total number of Discord servers joined',
          evidence: { correlation: 0.40, note: 'More communities = higher social engagement' },
          raw_value: communityCount.rawValue
        }));
      }

      // 4. Activity Level (Extraversion)
      const activityLevel = this.calculateActivityLevel(discordData);
      if (activityLevel !== null) {
        features.push(this.createFeature(userId, 'activity_level', activityLevel.value, {
          contributes_to: 'extraversion',
          contribution_weight: 0.35,
          description: 'Overall engagement and activity across Discord servers',
          evidence: { correlation: 0.35, note: 'Active participation signals social energy' },
          raw_value: activityLevel.rawValue
        }));
      }

      // 5. Server Topic Diversity (Openness)
      const topicDiversity = this.calculateServerTopicDiversity(discordData);
      if (topicDiversity !== null) {
        features.push(this.createFeature(userId, 'server_topic_diversity', topicDiversity.value, {
          contributes_to: 'openness',
          contribution_weight: 0.30,
          description: 'Variety of server categories (gaming, tech, art, etc.)',
          evidence: { correlation: 0.30, note: 'Diverse interests across server topics' },
          raw_value: topicDiversity.rawValue
        }));
      }

      // 6. Moderation Roles (Agreeableness)
      const moderationRoles = this.calculateModerationRoles(discordData);
      if (moderationRoles !== null) {
        features.push(this.createFeature(userId, 'moderation_roles', moderationRoles.value, {
          contributes_to: 'agreeableness',
          contribution_weight: 0.25,
          description: 'Having mod/admin roles in communities',
          evidence: { correlation: 0.25, note: 'Moderation roles indicate community stewardship and prosocial behavior' },
          raw_value: moderationRoles.rawValue
        }));
      }

      log.info(`Extracted ${features.length} features`);
      return features;

    } catch (error) {
      log.error('Error:', error);
      throw error;
    }
  }

  /**
   * Extract guilds (servers) from Discord data entries
   * Handles multiple data formats from both tables
   */
  extractGuilds(discordData) {
    const guilds = [];
    const seenGuildIds = new Set();

    for (const entry of discordData) {
      const raw = entry.raw_data || {};
      const dataType = entry.data_type || '';
      const content = entry.content || '';

      // From guilds/servers data type
      if (dataType === 'guilds' || dataType === 'servers') {
        const items = raw.items || raw.guilds || raw.servers || (raw.id ? [raw] : []);
        for (const guild of items) {
          const guildId = guild.id || guild.name;
          if (guildId && !seenGuildIds.has(guildId)) {
            seenGuildIds.add(guildId);
            guilds.push(guild);
          }
        }
      }

      // From guild_membership or server_membership
      if (dataType === 'guild_membership' || dataType === 'server_membership') {
        const guildId = raw.guild_id || raw.server_id || raw.id;
        if (guildId && !seenGuildIds.has(guildId)) {
          seenGuildIds.add(guildId);
          guilds.push(raw);
        }
      }

      // Parse observation content strings for guild info
      if (content && typeof content === 'string') {
        const guildCountMatch = content.match(/(\d+)\s*(?:servers?|guilds?|communities)/i);
        if (guildCountMatch && !seenGuildIds.has('content_parsed')) {
          seenGuildIds.add('content_parsed');
          guilds.push({ _parsedCount: parseInt(guildCountMatch[1], 10) });
        }
      }
    }

    return guilds;
  }

  /**
   * Extract roles from Discord data entries
   */
  extractRoles(discordData) {
    const roles = [];
    const seenRoleKeys = new Set();

    for (const entry of discordData) {
      const raw = entry.raw_data || {};
      const dataType = entry.data_type || '';
      const content = entry.content || '';

      // From roles data type
      if (dataType === 'roles' || dataType === 'user_roles') {
        const items = raw.items || raw.roles || (raw.name ? [raw] : []);
        for (const role of items) {
          const roleKey = `${role.guild_id || 'unknown'}-${role.name || role.id}`;
          if (!seenRoleKeys.has(roleKey)) {
            seenRoleKeys.add(roleKey);
            roles.push(role);
          }
        }
      }

      // From guild data with embedded roles
      if ((dataType === 'guilds' || dataType === 'servers') && raw.roles) {
        for (const role of raw.roles) {
          const roleKey = `${raw.id || 'unknown'}-${role.name || role.id}`;
          if (!seenRoleKeys.has(roleKey)) {
            seenRoleKeys.add(roleKey);
            roles.push({ ...role, guild_id: raw.id, guild_name: raw.name });
          }
        }
      }

      // From guild_membership with roles array
      if ((dataType === 'guild_membership' || dataType === 'server_membership') && raw.roles) {
        for (const role of raw.roles) {
          const roleObj = typeof role === 'string' ? { name: role } : role;
          const roleKey = `${raw.guild_id || 'unknown'}-${roleObj.name || roleObj.id || role}`;
          if (!seenRoleKeys.has(roleKey)) {
            seenRoleKeys.add(roleKey);
            roles.push({ ...roleObj, guild_id: raw.guild_id, guild_name: raw.guild_name });
          }
        }
      }

      // Parse observation content strings for role info
      if (content && typeof content === 'string') {
        const modMatch = content.match(/(?:moderator|admin|mod)\s*(?:in|of|for)\s*/i);
        if (modMatch && !seenRoleKeys.has('content_mod')) {
          seenRoleKeys.add('content_mod');
          roles.push({ name: 'moderator', _fromContent: true });
        }
      }
    }

    return roles;
  }

  /**
   * Calculate server diversity (variety of Discord servers)
   * Returns { value, rawValue }
   */
  calculateServerDiversity(discordData) {
    const guilds = this.extractGuilds(discordData);

    if (guilds.length === 0) return null;

    // Get actual guild count (handle parsed count from content)
    const parsedEntry = guilds.find(g => g._parsedCount);
    const guildCount = parsedEntry ? Math.max(parsedEntry._parsedCount, guilds.length) : guilds.length;

    // Collect unique server categories/topics for diversity
    const categories = new Set();
    for (const guild of guilds) {
      if (guild._parsedCount) continue;
      const category = this.categorizeServer(guild);
      if (category) categories.add(category);
    }

    // Diversity score based on both count and category spread
    // More servers + more diverse categories = higher score
    const countScore = Math.min(guildCount / 20, 1) * 50; // Up to 50 for count (20+ servers = max)
    const categoryScore = categories.size > 0 ? Math.min(categories.size / 6, 1) * 50 : 25; // Up to 50 for categories

    const diversityScore = countScore + categoryScore;

    return {
      value: Math.round(Math.min(100, diversityScore) * 100) / 100,
      rawValue: { guild_count: guildCount, unique_categories: categories.size }
    };
  }

  /**
   * Calculate role accumulation (commitment shown through roles)
   * Returns { value, rawValue }
   */
  calculateRoleAccumulation(discordData) {
    const roles = this.extractRoles(discordData);
    const guilds = this.extractGuilds(discordData);

    if (guilds.length === 0) return null;

    const parsedEntry = guilds.find(g => g._parsedCount);
    const guildCount = parsedEntry ? Math.max(parsedEntry._parsedCount, guilds.length) : guilds.length;

    // Score based on roles per server
    const roleCount = roles.length;
    const rolesPerServer = guildCount > 0 ? roleCount / guildCount : 0;

    // More roles per server = higher conscientiousness
    // 3+ roles per server = max score
    const roleScore = Math.min(rolesPerServer / 3, 1) * 70;

    // Bonus for having any roles at all
    const hasRolesBonus = roleCount > 0 ? 30 : 0;

    const accumulationScore = roleScore + hasRolesBonus;

    return {
      value: Math.round(Math.min(100, accumulationScore) * 100) / 100,
      rawValue: { total_roles: roleCount, guild_count: guildCount, roles_per_server: Math.round(rolesPerServer * 100) / 100 }
    };
  }

  /**
   * Calculate community count (total servers joined)
   * Returns { value, rawValue }
   */
  calculateCommunityCount(discordData) {
    const guilds = this.extractGuilds(discordData);

    if (guilds.length === 0) return null;

    const parsedEntry = guilds.find(g => g._parsedCount);
    const guildCount = parsedEntry ? Math.max(parsedEntry._parsedCount, guilds.length) : guilds.length;

    // Normalize: 1 server = low, 30+ = max extraversion signal
    const communityScore = Math.min(guildCount / 30, 1) * 100;

    return {
      value: Math.round(communityScore * 100) / 100,
      rawValue: { guild_count: guildCount }
    };
  }

  /**
   * Calculate activity level across Discord
   * Returns { value, rawValue }
   */
  calculateActivityLevel(discordData) {
    let messageCount = 0;
    let activeGuilds = 0;
    let hasActivityData = false;

    const activeGuildIds = new Set();

    for (const entry of discordData) {
      const raw = entry.raw_data || {};
      const dataType = entry.data_type || '';
      const content = entry.content || '';

      // From activity/messages data
      if (dataType === 'activity' || dataType === 'messages' || dataType === 'message_count') {
        hasActivityData = true;
        messageCount += raw.message_count || raw.count || 0;
        if (raw.guild_id) activeGuildIds.add(raw.guild_id);
      }

      // From guild data with activity metrics
      if ((dataType === 'guilds' || dataType === 'servers') && raw.message_count !== undefined) {
        hasActivityData = true;
        messageCount += raw.message_count;
        if (raw.id) activeGuildIds.add(raw.id);
      }

      // From presence/status data
      if (dataType === 'presence' || dataType === 'status') {
        hasActivityData = true;
        if (raw.status === 'online' || raw.status === 'dnd' || raw.status === 'idle') {
          messageCount += 1; // Count presence as light activity
        }
      }

      // Parse observation content for activity indicators
      if (content && typeof content === 'string') {
        const msgMatch = content.match(/(\d+)\s*messages?/i);
        if (msgMatch) {
          hasActivityData = true;
          messageCount += parseInt(msgMatch[1], 10);
        }

        const activeMatch = content.match(/active\s*(?:in|on)\s*(\d+)/i);
        if (activeMatch) {
          hasActivityData = true;
          activeGuilds = Math.max(activeGuilds, parseInt(activeMatch[1], 10));
        }
      }
    }

    if (!hasActivityData) return null;

    activeGuilds = Math.max(activeGuilds, activeGuildIds.size);

    // Activity score: combination of message volume and server breadth
    // 500+ messages in 90 days = high activity, 10+ active servers = max breadth
    const messageScore = Math.min(messageCount / 500, 1) * 60;
    const breadthScore = Math.min(activeGuilds / 10, 1) * 40;

    const activityScore = messageScore + breadthScore;

    return {
      value: Math.round(Math.min(100, activityScore) * 100) / 100,
      rawValue: { message_count: messageCount, active_guilds: activeGuilds }
    };
  }

  /**
   * Calculate server topic diversity (variety of server categories)
   * Returns { value, rawValue }
   */
  calculateServerTopicDiversity(discordData) {
    const guilds = this.extractGuilds(discordData);

    if (guilds.length === 0) return null;

    const categoryCounts = {};
    let categorizedCount = 0;

    for (const guild of guilds) {
      if (guild._parsedCount) continue;
      const category = this.categorizeServer(guild);
      if (category) {
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        categorizedCount++;
      }
    }

    const uniqueCategories = Object.keys(categoryCounts).length;
    if (uniqueCategories === 0) return null;

    // Shannon entropy for topic diversity
    let entropy = 0;
    for (const count of Object.values(categoryCounts)) {
      const p = count / categorizedCount;
      entropy -= p * Math.log2(p);
    }

    // Normalize to 0-100 (max entropy is log2(unique_categories))
    const maxEntropy = Math.log2(uniqueCategories);
    const diversityFromEntropy = maxEntropy > 0 ? (entropy / maxEntropy) * 100 : 0;

    // Weight both category count and evenness
    const categoryCountScore = Math.min(uniqueCategories / 6, 1) * 50; // 6+ categories = max
    const evennessScore = (diversityFromEntropy / 100) * 50;

    const topicScore = categoryCountScore + evennessScore;

    return {
      value: Math.round(Math.min(100, topicScore) * 100) / 100,
      rawValue: { unique_categories: uniqueCategories, categories: categoryCounts }
    };
  }

  /**
   * Calculate moderation roles score (community stewardship)
   * Returns { value, rawValue }
   */
  calculateModerationRoles(discordData) {
    const roles = this.extractRoles(discordData);
    const guilds = this.extractGuilds(discordData);

    if (guilds.length === 0) return null;

    const modRoleNames = ['admin', 'administrator', 'mod', 'moderator', 'owner', 'staff', 'helper', 'support'];
    const modRoles = roles.filter(role => {
      const roleName = (role.name || '').toLowerCase();
      return modRoleNames.some(mod => roleName.includes(mod));
    });

    // Also check permissions flags for mod-level access
    const permissionModRoles = roles.filter(role => {
      const permissions = role.permissions || 0;
      // Check for ADMINISTRATOR (0x8), MANAGE_GUILD (0x20), BAN_MEMBERS (0x4), KICK_MEMBERS (0x2)
      const modPermissions = 0x8 | 0x20 | 0x4 | 0x2;
      return (permissions & modPermissions) !== 0;
    });

    const totalModRoles = new Set([
      ...modRoles.map(r => `${r.guild_id}-${r.name}`),
      ...permissionModRoles.map(r => `${r.guild_id}-${r.name}`)
    ]).size;

    const parsedEntry = guilds.find(g => g._parsedCount);
    const guildCount = parsedEntry ? Math.max(parsedEntry._parsedCount, guilds.length) : guilds.length;

    // Moderation score: having mod roles in any server is significant
    // 1 mod role = good, 3+ = high agreeableness signal
    const modScore = Math.min(totalModRoles / 3, 1) * 70;

    // Ratio of moderated servers to total
    const modRatio = guildCount > 0 ? totalModRoles / guildCount : 0;
    const ratioScore = Math.min(modRatio / 0.3, 1) * 30; // 30% of servers modded = max

    const moderationScore = modScore + ratioScore;

    return {
      value: Math.round(Math.min(100, moderationScore) * 100) / 100,
      rawValue: { mod_roles: totalModRoles, guild_count: guildCount, mod_ratio: Math.round(modRatio * 100) / 100 }
    };
  }

  /**
   * Categorize a server by its name, description, or features
   * Returns a category string or null
   */
  categorizeServer(guild) {
    const name = (guild.name || '').toLowerCase();
    const description = (guild.description || '').toLowerCase();
    const text = `${name} ${description}`;

    const categoryPatterns = {
      gaming: /\bgam(?:e|ing|er)\b|fps|rpg|mmorpg|minecraft|valorant|league|fortnite|roblox|steam|xbox|playstation|nintendo/,
      tech: /\btech|programming|code|coding|dev(?:elop)?|software|javascript|python|rust|linux|github|api|web\s*dev/,
      art: /\bart\b|draw(?:ing)?|design|creative|illustration|photography|graphic|pixel|animation|sculpt/,
      music: /\bmusic\b|band|producer|beat|dj|spotify|sound|audio|guitar|piano|rap|hip\s*hop/,
      education: /\bedu|learn|study|school|university|course|tutor|academic|science|math|research/,
      social: /\bsocial|community|chill|hang\s*out|friends|chat|lounge|cafe/,
      crypto: /\bcrypto|nft|blockchain|defi|web3|token|dao|eth|bitcoin|solana/,
      anime: /\banime|manga|otaku|weeb|vtuber|hololive|genshin/,
      fitness: /\bfit(?:ness)?|gym|workout|health|sport|exercise|running|yoga/,
      business: /\bbusiness|startup|entrepreneur|marketing|finance|invest|career/
    };

    for (const [category, pattern] of Object.entries(categoryPatterns)) {
      if (pattern.test(text)) return category;
    }

    return null;
  }

  /**
   * Create standardized feature object
   */
  createFeature(userId, featureType, featureValue, metadata = {}) {
    return {
      user_id: userId,
      platform: 'discord',
      feature_type: featureType,
      feature_value: featureValue,
      normalized_value: featureValue / 100, // Normalize to 0-1
      confidence_score: 65, // Default confidence for Discord features
      sample_size: 1,
      contributes_to: metadata.contributes_to || null,
      contribution_weight: metadata.contribution_weight || 0,
      metadata: {
        raw_value: metadata.raw_value || {}
      },
      evidence: {
        description: metadata.description,
        correlation: metadata.evidence?.correlation,
        citation: metadata.evidence?.citation,
        note: metadata.evidence?.note,
        raw_value: metadata.raw_value || {}
      }
    };
  }

  /**
   * Save features to database
   */
  async saveFeatures(features) {
    if (features.length === 0) return { success: true, saved: 0 };

    log.info(`Saving ${features.length} features to database...`);

    try {
      const { data, error } = await supabaseAdmin
        .from('behavioral_features')
        .upsert(features, {
          onConflict: 'user_id,platform,feature_type'
        })
        .select();

      if (error) throw error;

      log.info(`Saved ${data.length} features successfully`);
      return { success: true, saved: data.length, data };

    } catch (error) {
      log.error('Error saving features:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
const discordFeatureExtractor = new DiscordFeatureExtractor();
export default discordFeatureExtractor;
