/**
 * Twitch Feature Extractor
 *
 * Extracts behavioral features from Twitch data that correlate
 * with Big Five personality traits.
 *
 * - Channel diversity → Openness (r=0.30)
 * - Follow count → Extraversion (r=0.32)
 * - Streamer status → Extraversion (r=0.40)
 * - Gaming genre diversity → Openness (r=0.28)
 * - Community engagement → Agreeableness (r=0.22)
 */
import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('TwitchExtractor');

const GENRE_KEYWORDS = {
  fps: ['valorant', 'overwatch', 'counter-strike', 'cs2', 'apex legends', 'call of duty', 'fortnite', 'halo'],
  moba: ['league of legends', 'dota', 'smite'],
  rpg: ['world of warcraft', 'final fantasy', 'elden ring', 'baldur', 'diablo', 'genshin'],
  strategy: ['civilization', 'starcraft', 'chess', 'hearthstone'],
  survival: ['minecraft', 'rust', 'ark', 'valheim', 'palworld'],
  sports: ['fifa', 'nba', 'rocket league', 'f1'],
  creative: ['just chatting', 'art', 'music', 'cooking', 'irl'],
  horror: ['phasmophobia', 'dead by daylight', 'resident evil'],
  indie: ['hollow knight', 'celeste', 'hades', 'stardew valley']
};

class TwitchFeatureExtractor {
  constructor() {
    this.LOOKBACK_DAYS = 90;
  }

  async extractFeatures(userId) {
    log.info(`Extracting features for user ${userId}`);
    try {
      const cutoffDate = new Date(Date.now() - this.LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

      const { data: platformData, error: platformError } = await supabaseAdmin
        .from('user_platform_data').select('*')
        .eq('user_id', userId).eq('platform', 'twitch')
        .gte('extracted_at', cutoffDate).order('extracted_at', { ascending: false });
      if (platformError) log.warn('Error fetching user_platform_data:', platformError.message);

      const { data: soulData, error: soulError } = await supabaseAdmin
        .from('soul_data').select('*')
        .eq('user_id', userId).eq('platform', 'twitch')
        .gte('created_at', cutoffDate).order('created_at', { ascending: false });
      if (soulError) log.warn('Error fetching soul_data:', soulError.message);

      const normalizedPlatform = (platformData || []).map(e => ({ ...e, created_at: e.extracted_at, raw_data: e.raw_data || {} }));
      const normalizedSoul = (soulData || []).map(e => ({ ...e, raw_data: e.raw_data || {} }));
      const data = [...normalizedPlatform, ...normalizedSoul];

      if (data.length === 0) { log.info('No Twitch data found'); return []; }
      log.info(`Found ${data.length} Twitch entries (${normalizedPlatform.length} platform, ${normalizedSoul.length} soul)`);

      const features = [];
      const push = (result, type, trait, weight, desc, corr, note) => {
        if (result !== null) {
          const val = typeof result === 'object' ? result.value : result;
          const raw = typeof result === 'object' ? result.rawValue : {};
          features.push(this.createFeature(userId, type, val, {
            contributes_to: trait, contribution_weight: weight,
            description: desc, evidence: { correlation: corr, note }, raw_value: raw
          }));
        }
      };

      push(this.calculateChannelDiversity(data), 'channel_diversity', 'openness', 0.30,
        'Variety of followed channel categories', 0.30, 'Diverse categories suggest openness');
      push(this.calculateFollowCount(data), 'follow_count', 'extraversion', 0.32,
        'Number of channels followed', 0.32, 'More follows indicate social engagement');
      push(this.calculateStreamerStatus(data), 'streamer_status', 'extraversion', 0.40,
        'Being a streamer vs viewer only', 0.40, 'Active streaming correlates with extraversion');
      push(this.calculateGamingGenreDiversity(data), 'gaming_genre_diversity', 'openness', 0.28,
        'Variety of game categories', 0.28, 'Diverse gaming interests suggest curiosity');
      push(this.calculateCommunityEngagement(data), 'community_engagement', 'agreeableness', 0.22,
        'Following smaller streamers vs only big ones', 0.22, 'Supporting smaller creators suggests agreeableness');
      push(this.calculateFollowLoyalty(data), 'follow_loyalty', 'conscientiousness', 0.25,
        'Average follow duration — long-held follows indicate commitment', 0.25, 'Follow loyalty correlates with conscientiousness');

      log.info(`Extracted ${features.length} features`);
      return features;
    } catch (error) { log.error('Error:', error); throw error; }
  }

  /** Collect game/category names from all entries */
  _collectGames(data) {
    const games = new Set();
    for (const entry of data) {
      const raw = entry.raw_data || {};
      const dt = entry.data_type || '';
      const content = entry.content || '';
      const addGames = (items) => items.forEach(i => {
        const n = typeof i === 'string' ? i : (i.game_name || i.name || i.game || i.category || '');
        if (n) games.add(n.toLowerCase().trim());
      });
      if (['followed_channels', 'follows'].includes(dt)) addGames(raw.items || raw.channels || raw.follows || []);
      if (['streams', 'viewing_history'].includes(dt)) addGames(raw.items || raw.streams || []);
      if (['gaming_preferences', 'games'].includes(dt)) addGames(raw.items || raw.games || raw.preferences || []);
      if (raw.game_name) games.add(raw.game_name.toLowerCase().trim());
      if (raw.category) games.add(raw.category.toLowerCase().trim());
      const cm = content.match(/categories?:\s*(.+?)(?:\.|$)/i);
      if (cm) cm[1].split(/[,;]/).forEach(c => { const t = c.trim().toLowerCase(); if (t.length > 1) games.add(t); });
    }
    return games;
  }

  calculateChannelDiversity(data) {
    const categories = this._collectGames(data);
    if (categories.size === 0) return null;
    return { value: Math.min(100, Math.round((categories.size / 10) * 10000) / 100), rawValue: { category_count: categories.size } };
  }

  calculateFollowCount(data) {
    let maxFollows = 0;
    const channels = new Set();
    for (const entry of data) {
      const raw = entry.raw_data || {};
      const dt = entry.data_type || '';
      const content = entry.content || '';
      if (['followed_channels', 'follows'].includes(dt)) {
        (raw.items || raw.channels || raw.follows || []).forEach(ch => {
          const n = ch.broadcaster_name || ch.name || ch.channel || '';
          if (n) channels.add(n.toLowerCase().trim());
        });
        if (raw.total) maxFollows = Math.max(maxFollows, raw.total);
      }
      for (const k of ['follow_count', 'following_count']) { if (raw[k] !== undefined) maxFollows = Math.max(maxFollows, raw[k]); }
      const fm = content.match(/(?:follows?|following)\s*(?:count)?[:\s]*(\d+)/i);
      if (fm) maxFollows = Math.max(maxFollows, parseInt(fm[1], 10));
    }
    const total = Math.max(maxFollows, channels.size);
    if (total === 0) return null;
    return { value: Math.min(100, Math.round((total / 100) * 10000) / 100), rawValue: { follow_count: total } };
  }

  calculateStreamerStatus(data) {
    let isStreamer = false, isAffiliate = false, isPartner = false, streamCount = 0;
    for (const entry of data) {
      const raw = entry.raw_data || {};
      const dt = entry.data_type || '';
      const content = entry.content || '';
      if (raw.broadcaster_type) {
        const t = raw.broadcaster_type.toLowerCase();
        isStreamer = true;
        if (t === 'affiliate') isAffiliate = true;
        if (t === 'partner') isPartner = true;
      }
      if (['profile', 'user', 'twitch_profile'].includes(dt) && (raw.is_streamer || raw.broadcaster_type)) isStreamer = true;
      if (['streams', 'stream_history', 'past_streams'].includes(dt)) {
        const items = raw.items || raw.streams || [];
        streamCount += items.length;
        if (items.length > 0) isStreamer = true;
      }
      if (/\b(?:streamer|streaming|broadcasts?)\b/i.test(content)) isStreamer = true;
      if (/\baffiliate\b/i.test(content)) { isAffiliate = true; isStreamer = true; }
      if (/\bpartner\b/i.test(content)) { isPartner = true; isStreamer = true; }
    }
    let score = 10; // Viewer baseline
    if (isPartner) score = 100;
    else if (isAffiliate) score = 75;
    else if (isStreamer && streamCount > 5) score = 60;
    else if (isStreamer) score = 40;
    return { value: score, rawValue: { is_streamer: isStreamer, is_affiliate: isAffiliate, is_partner: isPartner, stream_count: streamCount } };
  }

  calculateGamingGenreDiversity(data) {
    const games = this._collectGames(data);
    if (games.size === 0) return null;
    const genres = new Set();
    for (const game of games) {
      for (const [genre, kws] of Object.entries(GENRE_KEYWORDS)) {
        if (kws.some(kw => game.includes(kw) || kw.includes(game))) genres.add(genre);
      }
    }
    const count = genres.size > 0 ? genres.size : Math.min(games.size, 5);
    return { value: Math.min(100, Math.round((count / 5) * 10000) / 100), rawValue: { genre_count: genres.size, game_count: games.size, genres: Array.from(genres) } };
  }

  calculateCommunityEngagement(data) {
    let small = 0, total = 0;
    for (const entry of data) {
      const raw = entry.raw_data || {};
      const dt = entry.data_type || '';
      if (['followed_channels', 'follows'].includes(dt)) {
        (raw.items || raw.channels || raw.follows || []).forEach(ch => {
          total++;
          const viewers = ch.average_viewers || ch.viewer_count || ch.avg_viewers || 0;
          const followers = ch.follower_count || ch.followers || 0;
          if ((viewers > 0 && viewers < 1000) || (viewers === 0 && followers > 0 && followers < 10000)) small++;
        });
      }
      if (dt === 'stream_demographics' || dt === 'channel_sizes') {
        if (raw.small_channels !== undefined) small += raw.small_channels;
        if (raw.total_channels !== undefined) total = Math.max(total, raw.total_channels);
      }
    }
    if (total === 0) return null;
    const ratio = small / total;
    return { value: Math.min(100, Math.round((ratio / 0.6) * 10000) / 100), rawValue: { small_streamers: small, total_channels: total, small_ratio: Math.round(ratio * 100) } };
  }

  /**
   * Follow Loyalty: average follow duration across followed channels
   */
  calculateFollowLoyalty(data) {
    const dates = [];
    for (const entry of data) {
      const raw = entry.raw_data || {};
      const dt = entry.data_type || '';
      if (['followed_channels', 'follows', 'followed_channels_raw'].includes(dt)) {
        const items = raw.items || raw.channels || raw.follows || [];
        for (const ch of items) {
          const followedAt = ch.followed_at;
          if (followedAt) {
            const d = new Date(followedAt);
            if (!isNaN(d.getTime())) dates.push(d);
          }
        }
      }
    }
    if (dates.length < 3) return null;

    const now = Date.now();
    const avgMonths = dates.reduce((s, d) => s + (now - d.getTime()), 0) / dates.length / (1000 * 60 * 60 * 24 * 30);
    // Score: 0-100. 0 months = 0, 24+ months = 100
    const value = Math.min(100, Math.round((avgMonths / 24) * 100));
    return { value, rawValue: { avgMonths: Math.round(avgMonths), followCount: dates.length } };
  }

  createFeature(userId, featureType, featureValue, metadata = {}) {
    return {
      user_id: userId, platform: 'twitch', feature_type: featureType,
      feature_value: featureValue, normalized_value: featureValue / 100,
      confidence_score: 60, sample_size: 1,
      contributes_to: metadata.contributes_to || null,
      contribution_weight: metadata.contribution_weight || 0,
      evidence: { description: metadata.description, correlation: metadata.evidence?.correlation, citation: metadata.evidence?.citation, note: metadata.evidence?.note, raw_value: metadata.raw_value || {} }
    };
  }

  async saveFeatures(features) {
    if (features.length === 0) return { success: true, saved: 0 };
    log.info(`Saving ${features.length} features to database...`);
    try {
      const { data, error } = await supabaseAdmin.from('behavioral_features')
        .upsert(features, { onConflict: 'user_id,platform,feature_type' }).select();
      if (error) throw error;
      log.info(`Saved ${data.length} features successfully`);
      return { success: true, saved: data.length, data };
    } catch (error) { log.error('Error saving features:', error); return { success: false, error: error.message }; }
  }
}

const twitchFeatureExtractor = new TwitchFeatureExtractor();
export default twitchFeatureExtractor;
