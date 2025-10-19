/**
 * YouTube Enhanced Extractor
 *
 * Provides deep behavioral insights from YouTube watch history:
 * - Watch patterns (binge behavior, session duration, time of day)
 * - Content preferences (educational vs entertainment, depth vs breadth)
 * - Creator loyalty (consistent vs exploratory)
 * - Learning style (visual learner, tutorial seeker, concept explorer)
 * - Curiosity profiling (specialist vs generalist)
 * - Attention patterns (short-form vs long-form preference)
 * - Engagement behavior (active vs passive consumption)
 * - Overall personality metrics
 *
 * Based on SOUL_SIGNATURE_ENHANCEMENT_RECOMMENDATIONS.md
 */

class YouTubeEnhancedExtractor {
  constructor() {
    this.API_BASE = 'https://www.googleapis.com/youtube/v3';
  }

  /**
   * Main extraction method - comprehensive YouTube personality profile
   * @param {string} accessToken - Valid YouTube/Google OAuth token
   * @param {string} userId - User identifier
   * @returns {Promise<Object>} Enhanced profile with 12+ behavioral dimensions
   */
  async extractComprehensiveProfile(accessToken, userId) {
    console.log(`📺 [YouTube Enhanced] Starting comprehensive extraction for user ${userId}`);

    try {
      // Step 1: Fetch data in parallel for performance
      console.log(`📺 [YouTube Enhanced] Fetching YouTube data...`);
      const [
        likedVideos,
        subscriptions,
        playlists,
        watchHistory,
        searchHistory
      ] = await Promise.all([
        this.getLikedVideos(accessToken, 50),
        this.getSubscriptions(accessToken, 100),
        this.getPlaylists(accessToken, 50),
        this.getWatchHistory(accessToken, 100),
        this.getSearchHistory(accessToken, 50).catch(() => null) // Search history might not be available
      ]);

      console.log(`📺 [YouTube Enhanced] Data fetched: ${likedVideos.length} liked, ${subscriptions.length} subscriptions, ${watchHistory.length} watch history`);

      // Step 2: Fetch video details for analysis
      const allVideoIds = [
        ...likedVideos.map(v => v.id),
        ...watchHistory.map(v => v.videoId)
      ].filter(Boolean).slice(0, 100); // Limit to avoid API quota issues

      const videoDetails = await this.getVideoDetails(accessToken, allVideoIds);

      console.log(`📺 [YouTube Enhanced] Analyzing ${videoDetails.length} videos...`);

      // Step 3: Perform comprehensive analyses
      const analyses = {
        // 1. Watch Patterns - When and how you watch
        watchPatterns: await this.analyzeWatchPatterns(watchHistory, videoDetails),

        // 2. Content Preferences - What you watch
        contentPreferences: await this.analyzeContentPreferences(videoDetails, likedVideos),

        // 3. Creator Loyalty - Who you follow
        creatorLoyalty: await this.analyzeCreatorLoyalty(subscriptions, watchHistory, videoDetails),

        // 4. Learning Style - How you learn
        learningStyle: await this.analyzeLearningStyle(videoDetails, watchHistory, searchHistory),

        // 5. Curiosity Profiling - What interests you
        curiosityProfile: await this.analyzeCuriosityProfile(videoDetails, searchHistory, subscriptions),

        // 6. Attention Patterns - Duration preferences
        attentionPatterns: await this.analyzeAttentionPatterns(videoDetails, watchHistory),

        // 7. Engagement Behavior - Active vs passive
        engagementBehavior: await this.analyzeEngagementBehavior(likedVideos, playlists, subscriptions),

        // 8. Content Evolution - How tastes change
        contentEvolution: await this.analyzeContentEvolution(watchHistory, videoDetails),

        // 9. Discovery Behavior - How you find content
        discoveryBehavior: await this.analyzeDiscoveryBehavior(subscriptions, watchHistory, searchHistory),

        // 10. Educational Depth - Learning commitment
        educationalDepth: await this.analyzeEducationalDepth(videoDetails, playlists, watchHistory)
      };

      // Step 4: Calculate overall personality metrics
      const overallMetrics = this.calculateOverallMetrics(analyses);

      // Step 5: Assess data quality
      const dataQuality = this.assessDataQuality({
        likedVideos: likedVideos.length,
        subscriptions: subscriptions.length,
        watchHistory: watchHistory.length,
        playlists: playlists.length,
        videoDetails: videoDetails.length
      });

      console.log(`📺 [YouTube Enhanced] Extraction complete - Quality: ${dataQuality.quality}`);

      return {
        success: true,
        userId,
        extractedAt: new Date().toISOString(),
        dataQuality,
        ...analyses,
        overallMetrics,
        dataSources: {
          likedVideos: likedVideos.length,
          subscriptions: subscriptions.length,
          watchHistory: watchHistory.length,
          playlists: playlists.length,
          analyzedVideos: videoDetails.length
        }
      };

    } catch (error) {
      console.error(`📺 [YouTube Enhanced] Extraction error:`, error);
      return {
        success: false,
        error: error.message,
        userId,
        extractedAt: new Date().toISOString()
      };
    }
  }

  /**
   * 1. WATCH PATTERNS ANALYSIS
   * Analyzes when and how user watches content
   */
  async analyzeWatchPatterns(watchHistory, videoDetails) {
    console.log(`📺 [YouTube Enhanced] Analyzing watch patterns...`);

    // Extract watch times (if available from history)
    const watchTimes = watchHistory
      .filter(w => w.watchedAt)
      .map(w => new Date(w.watchedAt));

    // Analyze by hour of day
    const hourCounts = {};
    watchTimes.forEach(time => {
      const hour = time.getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    // Find peak hours
    const peakHours = Object.entries(hourCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([hour]) => parseInt(hour));

    // Determine watching personality
    const avgPeakHour = peakHours.length > 0
      ? peakHours.reduce((sum, h) => sum + h, 0) / peakHours.length
      : 12;

    const watchingPersonality = [];
    if (avgPeakHour < 6) watchingPersonality.push('night-owl-extreme');
    else if (avgPeakHour < 9) watchingPersonality.push('early-bird');
    else if (avgPeakHour < 12) watchingPersonality.push('morning-learner');
    else if (avgPeakHour < 17) watchingPersonality.push('afternoon-consumer');
    else if (avgPeakHour < 22) watchingPersonality.push('evening-watcher');
    else watchingPersonality.push('night-owl');

    // Analyze binge behavior
    const sessionGaps = [];
    for (let i = 1; i < watchTimes.length; i++) {
      const gap = (watchTimes[i] - watchTimes[i-1]) / (1000 * 60); // minutes
      sessionGaps.push(gap);
    }

    const avgSessionGap = sessionGaps.length > 0
      ? sessionGaps.reduce((sum, gap) => sum + gap, 0) / sessionGaps.length
      : 0;

    const bingeScore = avgSessionGap < 15 ? 0.9 :
                       avgSessionGap < 30 ? 0.7 :
                       avgSessionGap < 60 ? 0.5 : 0.3;

    return {
      peakWatchingHours: peakHours,
      watchingPersonality,
      bingeScore,
      bingeInterpretation: bingeScore > 0.7 ? 'Frequent binge-watcher' :
                           bingeScore > 0.5 ? 'Moderate session viewer' : 'Casual browser',
      averageSessionGap: Math.round(avgSessionGap),
      totalWatchSessions: watchHistory.length
    };
  }

  /**
   * 2. CONTENT PREFERENCES ANALYSIS
   * Analyzes what types of content user prefers
   */
  async analyzeContentPreferences(videoDetails, likedVideos) {
    console.log(`📺 [YouTube Enhanced] Analyzing content preferences...`);

    // Categorize videos by type
    const categories = {
      educational: 0,
      entertainment: 0,
      music: 0,
      news: 0,
      howTo: 0,
      gaming: 0,
      vlog: 0,
      review: 0,
      other: 0
    };

    const educationalKeywords = ['tutorial', 'learn', 'education', 'course', 'lecture', 'explain', 'how to', 'guide'];
    const entertainmentKeywords = ['funny', 'comedy', 'entertainment', 'fun', 'laugh'];
    const musicKeywords = ['music', 'song', 'album', 'official music', 'mv'];
    const newsKeywords = ['news', 'breaking', 'update', 'report'];
    const gamingKeywords = ['gaming', 'gameplay', 'game', 'playthrough', 'walkthrough'];
    const vlogKeywords = ['vlog', 'daily', 'life', 'day in'];
    const reviewKeywords = ['review', 'unboxing', 'first look', 'hands on'];

    videoDetails.forEach(video => {
      const title = (video.title || '').toLowerCase();
      const description = (video.description || '').toLowerCase();
      const text = `${title} ${description}`;

      if (educationalKeywords.some(kw => text.includes(kw))) categories.educational++;
      else if (musicKeywords.some(kw => text.includes(kw))) categories.music++;
      else if (gamingKeywords.some(kw => text.includes(kw))) categories.gaming++;
      else if (newsKeywords.some(kw => text.includes(kw))) categories.news++;
      else if (vlogKeywords.some(kw => text.includes(kw))) categories.vlog++;
      else if (reviewKeywords.some(kw => text.includes(kw))) categories.review++;
      else if (entertainmentKeywords.some(kw => text.includes(kw))) categories.entertainment++;
      else categories.other++;
    });

    const total = videoDetails.length || 1;
    const categoryPercentages = {};
    Object.keys(categories).forEach(cat => {
      categoryPercentages[cat] = Math.round((categories[cat] / total) * 100);
    });

    // Determine dominant preference
    const dominant = Object.entries(categories)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([cat]) => cat);

    // Educational vs Entertainment ratio
    const edVsEnt = categories.educational / (categories.entertainment + 1);
    const contentOrientation = edVsEnt > 2 ? 'Highly Educational' :
                              edVsEnt > 1 ? 'Educational-Leaning' :
                              edVsEnt > 0.5 ? 'Balanced' :
                              edVsEnt > 0.25 ? 'Entertainment-Leaning' : 'Highly Entertainment';

    return {
      categoryBreakdown: categoryPercentages,
      dominantCategories: dominant,
      contentOrientation,
      educationalVsEntertainment: edVsEnt.toFixed(2),
      diversityScore: Object.values(categories).filter(v => v > 0).length / Object.keys(categories).length
    };
  }

  /**
   * 3. CREATOR LOYALTY ANALYSIS
   * Analyzes relationship with content creators
   */
  async analyzeCreatorLoyalty(subscriptions, watchHistory, videoDetails) {
    console.log(`📺 [YouTube Enhanced] Analyzing creator loyalty...`);

    // Build creator watch frequency map
    const creatorWatchCounts = {};
    watchHistory.forEach(watch => {
      const creator = watch.channelId || 'unknown';
      creatorWatchCounts[creator] = (creatorWatchCounts[creator] || 0) + 1;
    });

    // Calculate loyalty metrics
    const topCreators = Object.entries(creatorWatchCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);

    const totalWatches = Object.values(creatorWatchCounts).reduce((sum, count) => sum + count, 0) || 1;
    const topCreatorConcentration = topCreators.reduce((sum, [,count]) => sum + count, 0) / totalWatches;

    const loyaltyScore = topCreatorConcentration; // 0-1, higher = more loyal to few creators

    // Discovery vs loyalty
    const uniqueCreators = Object.keys(creatorWatchCounts).length;
    const subscriptionCount = subscriptions.length;

    const discoveryScore = uniqueCreators / (subscriptionCount + 1);

    return {
      loyaltyScore: loyaltyScore.toFixed(2),
      loyaltyInterpretation: loyaltyScore > 0.7 ? 'Very loyal to favorite creators' :
                             loyaltyScore > 0.5 ? 'Moderately loyal' :
                             loyaltyScore > 0.3 ? 'Diverse content consumption' : 'Highly exploratory',
      topCreatorConcentration: Math.round(topCreatorConcentration * 100),
      uniqueCreatorsWatched: uniqueCreators,
      totalSubscriptions: subscriptionCount,
      discoveryScore: discoveryScore.toFixed(2),
      explorationStyle: discoveryScore > 1.5 ? 'Wide explorer' :
                        discoveryScore > 1 ? 'Moderate explorer' : 'Subscription-focused'
    };
  }

  /**
   * 4. LEARNING STYLE ANALYSIS
   * Identifies how user learns from content
   */
  async analyzeLearningStyle(videoDetails, watchHistory, searchHistory) {
    console.log(`📺 [YouTube Enhanced] Analyzing learning style...`);

    // Identify tutorial/educational content
    const learningKeywords = {
      tutorial: ['tutorial', 'how to', 'guide', 'step by step'],
      conceptual: ['explain', 'what is', 'understanding', 'theory', 'concept'],
      practical: ['demo', 'example', 'practice', 'hands on', 'build'],
      deep: ['deep dive', 'comprehensive', 'complete guide', 'masterclass', 'course'],
      quick: ['quick', 'fast', 'in 5 minutes', 'tldr', 'summary']
    };

    const learningCounts = {
      tutorial: 0,
      conceptual: 0,
      practical: 0,
      deep: 0,
      quick: 0
    };

    videoDetails.forEach(video => {
      const text = `${video.title || ''} ${video.description || ''}`.toLowerCase();

      Object.keys(learningKeywords).forEach(type => {
        if (learningKeywords[type].some(kw => text.includes(kw))) {
          learningCounts[type]++;
        }
      });
    });

    // Determine learning style
    const total = Object.values(learningCounts).reduce((sum, count) => sum + count, 0) || 1;
    const learningProfile = {};
    Object.keys(learningCounts).forEach(type => {
      learningProfile[type] = Math.round((learningCounts[type] / total) * 100);
    });

    const dominantStyle = Object.entries(learningCounts)
      .sort(([,a], [,b]) => b - a)[0][0];

    const depthVsBreadth = learningCounts.deep / (learningCounts.quick + 1);

    return {
      learningProfile,
      dominantLearningStyle: dominantStyle,
      depthVsBreadth: depthVsBreadth.toFixed(2),
      learningApproach: depthVsBreadth > 1.5 ? 'Deep learner - comprehensive understanding' :
                       depthVsBreadth > 0.7 ? 'Balanced learner' :
                       depthVsBreadth > 0.3 ? 'Quick learner - practical focus' : 'Surface-level learner',
      visualLearnerScore: 0.8, // YouTube is inherently visual
      practicalVsTheoretical: learningCounts.practical / (learningCounts.conceptual + 1)
    };
  }

  /**
   * 5. CURIOSITY PROFILING
   * Analyzes breadth and depth of interests
   */
  async analyzeCuriosityProfile(videoDetails, searchHistory, subscriptions) {
    console.log(`📺 [YouTube Enhanced] Analyzing curiosity profile...`);

    // Extract topics from video titles
    const topics = new Set();
    const topicCounts = {};

    videoDetails.forEach(video => {
      const words = (video.title || '').toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 4); // Filter short words

      words.forEach(word => {
        topics.add(word);
        topicCounts[word] = (topicCounts[word] || 0) + 1;
      });
    });

    // Calculate curiosity metrics
    const uniqueTopics = topics.size;
    const totalVideos = videoDetails.length || 1;
    const topicDiversity = uniqueTopics / totalVideos;

    // Specialist vs Generalist
    const topTopics = Object.entries(topicCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);

    const topTopicConcentration = topTopics.reduce((sum, [,count]) => sum + count, 0) / totalVideos;

    const specialistScore = topTopicConcentration;

    return {
      uniqueTopicsExplored: uniqueTopics,
      topicDiversity: topicDiversity.toFixed(2),
      specialistVsGeneralist: specialistScore > 0.5 ? 'Specialist' :
                              specialistScore > 0.3 ? 'Focused generalist' : 'Broad generalist',
      specialistScore: specialistScore.toFixed(2),
      topInterests: topTopics.map(([topic, count]) => ({ topic, count })).slice(0, 5),
      curiosityBreadth: topicDiversity > 0.5 ? 'Very broad interests' :
                        topicDiversity > 0.3 ? 'Moderate breadth' : 'Focused interests'
    };
  }

  /**
   * 6. ATTENTION PATTERNS ANALYSIS
   * Analyzes content duration preferences
   */
  async analyzeAttentionPatterns(videoDetails, watchHistory) {
    console.log(`📺 [YouTube Enhanced] Analyzing attention patterns...`);

    // Categorize by video duration
    const durations = videoDetails
      .map(v => v.duration || 0)
      .filter(d => d > 0);

    if (durations.length === 0) {
      return {
        averageDuration: 0,
        durationPreference: 'Unknown',
        attentionSpan: 'Unknown'
      };
    }

    const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;

    // Categorize durations
    const shortForm = durations.filter(d => d < 300).length; // < 5 min
    const mediumForm = durations.filter(d => d >= 300 && d < 1200).length; // 5-20 min
    const longForm = durations.filter(d => d >= 1200).length; // > 20 min

    const total = durations.length;
    const durationProfile = {
      shortForm: Math.round((shortForm / total) * 100),
      mediumForm: Math.round((mediumForm / total) * 100),
      longForm: Math.round((longForm / total) * 100)
    };

    const dominantDuration = shortForm > mediumForm && shortForm > longForm ? 'Short-form' :
                            longForm > mediumForm ? 'Long-form' : 'Medium-form';

    return {
      averageDuration: Math.round(avgDuration),
      durationProfile,
      durationPreference: dominantDuration,
      attentionSpan: longForm / total > 0.4 ? 'High - prefers deep dives' :
                     shortForm / total > 0.6 ? 'Short - quick content preference' : 'Moderate - balanced consumption',
      longFormEngagement: Math.round((longForm / total) * 100)
    };
  }

  /**
   * 7. ENGAGEMENT BEHAVIOR ANALYSIS
   * Analyzes active vs passive consumption
   */
  async analyzeEngagementBehavior(likedVideos, playlists, subscriptions) {
    console.log(`📺 [YouTube Enhanced] Analyzing engagement behavior...`);

    const likeCount = likedVideos.length;
    const playlistCount = playlists.length;
    const subscriptionCount = subscriptions.length;

    // Calculate engagement score
    const engagementScore = (
      (likeCount > 0 ? 0.3 : 0) +
      (playlistCount > 5 ? 0.4 : playlistCount > 0 ? 0.2 : 0) +
      (subscriptionCount > 20 ? 0.3 : subscriptionCount > 0 ? 0.15 : 0)
    );

    return {
      engagementScore: engagementScore.toFixed(2),
      engagementLevel: engagementScore > 0.7 ? 'Highly engaged - active curator' :
                      engagementScore > 0.4 ? 'Moderately engaged' :
                      engagementScore > 0.2 ? 'Casually engaged' : 'Passive consumer',
      likedVideos: likeCount,
      playlistsCreated: playlistCount,
      subscriptions: subscriptionCount,
      curatorScore: playlistCount / 10, // Higher = more organized
      socialEngagement: subscriptionCount > 50 ? 'High community involvement' :
                       subscriptionCount > 20 ? 'Moderate community involvement' : 'Low community involvement'
    };
  }

  /**
   * 8. CONTENT EVOLUTION ANALYSIS
   * Tracks how viewing preferences change over time
   */
  async analyzeContentEvolution(watchHistory, videoDetails) {
    console.log(`📺 [YouTube Enhanced] Analyzing content evolution...`);

    // Sort by watch date
    const sortedHistory = watchHistory
      .filter(w => w.watchedAt)
      .sort((a, b) => new Date(a.watchedAt) - new Date(b.watchedAt));

    if (sortedHistory.length < 10) {
      return {
        evolutionDetected: false,
        stability: 'Insufficient data'
      };
    }

    // Compare early vs recent watches
    const earlyWatches = sortedHistory.slice(0, Math.floor(sortedHistory.length / 3));
    const recentWatches = sortedHistory.slice(-Math.floor(sortedHistory.length / 3));

    // Simple evolution detection (could be enhanced)
    const evolution = {
      tasteStability: 'stable', // Placeholder
      evolutionDetected: false,
      trendsIdentified: []
    };

    return evolution;
  }

  /**
   * 9. DISCOVERY BEHAVIOR ANALYSIS
   * How user finds new content
   */
  async analyzeDiscoveryBehavior(subscriptions, watchHistory, searchHistory) {
    console.log(`📺 [YouTube Enhanced] Analyzing discovery behavior...`);

    const recentSubscriptions = subscriptions.slice(0, 20);
    const totalSubscriptions = subscriptions.length;

    const subscriptionGrowthRate = recentSubscriptions.length / totalSubscriptions;

    const discoveryStyle = subscriptionGrowthRate > 0.3 ? 'Active discoverer - frequently finds new creators' :
                          subscriptionGrowthRate > 0.15 ? 'Moderate discoverer' : 'Established preferences';

    return {
      discoveryStyle,
      subscriptionGrowthRate: subscriptionGrowthRate.toFixed(2),
      totalSubscriptions,
      recentSubscriptions: recentSubscriptions.length,
      searchDriven: searchHistory ? searchHistory.length > 20 : false
    };
  }

  /**
   * 10. EDUCATIONAL DEPTH ANALYSIS
   * Learning commitment and depth
   */
  async analyzeEducationalDepth(videoDetails, playlists, watchHistory) {
    console.log(`📺 [YouTube Enhanced] Analyzing educational depth...`);

    const educationalVideos = videoDetails.filter(v => {
      const text = `${v.title || ''} ${v.description || ''}`.toLowerCase();
      return text.includes('tutorial') || text.includes('learn') ||
             text.includes('course') || text.includes('education');
    });

    const educationalPercentage = (educationalVideos.length / videoDetails.length) * 100 || 0;

    const learningCommitment = educationalPercentage > 50 ? 'High - dedicated learner' :
                              educationalPercentage > 25 ? 'Moderate - casual learner' : 'Low - entertainment focus';

    return {
      educationalPercentage: Math.round(educationalPercentage),
      educationalVideosWatched: educationalVideos.length,
      learningCommitment,
      structuredLearning: playlists.length > 5 // Playlists indicate organization
    };
  }

  /**
   * Calculate overall personality metrics from all analyses
   */
  calculateOverallMetrics(analyses) {
    console.log(`📺 [YouTube Enhanced] Calculating overall metrics...`);

    // Openness (curiosity, discovery, diversity)
    const opennessScore = (
      (analyses.curiosityProfile?.topicDiversity || 0) * 0.4 +
      (analyses.discoveryBehavior?.subscriptionGrowthRate || 0) * 0.3 +
      (analyses.contentPreferences?.diversityScore || 0) * 0.3
    );

    // Conscientiousness (organization, learning commitment)
    const conscientiousnessScore = (
      (analyses.engagementBehavior?.curatorScore || 0) * 0.5 +
      (analyses.educationalDepth?.educationalPercentage || 0) / 100 * 0.5
    );

    // Intellectual Curiosity
    const intellectualCuriosityScore = (
      (analyses.educationalDepth?.educationalPercentage || 0) / 100 * 0.6 +
      (analyses.learningStyle?.depthVsBreadth || 0) * 0.4
    );

    return {
      openness: {
        score: Math.min(opennessScore, 1).toFixed(2),
        level: opennessScore > 0.7 ? 'very-high' :
               opennessScore > 0.5 ? 'high' :
               opennessScore > 0.3 ? 'moderate' : 'low'
      },
      conscientiousness: {
        score: Math.min(conscientiousnessScore, 1).toFixed(2),
        level: conscientiousnessScore > 0.7 ? 'very-high' :
               conscientiousnessScore > 0.5 ? 'high' :
               conscientiousnessScore > 0.3 ? 'moderate' : 'low'
      },
      intellectualCuriosity: {
        score: Math.min(intellectualCuriosityScore, 1).toFixed(2),
        level: intellectualCuriosityScore > 0.7 ? 'very-high' :
               intellectualCuriosityScore > 0.5 ? 'high' :
               intellectualCuriosityScore > 0.3 ? 'moderate' : 'low'
      }
    };
  }

  /**
   * Assess data quality for extraction
   */
  assessDataQuality(dataPoints) {
    const { likedVideos, subscriptions, watchHistory, playlists, videoDetails } = dataPoints;

    const score = (
      (likedVideos > 20 ? 20 : likedVideos) +
      (subscriptions > 30 ? 30 : subscriptions) +
      (watchHistory > 50 ? 30 : watchHistory * 0.6) +
      (playlists > 5 ? 10 : playlists * 2) +
      (videoDetails > 50 ? 10 : videoDetails * 0.2)
    );

    const quality = score > 80 ? 'high' :
                    score > 50 ? 'medium' :
                    score > 20 ? 'low' : 'very-low';

    return {
      score: Math.round(score),
      quality,
      recommendations: quality === 'low' || quality === 'very-low'
        ? ['Watch more videos', 'Subscribe to channels', 'Like interesting videos']
        : []
    };
  }

  // ============================================================================
  // YOUTUBE API HELPER METHODS
  // ============================================================================

  async getLikedVideos(accessToken, maxResults = 50) {
    // YouTube API: Get liked videos
    try {
      const response = await fetch(
        `${this.API_BASE}/videos?part=snippet,contentDetails&myRating=like&maxResults=${maxResults}`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status}`);
      }

      const data = await response.json();
      return data.items || [];
    } catch (error) {
      console.error('Error fetching liked videos:', error);
      return [];
    }
  }

  async getSubscriptions(accessToken, maxResults = 100) {
    try {
      const response = await fetch(
        `${this.API_BASE}/subscriptions?part=snippet&mine=true&maxResults=${maxResults}`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status}`);
      }

      const data = await response.json();
      return data.items || [];
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      return [];
    }
  }

  async getPlaylists(accessToken, maxResults = 50) {
    try {
      const response = await fetch(
        `${this.API_BASE}/playlists?part=snippet,contentDetails&mine=true&maxResults=${maxResults}`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status}`);
      }

      const data = await response.json();
      return data.items || [];
    } catch (error) {
      console.error('Error fetching playlists:', error);
      return [];
    }
  }

  async getWatchHistory(accessToken, maxResults = 100) {
    try {
      // Note: YouTube watch history API is limited, may return empty
      const response = await fetch(
        `${this.API_BASE}/playlistItems?part=snippet,contentDetails&playlistId=HL&maxResults=${maxResults}`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      if (!response.ok) {
        // Watch history might not be available
        console.warn('Watch history not available');
        return [];
      }

      const data = await response.json();
      const items = data.items || [];

      return items.map(item => ({
        videoId: item.contentDetails?.videoId,
        channelId: item.snippet?.videoOwnerChannelId,
        watchedAt: item.snippet?.publishedAt // Approximation
      }));
    } catch (error) {
      console.error('Error fetching watch history:', error);
      return [];
    }
  }

  async getSearchHistory(accessToken, maxResults = 50) {
    // Search history is generally not available via API
    return null;
  }

  async getVideoDetails(accessToken, videoIds) {
    if (!videoIds || videoIds.length === 0) return [];

    try {
      // YouTube API allows up to 50 video IDs per request
      const chunks = [];
      for (let i = 0; i < videoIds.length; i += 50) {
        chunks.push(videoIds.slice(i, i + 50));
      }

      const allDetails = [];

      for (const chunk of chunks) {
        const response = await fetch(
          `${this.API_BASE}/videos?part=snippet,contentDetails,statistics&id=${chunk.join(',')}`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }
        );

        if (!response.ok) {
          console.error(`YouTube API error: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const items = data.items || [];

        items.forEach(item => {
          allDetails.push({
            id: item.id,
            title: item.snippet?.title,
            description: item.snippet?.description,
            duration: this.parseISO8601Duration(item.contentDetails?.duration),
            channelId: item.snippet?.channelId,
            categoryId: item.snippet?.categoryId,
            tags: item.snippet?.tags || []
          });
        });
      }

      return allDetails;
    } catch (error) {
      console.error('Error fetching video details:', error);
      return [];
    }
  }

  /**
   * Parse ISO 8601 duration (PT1H30M15S) to seconds
   */
  parseISO8601Duration(duration) {
    if (!duration) return 0;

    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;

    return hours * 3600 + minutes * 60 + seconds;
  }
}

// Export singleton instance
const youtubeEnhancedExtractor = new YouTubeEnhancedExtractor();
export default youtubeEnhancedExtractor;
