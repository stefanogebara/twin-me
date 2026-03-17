/**
 * Reddit Feature Extractor
 *
 * Extracts behavioral features from Reddit subscription data that correlate
 * with Big Five personality traits.
 *
 * Key Features Extracted:
 * - Subreddit diversity → Openness (r=0.35)
 * - Subreddit count → Openness (r=0.28)
 * - Topic distribution → Openness (r=0.30)
 * - Niche interests → Openness (r=0.32)
 * - Social subreddit ratio → Extraversion (r=0.25)
 * - Help/advice subreddits → Agreeableness (r=0.22)
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('RedditExtractor');

// Topic categories for subreddit classification
const TOPIC_CATEGORIES = {
  technology: ['programming', 'webdev', 'javascript', 'python', 'machinelearning', 'artificial', 'coding', 'software', 'hardware', 'linux', 'android', 'apple', 'tech', 'computer', 'datascience', 'devops', 'gamedev', 'cybersecurity', 'node', 'react', 'typescript'],
  science: ['science', 'physics', 'chemistry', 'biology', 'space', 'astronomy', 'neuro', 'psychology', 'math', 'engineering', 'quantum', 'geology', 'ecology'],
  gaming: ['gaming', 'games', 'xbox', 'playstation', 'nintendo', 'pcgaming', 'steam', 'esports', 'minecraft', 'valorant', 'leagueoflegends', 'overwatch', 'fortnite'],
  entertainment: ['movies', 'television', 'netflix', 'anime', 'manga', 'books', 'music', 'hiphop', 'podcasts', 'celebrity', 'comics', 'horror', 'scifi', 'fantasy'],
  sports: ['sports', 'nba', 'nfl', 'soccer', 'football', 'basketball', 'baseball', 'mma', 'boxing', 'tennis', 'cricket', 'formula1', 'f1'],
  social: ['askreddit', 'casualconversation', 'socialskills', 'dating', 'relationships', 'amitheasshole', 'unpopularopinion', 'changemyview', 'debate', 'discussion', 'talkative', 'meetpeople', 'makefriendshere'],
  help_advice: ['advice', 'lifeprotips', 'selfimprovement', 'getmotivated', 'decidingtobebetter', 'mentalhealth', 'anxiety', 'depression', 'support', 'offmychest', 'trueoffmychest', 'therapy', 'needadvice', 'relationship_advice', 'legaladvice', 'personalfinance', 'careerguidance', 'parenting'],
  creative: ['art', 'drawing', 'painting', 'photography', 'writing', 'writingprompts', 'design', 'diy', 'crafts', 'woodworking', 'illustration', 'digitalart', 'graphic_design'],
  news_politics: ['news', 'worldnews', 'politics', 'economics', 'geopolitics', 'currentevents', 'environment', 'climate'],
  lifestyle: ['fitness', 'gym', 'yoga', 'meditation', 'cooking', 'food', 'travel', 'fashion', 'skincare', 'camping', 'hiking', 'gardening', 'homeimprovement'],
  humor: ['funny', 'memes', 'dankmemes', 'jokes', 'comedyheaven', 'me_irl', 'shitposting'],
  niche: ['breadit', 'fountainpens', 'mechanicalkeyboards', 'audiophile', 'vinyl', 'bonsai', 'terrariums', 'lockpicking', 'penmanship', 'crochet', 'fermentation', 'sourdough', 'espresso', 'watchescirclejerk', 'flashlight']
};

// Large mainstream subreddits (for niche detection)
const MAINSTREAM_SUBS = new Set([
  'askreddit', 'funny', 'gaming', 'aww', 'pics', 'music', 'science',
  'worldnews', 'videos', 'todayilearned', 'movies', 'news', 'showerthoughts',
  'explainlikeimfive', 'mildlyinteresting', 'jokes', 'nottheonion',
  'lifeprotips', 'space', 'food', 'sports', 'television', 'memes',
  'art', 'books', 'diy', 'earthporn', 'gadgets', 'gifs',
  'dataisbeautiful', 'futurology', 'documentaries', 'history',
  'philosophy', 'fitness', 'getmotivated', 'photoshopbattles'
]);

class RedditFeatureExtractor {
  constructor() {
    this.LOOKBACK_DAYS = 90;
  }

  /**
   * Extract all behavioral features from Reddit data
   */
  async extractFeatures(userId) {
    log.info(`Extracting features for user ${userId}`);

    try {
      const cutoffDate = new Date(Date.now() - this.LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

      // Fetch from BOTH tables to get all Reddit data
      // Primary source: user_platform_data
      const { data: platformData, error: platformError } = await supabaseAdmin
        .from('user_platform_data')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'reddit')
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
        .eq('platform', 'reddit')
        .gte('created_at', cutoffDate)
        .order('created_at', { ascending: false });

      if (soulError) {
        log.warn('Error fetching soul_data:', soulError.message);
      }

      // Normalize data from both tables
      const normalizedPlatformData = (platformData || []).map(entry => ({
        ...entry,
        created_at: entry.extracted_at,
        raw_data: entry.raw_data || {}
      }));

      const normalizedSoulData = (soulData || []).map(entry => ({
        ...entry,
        raw_data: entry.raw_data || {}
      }));

      // Combine all data sources
      const redditData = [...normalizedPlatformData, ...normalizedSoulData];

      if (redditData.length === 0) {
        log.info('No Reddit data found for user in either table');
        return [];
      }

      log.info(`Found ${redditData.length} Reddit data entries (${normalizedPlatformData.length} from user_platform_data, ${normalizedSoulData.length} from soul_data)`);

      // Parse subreddit list from all data entries
      const subreddits = this.parseSubreddits(redditData);

      if (subreddits.length === 0) {
        log.info('No subreddit data could be parsed');
        return [];
      }

      log.info(`Parsed ${subreddits.length} unique subreddits`);

      // Extract features
      const features = [];

      // 1. Subreddit Diversity (Openness)
      const subredditDiversity = this.calculateSubredditDiversity(subreddits);
      if (subredditDiversity !== null) {
        features.push(this.createFeature(userId, 'subreddit_diversity', subredditDiversity.value, {
          contributes_to: 'openness',
          contribution_weight: 0.35,
          description: 'Variety of subreddit categories subscribed to',
          evidence: { correlation: 0.35, citation: 'Park et al. (2015)' },
          raw_value: subredditDiversity.rawValue
        }));
      }

      // 2. Subreddit Count (Openness)
      const subredditCount = this.calculateSubredditCount(subreddits);
      if (subredditCount !== null) {
        features.push(this.createFeature(userId, 'subreddit_count', subredditCount.value, {
          contributes_to: 'openness',
          contribution_weight: 0.28,
          description: 'Total number of subreddits joined',
          evidence: { correlation: 0.28, citation: 'Gjurkovic & Snajder (2018)' },
          raw_value: subredditCount.rawValue
        }));
      }

      // 3. Topic Distribution (Openness)
      const topicDistribution = this.calculateTopicDistribution(subreddits);
      if (topicDistribution !== null) {
        features.push(this.createFeature(userId, 'topic_distribution', topicDistribution.value, {
          contributes_to: 'openness',
          contribution_weight: 0.30,
          description: 'Spread across different topic areas',
          evidence: { correlation: 0.30, citation: 'Kosinski et al. (2013)' },
          raw_value: topicDistribution.rawValue
        }));
      }

      // 4. Niche Interests (Openness)
      const nicheInterests = this.calculateNicheInterests(subreddits);
      if (nicheInterests !== null) {
        features.push(this.createFeature(userId, 'niche_interests', nicheInterests.value, {
          contributes_to: 'openness',
          contribution_weight: 0.32,
          description: 'Proportion of niche/specialized subreddits',
          evidence: { correlation: 0.32, citation: 'Schwartz et al. (2013)' },
          raw_value: nicheInterests.rawValue
        }));
      }

      // 5. Social Subreddit Ratio (Extraversion)
      const socialRatio = this.calculateSocialSubredditRatio(subreddits);
      if (socialRatio !== null) {
        features.push(this.createFeature(userId, 'social_subreddit_ratio', socialRatio.value, {
          contributes_to: 'extraversion',
          contribution_weight: 0.25,
          description: 'Ratio of social/discussion subs vs passive consumption',
          evidence: { correlation: 0.25, citation: 'Gjurkovic & Snajder (2018)' },
          raw_value: socialRatio.rawValue
        }));
      }

      // 6. Help/Advice Subreddits (Agreeableness)
      const helpAdvice = this.calculateHelpAdviceRatio(subreddits);
      if (helpAdvice !== null) {
        features.push(this.createFeature(userId, 'help_advice_subreddits', helpAdvice.value, {
          contributes_to: 'agreeableness',
          contribution_weight: 0.22,
          description: 'Membership in support/advice communities',
          evidence: { correlation: 0.22, citation: 'Park et al. (2015)' },
          raw_value: helpAdvice.rawValue
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
   * Parse subreddit names from all Reddit data entries.
   * Handles both raw_data objects and observation content strings.
   */
  parseSubreddits(redditData) {
    const subredditSet = new Set();

    for (const entry of redditData) {
      const raw = entry.raw_data || {};
      const content = entry.content || entry.observation || '';
      const dataType = entry.data_type || '';

      // From raw_data: subreddits array
      if (raw.subreddits && Array.isArray(raw.subreddits)) {
        for (const sub of raw.subreddits) {
          const name = typeof sub === 'string' ? sub : (sub.name || sub.display_name || '');
          if (name) subredditSet.add(name.toLowerCase().replace(/^r\//, ''));
        }
      }

      // From raw_data: subscriptions array
      if (raw.subscriptions && Array.isArray(raw.subscriptions)) {
        for (const sub of raw.subscriptions) {
          const name = typeof sub === 'string' ? sub : (sub.name || sub.display_name || '');
          if (name) subredditSet.add(name.toLowerCase().replace(/^r\//, ''));
        }
      }

      // From raw_data: items array (common API format)
      if (raw.items && Array.isArray(raw.items)) {
        for (const item of raw.items) {
          const name = item.display_name || item.name || item.subreddit || '';
          if (name) subredditSet.add(name.toLowerCase().replace(/^r\//, ''));
        }
      }

      // From raw_data: children array (Reddit API format)
      if (raw.children && Array.isArray(raw.children)) {
        for (const child of raw.children) {
          const data = child.data || child;
          const name = data.display_name || data.name || data.subreddit || '';
          if (name) subredditSet.add(name.toLowerCase().replace(/^r\//, ''));
        }
      }

      // From raw_data: direct display_name (single subreddit record)
      if (raw.display_name) {
        subredditSet.add(raw.display_name.toLowerCase().replace(/^r\//, ''));
      }

      // Parse observation content strings like "Subscribed to X subreddits including..."
      if (content) {
        // Match r/subredditname patterns
        const rSlashMatches = content.match(/r\/([a-zA-Z0-9_]+)/g);
        if (rSlashMatches) {
          for (const match of rSlashMatches) {
            subredditSet.add(match.replace(/^r\//, '').toLowerCase());
          }
        }

        // Match comma-separated subreddit lists after "including" or "such as"
        const listMatch = content.match(/(?:including|such as|like|subscribed to)[:\s]+([^.]+)/i);
        if (listMatch) {
          const names = listMatch[1].split(/[,;]+/).map(s => s.trim().replace(/^r\//, '').replace(/^and\s+/i, ''));
          for (const name of names) {
            const cleaned = name.replace(/[^a-zA-Z0-9_]/g, '');
            if (cleaned.length > 1) subredditSet.add(cleaned.toLowerCase());
          }
        }
      }
    }

    return Array.from(subredditSet).filter(name => name.length > 0);
  }

  /**
   * Classify a subreddit into a topic category.
   * Returns the category name or 'uncategorized'.
   */
  classifySubreddit(subredditName) {
    const normalized = subredditName.toLowerCase();

    for (const [category, keywords] of Object.entries(TOPIC_CATEGORIES)) {
      for (const keyword of keywords) {
        if (normalized === keyword || normalized.includes(keyword)) {
          return category;
        }
      }
    }

    return 'uncategorized';
  }

  /**
   * Calculate subreddit diversity (Shannon entropy of topic categories)
   * Higher diversity of categories → higher Openness
   */
  calculateSubredditDiversity(subreddits) {
    if (subreddits.length === 0) return null;

    const categoryCounts = {};
    let total = 0;

    for (const sub of subreddits) {
      const category = this.classifySubreddit(sub);
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      total++;
    }

    const categoryCount = Object.keys(categoryCounts).length;
    if (categoryCount <= 1) return { value: 0, rawValue: { category_count: categoryCount } };

    // Shannon entropy
    let entropy = 0;
    for (const count of Object.values(categoryCounts)) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }

    // Normalize to 0-100 (max entropy = log2(unique_categories))
    const maxEntropy = Math.log2(categoryCount);
    const diversity = maxEntropy > 0 ? (entropy / maxEntropy) * 100 : 0;

    return {
      value: Math.round(diversity * 100) / 100,
      rawValue: { category_count: categoryCount, categories: categoryCounts }
    };
  }

  /**
   * Calculate subreddit count score.
   * More subreddits → higher Openness (normalized, 100+ subs = max score)
   */
  calculateSubredditCount(subreddits) {
    if (subreddits.length === 0) return null;

    const count = subreddits.length;
    // Normalize: 100+ subreddits = 100 score
    const score = Math.min(100, (count / 100) * 100);

    return {
      value: Math.round(score * 100) / 100,
      rawValue: { total_subreddits: count }
    };
  }

  /**
   * Calculate topic distribution (evenness of spread across categories).
   * Uses Pielou's evenness index: J = H / H_max
   */
  calculateTopicDistribution(subreddits) {
    if (subreddits.length === 0) return null;

    const categoryCounts = {};
    let total = 0;

    for (const sub of subreddits) {
      const category = this.classifySubreddit(sub);
      if (category !== 'uncategorized') {
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        total++;
      }
    }

    const categoryCount = Object.keys(categoryCounts).length;
    if (total === 0 || categoryCount <= 1) return null;

    // Shannon entropy of categorized subreddits
    let entropy = 0;
    for (const count of Object.values(categoryCounts)) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }

    // Pielou's evenness (how evenly distributed across categories)
    const maxEntropy = Math.log2(categoryCount);
    const evenness = maxEntropy > 0 ? (entropy / maxEntropy) * 100 : 0;

    // Top 3 categories by count
    const topCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat, cnt]) => ({ category: cat, count: cnt }));

    return {
      value: Math.round(evenness * 100) / 100,
      rawValue: { categorized_count: total, category_count: categoryCount, top_categories: topCategories }
    };
  }

  /**
   * Calculate niche interest proportion.
   * Non-mainstream subreddits indicate curiosity and Openness.
   */
  calculateNicheInterests(subreddits) {
    if (subreddits.length === 0) return null;

    let nicheCount = 0;
    const nicheSubs = [];

    for (const sub of subreddits) {
      const isMainstream = MAINSTREAM_SUBS.has(sub.toLowerCase());
      const isNicheCategory = this.classifySubreddit(sub) === 'niche';

      if (!isMainstream && !isNicheCategory) {
        // Also count small/specialized subs not in mainstream set
        // Heuristic: if it doesn't match any broad category keyword, it's likely niche
        const category = this.classifySubreddit(sub);
        if (category === 'uncategorized') {
          nicheCount++;
          nicheSubs.push(sub);
        }
      }

      if (isNicheCategory) {
        nicheCount++;
        nicheSubs.push(sub);
      }
    }

    const nicheRatio = (nicheCount / subreddits.length) * 100;

    return {
      value: Math.round(nicheRatio * 100) / 100,
      rawValue: { niche_count: nicheCount, total: subreddits.length, sample_niche: nicheSubs.slice(0, 5) }
    };
  }

  /**
   * Calculate social subreddit ratio.
   * Social/discussion subs vs passive consumption → Extraversion
   */
  calculateSocialSubredditRatio(subreddits) {
    if (subreddits.length === 0) return null;

    let socialCount = 0;

    for (const sub of subreddits) {
      const category = this.classifySubreddit(sub);
      if (category === 'social') {
        socialCount++;
      }
    }

    const socialRatio = (socialCount / subreddits.length) * 100;

    return {
      value: Math.round(socialRatio * 100) / 100,
      rawValue: { social_count: socialCount, total: subreddits.length }
    };
  }

  /**
   * Calculate help/advice subreddit ratio.
   * Membership in support communities → Agreeableness
   */
  calculateHelpAdviceRatio(subreddits) {
    if (subreddits.length === 0) return null;

    let helpCount = 0;

    for (const sub of subreddits) {
      const category = this.classifySubreddit(sub);
      if (category === 'help_advice') {
        helpCount++;
      }
    }

    const helpRatio = (helpCount / subreddits.length) * 100;

    return {
      value: Math.round(helpRatio * 100) / 100,
      rawValue: { help_advice_count: helpCount, total: subreddits.length }
    };
  }

  /**
   * Create standardized feature object
   */
  createFeature(userId, featureType, featureValue, metadata = {}) {
    return {
      user_id: userId,
      platform: 'reddit',
      feature_type: featureType,
      feature_value: featureValue,
      normalized_value: featureValue / 100,
      confidence_score: 60,
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
const redditFeatureExtractor = new RedditFeatureExtractor();
export default redditFeatureExtractor;
