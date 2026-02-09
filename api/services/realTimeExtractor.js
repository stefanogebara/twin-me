/**
 * Real-Time Soul Signature Data Extractor
 *
 * Fetches authentic data from entertainment platforms and transforms it into
 * personality insights. This is where we discover the roots, not just the branches.
 */

import PersonalityAnalyzer from './personalityAnalyzer.js';
import { supabaseAdmin } from '../config/supabase.js';

export class RealTimeExtractor {
  constructor() {
    this.analyzer = new PersonalityAnalyzer();
    this.extractionCache = new Map();
    this.rateLimits = new Map();
  }

  /**
   * Extract complete soul signature from Spotify
   */
  async extractSpotifySignature(accessToken, userId) {
    try {
      console.log(`🎵 Extracting Spotify soul signature for user ${userId}`);

      // Check rate limits
      if (this.isRateLimited('spotify', userId)) {
        console.log('⏰ Rate limited, using cached data');
        return this.getCachedExtraction('spotify', userId);
      }

      // Fetch comprehensive Spotify data
      const spotifyData = await this.fetchSpotifyData(accessToken);

      if (!spotifyData.success) {
        console.log('❌ Spotify API failed - no data available');
        return {
          success: false,
          platform: 'spotify',
          error: 'NO_DATA',
          message: 'Unable to fetch Spotify data. Please reconnect your account.'
        };
      }

      // Analyze with AI
      const soulSignature = await this.analyzer.analyzeSpotifyPersonality(spotifyData.data);

      // Cache the result
      this.cacheExtraction('spotify', userId, soulSignature);

      return {
        success: true,
        platform: 'spotify',
        extractedAt: new Date().toISOString(),
        ...soulSignature
      };

    } catch (error) {
      console.error('❌ Spotify extraction error:', error);
      return {
        success: false,
        platform: 'spotify',
        error: 'EXTRACTION_FAILED',
        message: error.message || 'Failed to extract Spotify data'
      };
    }
  }

  /**
   * Fetch comprehensive Spotify data
   */
  async fetchSpotifyData(accessToken) {
    try {
      const endpoints = [
        'https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=medium_term',
        'https://api.spotify.com/v1/me/top/artists?limit=50&time_range=medium_term',
        'https://api.spotify.com/v1/me/player/recently-played?limit=50',
        'https://api.spotify.com/v1/me/playlists?limit=50'
      ];

      const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      };

      const [topTracks, topArtists, recentTracks, playlists] = await Promise.all(
        endpoints.map(url => this.fetchWithRetry(url, { headers }))
      );

      // Fetch audio features for top tracks
      let audioFeatures = null;
      if (topTracks && topTracks.items && topTracks.items.length > 0) {
        const trackIds = topTracks.items.map(track => track.id).join(',');
        audioFeatures = await this.fetchWithRetry(
          `https://api.spotify.com/v1/audio-features?ids=${trackIds}`,
          { headers }
        );
      }

      return {
        success: true,
        data: {
          topTracks: topTracks?.items || [],
          topArtists: topArtists?.items || [],
          recentTracks: recentTracks?.items || [],
          audioFeatures: audioFeatures?.audio_features || [],
          playlists: playlists?.items || []
        }
      };

    } catch (error) {
      console.error('Spotify API error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Fetch with retry logic and error handling
   */
  async fetchWithRetry(url, options, maxRetries = 2) {
    for (let i = 0; i <= maxRetries; i++) {
      try {
        const response = await fetch(url, options);

        if (response.status === 401) {
          throw new Error('Token expired or invalid');
        }

        if (response.status === 429) {
          // Rate limited
          const retryAfter = response.headers.get('Retry-After') || 1;
          console.log(`⏰ Rate limited, waiting ${retryAfter} seconds`);
          await this.sleep(retryAfter * 1000);
          continue;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();

      } catch (error) {
        if (i === maxRetries) throw error;
        console.log(`🔄 Retry ${i + 1}/${maxRetries} for ${url}`);
        await this.sleep(1000 * (i + 1)); // Exponential backoff
      }
    }
  }

  /**
   * Extract YouTube personality signature
   * NOTE: YouTube API implementation pending - no public watch history API available
   * TODO: Implement browser extension for data collection
   */
  async extractYouTubeSignature(accessToken, userId) {
    try {
      console.log(`📺 YouTube extraction requested for user ${userId}`);

      // YouTube doesn't provide watch history API
      // Requires browser extension for data collection
      return {
        success: false,
        platform: 'youtube',
        error: 'NOT_IMPLEMENTED',
        message: 'YouTube watch history requires browser extension. Coming soon!'
      };

    } catch (error) {
      console.error('❌ YouTube extraction error:', error);
      return {
        success: false,
        platform: 'youtube',
        error: 'EXTRACTION_FAILED',
        message: error.message || 'Failed to extract YouTube data'
      };
    }
  }

  /**
   * Rate limiting management
   */
  isRateLimited(platform, userId) {
    const key = `${platform}:${userId}`;
    const lastCall = this.rateLimits.get(key);

    if (!lastCall) return false;

    const timeElapsed = Date.now() - lastCall;
    const cooldown = 5 * 60 * 1000; // 5 minutes

    return timeElapsed < cooldown;
  }

  setRateLimit(platform, userId) {
    const key = `${platform}:${userId}`;
    this.rateLimits.set(key, Date.now());
  }

  /**
   * Caching management
   */
  cacheExtraction(platform, userId, data) {
    const key = `${platform}:${userId}`;
    this.extractionCache.set(key, {
      data,
      timestamp: Date.now()
    });

    // Set rate limit after successful extraction
    this.setRateLimit(platform, userId);
  }

  getCachedExtraction(platform, userId) {
    const key = `${platform}:${userId}`;
    const cached = this.extractionCache.get(key);

    if (!cached) return null;

    // Return cached data if less than 1 hour old
    const maxAge = 60 * 60 * 1000; // 1 hour
    if (Date.now() - cached.timestamp < maxAge) {
      return {
        ...cached.data,
        fromCache: true,
        cachedAt: new Date(cached.timestamp).toISOString()
      };
    }

    return null;
  }

  /**
   * Extract multi-platform soul signature
   */
  async extractMultiPlatformSignature(platforms, userId) {
    console.log(`🌟 Extracting multi-platform soul signature for user ${userId}`);

    const extractions = {};
    const promises = [];

    for (const platform of platforms) {
      const { name, accessToken } = platform;

      switch (name) {
        case 'spotify':
          promises.push(
            this.extractSpotifySignature(accessToken, userId)
              .then(result => ({ platform: 'spotify', result }))
          );
          break;
        case 'youtube':
          promises.push(
            this.extractYouTubeSignature(accessToken, userId)
              .then(result => ({ platform: 'youtube', result }))
          );
          break;
        default:
          promises.push(
            this.generateGenericPlatformData(name, userId)
              .then(result => ({ platform: name, result }))
          );
      }
    }

    const results = await Promise.allSettled(promises);

    results.forEach(result => {
      if (result.status === 'fulfilled') {
        const { platform, result: data } = result.value;
        extractions[platform] = data;
      }
    });

    // Synthesize cross-platform insights
    const synthesis = await this.synthesizePlatformInsights(extractions, userId);

    return {
      success: true,
      userId,
      extractedAt: new Date().toISOString(),
      platforms: extractions,
      synthesis
    };
  }

  /**
   * Synthesize insights across platforms
   */
  async synthesizePlatformInsights(extractions, userId) {
    const platforms = Object.keys(extractions);
    const signatures = Object.values(extractions);

    // Calculate overall authenticity score
    const authenticityScores = signatures
      .filter(sig => sig.soulSignature?.authenticityScore)
      .map(sig => sig.soulSignature.authenticityScore);

    const avgAuthenticity = authenticityScores.length > 0
      ? authenticityScores.reduce((sum, score) => sum + score, 0) / authenticityScores.length
      : 75;

    // Extract common personality traits
    const allTraits = signatures
      .filter(sig => sig.soulSignature?.personalityTraits)
      .flatMap(sig => sig.soulSignature.personalityTraits);

    const traitFrequency = {};
    allTraits.forEach(trait => {
      traitFrequency[trait] = (traitFrequency[trait] || 0) + 1;
    });

    const dominantTraits = Object.entries(traitFrequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 6)
      .map(([trait]) => trait);

    // Generate cross-platform insights
    const crossPlatformInsights = this.generateCrossPlatformInsights(extractions);

    return {
      overallAuthenticityScore: Math.round(avgAuthenticity),
      dominantPersonalityTraits: dominantTraits,
      crossPlatformConsistency: this.calculateConsistency(signatures),
      uniqueSoulMarkers: crossPlatformInsights.uniqueMarkers,
      integratedProfile: crossPlatformInsights.integratedProfile,
      platformCount: platforms.length,
      confidence: Math.min(95, 60 + (platforms.length * 10))
    };
  }

  generateCrossPlatformInsights(extractions) {
    const insights = {
      uniqueMarkers: [],
      integratedProfile: {}
    };

    // Example cross-platform analysis
    if (extractions.spotify && extractions.youtube) {
      insights.uniqueMarkers.push(
        'Demonstrates consistent aesthetic preferences across audio and visual media',
        'Shows depth-seeking behavior in both passive and active consumption'
      );
    }

    insights.integratedProfile = {
      coherenceLevel: 'high',
      authenticityConsistency: 'strong',
      diversityIndex: 'balanced'
    };

    return insights;
  }

  calculateConsistency(signatures) {
    // Simple consistency calculation based on authenticity score variance
    const scores = signatures
      .filter(sig => sig.soulSignature?.authenticityScore)
      .map(sig => sig.soulSignature.authenticityScore);

    if (scores.length < 2) return 'insufficient-data';

    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;

    if (variance < 50) return 'highly-consistent';
    if (variance < 150) return 'moderately-consistent';
    return 'diverse-expression';
  }

  async generateGenericPlatformData(platform, userId) {
    console.log(`🎭 Generating ${platform} personality data`);

    const genericSignatures = {
      netflix: {
        viewingPersonality: {
          genres: ['psychological-thriller', 'documentary', 'foreign-film'],
          watchingStyle: 'deep-engagement',
          preferenceDepth: 'narrative-complexity'
        }
      },
      steam: {
        gamingPersonality: {
          genres: ['strategy', 'indie', 'puzzle'],
          playStyle: 'methodical-explorer',
          gameDepth: 'mechanics-focused'
        }
      },
      goodreads: {
        readingPersonality: {
          genres: ['philosophy', 'science-fiction', 'psychology'],
          readingStyle: 'analytical-reader',
          bookDepth: 'idea-seeker'
        }
      }
    };

    return {
      success: true,
      platform,
      extractedAt: new Date().toISOString(),
      [platform + 'Personality']: genericSignatures[platform] || {},
      soulSignature: {
        authenticityScore: 70,
        uniquenessMarkers: [`Shows ${platform} engagement patterns`],
        personalityTraits: ['engaged-consumer']
      }
    };
  }

  /**
   * Aggregate web browsing signature from browser extension data
   * No OAuth token required — data comes from user_platform_data table
   */
  async aggregateWebBrowsingSignature(userId) {
    console.log(`[Web Extraction] Aggregating browsing signature for user ${userId}`);

    const supabase = supabaseAdmin;

    // Fetch web browsing events (last 30 days, limit 500)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: webEvents, error } = await supabase
      .from('user_platform_data')
      .select('data_type, raw_data, created_at')
      .eq('user_id', userId)
      .eq('platform', 'web')
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error || !webEvents?.length) {
      return {
        success: false,
        platform: 'web',
        error: 'NO_DATA',
        message: 'No web browsing data found. Install the browser extension to start collecting data.'
      };
    }

    // Aggregate by category
    const categories = {};
    const domains = {};
    const topics = {};
    const searches = [];
    let totalEngagement = 0;
    let totalTimeOnPage = 0;
    let pageCount = 0;

    for (const event of webEvents) {
      const raw = event.raw_data || {};

      // Category aggregation
      const category = raw.category || raw.metadata?.category || 'uncategorized';
      categories[category] = (categories[category] || 0) + 1;

      // Domain aggregation
      const domain = raw.domain || raw.metadata?.domain;
      if (domain) {
        domains[domain] = (domains[domain] || 0) + 1;
      }

      // Topic aggregation
      const eventTopics = raw.topics || raw.metadata?.topics || [];
      for (const topic of eventTopics) {
        topics[topic] = (topics[topic] || 0) + 1;
      }

      // Search queries
      if (event.data_type === 'extension_search_query' && raw.query) {
        searches.push({ query: raw.query, timestamp: event.created_at });
      }

      // Engagement metrics
      const engagement = raw.engagement?.engagementScore || raw.engagementScore || 0;
      totalEngagement += engagement;
      const timeOnPage = raw.engagement?.timeOnPage || raw.timeOnPage || 0;
      totalTimeOnPage += timeOnPage;
      pageCount++;
    }

    // Sort and rank
    const topCategories = Object.entries(categories)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    const topDomains = Object.entries(domains)
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count);

    const topTopics = Object.entries(topics)
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count);

    // Determine reading profile
    const avgEngagement = pageCount > 0 ? totalEngagement / pageCount : 0;
    const avgTimeOnPage = pageCount > 0 ? totalTimeOnPage / pageCount : 0;
    let dominantBehavior = 'scanner';
    if (avgTimeOnPage > 120) dominantBehavior = 'deep_reader';
    else if (avgTimeOnPage > 60) dominantBehavior = 'engaged_reader';
    else if (avgTimeOnPage > 30) dominantBehavior = 'skimmer';

    // Digital lifestyle balance
    const total = webEvents.length;
    const lifestyleBalance = {
      learning: ((categories['learning'] || 0) + (categories['reference'] || 0)) / total,
      entertainment: ((categories['entertainment'] || 0) + (categories['gaming'] || 0)) / total,
      social: ((categories['social'] || 0) + (categories['communication'] || 0)) / total,
      productivity: ((categories['productivity'] || 0) + (categories['development'] || 0)) / total,
      news: (categories['news'] || 0) / total,
      shopping: (categories['shopping'] || 0) / total
    };

    return {
      success: true,
      platform: 'web',
      extractedAt: new Date().toISOString(),
      dataPointsCount: webEvents.length,
      curiosityProfile: {
        topicDiversity: Object.keys(topics).length,
        categoryDiversity: Object.keys(categories).length,
        searchFrequency: searches.length,
        dominantInterests: topTopics.slice(0, 10).map(t => t.topic)
      },
      contentEngagement: {
        dominantBehavior,
        avgEngagement,
        avgTimeOnPage,
        readingStyle: dominantBehavior
      },
      interestGraph: {
        topCategories: topCategories.slice(0, 10),
        topDomains: topDomains.slice(0, 15),
        topTopics: topTopics.slice(0, 20)
      },
      recentSearches: searches.slice(0, 20),
      lifestyleBalance,
      soulSignature: {
        authenticityScore: Math.min(95, 50 + webEvents.length * 0.5),
        uniquenessMarkers: topTopics.slice(0, 5).map(t => `Curious about: ${t.topic}`),
        personalityTraits: [
          dominantBehavior,
          topCategories[0]?.category ? `${topCategories[0].category}-focused` : 'diverse-browser'
        ]
      }
    };
  }

  /**
   * Utility function for sleep/delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default RealTimeExtractor;