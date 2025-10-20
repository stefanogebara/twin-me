/**
 * Spotify Enhanced Extractor
 * Advanced personality analysis from Spotify data - far beyond basic listening patterns
 *
 * This extracts 15+ behavioral dimensions that Spotify Wrapped uses internally,
 * revealing deep personality insights through musical choices and listening behavior.
 */

import fetch from 'node-fetch';

class SpotifyEnhancedExtractor {
  constructor() {
    this.baseUrl = 'https://api.spotify.com/v1';
  }

  /**
   * Main extraction method - gets comprehensive Spotify personality profile
   */
  async extractComprehensiveProfile(accessToken, userId) {
    console.log('[Spotify Enhanced] Starting comprehensive profile extraction...');

    try {
      // Parallel data fetching for performance
      const [
        topTracksShort,
        topTracksMedium,
        topTracksLong,
        topArtistsShort,
        topArtistsMedium,
        topArtistsLong,
        recentTracks,
        savedTracks,
        playlists,
        followedArtists
      ] = await Promise.all([
        this.getTopTracks(accessToken, 'short_term', 50),   // Last 4 weeks
        this.getTopTracks(accessToken, 'medium_term', 50),  // Last 6 months
        this.getTopTracks(accessToken, 'long_term', 50),    // All time
        this.getTopArtists(accessToken, 'short_term', 50),
        this.getTopArtists(accessToken, 'medium_term', 50),
        this.getTopArtists(accessToken, 'long_term', 50),
        this.getRecentlyPlayed(accessToken, 50),
        this.getSavedTracks(accessToken, 50),
        this.getUserPlaylists(accessToken),
        this.getFollowedArtists(accessToken)
      ]);

      console.log('[Spotify Enhanced] Data fetched successfully');

      // Extract audio features for all unique tracks
      const allTrackIds = this.extractUniqueTrackIds([
        ...topTracksShort.items,
        ...topTracksMedium.items,
        ...topTracksLong.items,
        ...recentTracks.items.map(item => item.track)
      ]);

      const audioFeatures = await this.getAudioFeaturesForTracks(accessToken, allTrackIds);

      console.log('[Spotify Enhanced] Audio features retrieved');

      // Perform advanced analyses
      const analyses = {
        temporalPatterns: await this.analyzeTemporalPatterns(recentTracks, topTracksShort, topTracksMedium, topTracksLong),
        discoveryBehavior: await this.analyzeDiscoveryBehavior(topArtistsShort, topArtistsLong, followedArtists),
        audioPersonality: await this.analyzeAudioPersonality(audioFeatures),
        playlistBehavior: await this.analyzePlaylistBehavior(playlists),
        genreEvolution: await this.analyzeGenreEvolution(topArtistsShort, topArtistsMedium, topArtistsLong),
        artistLoyalty: await this.analyzeArtistLoyalty(topTracksShort, topTracksMedium, topTracksLong),
        musicalSophistication: await this.analyzeMusicalSophistication(topArtistsLong, audioFeatures),
        emotionalProfile: await this.analyzeEmotionalProfile(audioFeatures, recentTracks)
      };

      console.log('[Spotify Enhanced] All analyses complete');

      // Calculate overall metrics
      const overallMetrics = this.calculateOverallMetrics(analyses);

      return {
        success: true,
        userId,
        extractedAt: new Date().toISOString(),
        dataQuality: this.assessDataQuality(topTracksLong, topArtistsLong, recentTracks),
        ...analyses,
        overallMetrics,
        rawDataCounts: {
          topTracks: topTracksLong.items.length,
          topArtists: topArtistsLong.items.length,
          recentTracks: recentTracks.items.length,
          playlists: playlists.items.length,
          followedArtists: followedArtists.artists?.items?.length || 0
        }
      };

    } catch (error) {
      console.error('[Spotify Enhanced] Error in comprehensive extraction:', error);
      return {
        success: false,
        error: error.message,
        userId,
        extractedAt: new Date().toISOString()
      };
    }
  }

  /**
   * TEMPORAL PATTERNS ANALYSIS
   * When you listen reveals personality - night owls vs early birds, weekday vs weekend patterns
   */
  async analyzeTemporalPatterns(recentTracks, topShort, topMedium, topLong) {
    console.log('[Spotify Enhanced] Analyzing temporal patterns...');

    if (!recentTracks.items || recentTracks.items.length === 0) {
      return this.getDefaultTemporalPatterns();
    }

    const hourCounts = {};
    const dayCounts = {};
    const weekdayVsWeekend = { weekday: 0, weekend: 0 };

    recentTracks.items.forEach(item => {
      if (item.played_at) {
        const timestamp = new Date(item.played_at);
        const hour = timestamp.getHours();
        const day = timestamp.getDay(); // 0 = Sunday, 6 = Saturday

        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        dayCounts[day] = (dayCounts[day] || 0) + 1;

        if (day === 0 || day === 6) {
          weekdayVsWeekend.weekend++;
        } else {
          weekdayVsWeekend.weekday++;
        }
      }
    });

    // Determine peak listening hours
    const sortedHours = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]);
    const peakHours = sortedHours.slice(0, 4).map(([hour]) => parseInt(hour));

    // Categorize listening personality
    const listeningPersonality = this.categorizeListeningPersonality(peakHours, weekdayVsWeekend);

    // Calculate listening consistency
    const consistency = this.calculateListeningConsistency(topShort, topMedium, topLong);

    return {
      peakListeningHours: peakHours,
      hourlyDistribution: hourCounts,
      dayOfWeekDistribution: dayCounts,
      weekdayVsWeekend: {
        weekday: Math.round((weekdayVsWeekend.weekday / recentTracks.items.length) * 100),
        weekend: Math.round((weekdayVsWeekend.weekend / recentTracks.items.length) * 100)
      },
      listeningPersonality,
      consistency
    };
  }

  categorizeListeningPersonality(peakHours, weekdayVsWeekend) {
    const avgPeakHour = peakHours.reduce((sum, h) => sum + h, 0) / peakHours.length;

    let personality = [];

    // Time of day patterns
    if (avgPeakHour >= 22 || avgPeakHour <= 2) {
      personality.push('night-owl');
    } else if (avgPeakHour >= 6 && avgPeakHour <= 9) {
      personality.push('early-bird');
    } else if (avgPeakHour >= 18 && avgPeakHour <= 21) {
      personality.push('evening-focused');
    } else {
      personality.push('daytime-listener');
    }

    // Weekday vs weekend
    const total = weekdayVsWeekend.weekday + weekdayVsWeekend.weekend;
    const weekendRatio = weekdayVsWeekend.weekend / total;

    if (weekendRatio > 0.4) {
      personality.push('weekend-enthusiast');
    } else if (weekendRatio < 0.2) {
      personality.push('weekday-focused');
    }

    return personality;
  }

  calculateListeningConsistency(topShort, topMedium, topLong) {
    // Check how much overlap exists between time periods
    const shortTrackIds = new Set(topShort.items.map(t => t.id));
    const mediumTrackIds = new Set(topMedium.items.map(t => t.id));
    const longTrackIds = new Set(topLong.items.map(t => t.id));

    // Calculate overlap percentages
    let shortMediumOverlap = 0;
    shortTrackIds.forEach(id => {
      if (mediumTrackIds.has(id)) shortMediumOverlap++;
    });

    let mediumLongOverlap = 0;
    mediumTrackIds.forEach(id => {
      if (longTrackIds.has(id)) mediumLongOverlap++;
    });

    const consistencyScore = ((shortMediumOverlap / topShort.items.length) +
                             (mediumLongOverlap / topMedium.items.length)) / 2;

    let consistencyLabel = 'varied';
    if (consistencyScore > 0.7) consistencyLabel = 'highly-consistent';
    else if (consistencyScore > 0.4) consistencyLabel = 'moderately-consistent';

    return {
      score: Math.round(consistencyScore * 100) / 100,
      label: consistencyLabel,
      interpretation: consistencyScore > 0.6
        ? 'Loyal to favorite artists, comfort-zone preference'
        : 'Constantly exploring new music, novelty-seeking'
    };
  }

  /**
   * DISCOVERY BEHAVIOR ANALYSIS
   * How you explore music reveals openness to experience, conformity, cultural sophistication
   */
  async analyzeDiscoveryBehavior(topArtistsShort, topArtistsLong, followedArtists) {
    console.log('[Spotify Enhanced] Analyzing discovery behavior...');

    // Calculate artist turnover rate
    const shortArtistIds = new Set(topArtistsShort.items.map(a => a.id));
    const longArtistIds = new Set(topArtistsLong.items.map(a => a.id));

    let newArtistCount = 0;
    shortArtistIds.forEach(id => {
      if (!longArtistIds.has(id)) newArtistCount++;
    });

    const newArtistRate = newArtistCount / topArtistsShort.items.length;

    // Calculate average artist popularity (mainstream vs underground)
    const avgPopularity = topArtistsLong.items.reduce((sum, artist) =>
      sum + (artist.popularity || 0), 0) / topArtistsLong.items.length;

    // Underground score (lower popularity = higher underground score)
    const undergroundScore = (100 - avgPopularity) / 100;

    // Genre diversity
    const allGenres = new Set();
    topArtistsLong.items.forEach(artist => {
      if (artist.genres) {
        artist.genres.forEach(genre => allGenres.add(genre));
      }
    });

    const genreDiversity = Math.min(allGenres.size / 20, 1); // Normalize to 0-1

    // Categorize discovery style
    const discoveryStyle = this.categorizeDiscoveryStyle(newArtistRate, undergroundScore, genreDiversity);

    return {
      newArtistRate: Math.round(newArtistRate * 100) / 100,
      loyaltyIndex: Math.round((1 - newArtistRate) * 100) / 100,
      undergroundScore: Math.round(undergroundScore * 100) / 100,
      mainstreamIndex: Math.round((1 - undergroundScore) * 100) / 100,
      genreDiversity: Math.round(genreDiversity * 100) / 100,
      totalGenres: allGenres.size,
      discoveryStyle,
      followedArtistsCount: followedArtists.artists?.items?.length || 0
    };
  }

  categorizeDiscoveryStyle(newArtistRate, undergroundScore, genreDiversity) {
    let style = '';

    // Exploration dimension
    if (newArtistRate > 0.5) {
      style = 'active-explorer';
    } else if (newArtistRate > 0.3) {
      style = 'selective-explorer';
    } else {
      style = 'comfort-zone-listener';
    }

    // Mainstream vs underground
    let mainstream = '';
    if (undergroundScore > 0.6) {
      mainstream = 'underground-focused';
    } else if (undergroundScore < 0.4) {
      mainstream = 'mainstream-oriented';
    } else {
      mainstream = 'balanced-taste';
    }

    // Genre diversity
    let diversity = '';
    if (genreDiversity > 0.7) {
      diversity = 'genre-omnivore';
    } else if (genreDiversity > 0.4) {
      diversity = 'genre-flexible';
    } else {
      diversity = 'genre-specialist';
    }

    return {
      primary: style,
      mainstream,
      diversity,
      summary: `${style}, ${mainstream}, ${diversity}`
    };
  }

  /**
   * AUDIO PERSONALITY ANALYSIS
   * Audio features reveal emotional patterns, energy levels, complexity preferences
   */
  async analyzeAudioPersonality(audioFeatures) {
    console.log('[Spotify Enhanced] Analyzing audio personality...');

    if (!audioFeatures || audioFeatures.length === 0) {
      return this.getDefaultAudioPersonality();
    }

    // Filter valid features
    const validFeatures = audioFeatures.filter(f => f && typeof f.energy === 'number');

    if (validFeatures.length === 0) {
      return this.getDefaultAudioPersonality();
    }

    // Calculate averages
    const avgFeatures = {
      energy: 0,
      valence: 0,
      danceability: 0,
      acousticness: 0,
      instrumentalness: 0,
      speechiness: 0,
      liveness: 0,
      tempo: 0
    };

    validFeatures.forEach(feature => {
      avgFeatures.energy += feature.energy;
      avgFeatures.valence += feature.valence;
      avgFeatures.danceability += feature.danceability;
      avgFeatures.acousticness += feature.acousticness;
      avgFeatures.instrumentalness += feature.instrumentalness;
      avgFeatures.speechiness += feature.speechiness;
      avgFeatures.liveness += feature.liveness;
      avgFeatures.tempo += feature.tempo;
    });

    const count = validFeatures.length;
    Object.keys(avgFeatures).forEach(key => {
      avgFeatures[key] = Math.round((avgFeatures[key] / count) * 100) / 100;
    });

    // Calculate variance (emotional range)
    const variance = this.calculateAudioVariance(validFeatures);

    // Derive personality insights
    const emotionalProfile = this.deriveEmotionalProfile(avgFeatures, variance);
    const complexityProfile = this.deriveComplexityProfile(avgFeatures);
    const energyProfile = this.deriveEnergyProfile(avgFeatures);

    return {
      averageFeatures: avgFeatures,
      variance,
      emotionalProfile,
      complexityProfile,
      energyProfile,
      sampleSize: validFeatures.length
    };
  }

  calculateAudioVariance(features) {
    const keys = ['energy', 'valence', 'danceability', 'acousticness'];
    const variances = {};

    keys.forEach(key => {
      const values = features.map(f => f[key]).filter(v => typeof v === 'number');
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      variances[key] = Math.round(variance * 1000) / 1000;
    });

    // Overall emotional range
    const avgVariance = Object.values(variances).reduce((sum, v) => sum + v, 0) / keys.length;
    let rangeLabel = 'narrow';
    if (avgVariance > 0.06) rangeLabel = 'wide';
    else if (avgVariance > 0.03) rangeLabel = 'moderate';

    return {
      ...variances,
      overall: Math.round(avgVariance * 1000) / 1000,
      emotionalRange: rangeLabel
    };
  }

  deriveEmotionalProfile(avgFeatures, variance) {
    const { energy, valence } = avgFeatures;

    let moodCategory = '';
    if (energy > 0.7 && valence > 0.7) {
      moodCategory = 'euphoric-energetic';
    } else if (energy > 0.7 && valence < 0.4) {
      moodCategory = 'intense-cathartic';
    } else if (energy < 0.4 && valence > 0.6) {
      moodCategory = 'peaceful-content';
    } else if (energy < 0.4 && valence < 0.4) {
      moodCategory = 'melancholic-contemplative';
    } else {
      moodCategory = 'balanced-versatile';
    }

    return {
      dominantMood: moodCategory,
      energyLevel: energy > 0.7 ? 'high-energy-seeker' : energy < 0.3 ? 'low-energy-preference' : 'balanced-energy',
      valenceTendency: valence > 0.7 ? 'positivity-oriented' : valence < 0.3 ? 'complexity-emotional' : 'emotionally-balanced',
      emotionalRange: variance.emotionalRange,
      emotionalStability: variance.overall < 0.04 ? 'consistent' : 'dynamic'
    };
  }

  deriveComplexityProfile(avgFeatures) {
    const { acousticness, instrumentalness, speechiness } = avgFeatures;

    const complexityScore = (acousticness * 0.3) + (instrumentalness * 0.5) + ((1 - speechiness) * 0.2);

    return {
      complexityScore: Math.round(complexityScore * 100) / 100,
      organicVsElectronic: acousticness > 0.6 ? 'organic-preference' : acousticness < 0.3 ? 'electronic-preference' : 'balanced',
      vocalVsInstrumental: instrumentalness > 0.5 ? 'instrumental-focused' : instrumentalness < 0.2 ? 'vocal-focused' : 'mixed',
      lyricImportance: speechiness > 0.15 ? 'lyrics-important' : 'music-over-lyrics',
      sophisticationLevel: complexityScore > 0.6 ? 'high-sophistication' : complexityScore > 0.3 ? 'moderate-sophistication' : 'accessibility-focused'
    };
  }

  deriveEnergyProfile(avgFeatures) {
    const { energy, danceability, tempo } = avgFeatures;

    const movementScore = (energy * 0.4) + (danceability * 0.4) + (Math.min(tempo / 180, 1) * 0.2);

    return {
      energyConsistency: energy,
      danceability,
      tempo: Math.round(tempo),
      movementScore: Math.round(movementScore * 100) / 100,
      preferredPace: tempo > 140 ? 'fast-paced' : tempo < 90 ? 'slow-paced' : 'moderate-paced',
      physicalEngagement: danceability > 0.7 ? 'highly-rhythmic' : danceability < 0.4 ? 'contemplative-listening' : 'moderate-movement'
    };
  }

  /**
   * PLAYLIST BEHAVIOR ANALYSIS
   * How you organize music reveals conscientiousness, creativity, social openness
   */
  async analyzePlaylistBehavior(playlists) {
    console.log('[Spotify Enhanced] Analyzing playlist behavior...');

    if (!playlists.items || playlists.items.length === 0) {
      return this.getDefaultPlaylistBehavior();
    }

    const userPlaylists = playlists.items.filter(p => p.owner && p.owner.id);

    const totalPlaylists = userPlaylists.length;
    const publicPlaylists = userPlaylists.filter(p => p.public).length;
    const collaborativePlaylists = userPlaylists.filter(p => p.collaborative).length;

    // Analyze playlist naming patterns
    const namingAnalysis = this.analyzePlaylistNaming(userPlaylists);

    // Calculate average playlist size
    const avgPlaylistSize = userPlaylists.reduce((sum, p) => sum + (p.tracks?.total || 0), 0) / totalPlaylists;

    // Organization style
    const organizationStyle = this.determineOrganizationStyle(userPlaylists, avgPlaylistSize);

    return {
      totalPlaylists,
      publicPlaylists,
      collaborativePlaylists,
      publicVsPrivate: totalPlaylists > 0 ? Math.round((publicPlaylists / totalPlaylists) * 100) / 100 : 0,
      collaborativeRatio: totalPlaylists > 0 ? Math.round((collaborativePlaylists / totalPlaylists) * 100) / 100 : 0,
      averagePlaylistSize: Math.round(avgPlaylistSize),
      namingStyle: namingAnalysis,
      organizationStyle,
      socialOpenness: publicPlaylists > totalPlaylists * 0.5 ? 'high' : publicPlaylists > totalPlaylists * 0.2 ? 'moderate' : 'low'
    };
  }

  analyzePlaylistNaming(playlists) {
    const names = playlists.map(p => p.name.toLowerCase());

    // Check for creative/metaphorical names vs descriptive
    const descriptiveKeywords = ['workout', 'chill', 'study', 'sleep', 'party', 'road trip', 'morning', 'night'];
    const emojiCount = names.filter(name => /[\u{1F300}-\u{1F9FF}]/u.test(name)).length;

    let descriptiveCount = 0;
    names.forEach(name => {
      if (descriptiveKeywords.some(keyword => name.includes(keyword))) {
        descriptiveCount++;
      }
    });

    const descriptiveRatio = descriptiveCount / names.length;

    let style = 'creative-abstract';
    if (descriptiveRatio > 0.6) style = 'literal-descriptive';
    else if (descriptiveRatio > 0.3) style = 'mixed-practical';

    return {
      style,
      usesEmojis: emojiCount > 0,
      emojiRatio: Math.round((emojiCount / names.length) * 100) / 100
    };
  }

  determineOrganizationStyle(playlists, avgSize) {
    const totalPlaylists = playlists.length;

    let style = '';
    if (totalPlaylists > 50 && avgSize < 30) {
      style = 'hyper-organized-micro-curator';
    } else if (totalPlaylists > 20 && avgSize < 50) {
      style = 'meticulous-organizer';
    } else if (totalPlaylists < 10 && avgSize > 100) {
      style = 'macro-collector';
    } else {
      style = 'balanced-curator';
    }

    return {
      style,
      curationType: totalPlaylists > 20 ? 'granular' : totalPlaylists < 10 ? 'broad' : 'moderate',
      conscientiousnessSignal: totalPlaylists > 30 ? 'high' : totalPlaylists > 15 ? 'moderate' : 'low'
    };
  }

  /**
   * GENRE EVOLUTION ANALYSIS
   * How your genre preferences change over time reveals personality development
   */
  async analyzeGenreEvolution(topArtistsShort, topArtistsMedium, topArtistsLong) {
    console.log('[Spotify Enhanced] Analyzing genre evolution...');

    const shortGenres = this.extractGenres(topArtistsShort.items);
    const mediumGenres = this.extractGenres(topArtistsMedium.items);
    const longGenres = this.extractGenres(topArtistsLong.items);

    // Calculate genre stability
    const stability = this.calculateGenreStability(shortGenres, longGenres);

    return {
      currentGenres: Array.from(shortGenres).slice(0, 10),
      historicalGenres: Array.from(longGenres).slice(0, 10),
      genreStability: stability,
      evolution: stability.score > 0.7 ? 'stable-taste' : stability.score > 0.4 ? 'evolving-taste' : 'exploratory-taste'
    };
  }

  extractGenres(artists) {
    const genreCount = {};
    artists.forEach(artist => {
      if (artist.genres) {
        artist.genres.forEach(genre => {
          genreCount[genre] = (genreCount[genre] || 0) + 1;
        });
      }
    });

    return new Set(Object.entries(genreCount).sort((a, b) => b[1] - a[1]).map(([genre]) => genre));
  }

  calculateGenreStability(shortGenres, longGenres) {
    let overlap = 0;
    shortGenres.forEach(genre => {
      if (longGenres.has(genre)) overlap++;
    });

    const stability = shortGenres.size > 0 ? overlap / shortGenres.size : 0;

    return {
      score: Math.round(stability * 100) / 100,
      label: stability > 0.7 ? 'very-stable' : stability > 0.4 ? 'moderately-stable' : 'rapidly-evolving'
    };
  }

  /**
   * ARTIST LOYALTY ANALYSIS
   */
  async analyzeArtistLoyalty(topShort, topMedium, topLong) {
    console.log('[Spotify Enhanced] Analyzing artist loyalty...');

    // Extract artist IDs from tracks
    const shortArtists = new Set(topShort.items.flatMap(t => t.artists.map(a => a.id)));
    const mediumArtists = new Set(topMedium.items.flatMap(t => t.artists.map(a => a.id)));
    const longArtists = new Set(topLong.items.flatMap(t => t.artists.map(a => a.id)));

    let loyalArtists = 0;
    shortArtists.forEach(id => {
      if (mediumArtists.has(id) && longArtists.has(id)) loyalArtists++;
    });

    const loyaltyScore = shortArtists.size > 0 ? loyalArtists / shortArtists.size : 0;

    return {
      loyaltyScore: Math.round(loyaltyScore * 100) / 100,
      loyalArtistCount: loyalArtists,
      interpretation: loyaltyScore > 0.6 ? 'highly-loyal' : loyaltyScore > 0.3 ? 'moderately-loyal' : 'explorer'
    };
  }

  /**
   * MUSICAL SOPHISTICATION ANALYSIS
   */
  async analyzeMusicalSophistication(topArtistsLong, audioFeatures) {
    console.log('[Spotify Enhanced] Analyzing musical sophistication...');

    const avgPopularity = topArtistsLong.items.reduce((sum, a) => sum + (a.popularity || 0), 0) / topArtistsLong.items.length;

    // Lower popularity = more sophisticated/niche taste
    const nicheScore = (100 - avgPopularity) / 100;

    // Genre diversity
    const genres = new Set();
    topArtistsLong.items.forEach(a => {
      if (a.genres) a.genres.forEach(g => genres.add(g));
    });

    const genreDiversity = Math.min(genres.size / 20, 1);

    // Audio complexity from features
    const validFeatures = audioFeatures.filter(f => f);
    const avgInstrumentalness = validFeatures.reduce((sum, f) => sum + (f.instrumentalness || 0), 0) / validFeatures.length;
    const avgAcousticness = validFeatures.reduce((sum, f) => sum + (f.acousticness || 0), 0) / validFeatures.length;

    const complexityScore = (avgInstrumentalness * 0.5) + (avgAcousticness * 0.3) + (nicheScore * 0.2);

    const sophisticationScore = (nicheScore * 0.4) + (genreDiversity * 0.3) + (complexityScore * 0.3);

    return {
      sophisticationScore: Math.round(sophisticationScore * 100) / 100,
      nicheScore: Math.round(nicheScore * 100) / 100,
      genreDiversity: Math.round(genreDiversity * 100) / 100,
      complexityPreference: Math.round(complexityScore * 100) / 100,
      level: sophisticationScore > 0.7 ? 'high-sophistication' : sophisticationScore > 0.4 ? 'moderate-sophistication' : 'mainstream-accessible'
    };
  }

  /**
   * EMOTIONAL PROFILE
   */
  async analyzeEmotionalProfile(audioFeatures, recentTracks) {
    console.log('[Spotify Enhanced] Analyzing emotional profile...');

    const validFeatures = audioFeatures.filter(f => f && typeof f.valence === 'number');

    if (validFeatures.length === 0) {
      return { emotionalState: 'unknown', confidence: 0 };
    }

    // Calculate emotional trajectory (recent listening)
    const recentEmotions = validFeatures.slice(0, Math.min(20, validFeatures.length));
    const avgRecentValence = recentEmotions.reduce((sum, f) => sum + f.valence, 0) / recentEmotions.length;
    const avgRecentEnergy = recentEmotions.reduce((sum, f) => sum + f.energy, 0) / recentEmotions.length;

    let currentMood = 'neutral';
    if (avgRecentValence > 0.7 && avgRecentEnergy > 0.7) currentMood = 'energetic-positive';
    else if (avgRecentValence > 0.6 && avgRecentEnergy < 0.4) currentMood = 'peaceful-content';
    else if (avgRecentValence < 0.4 && avgRecentEnergy > 0.6) currentMood = 'intense-agitated';
    else if (avgRecentValence < 0.4 && avgRecentEnergy < 0.4) currentMood = 'melancholic-reflective';

    return {
      currentMood,
      avgValence: Math.round(avgRecentValence * 100) / 100,
      avgEnergy: Math.round(avgRecentEnergy * 100) / 100,
      emotionalState: this.categorizeEmotionalState(avgRecentValence, avgRecentEnergy)
    };
  }

  categorizeEmotionalState(valence, energy) {
    if (valence > 0.6 && energy > 0.6) return 'happy-energized';
    if (valence > 0.6 && energy < 0.4) return 'calm-content';
    if (valence < 0.4 && energy > 0.6) return 'stressed-anxious';
    if (valence < 0.4 && energy < 0.4) return 'sad-tired';
    return 'neutral-balanced';
  }

  /**
   * CALCULATE OVERALL METRICS
   */
  calculateOverallMetrics(analyses) {
    const openness = this.calculateOpennessScore(analyses);
    const conscientiousness = this.calculateConscientiousnessScore(analyses);
    const authenticity = this.calculateAuthenticityScore(analyses);

    return {
      openness,
      conscientiousness,
      authenticity
    };
  }

  calculateOpennessScore(analyses) {
    const { discoveryBehavior, genreEvolution, musicalSophistication } = analyses;

    const explorationScore = discoveryBehavior.newArtistRate || 0;
    const diversityScore = discoveryBehavior.genreDiversity || 0;
    const evolutionScore = 1 - (genreEvolution.genreStability?.score || 0.5);
    const sophisticationScore = musicalSophistication.sophisticationScore || 0.5;

    const openness = (explorationScore * 0.3) + (diversityScore * 0.3) + (evolutionScore * 0.2) + (sophisticationScore * 0.2);

    return {
      score: Math.round(openness * 100) / 100,
      level: openness > 0.7 ? 'very-high' : openness > 0.5 ? 'high' : openness > 0.3 ? 'moderate' : 'low',
      components: { explorationScore, diversityScore, evolutionScore, sophisticationScore }
    };
  }

  calculateConscientiousnessScore(analyses) {
    const { playlistBehavior, temporalPatterns, artistLoyalty } = analyses;

    const organizationScore = playlistBehavior.organizationStyle?.conscientiousnessSignal === 'high' ? 0.8 :
                             playlistBehavior.organizationStyle?.conscientiousnessSignal === 'moderate' ? 0.5 : 0.3;

    const consistencyScore = temporalPatterns.consistency?.score || 0.5;
    const loyaltyScore = artistLoyalty.loyaltyScore || 0.5;

    const conscientiousness = (organizationScore * 0.4) + (consistencyScore * 0.3) + (loyaltyScore * 0.3);

    return {
      score: Math.round(conscientiousness * 100) / 100,
      level: conscientiousness > 0.7 ? 'very-high' : conscientiousness > 0.5 ? 'high' : conscientiousness > 0.3 ? 'moderate' : 'low',
      components: { organizationScore, consistencyScore, loyaltyScore }
    };
  }

  calculateAuthenticityScore(analyses) {
    const { discoveryBehavior, musicalSophistication, playlistBehavior } = analyses;

    const undergroundScore = discoveryBehavior.undergroundScore || 0.5;
    const sophisticationScore = musicalSophistication.sophisticationScore || 0.5;
    const privateRatio = 1 - (playlistBehavior.publicVsPrivate || 0);

    const authenticity = (undergroundScore * 0.4) + (sophisticationScore * 0.4) + (privateRatio * 0.2);

    return {
      score: Math.round(authenticity * 100) / 100,
      level: authenticity > 0.7 ? 'highly-authentic' : authenticity > 0.5 ? 'authentic' : authenticity > 0.3 ? 'moderately-authentic' : 'mainstream',
      components: { undergroundScore, sophisticationScore, privateRatio }
    };
  }

  /**
   * ASSESS DATA QUALITY
   */
  assessDataQuality(topTracks, topArtists, recentTracks) {
    let quality = 'low';
    let score = 0;

    if (topTracks.items.length >= 40) score += 30;
    else if (topTracks.items.length >= 20) score += 20;
    else if (topTracks.items.length >= 10) score += 10;

    if (topArtists.items.length >= 40) score += 30;
    else if (topArtists.items.length >= 20) score += 20;
    else if (topArtists.items.length >= 10) score += 10;

    if (recentTracks.items.length >= 40) score += 40;
    else if (recentTracks.items.length >= 20) score += 20;
    else if (recentTracks.items.length >= 10) score += 10;

    if (score >= 80) quality = 'high';
    else if (score >= 50) quality = 'medium';

    return { quality, score };
  }

  // ============================================================
  // SPOTIFY API HELPER METHODS
  // ============================================================

  async getTopTracks(accessToken, timeRange = 'long_term', limit = 50) {
    const url = `${this.baseUrl}/me/top/tracks?time_range=${timeRange}&limit=${limit}`;
    return await this.spotifyRequest(url, accessToken);
  }

  async getTopArtists(accessToken, timeRange = 'long_term', limit = 50) {
    const url = `${this.baseUrl}/me/top/artists?time_range=${timeRange}&limit=${limit}`;
    return await this.spotifyRequest(url, accessToken);
  }

  async getRecentlyPlayed(accessToken, limit = 50) {
    const url = `${this.baseUrl}/me/player/recently-played?limit=${limit}`;
    return await this.spotifyRequest(url, accessToken);
  }

  async getSavedTracks(accessToken, limit = 50) {
    const url = `${this.baseUrl}/me/tracks?limit=${limit}`;
    return await this.spotifyRequest(url, accessToken);
  }

  async getUserPlaylists(accessToken) {
    const url = `${this.baseUrl}/me/playlists?limit=50`;
    return await this.spotifyRequest(url, accessToken);
  }

  async getFollowedArtists(accessToken) {
    const url = `${this.baseUrl}/me/following?type=artist&limit=50`;
    return await this.spotifyRequest(url, accessToken);
  }

  async getAudioFeaturesForTracks(accessToken, trackIds) {
    if (!trackIds || trackIds.length === 0) return [];

    // Spotify allows max 100 IDs per request
    const chunks = [];
    for (let i = 0; i < trackIds.length; i += 100) {
      chunks.push(trackIds.slice(i, i + 100));
    }

    const allFeatures = [];
    for (const chunk of chunks) {
      const url = `${this.baseUrl}/audio-features?ids=${chunk.join(',')}`;
      const response = await this.spotifyRequest(url, accessToken);
      if (response.audio_features) {
        allFeatures.push(...response.audio_features);
      }
    }

    return allFeatures;
  }

  async spotifyRequest(url, accessToken) {
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[Spotify Enhanced] API request failed:', error);
      throw error;
    }
  }

  extractUniqueTrackIds(tracks) {
    const ids = new Set();
    tracks.forEach(track => {
      if (track && track.id) {
        ids.add(track.id);
      }
    });
    return Array.from(ids);
  }

  // ============================================================
  // DEFAULT VALUES
  // ============================================================

  getDefaultTemporalPatterns() {
    return {
      peakListeningHours: [18, 19, 20, 21],
      hourlyDistribution: {},
      dayOfWeekDistribution: {},
      weekdayVsWeekend: { weekday: 70, weekend: 30 },
      listeningPersonality: ['evening-focused'],
      consistency: { score: 0.5, label: 'unknown', interpretation: 'Insufficient data' }
    };
  }

  getDefaultAudioPersonality() {
    return {
      averageFeatures: {
        energy: 0.6,
        valence: 0.5,
        danceability: 0.6,
        acousticness: 0.3,
        instrumentalness: 0.1,
        speechiness: 0.1,
        liveness: 0.1,
        tempo: 120
      },
      variance: { overall: 0, emotionalRange: 'unknown' },
      emotionalProfile: { dominantMood: 'balanced-versatile', energyLevel: 'balanced-energy', valenceTendency: 'emotionally-balanced', emotionalRange: 'unknown', emotionalStability: 'unknown' },
      complexityProfile: { complexityScore: 0.5, organicVsElectronic: 'balanced', vocalVsInstrumental: 'mixed', lyricImportance: 'unknown', sophisticationLevel: 'moderate-sophistication' },
      energyProfile: { energyConsistency: 0.6, danceability: 0.6, tempo: 120, movementScore: 0.6, preferredPace: 'moderate-paced', physicalEngagement: 'moderate-movement' },
      sampleSize: 0
    };
  }

  getDefaultPlaylistBehavior() {
    return {
      totalPlaylists: 0,
      publicPlaylists: 0,
      collaborativePlaylists: 0,
      publicVsPrivate: 0,
      collaborativeRatio: 0,
      averagePlaylistSize: 0,
      namingStyle: { style: 'unknown', usesEmojis: false, emojiRatio: 0 },
      organizationStyle: { style: 'unknown', curationType: 'unknown', conscientiousnessSignal: 'unknown' },
      socialOpenness: 'unknown'
    };
  }
}

export default new SpotifyEnhancedExtractor();
