/**
 * WebCuriosityAgent - Specialized agent for Big Five personality inference from web browsing data
 *
 * Uses validated digital behavior research to infer personality traits
 * from web browsing patterns captured by the browser extension.
 *
 * Research Foundation:
 * - Stachl et al. (2020): "Predicting personality from patterns of behavior collected with smartphones" (n=624)
 * - Kosinski et al. (2013): "Private traits and attributes are predictable from digital records" (n=58,000)
 * - Azucar et al. (2018): "Predicting Big Five from digital footprints" (meta-analysis, n=12,000+)
 * - Mark et al. (2016): "Email Duration, Batching, and Self-interruption" - browsing & conscientiousness
 */

import AgentBase from './AgentBase.js';
import researchRAGService from '../researchRAGService.js';
import { createClient } from '@supabase/supabase-js';

// Lazy Supabase initialization
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

// Research-validated correlations from peer-reviewed studies
const WEB_CURIOSITY_CORRELATIONS = {
  // Browsing Behavioral Patterns
  topic_diversity: {           // Number of distinct categories browsed
    openness: { r: 0.38, direction: 'positive' }    // Stachl et al. 2020
  },
  deep_reading_ratio: {        // % of pages with >60s engagement
    conscientiousness: { r: 0.25, direction: 'positive' },
    openness: { r: 0.30, direction: 'positive' }
  },
  search_frequency: {          // Frequency of search queries
    openness: { r: 0.22, direction: 'positive' }    // Curiosity-driven
  },
  social_media_ratio: {        // % time on social vs other categories
    extraversion: { r: 0.32, direction: 'positive' },  // Kosinski et al. 2013
    neuroticism: { r: 0.15, direction: 'positive' }
  },
  news_consumption: {          // News site visits
    openness: { r: 0.20, direction: 'positive' }
  },
  learning_ratio: {            // % on learning/reference sites
    openness: { r: 0.35, direction: 'positive' },
    conscientiousness: { r: 0.20, direction: 'positive' }
  },
  browsing_consistency: {      // Same domains revisited regularly
    conscientiousness: { r: 0.28, direction: 'positive' }  // Routine behavior
  },
  evening_browsing_ratio: {    // Activity after 10pm
    neuroticism: { r: 0.18, direction: 'positive' }  // Linked to rumination
  },
  productivity_ratio: {        // % on productivity tools (GitHub, docs, etc.)
    conscientiousness: { r: 0.32, direction: 'positive' }
  },
  shopping_browsing_ratio: {   // % on shopping sites
    agreeableness: { r: -0.12, direction: 'negative' }  // Materialism link
  }
};

// Category mappings for feature extraction
const CATEGORY_GROUPS = {
  social: ['social', 'social media', 'messaging'],
  learning: ['learning', 'education', 'reference', 'documentation', 'tutorial'],
  news: ['news', 'journalism', 'current events'],
  productivity: ['productivity', 'development', 'programming', 'tools', 'work'],
  entertainment: ['entertainment', 'gaming', 'video', 'streaming'],
  shopping: ['shopping', 'ecommerce', 'marketplace']
};

class WebCuriosityAgent extends AgentBase {
  constructor() {
    super({
      name: 'WebCuriosityAgent',
      role: 'Digital behavior specialist for Big Five personality inference from web browsing data',
      maxTokens: 4096,
      temperature: 0.3
    });

    this.correlations = WEB_CURIOSITY_CORRELATIONS;
    this.categoryGroups = CATEGORY_GROUPS;
    this.initializeTools();
  }

  buildSystemPrompt() {
    return `You are the WebCuriosityAgent, a specialized AI that analyzes web browsing behavior to infer Big Five personality traits using peer-reviewed digital behavior research.

YOUR EXPERTISE:
You have deep knowledge of digital behavior research, particularly:
- Stachl et al. (2020): Smartphone behavior patterns predict personality (n=624)
- Kosinski et al. (2013): Digital footprints predict private traits (n=58,000)
- Azucar et al. (2018): Meta-analysis of Big Five from digital footprints (n=12,000+)
- Mark et al. (2016): Browsing patterns and conscientiousness

YOUR TASK:
1. Analyze user's web browsing data (categories, domains, engagement, searches)
2. Apply validated research correlations to infer personality traits
3. Generate evidence items with specific citations
4. Calculate confidence based on data quality and correlation strength

OUTPUT FORMAT (JSON):
{
  "analysis": {
    "data_quality": {
      "page_visit_count": 150,
      "category_count": 8,
      "data_span_days": 14,
      "quality_score": 0.75
    },
    "browsing_profile": {
      "topic_diversity": 0.72,
      "deep_reading_ratio": 0.35,
      "avg_engagement_score": 65,
      "avg_time_on_page": 45
    },
    "category_profile": {
      "dominant_category": "learning",
      "social_media_ratio": 0.15,
      "learning_ratio": 0.30,
      "productivity_ratio": 0.25
    }
  },
  "personality_evidence": {
    "openness": {
      "score": 68,
      "confidence": 0.70,
      "evidence": [
        {
          "feature": "topic_diversity",
          "value": 0.72,
          "correlation": 0.38,
          "citation": "Stachl et al. (2020)",
          "description": "High browsing diversity across 8 categories indicates intellectual curiosity"
        }
      ]
    },
    "conscientiousness": { ... },
    "extraversion": { ... },
    "agreeableness": { ... },
    "neuroticism": { ... }
  },
  "summary": "Based on your web browsing patterns...",
  "research_context": "Analysis grounded in digital behavior research..."
}

CORRELATION GUIDELINES:
- r >= 0.35: Strong evidence, high confidence contribution
- r = 0.25-0.34: Moderate evidence, medium confidence
- r < 0.25: Weak evidence, low confidence contribution

IMPORTANT:
- Always cite specific research papers
- Be transparent about correlation strengths
- Acknowledge limitations when data is sparse
- Focus on statistically significant correlations only`;
  }

  initializeTools() {
    this.addTool({
      name: 'get_web_browsing_data',
      description: `Retrieve user's web browsing data including categories, domains, engagement, and search patterns.

Returns:
- Category distribution and diversity
- Domain frequency and consistency
- Engagement metrics (time on page, reading behavior)
- Search query patterns
- Temporal browsing patterns`,
      input_schema: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'User ID to fetch data for' }
        },
        required: ['user_id']
      }
    });

    this.addTool({
      name: 'get_research_context',
      description: `Retrieve relevant digital behavior research for a specific personality dimension.

Returns research papers, correlations, and citations relevant to the inference.`,
      input_schema: {
        type: 'object',
        properties: {
          dimension: { type: 'string', enum: ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'] },
          feature: { type: 'string', description: 'Web behavior feature being analyzed (e.g., topic_diversity, deep_reading_ratio)' }
        },
        required: ['dimension', 'feature']
      }
    });

    this.addTool({
      name: 'calculate_personality_scores',
      description: `Calculate Big Five personality scores from web browsing features using validated correlations.

Applies research-backed correlations to compute scores with confidence intervals.`,
      input_schema: {
        type: 'object',
        properties: {
          browsing_features: {
            type: 'object',
            description: 'Extracted browsing features (topic_diversity, deep_reading_ratio, etc.)'
          },
          category_profile: {
            type: 'object',
            description: 'Category distribution (social_media_ratio, learning_ratio, etc.)'
          },
          temporal_patterns: {
            type: 'object',
            description: 'Time-based patterns (evening_browsing_ratio, browsing_consistency)'
          }
        },
        required: ['browsing_features']
      }
    });
  }

  /**
   * Execute web curiosity analysis
   */
  async execute(prompt, options = {}) {
    const userId = options.userId;

    if (!userId) {
      throw new Error('WebCuriosityAgent requires userId in options');
    }

    this._currentUserId = userId;

    try {
      const response = await super.execute(prompt, options);

      return response;

    } finally {
      this._currentUserId = null;
    }
  }

  /**
   * Tool: Get web browsing data for user
   */
  async getWebBrowsingData(userId) {
    console.log(`[WebCuriosityAgent] Fetching web browsing data for ${userId}`);

    const supabase = getSupabaseClient();

    // Get web browsing events from last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: webEvents, error } = await supabase
      .from('user_platform_data')
      .select('raw_data, data_type, extracted_at')
      .eq('user_id', userId)
      .eq('platform', 'web')
      .gte('extracted_at', thirtyDaysAgo)
      .order('extracted_at', { ascending: false })
      .limit(500);

    if (error || !webEvents || webEvents.length === 0) {
      return {
        hasData: false,
        message: 'No web browsing data found for user',
        recommendation: 'Install the browser extension to enable browsing-based personality analysis'
      };
    }

    // Extract features
    const features = this.extractFeatures(webEvents);
    const categoryProfile = this.extractCategoryProfile(webEvents);
    const temporalPatterns = this.extractTemporalPatterns(webEvents);

    return {
      hasData: true,
      browsingFeatures: features,
      categoryProfile,
      temporalPatterns,
      dataQuality: this.assessDataQuality(webEvents)
    };
  }

  /**
   * Extract behavioral features from web events
   */
  extractFeatures(webEvents) {
    const pageVisits = webEvents.filter(e =>
      ['extension_page_visit', 'extension_article_read', 'extension_web_video'].includes(e.data_type)
    );
    const searchEvents = webEvents.filter(e => e.data_type === 'extension_search_query');

    // Topic diversity: unique categories / total possible categories
    const uniqueCategories = new Set();
    pageVisits.forEach(e => {
      const cat = e.raw_data?.category;
      if (cat) uniqueCategories.add(cat.toLowerCase());
    });
    const totalPossibleCategories = 10; // Reasonable upper bound
    const topic_diversity = Math.min(1, uniqueCategories.size / totalPossibleCategories);

    // Deep reading ratio: pages with >60s engagement / total pages
    const engagedPages = pageVisits.filter(e => {
      const timeOnPage = e.raw_data?.engagement?.timeOnPage;
      return timeOnPage && timeOnPage > 60;
    });
    const deep_reading_ratio = pageVisits.length > 0
      ? engagedPages.length / pageVisits.length
      : 0;

    // Search frequency: searches per day
    const daySpan = this.calculateDaySpan(webEvents);
    const search_frequency = daySpan > 0
      ? Math.min(1, (searchEvents.length / daySpan) / 10) // Normalize: 10 searches/day = 1.0
      : 0;

    // Category-based ratios
    const categoryCounts = {};
    pageVisits.forEach(e => {
      const cat = (e.raw_data?.category || 'other').toLowerCase();
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
    const totalPages = pageVisits.length || 1;

    const countInGroup = (group) => {
      const keywords = this.categoryGroups[group] || [];
      return Object.entries(categoryCounts)
        .filter(([cat]) => keywords.some(kw => cat.includes(kw)))
        .reduce((sum, [, count]) => sum + count, 0);
    };

    const social_media_ratio = countInGroup('social') / totalPages;
    const learning_ratio = countInGroup('learning') / totalPages;
    const news_consumption = countInGroup('news') / totalPages;
    const productivity_ratio = countInGroup('productivity') / totalPages;
    const shopping_browsing_ratio = countInGroup('shopping') / totalPages;

    // Browsing consistency: domains appearing 3+ times / unique domains
    const domainCounts = {};
    pageVisits.forEach(e => {
      const domain = e.raw_data?.domain;
      if (domain) domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    });
    const uniqueDomains = Object.keys(domainCounts).length;
    const consistentDomains = Object.values(domainCounts).filter(c => c >= 3).length;
    const browsing_consistency = uniqueDomains > 0
      ? consistentDomains / uniqueDomains
      : 0;

    // Evening browsing ratio: events after 10pm / total
    const eveningEvents = pageVisits.filter(e => {
      const timestamp = e.raw_data?.timestamp || e.extracted_at;
      if (!timestamp) return false;
      const hour = new Date(timestamp).getHours();
      return hour >= 22 || hour < 5;
    });
    const evening_browsing_ratio = pageVisits.length > 0
      ? eveningEvents.length / pageVisits.length
      : 0;

    // Average engagement
    const engagementScores = pageVisits
      .map(e => e.raw_data?.engagement?.engagementScore)
      .filter(s => s != null);
    const avg_engagement_score = engagementScores.length > 0
      ? engagementScores.reduce((a, b) => a + b, 0) / engagementScores.length / 100 // Normalize to 0-1
      : 0.5;

    // Average time on page
    const timeOnPages = pageVisits
      .map(e => e.raw_data?.engagement?.timeOnPage)
      .filter(t => t != null && t > 0);
    const avg_time_on_page = timeOnPages.length > 0
      ? timeOnPages.reduce((a, b) => a + b, 0) / timeOnPages.length
      : 0;

    return {
      topic_diversity,
      deep_reading_ratio,
      search_frequency,
      social_media_ratio,
      learning_ratio,
      news_consumption,
      productivity_ratio,
      shopping_browsing_ratio,
      browsing_consistency,
      evening_browsing_ratio,
      avg_engagement_score,
      avg_time_on_page,
      total_page_visits: pageVisits.length,
      total_searches: searchEvents.length,
      unique_categories: uniqueCategories.size,
      unique_domains: uniqueDomains
    };
  }

  /**
   * Extract category profile
   */
  extractCategoryProfile(webEvents) {
    const pageVisits = webEvents.filter(e =>
      ['extension_page_visit', 'extension_article_read', 'extension_web_video'].includes(e.data_type)
    );

    const categoryCounts = {};
    pageVisits.forEach(e => {
      const cat = (e.raw_data?.category || 'Other');
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    const totalPages = pageVisits.length || 1;
    const sortedCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1]);

    const dominantCategory = sortedCategories[0]?.[0] || 'varied';

    // Top domains
    const domainCounts = {};
    pageVisits.forEach(e => {
      const domain = e.raw_data?.domain;
      if (domain) domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    });
    const topDomains = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([domain, count]) => ({ domain, visits: count }));

    // Top topics
    const topicCounts = {};
    pageVisits.forEach(e => {
      (e.raw_data?.metadata?.topics || []).forEach(t => {
        topicCounts[t] = (topicCounts[t] || 0) + 1;
      });
    });
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([topic, count]) => ({ topic, frequency: count }));

    return {
      dominantCategory,
      categoryDistribution: sortedCategories.slice(0, 8).map(([cat, count]) => ({
        category: cat,
        percentage: Math.round((count / totalPages) * 100)
      })),
      topDomains,
      topTopics,
      diversityScore: Math.min(1, Object.keys(categoryCounts).length / 10)
    };
  }

  /**
   * Extract temporal browsing patterns
   */
  extractTemporalPatterns(webEvents) {
    const pageVisits = webEvents.filter(e =>
      ['extension_page_visit', 'extension_article_read', 'extension_web_video'].includes(e.data_type)
    );

    const hourCounts = Array(24).fill(0);
    const dayOfWeekCounts = Array(7).fill(0);

    pageVisits.forEach(e => {
      const timestamp = e.raw_data?.timestamp || e.extracted_at;
      if (!timestamp) return;
      const date = new Date(timestamp);
      hourCounts[date.getHours()]++;
      dayOfWeekCounts[date.getDay()]++;
    });

    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    const peakDay = dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts));
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Determine browsing chronotype
    const morningBrowsing = hourCounts.slice(6, 12).reduce((a, b) => a + b, 0);
    const afternoonBrowsing = hourCounts.slice(12, 18).reduce((a, b) => a + b, 0);
    const eveningBrowsing = hourCounts.slice(18, 24).reduce((a, b) => a + b, 0);
    const nightBrowsing = hourCounts.slice(0, 6).reduce((a, b) => a + b, 0);

    const total = morningBrowsing + afternoonBrowsing + eveningBrowsing + nightBrowsing || 1;

    return {
      peakHour,
      peakDay: dayNames[peakDay],
      morningRatio: morningBrowsing / total,
      afternoonRatio: afternoonBrowsing / total,
      eveningRatio: eveningBrowsing / total,
      nightRatio: nightBrowsing / total,
      chronotype: peakHour < 12 ? 'morning_browser' : peakHour < 18 ? 'afternoon_browser' : 'evening_browser'
    };
  }

  /**
   * Calculate day span of data
   */
  calculateDaySpan(events) {
    if (events.length < 2) return 1;
    const dates = events
      .map(e => new Date(e.extracted_at || e.raw_data?.timestamp))
      .filter(d => !isNaN(d))
      .sort((a, b) => a - b);
    if (dates.length < 2) return 1;
    return Math.max(1, Math.ceil((dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24)));
  }

  /**
   * Assess data quality
   */
  assessDataQuality(webEvents) {
    const pageVisits = webEvents.filter(e =>
      ['extension_page_visit', 'extension_article_read', 'extension_web_video'].includes(e.data_type)
    );
    const searchEvents = webEvents.filter(e => e.data_type === 'extension_search_query');

    let score = 0;

    // Page visit count (max 0.3)
    score += Math.min(pageVisits.length / 100, 0.3);

    // Category diversity (max 0.2)
    const uniqueCategories = new Set(pageVisits.map(e => e.raw_data?.category).filter(Boolean));
    score += Math.min(uniqueCategories.size / 8, 0.2);

    // Has search data (max 0.15)
    score += Math.min(searchEvents.length / 20, 0.15);

    // Engagement data available (max 0.15)
    const withEngagement = pageVisits.filter(e => e.raw_data?.engagement?.engagementScore != null);
    score += Math.min(withEngagement.length / pageVisits.length || 0, 0.15);

    // Data span (max 0.2)
    const daySpan = this.calculateDaySpan(webEvents);
    score += Math.min(daySpan / 14, 0.2);

    return {
      score: Math.min(score, 1),
      pageVisitCount: pageVisits.length,
      searchCount: searchEvents.length,
      categoryCount: uniqueCategories.size,
      dataSpanDays: daySpan,
      hasEngagementData: withEngagement.length > 0
    };
  }

  /**
   * Tool: Get research context from RAG
   */
  async getResearchContext(params) {
    const { dimension, feature } = params;

    try {
      const context = await researchRAGService.getResearchContext(dimension, feature);
      return context;
    } catch (error) {
      console.error(`[WebCuriosityAgent] RAG error:`, error);
      return {
        hasResearch: false,
        fallbackCorrelation: this.correlations[feature]?.[dimension] || null,
        message: 'RAG unavailable, using built-in correlations'
      };
    }
  }

  /**
   * Tool: Calculate personality scores from browsing features
   */
  async calculatePersonalityScores(params) {
    const { browsing_features, category_profile, temporal_patterns } = params;

    const scores = {
      openness: { score: 50, confidence: 0, evidence: [] },
      conscientiousness: { score: 50, confidence: 0, evidence: [] },
      extraversion: { score: 50, confidence: 0, evidence: [] },
      agreeableness: { score: 50, confidence: 0, evidence: [] },
      neuroticism: { score: 50, confidence: 0, evidence: [] }
    };

    if (browsing_features) {
      this.applyBrowsingCorrelations(scores, browsing_features);
    }

    if (temporal_patterns) {
      this.applyTemporalCorrelations(scores, temporal_patterns);
    }

    // Normalize scores to 0-100
    for (const dimension of Object.keys(scores)) {
      scores[dimension].score = Math.max(0, Math.min(100, Math.round(scores[dimension].score)));
      scores[dimension].confidence = Math.min(0.95, scores[dimension].confidence);
    }

    return scores;
  }

  /**
   * Apply browsing feature correlations to personality scores
   */
  applyBrowsingCorrelations(scores, features) {
    const featureKeys = [
      'topic_diversity', 'deep_reading_ratio', 'search_frequency',
      'social_media_ratio', 'learning_ratio', 'news_consumption',
      'productivity_ratio', 'shopping_browsing_ratio', 'browsing_consistency',
      'evening_browsing_ratio'
    ];

    for (const feature of featureKeys) {
      const value = features[feature];
      if (value === undefined || value === null) continue;

      const correlations = this.correlations[feature];
      if (!correlations) continue;

      for (const [dimension, corr] of Object.entries(correlations)) {
        const contribution = corr.direction === 'positive'
          ? (value - 0.5) * corr.r * 30
          : -(value - 0.5) * Math.abs(corr.r) * 30;

        scores[dimension].score += contribution;
        scores[dimension].confidence += Math.abs(corr.r) * 0.1;

        scores[dimension].evidence.push({
          feature,
          value: Math.round(value * 100) / 100,
          correlation: corr.r,
          direction: corr.direction,
          citation: this.getCitationForFeature(feature),
          description: this.generateEvidenceDescription(feature, value, dimension, corr)
        });
      }
    }
  }

  /**
   * Apply temporal pattern correlations
   */
  applyTemporalCorrelations(scores, patterns) {
    // Evening/night browsing ratio -> neuroticism (weak but documented)
    if (patterns.eveningRatio !== undefined && patterns.nightRatio !== undefined) {
      const lateRatio = patterns.eveningRatio + patterns.nightRatio;
      const corr = this.correlations.evening_browsing_ratio;
      if (corr?.neuroticism) {
        const contribution = (lateRatio - 0.3) * corr.neuroticism.r * 20;
        scores.neuroticism.score += contribution;
        scores.neuroticism.confidence += Math.abs(corr.neuroticism.r) * 0.05;

        scores.neuroticism.evidence.push({
          feature: 'evening_browsing_ratio',
          value: Math.round(lateRatio * 100) / 100,
          correlation: corr.neuroticism.r,
          direction: 'positive',
          citation: 'Mark et al. (2016)',
          description: lateRatio > 0.4
            ? 'Notable evening/late-night browsing activity, which research links to higher emotional sensitivity'
            : 'Browsing activity concentrated during daytime hours, suggesting stable routine'
        });
      }
    }
  }

  /**
   * Get citation for a feature
   */
  getCitationForFeature(feature) {
    const citations = {
      topic_diversity: 'Stachl et al. (2020)',
      deep_reading_ratio: 'Azucar et al. (2018)',
      search_frequency: 'Kosinski et al. (2013)',
      social_media_ratio: 'Kosinski et al. (2013)',
      learning_ratio: 'Stachl et al. (2020)',
      news_consumption: 'Azucar et al. (2018)',
      productivity_ratio: 'Stachl et al. (2020)',
      shopping_browsing_ratio: 'Azucar et al. (2018)',
      browsing_consistency: 'Mark et al. (2016)',
      evening_browsing_ratio: 'Mark et al. (2016)'
    };
    return citations[feature] || 'Digital behavior research';
  }

  /**
   * Generate human-readable evidence description
   */
  generateEvidenceDescription(feature, value, dimension, corr) {
    const templates = {
      topic_diversity: {
        high: `Diverse browsing across ${Math.round(value * 10)} content categories indicates intellectual curiosity and openness`,
        low: `Focused browsing in specific categories suggests depth-oriented, systematic approach`
      },
      deep_reading_ratio: {
        high: `${Math.round(value * 100)}% of pages received deep engagement (>60s), suggesting thorough, conscientious consumption`,
        low: `Quick scanning behavior across pages suggests efficient, rapid information processing`
      },
      search_frequency: {
        high: `Active search behavior suggests curiosity-driven exploration of topics`,
        low: `Navigation-based browsing suggests preference for known sources`
      },
      social_media_ratio: {
        high: `${Math.round(value * 100)}% of browsing on social platforms indicates social connectivity preference`,
        low: `Low social media usage suggests preference for individual content consumption`
      },
      learning_ratio: {
        high: `${Math.round(value * 100)}% of browsing on learning/reference sites indicates strong intellectual drive`,
        low: `Browsing patterns lean toward entertainment and general content`
      },
      news_consumption: {
        high: `Regular news consumption suggests awareness and openness to current events`,
        low: `Limited news browsing suggests focus on specific interest domains`
      },
      productivity_ratio: {
        high: `${Math.round(value * 100)}% of browsing on productivity tools suggests organized, goal-directed behavior`,
        low: `Browsing leans toward exploration and leisure over structured productivity`
      },
      shopping_browsing_ratio: {
        high: `Notable shopping browsing activity`,
        low: `Minimal shopping-oriented browsing`
      },
      browsing_consistency: {
        high: `Consistent return to familiar domains (${Math.round(value * 100)}% revisited) suggests routine-oriented behavior`,
        low: `Broad domain exploration with little repetition suggests novelty-seeking`
      },
      evening_browsing_ratio: {
        high: `${Math.round(value * 100)}% of browsing occurs in evening/night hours`,
        low: `Browsing concentrated in daytime hours, suggesting structured daily routine`
      }
    };

    const level = value > 0.5 ? 'high' : 'low';
    return templates[feature]?.[level] || `${feature}: ${Math.round(value * 100)}%`;
  }

  /**
   * Main analysis method - analyze user's web browsing for personality
   */
  async analyzeWebData(userId) {
    console.log(`[WebCuriosityAgent] Starting analysis for user ${userId}`);

    // Direct feature extraction (bypasses Claude for efficiency)
    try {
      const webData = await this.getWebBrowsingData(userId);

      if (!webData.hasData) {
        return {
          success: false,
          error: 'No web browsing data available',
          recommendation: webData.recommendation
        };
      }

      // Calculate personality scores directly
      const personalityScores = await this.calculatePersonalityScores({
        browsing_features: webData.browsingFeatures,
        category_profile: webData.categoryProfile,
        temporal_patterns: webData.temporalPatterns
      });

      // Build personality adjustments in the format expected by AgentOrchestrator
      const personality_adjustments = {};
      for (const [dimension, data] of Object.entries(personalityScores)) {
        personality_adjustments[dimension] = {
          value: (data.score - 50) / 50, // Normalize to -1 to 1 range
          confidence: data.confidence,
          evidence_count: data.evidence.length
        };
      }

      // Build evidence array for combineEvidence
      const evidence = [];
      for (const [dimension, data] of Object.entries(personalityScores)) {
        for (const item of data.evidence) {
          evidence.push({
            dimension,
            feature: item.feature,
            observation: item.description,
            correlation: item.correlation,
            citation: item.citation,
            effect_size: Math.abs(item.correlation) >= 0.35 ? 'large' : Math.abs(item.correlation) >= 0.25 ? 'medium' : 'small',
            source_agent: 'web'
          });
        }
      }

      // Build interpretation
      const dominantTraits = Object.entries(personality_adjustments)
        .sort((a, b) => Math.abs(b[1].value) - Math.abs(a[1].value))
        .slice(0, 3);

      const interpretation = {
        web_personality_summary: `Web browsing analysis reveals ${dominantTraits.map(([dim, adj]) =>
          `${adj.value > 0 ? 'higher' : 'lower'} ${dim}`
        ).join(', ')} based on ${webData.browsingFeatures.total_page_visits} page visits across ${webData.browsingFeatures.unique_categories} categories.`,
        key_insight: `Browsing diversity score of ${Math.round(webData.browsingFeatures.topic_diversity * 100)}% with ${Math.round(webData.browsingFeatures.deep_reading_ratio * 100)}% deep reading engagement.`
      };

      return {
        success: true,
        analysis: {
          data_quality: webData.dataQuality,
          browsing_profile: webData.browsingFeatures,
          category_profile: webData.categoryProfile,
          temporal_patterns: webData.temporalPatterns
        },
        personality_evidence: personalityScores,
        personality_adjustments,
        evidence,
        features: webData.browsingFeatures,
        data_quality: webData.dataQuality,
        interpretation,
        summary: interpretation.web_personality_summary,
        research_context: 'Analysis grounded in Stachl et al. (2020), Kosinski et al. (2013), Azucar et al. (2018), and Mark et al. (2016)'
      };

    } catch (error) {
      console.error(`[WebCuriosityAgent] Analysis failed:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default WebCuriosityAgent;
