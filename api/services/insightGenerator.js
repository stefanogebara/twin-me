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

  /**
   * Generate insights by combining Big Five personality with platform behavioral data
   * This creates a unified view of who the user is based on both questionnaire and behavior
   * @param {Object} bigFiveScores - User's Big Five scores (from big_five_scores table)
   * @param {Object} behavioralScores - User's behavioral estimates (from personality_estimates table)
   * @param {Object} platformData - Raw platform data (spotify, calendar, whoop)
   */
  async generatePersonalityIntegratedInsights(bigFiveScores, behavioralScores, platformData) {
    const insights = [];

    try {
      // Only proceed if we have Big Five data
      if (!bigFiveScores) {
        insights.push({
          title: "Complete Your Personality Profile",
          icon: "🎯",
          description: "Take the Big Five assessment to unlock personalized insights",
          source: 'system',
          confidence: 100,
          actions: ["Take Big Five Assessment"],
          data: { pattern: 'incomplete_profile', value: 0 }
        });
        return insights;
      }

      // Extract Big Five percentiles
      const personality = {
        openness: bigFiveScores.openness_percentile || 50,
        conscientiousness: bigFiveScores.conscientiousness_percentile || 50,
        extraversion: bigFiveScores.extraversion_percentile || 50,
        agreeableness: bigFiveScores.agreeableness_percentile || 50,
        neuroticism: bigFiveScores.neuroticism_percentile || 50
      };

      // 1. Consistency Analysis: Compare questionnaire vs behavior
      if (behavioralScores && behavioralScores.total_behavioral_signals > 10) {
        const consistency = this.analyzePersonalityConsistency(personality, behavioralScores);

        if (consistency.score > 0.8) {
          insights.push({
            title: "Authentic Self-Expression",
            icon: "✨",
            description: "Your digital behavior strongly aligns with your self-perception. You express your true self consistently.",
            source: 'personality_behavioral',
            confidence: Math.round(consistency.score * 100),
            actions: ["View alignment details", "See behavioral evidence"],
            data: { pattern: 'personality_consistency', value: consistency.score, details: consistency.details }
          });
        } else if (consistency.score < 0.5) {
          const gaps = consistency.details.filter(d => d.gap > 20);
          insights.push({
            title: "Hidden Depths",
            icon: "🔍",
            description: `Your behavior suggests different traits than you reported. ${gaps.length > 0 ? `Especially in ${gaps[0].trait}.` : ''}`,
            source: 'personality_behavioral',
            confidence: Math.round((1 - consistency.score) * 100),
            actions: ["Explore the difference", "Retake assessment"],
            data: { pattern: 'personality_gap', value: consistency.score, gaps }
          });
        }
      }

      // 2. Personality-Driven Insights
      // High Openness + Spotify
      if (personality.openness > 70 && platformData?.spotify) {
        const genreDiversity = this.analyzeGenreDiversity(platformData.spotify);
        if (genreDiversity.score > 0.6) {
          insights.push({
            title: "Musical Explorer",
            icon: "🎵",
            description: `Your high openness (${personality.openness}th percentile) perfectly matches your diverse music taste spanning ${genreDiversity.count}+ genres.`,
            source: 'spotify_personality',
            confidence: 95,
            actions: ["Discover new genres", "See your music journey"],
            data: { pattern: 'openness_music', openness: personality.openness, genreCount: genreDiversity.count }
          });
        }
      }

      // High Conscientiousness + Calendar
      if (personality.conscientiousness > 70 && platformData?.calendar) {
        const calendarPatterns = this.analyzeCalendarForConscientiousness(platformData.calendar);
        if (calendarPatterns.organized) {
          insights.push({
            title: "Structured Achiever",
            icon: "📅",
            description: `Your disciplined nature (${personality.conscientiousness}th percentile) shows in your organized calendar with ${calendarPatterns.focusBlocks} focus blocks per week.`,
            source: 'calendar_personality',
            confidence: 90,
            actions: ["Optimize your schedule", "See productivity patterns"],
            data: { pattern: 'conscientiousness_calendar', conscientiousness: personality.conscientiousness, ...calendarPatterns }
          });
        }
      }

      // Extraversion + Social patterns
      if (personality.extraversion > 70) {
        const socialScore = this.calculateSocialEngagement(platformData);
        insights.push({
          title: personality.extraversion > 85 ? "Social Energizer" : "Social Connector",
          icon: "🌟",
          description: `Your extraversion (${personality.extraversion}th percentile) drives your active social life and high energy activities.`,
          source: 'extraversion_analysis',
          confidence: 88,
          actions: ["Find social events", "Connect with similar personalities"],
          data: { pattern: 'extraversion_social', extraversion: personality.extraversion, socialScore }
        });
      } else if (personality.extraversion < 30) {
        insights.push({
          title: "Deep Focus Individual",
          icon: "🧘",
          description: `Your introverted nature (${personality.extraversion}th percentile) gives you the power of deep focus and thoughtful reflection.`,
          source: 'extraversion_analysis',
          confidence: 88,
          actions: ["Optimize alone time", "Find quiet spaces"],
          data: { pattern: 'introversion_focus', extraversion: personality.extraversion }
        });
      }

      // Neuroticism + Whoop recovery
      if (platformData?.whoop) {
        const whoopPatterns = this.analyzeWhoopForNeuroticism(platformData.whoop, personality.neuroticism);
        if (whoopPatterns.insight) {
          insights.push(whoopPatterns.insight);
        }
      }

      // Agreeableness insights
      if (personality.agreeableness > 75) {
        insights.push({
          title: "Natural Harmonizer",
          icon: "🤝",
          description: `Your high agreeableness (${personality.agreeableness}th percentile) makes you a natural at building trust and maintaining relationships.`,
          source: 'agreeableness_analysis',
          confidence: 85,
          actions: ["See relationship patterns", "Team collaboration tips"],
          data: { pattern: 'agreeableness_high', agreeableness: personality.agreeableness }
        });
      }

      // 3. Unique Combination Insights
      const uniqueProfile = this.identifyUniqueProfile(personality);
      if (uniqueProfile) {
        insights.push(uniqueProfile);
      }

      // 4. Learning & Growth Recommendations
      const growthAreas = this.identifyGrowthAreas(personality, platformData);
      if (growthAreas.length > 0) {
        insights.push({
          title: "Growth Opportunities",
          icon: "🌱",
          description: `Based on your profile, you might benefit from: ${growthAreas.join(', ')}`,
          source: 'growth_analysis',
          confidence: 75,
          actions: growthAreas.map(area => `Explore ${area}`),
          data: { pattern: 'growth_areas', areas: growthAreas }
        });
      }

    } catch (error) {
      console.error('[InsightGenerator] Error generating personality insights:', error);
    }

    return insights;
  }

  /**
   * Analyze consistency between questionnaire and behavioral scores
   */
  analyzePersonalityConsistency(questionnaire, behavioral) {
    const traits = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];
    const details = [];
    let totalScore = 0;

    for (const trait of traits) {
      const qScore = questionnaire[trait];
      const bScore = behavioral[trait];
      const gap = Math.abs(qScore - bScore);
      const consistency = 1 - (gap / 100);

      details.push({
        trait,
        questionnaire: qScore,
        behavioral: bScore,
        gap,
        consistency
      });

      totalScore += consistency;
    }

    return {
      score: totalScore / traits.length,
      details
    };
  }

  /**
   * Analyze calendar data for conscientiousness indicators
   */
  analyzeCalendarForConscientiousness(calendarData) {
    if (!calendarData?.events) return { organized: false, focusBlocks: 0 };

    const events = calendarData.events;
    const focusBlocks = events.filter(e =>
      e.summary?.toLowerCase().includes('focus') ||
      e.summary?.toLowerCase().includes('deep work') ||
      e.summary?.toLowerCase().includes('block')
    ).length;

    const regularMeetings = events.filter(e => e.recurringEventId).length;
    const organized = focusBlocks > 2 || regularMeetings > 5;

    return {
      organized,
      focusBlocks: Math.round(focusBlocks / 4), // Weekly average
      regularMeetings,
      totalEvents: events.length
    };
  }

  /**
   * Calculate social engagement from platform data
   */
  calculateSocialEngagement(platformData) {
    let score = 50;

    if (platformData?.calendar) {
      const events = platformData.calendar.events || [];
      const socialEvents = events.filter(e => e.attendees?.length > 1).length;
      score += Math.min(socialEvents * 2, 30);
    }

    return Math.min(100, score);
  }

  /**
   * Analyze Whoop data in context of neuroticism
   */
  analyzeWhoopForNeuroticism(whoopData, neuroticismScore) {
    if (!whoopData?.recoveries || whoopData.recoveries.length < 7) return {};

    const recoveryScores = whoopData.recoveries.map(r => r.score || r.recovery_score || 0);
    const avgRecovery = recoveryScores.reduce((a, b) => a + b, 0) / recoveryScores.length;
    const variance = this.calculateVariance(recoveryScores);

    // High neuroticism + low/variable recovery
    if (neuroticismScore > 60 && (avgRecovery < 50 || variance > 15)) {
      return {
        insight: {
          title: "Stress Awareness",
          icon: "💚",
          description: `Your stress sensitivity (${neuroticismScore}th percentile) may be affecting your recovery (avg: ${Math.round(avgRecovery)}%). Consider stress management techniques.`,
          source: 'whoop_personality',
          confidence: 80,
          actions: ["View recovery patterns", "Stress reduction tips"],
          data: { pattern: 'neuroticism_recovery', neuroticism: neuroticismScore, avgRecovery, variance }
        }
      };
    }

    // Low neuroticism + good recovery
    if (neuroticismScore < 40 && avgRecovery > 60) {
      return {
        insight: {
          title: "Emotional Resilience",
          icon: "💪",
          description: `Your emotional stability (${100 - neuroticismScore}th percentile) contributes to excellent recovery (avg: ${Math.round(avgRecovery)}%).`,
          source: 'whoop_personality',
          confidence: 85,
          actions: ["See resilience patterns", "Share your approach"],
          data: { pattern: 'stability_recovery', neuroticism: neuroticismScore, avgRecovery }
        }
      };
    }

    return {};
  }

  /**
   * Identify unique personality profile combinations
   */
  identifyUniqueProfile(personality) {
    const { openness, conscientiousness, extraversion, agreeableness, neuroticism } = personality;

    // Creative Organizer: High openness + high conscientiousness (rare)
    if (openness > 70 && conscientiousness > 70) {
      return {
        title: "Creative Organizer",
        icon: "🎨📊",
        description: "A rare combination: you're both highly creative and highly disciplined. You bring innovation with execution.",
        source: 'unique_profile',
        confidence: 92,
        actions: ["Explore this superpower", "Find similar profiles"],
        data: { pattern: 'creative_organizer', openness, conscientiousness }
      };
    }

    // Empathic Leader: High extraversion + high agreeableness
    if (extraversion > 70 && agreeableness > 70) {
      return {
        title: "Empathic Leader",
        icon: "👑❤️",
        description: "You combine social energy with genuine care for others - a natural leader who builds teams through trust.",
        source: 'unique_profile',
        confidence: 90,
        actions: ["Leadership insights", "Team building tips"],
        data: { pattern: 'empathic_leader', extraversion, agreeableness }
      };
    }

    // Analytical Observer: Low extraversion + high openness
    if (extraversion < 40 && openness > 70) {
      return {
        title: "Analytical Observer",
        icon: "🔬🧠",
        description: "Your introspective nature combined with curiosity makes you an exceptional analyst and deep thinker.",
        source: 'unique_profile',
        confidence: 88,
        actions: ["Deep thinking resources", "Research communities"],
        data: { pattern: 'analytical_observer', extraversion, openness }
      };
    }

    return null;
  }

  /**
   * Identify growth areas based on personality and behavior
   */
  identifyGrowthAreas(personality, platformData) {
    const areas = [];

    // Low conscientiousness + scattered calendar
    if (personality.conscientiousness < 40) {
      areas.push('time management');
    }

    // High neuroticism + poor recovery
    if (personality.neuroticism > 60) {
      areas.push('stress resilience');
    }

    // Low extraversion but desire for connection
    if (personality.extraversion < 30 && personality.agreeableness > 60) {
      areas.push('meaningful connections');
    }

    // Low openness
    if (personality.openness < 40) {
      areas.push('new experiences');
    }

    return areas.slice(0, 3); // Max 3 areas
  }
}

module.exports = new InsightGenerator();