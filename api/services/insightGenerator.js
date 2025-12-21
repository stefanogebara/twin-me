/**
 * Insight Generation Service
 * Converts complex graph metrics and platform data into user-friendly insights
 * Users see meaningful discoveries, not technical jargon
 */

class InsightGenerator {
  constructor() {
    // Insight templates for different patterns
    this.insightTemplates = {
      personality: {
        nightOwl: {
          title: "Night Owl Creative",
          icon: "🌙",
          description: "Your creative energy peaks after midnight",
          actions: ["See night productivity tips", "Find night owl community"]
        },
        earlyBird: {
          title: "Dawn Thinker",
          icon: "🌅",
          description: "Your mind is sharpest in the early morning hours",
          actions: ["Morning routine suggestions", "Connect with early risers"]
        },
        bridgeBuilder: {
          title: "Natural Connector",
          icon: "🌉",
          description: "You naturally bring different groups of people together",
          actions: ["See your connection map", "Networking tips"]
        },
        deepThinker: {
          title: "Philosophical Soul",
          icon: "🤔",
          description: "You spend significant time exploring life's deeper questions",
          actions: ["Philosophy book recommendations", "Find deep thinkers"]
        }
      },

      emotional: {
        emotionalProcessor: {
          title: "Emotional Alchemist",
          icon: "🎭",
          description: "You transform emotions through creative expression",
          actions: ["Emotional wellness tips", "Creative outlets"]
        },
        moodNavigator: {
          title: "Mood Navigator",
          icon: "🧭",
          description: "You consciously use music to navigate emotional states",
          actions: ["Mood playlists", "Emotional intelligence tips"]
        }
      },

      social: {
        intimateCircle: {
          title: "Intimate Circle Builder",
          icon: "👥",
          description: "You prefer deep connections with a close-knit group",
          actions: ["Strengthen bonds", "Quality over quantity tips"]
        },
        socialExplorer: {
          title: "Social Explorer",
          icon: "🌍",
          description: "You thrive on diverse connections and new perspectives",
          actions: ["Expand your network", "Cultural events nearby"]
        }
      },

      learning: {
        techCurious: {
          title: "Tech Pioneer",
          icon: "🚀",
          description: "You're always exploring cutting-edge technology",
          actions: ["Latest tech trends", "Innovation community"]
        },
        lifelongLearner: {
          title: "Knowledge Seeker",
          icon: "📚",
          description: "Your curiosity drives continuous learning across domains",
          actions: ["Learning paths", "Knowledge community"]
        }
      }
    };
  }

  /**
   * Generate insights from Spotify data
   */
  async generateSpotifyInsights(spotifyData) {
    const insights = [];

    try {
      // Analyze listening times
      const timePatterns = this.analyzeListeningTimes(spotifyData);
      if (timePatterns.nightPercentage > 60) {
        insights.push({
          ...this.insightTemplates.personality.nightOwl,
          source: 'spotify',
          confidence: Math.round(timePatterns.nightPercentage),
          data: { pattern: 'night_listening', value: timePatterns.nightPercentage }
        });
      } else if (timePatterns.morningPercentage > 60) {
        insights.push({
          ...this.insightTemplates.personality.earlyBird,
          source: 'spotify',
          confidence: Math.round(timePatterns.morningPercentage),
          data: { pattern: 'morning_listening', value: timePatterns.morningPercentage }
        });
      }

      // Analyze emotional patterns
      const emotionalPatterns = this.analyzeEmotionalPatterns(spotifyData);
      if (emotionalPatterns.moodVariety > 0.7) {
        insights.push({
          ...this.insightTemplates.emotional.moodNavigator,
          source: 'spotify',
          confidence: Math.round(emotionalPatterns.moodVariety * 100),
          data: { pattern: 'mood_navigation', value: emotionalPatterns.moodVariety }
        });
      }
      if (emotionalPatterns.emotionalDepth > 0.6) {
        insights.push({
          ...this.insightTemplates.emotional.emotionalProcessor,
          source: 'spotify',
          confidence: Math.round(emotionalPatterns.emotionalDepth * 100),
          data: { pattern: 'emotional_processing', value: emotionalPatterns.emotionalDepth }
        });
      }

      // Analyze genre diversity (indicates personality)
      const genreDiversity = this.analyzeGenreDiversity(spotifyData);
      if (genreDiversity.score > 0.7) {
        insights.push({
          title: "Musical Explorer",
          icon: "🎵",
          description: "Your diverse music taste reflects an open and curious personality",
          source: 'spotify',
          confidence: Math.round(genreDiversity.score * 100),
          actions: ["Discover new genres", "Music personality match"],
          data: { pattern: 'genre_diversity', value: genreDiversity.score }
        });
      }

    } catch (error) {
      console.error('[InsightGenerator] Error generating Spotify insights:', error);
    }

    return insights;
  }

  /**
   * Generate insights from YouTube data
   */
  async generateYouTubeInsights(youtubeData) {
    const insights = [];

    try {
      // Analyze learning patterns
      const learningPatterns = this.analyzeLearningPatterns(youtubeData);
      if (learningPatterns.techContent > 60) {
        insights.push({
          ...this.insightTemplates.learning.techCurious,
          source: 'youtube',
          confidence: Math.round(learningPatterns.techContent),
          data: { pattern: 'tech_learning', value: learningPatterns.techContent }
        });
      }
      if (learningPatterns.diverseTopics > 0.7) {
        insights.push({
          ...this.insightTemplates.learning.lifelongLearner,
          source: 'youtube',
          confidence: Math.round(learningPatterns.diverseTopics * 100),
          data: { pattern: 'diverse_learning', value: learningPatterns.diverseTopics }
        });
      }

      // Analyze content depth (long vs short videos)
      const contentDepth = this.analyzeContentDepth(youtubeData);
      if (contentDepth.deepDive > 0.6) {
        insights.push({
          ...this.insightTemplates.personality.deepThinker,
          source: 'youtube',
          confidence: Math.round(contentDepth.deepDive * 100),
          data: { pattern: 'deep_content', value: contentDepth.deepDive }
        });
      }

    } catch (error) {
      console.error('[InsightGenerator] Error generating YouTube insights:', error);
    }

    return insights;
  }

  /**
   * Generate insights from GitHub data
   */
  async generateGitHubInsights(githubData) {
    const insights = [];

    try {
      // Analyze coding patterns
      const codingPatterns = this.analyzeCodingPatterns(githubData);
      if (codingPatterns.consistentContributor) {
        insights.push({
          title: "Consistent Builder",
          icon: "🔨",
          description: "Your steady contribution pattern shows discipline and dedication",
          source: 'github',
          confidence: 85,
          actions: ["See contribution streak", "Set coding goals"],
          data: { pattern: 'consistent_coding', value: codingPatterns.consistency }
        });
      }

      // Analyze collaboration patterns
      if (codingPatterns.collaborationScore > 0.5) {
        insights.push({
          title: "Collaborative Coder",
          icon: "👨‍💻",
          description: "You thrive in team projects and open source collaboration",
          source: 'github',
          confidence: Math.round(codingPatterns.collaborationScore * 100),
          actions: ["Find collaborators", "Open source projects"],
          data: { pattern: 'collaboration', value: codingPatterns.collaborationScore }
        });
      }

    } catch (error) {
      console.error('[InsightGenerator] Error generating GitHub insights:', error);
    }

    return insights;
  }

  /**
   * Generate cross-platform insights (most valuable)
   */
  async generateCrossPlatformInsights(allPlatformData) {
    const insights = [];

    try {
      // Detect bridge builder pattern (high betweenness in graph terms)
      if (this.detectBridgeBuilderPattern(allPlatformData)) {
        insights.push({
          ...this.insightTemplates.personality.bridgeBuilder,
          source: 'cross-platform',
          confidence: 92,
          data: { pattern: 'bridge_builder', value: 0.75 }
        });
      }

      // Detect intimate circle pattern (high clustering coefficient)
      if (this.detectIntimateCirclePattern(allPlatformData)) {
        insights.push({
          ...this.insightTemplates.social.intimateCircle,
          source: 'cross-platform',
          confidence: 88,
          data: { pattern: 'intimate_circle', value: 0.82 }
        });
      }

      // Calculate authenticity score
      const authenticityScore = this.calculateAuthenticityScore(allPlatformData);
      insights.push({
        title: "Authenticity Score",
        icon: "✨",
        description: `Your soul signature is ${authenticityScore}% complete`,
        source: 'cross-platform',
        confidence: 100,
        actions: ["Increase authenticity", "See what's missing"],
        data: { pattern: 'authenticity', value: authenticityScore }
      });

    } catch (error) {
      console.error('[InsightGenerator] Error generating cross-platform insights:', error);
    }

    return insights;
  }

  /**
   * Convert graph metrics to human insights (runs after graph processing)
   */
  convertGraphMetricsToInsights(metrics) {
    const insights = [];

    // High clustering coefficient = intimate circle
    if (metrics.clusteringCoefficient > 0.7) {
      insights.push({
        ...this.insightTemplates.social.intimateCircle,
        confidence: Math.round(metrics.clusteringCoefficient * 100),
        data: { metric: 'clustering', value: metrics.clusteringCoefficient }
      });
    }

    // High betweenness = bridge builder
    if (metrics.betweennessCentrality > 0.5) {
      insights.push({
        ...this.insightTemplates.personality.bridgeBuilder,
        confidence: Math.round(metrics.betweennessCentrality * 100),
        data: { metric: 'betweenness', value: metrics.betweennessCentrality }
      });
    }

    // Low clustering + high degree = social explorer
    if (metrics.clusteringCoefficient < 0.3 && metrics.degree > 50) {
      insights.push({
        ...this.insightTemplates.social.socialExplorer,
        confidence: 85,
        data: { metric: 'exploration', value: metrics.degree }
      });
    }

    return insights;
  }

  // Helper methods for pattern analysis
  analyzeListeningTimes(spotifyData) {
    if (!spotifyData?.recentlyPlayed) return { nightPercentage: 0, morningPercentage: 0 };

    const times = spotifyData.recentlyPlayed.map(track => {
      const hour = new Date(track.played_at).getHours();
      return hour;
    });

    const nightListening = times.filter(h => h >= 22 || h <= 4).length;
    const morningListening = times.filter(h => h >= 5 && h <= 9).length;

    return {
      nightPercentage: (nightListening / times.length) * 100,
      morningPercentage: (morningListening / times.length) * 100
    };
  }

  analyzeEmotionalPatterns(spotifyData) {
    // Analyze audio features for emotional depth
    const features = spotifyData.audioFeatures || [];

    const valenceVariety = this.calculateVariance(features.map(f => f?.valence || 0.5));
    const energyVariety = this.calculateVariance(features.map(f => f?.energy || 0.5));

    return {
      moodVariety: (valenceVariety + energyVariety) / 2,
      emotionalDepth: features.filter(f => f?.valence < 0.5).length / features.length
    };
  }

  analyzeGenreDiversity(spotifyData) {
    const genres = new Set();
    spotifyData.topArtists?.forEach(artist => {
      artist.genres?.forEach(genre => genres.add(genre));
    });

    return {
      score: Math.min(genres.size / 20, 1), // Normalize to 0-1
      count: genres.size
    };
  }

  analyzeLearningPatterns(youtubeData) {
    const categories = youtubeData.watchHistory?.map(v => v.category) || [];
    const techCategories = ['Science & Technology', 'Education', 'Programming'];

    const techContent = categories.filter(c => techCategories.includes(c)).length;
    const uniqueCategories = new Set(categories).size;

    return {
      techContent: (techContent / categories.length) * 100,
      diverseTopics: uniqueCategories / 10 // Normalize
    };
  }

  analyzeContentDepth(youtubeData) {
    const durations = youtubeData.watchHistory?.map(v => v.duration) || [];
    const longVideos = durations.filter(d => d > 600).length; // >10 minutes

    return {
      deepDive: longVideos / durations.length
    };
  }

  analyzeCodingPatterns(githubData) {
    const commits = githubData.contributions?.length || 0;
    const collaborations = githubData.pullRequests?.length || 0;

    return {
      consistentContributor: commits > 50,
      consistency: Math.min(commits / 100, 1),
      collaborationScore: collaborations / (commits + 1)
    };
  }

  detectBridgeBuilderPattern(data) {
    // Simplified detection - would use graph metrics in production
    const platforms = Object.keys(data).length;
    const diverseConnections = platforms > 3;
    return diverseConnections;
  }

  detectIntimateCirclePattern(data) {
    // Simplified detection - would use clustering coefficient in production
    const spotifyData = data.spotify;
    const repeatArtists = spotifyData?.topArtists?.slice(0, 5).length || 0;
    return repeatArtists === 5; // Consistently listens to same artists
  }

  calculateAuthenticityScore(data) {
    const connectedPlatforms = Object.keys(data).length;
    const maxPlatforms = 10;
    const dataQuality = this.assessDataQuality(data);

    return Math.round(((connectedPlatforms / maxPlatforms) * 0.5 + dataQuality * 0.5) * 100);
  }

  assessDataQuality(data) {
    let quality = 0;
    let count = 0;

    Object.values(data).forEach(platformData => {
      if (platformData && Object.keys(platformData).length > 0) {
        quality += 1;
      }
      count += 1;
    });

    return count > 0 ? quality / count : 0;
  }

  calculateVariance(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }
}

module.exports = new InsightGenerator();