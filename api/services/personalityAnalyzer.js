/**
 * Advanced Soul Signature Personality Analyzer
 *
 * This service transforms raw entertainment data into deep personality insights
 * using AI-powered pattern recognition and psychological profiling.
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class PersonalityAnalyzer {
  constructor() {
    this.personalityTraits = {
      // Big Five + Additional dimensions
      openness: 0,
      conscientiousness: 0,
      extraversion: 0,
      agreeableness: 0,
      neuroticism: 0,

      // Soul-specific traits
      authenticity: 0,
      creativity: 0,
      intellectualCuriosity: 0,
      emotionalDepth: 0,
      culturalSophistication: 0
    };
  }

  /**
   * Analyze Spotify data for musical personality
   */
  async analyzeSpotifyPersonality(data) {
    const { topTracks, topArtists, audioFeatures, recentTracks } = data;

    // Extract musical DNA
    const musicalDNA = this.extractMusicalDNA(audioFeatures, topArtists);

    // Analyze listening patterns
    const listeningBehavior = this.analyzeListeningBehavior(recentTracks, topTracks);

    // Generate AI insights
    const aiInsights = await this.generateAIPersonalityInsights('music', {
      musicalDNA,
      listeningBehavior,
      topGenres: this.extractTopGenres(topArtists),
      artistDiversity: this.calculateArtistDiversity(topArtists)
    });

    return {
      musicalPersonality: {
        dominantMoods: musicalDNA.moods,
        genreSpectrum: musicalDNA.genres,
        audioPreferences: musicalDNA.audioProfile,
        listeningPatterns: listeningBehavior,
        artistExploration: musicalDNA.diversity
      },
      soulSignature: {
        authenticityScore: this.calculateAuthenticityScore(musicalDNA, listeningBehavior),
        uniquenessMarkers: aiInsights.uniquenessMarkers,
        personalityTraits: aiInsights.personalityTraits,
        emotionalProfile: musicalDNA.emotionalSignature
      },
      confidence: this.calculateConfidence(data)
    };
  }

  /**
   * Extract musical DNA from audio features and artist data
   */
  extractMusicalDNA(audioFeatures, topArtists) {
    if (!audioFeatures || audioFeatures.length === 0) {
      return this.generateDefaultMusicalDNA();
    }

    // Calculate average audio characteristics
    const avgFeatures = this.calculateAverageFeatures(audioFeatures);

    // Infer moods from audio features
    const moods = this.inferMoodsFromAudio(avgFeatures);

    // Extract genres with popularity analysis
    const genres = this.extractGenresWithPopularity(topArtists);

    // Calculate emotional signature
    const emotionalSignature = this.calculateEmotionalSignature(avgFeatures);

    return {
      audioProfile: avgFeatures,
      moods: moods,
      genres: genres,
      emotionalSignature: emotionalSignature,
      diversity: this.calculateMusicalDiversity(topArtists, audioFeatures)
    };
  }

  /**
   * Calculate average audio features with noise filtering
   */
  calculateAverageFeatures(audioFeatures) {
    const validFeatures = audioFeatures.filter(f => f && typeof f.energy === 'number');

    if (validFeatures.length === 0) {
      return {
        energy: 0.5,
        valence: 0.5,
        danceability: 0.5,
        acousticness: 0.3,
        instrumentalness: 0.1,
        speechiness: 0.1,
        liveness: 0.1,
        tempo: 120
      };
    }

    const sum = validFeatures.reduce((acc, feature) => ({
      energy: acc.energy + feature.energy,
      valence: acc.valence + feature.valence,
      danceability: acc.danceability + feature.danceability,
      acousticness: acc.acousticness + feature.acousticness,
      instrumentalness: acc.instrumentalness + feature.instrumentalness,
      speechiness: acc.speechiness + feature.speechiness,
      liveness: acc.liveness + feature.liveness,
      tempo: acc.tempo + feature.tempo
    }), {
      energy: 0, valence: 0, danceability: 0, acousticness: 0,
      instrumentalness: 0, speechiness: 0, liveness: 0, tempo: 0
    });

    const count = validFeatures.length;
    return {
      energy: sum.energy / count,
      valence: sum.valence / count,
      danceability: sum.danceability / count,
      acousticness: sum.acousticness / count,
      instrumentalness: sum.instrumentalness / count,
      speechiness: sum.speechiness / count,
      liveness: sum.liveness / count,
      tempo: sum.tempo / count
    };
  }

  /**
   * Infer emotional moods from audio characteristics
   */
  inferMoodsFromAudio(features) {
    const moods = [];

    // High energy + high valence = euphoric/energetic
    if (features.energy > 0.7 && features.valence > 0.7) {
      moods.push('euphoric', 'energetic', 'uplifting');
    }

    // High energy + low valence = intense/aggressive
    else if (features.energy > 0.7 && features.valence < 0.4) {
      moods.push('intense', 'aggressive', 'cathartic');
    }

    // Low energy + high valence = peaceful/content
    else if (features.energy < 0.4 && features.valence > 0.6) {
      moods.push('peaceful', 'content', 'serene');
    }

    // Low energy + low valence = melancholic/contemplative
    else if (features.energy < 0.4 && features.valence < 0.4) {
      moods.push('melancholic', 'contemplative', 'introspective');
    }

    // Balanced = dynamic/versatile
    else {
      moods.push('dynamic', 'versatile', 'balanced');
    }

    // Add complexity-based moods
    if (features.acousticness > 0.6) moods.push('organic', 'intimate');
    if (features.instrumentalness > 0.5) moods.push('atmospheric', 'cinematic');
    if (features.danceability > 0.7) moods.push('rhythmic', 'groove-oriented');

    return moods.slice(0, 5); // Return top 5 moods
  }

  /**
   * Calculate emotional signature for deep personality insights
   */
  calculateEmotionalSignature(features) {
    return {
      emotionalRange: this.calculateEmotionalRange(features),
      energyPreference: this.categorizeEnergyLevel(features.energy),
      valenceTendency: this.categorizeValence(features.valence),
      complexitySeeker: features.acousticness > 0.5 || features.instrumentalness > 0.3,
      rhythmicAffinity: features.danceability,
      contemplativeIndex: (1 - features.energy) * features.acousticness
    };
  }

  calculateEmotionalRange(features) {
    // Calculate how diverse the emotional content is
    const range = Math.abs(features.energy - 0.5) + Math.abs(features.valence - 0.5);
    if (range > 0.6) return 'wide';
    if (range > 0.3) return 'moderate';
    return 'narrow';
  }

  categorizeEnergyLevel(energy) {
    if (energy > 0.7) return 'high-energy-seeker';
    if (energy < 0.3) return 'low-energy-preference';
    return 'balanced-energy';
  }

  categorizeValence(valence) {
    if (valence > 0.7) return 'positivity-oriented';
    if (valence < 0.3) return 'complexity-emotional';
    return 'emotionally-balanced';
  }

  /**
   * Extract top genres with popularity analysis
   */
  extractGenresWithPopularity(topArtists) {
    if (!topArtists || topArtists.length === 0) {
      return ['alternative', 'electronic', 'indie'];
    }

    const genreCount = {};
    const genrePopularity = {};

    topArtists.forEach(artist => {
      if (artist.genres) {
        artist.genres.forEach(genre => {
          genreCount[genre] = (genreCount[genre] || 0) + 1;
          genrePopularity[genre] = (genrePopularity[genre] || 0) + (artist.popularity || 0);
        });
      }
    });

    // Sort by frequency and calculate uniqueness score
    const sortedGenres = Object.entries(genreCount)
      .sort(([,a], [,b]) => b - a)
      .map(([genre, count]) => ({
        genre,
        frequency: count,
        avgPopularity: genrePopularity[genre] / count,
        uniquenessScore: this.calculateGenreUniqueness(genre, genrePopularity[genre] / count)
      }));

    return sortedGenres.slice(0, 8).map(g => g.genre);
  }

  calculateGenreUniqueness(genre, avgPopularity) {
    // Lower popularity = higher uniqueness
    const popularityScore = Math.max(0, (100 - avgPopularity) / 100);

    // Some genres are inherently more niche
    const nicheGenres = ['experimental', 'ambient', 'drone', 'noise', 'avant-garde', 'field-recording'];
    const mainstreamGenres = ['pop', 'top-40', 'commercial', 'mainstream'];

    let nicheBonus = 0;
    if (nicheGenres.some(niche => genre.toLowerCase().includes(niche))) nicheBonus = 0.3;
    if (mainstreamGenres.some(mainstream => genre.toLowerCase().includes(mainstream))) nicheBonus = -0.2;

    return Math.min(1, popularityScore + nicheBonus);
  }

  /**
   * Analyze listening behavior patterns
   */
  analyzeListeningBehavior(recentTracks, topTracks) {
    if (!recentTracks || recentTracks.length === 0) {
      return {
        consistency: 'moderate',
        exploration: 'balanced',
        timePatterns: ['evening-focused'],
        sessionDepth: 'moderate'
      };
    }

    // Analyze track repetition and exploration
    const trackIds = new Set();
    const playTimes = [];

    recentTracks.forEach(item => {
      if (item.track) {
        trackIds.add(item.track.id);
        playTimes.push(new Date(item.played_at));
      }
    });

    const uniquenessRatio = trackIds.size / recentTracks.length;
    const timePatterns = this.analyzeTimePatterns(playTimes);

    return {
      consistency: this.categorizeConsistency(uniquenessRatio),
      exploration: this.categorizeExploration(uniquenessRatio),
      timePatterns: timePatterns,
      sessionDepth: this.calculateSessionDepth(recentTracks),
      repeatBehavior: this.analyzeRepeatBehavior(recentTracks, topTracks)
    };
  }

  categorizeConsistency(uniquenessRatio) {
    if (uniquenessRatio > 0.8) return 'high-novelty-seeker';
    if (uniquenessRatio < 0.4) return 'comfort-zone-preference';
    return 'balanced-exploration';
  }

  categorizeExploration(uniquenessRatio) {
    if (uniquenessRatio > 0.7) return 'active-explorer';
    if (uniquenessRatio < 0.5) return 'familiar-preference';
    return 'selective-explorer';
  }

  analyzeTimePatterns(playTimes) {
    if (playTimes.length === 0) return ['varied'];

    const hourCounts = {};
    playTimes.forEach(time => {
      const hour = time.getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    const patterns = [];

    // Morning (6-11)
    const morningPlays = Object.entries(hourCounts)
      .filter(([hour]) => hour >= 6 && hour <= 11)
      .reduce((sum, [, count]) => sum + count, 0);

    // Afternoon (12-17)
    const afternoonPlays = Object.entries(hourCounts)
      .filter(([hour]) => hour >= 12 && hour <= 17)
      .reduce((sum, [, count]) => sum + count, 0);

    // Evening (18-23)
    const eveningPlays = Object.entries(hourCounts)
      .filter(([hour]) => hour >= 18 && hour <= 23)
      .reduce((sum, [, count]) => sum + count, 0);

    // Night (0-5)
    const nightPlays = Object.entries(hourCounts)
      .filter(([hour]) => hour >= 0 && hour <= 5)
      .reduce((sum, [, count]) => sum + count, 0);

    const total = morningPlays + afternoonPlays + eveningPlays + nightPlays;

    if (eveningPlays / total > 0.4) patterns.push('evening-focused');
    if (nightPlays / total > 0.2) patterns.push('night-owl');
    if (morningPlays / total > 0.3) patterns.push('morning-energized');
    if (afternoonPlays / total > 0.3) patterns.push('afternoon-active');

    return patterns.length > 0 ? patterns : ['varied'];
  }

  /**
   * Generate AI-powered personality insights using OpenAI
   */
  async generateAIPersonalityInsights(domain, data) {
    try {
      const prompt = this.createPersonalityAnalysisPrompt(domain, data);

      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a psychological profiler specializing in personality analysis through entertainment preferences. Provide deep, nuanced insights into personality traits based on the data provided."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 800
      });

      return this.parseAIResponse(response.choices[0].message.content);

    } catch (error) {
      console.error('AI personality analysis error:', error);
      return this.generateFallbackInsights(domain, data);
    }
  }

  createPersonalityAnalysisPrompt(domain, data) {
    return `Analyze this ${domain} consumption data and provide personality insights:

Data Summary:
${JSON.stringify(data, null, 2)}

Please provide:
1. 3-5 unique personality markers that distinguish this person
2. 4-6 core personality traits with explanations
3. Authenticity score (1-100) with reasoning
4. Emotional and intellectual characteristics

Format as JSON with keys: uniquenessMarkers, personalityTraits, authenticityScore, reasoning`;
  }

  parseAIResponse(response) {
    try {
      const parsed = JSON.parse(response);
      return {
        uniquenessMarkers: parsed.uniquenessMarkers || [],
        personalityTraits: parsed.personalityTraits || [],
        authenticityScore: parsed.authenticityScore || 75,
        reasoning: parsed.reasoning || ''
      };
    } catch (error) {
      // Parse natural language response
      return this.parseNaturalLanguageResponse(response);
    }
  }

  parseNaturalLanguageResponse(response) {
    // Extract insights from natural language response
    const uniquenessMarkers = this.extractListItems(response, ['unique', 'distinctive', 'markers']);
    const personalityTraits = this.extractPersonalityTraits(response);
    const authenticityScore = this.extractAuthenticityScore(response);

    return {
      uniquenessMarkers: uniquenessMarkers.slice(0, 5),
      personalityTraits: personalityTraits.slice(0, 6),
      authenticityScore: authenticityScore
    };
  }

  extractListItems(text, keywords) {
    // Simple extraction of list items related to keywords
    const items = [];
    const lines = text.split('\n');

    lines.forEach(line => {
      if (keywords.some(keyword => line.toLowerCase().includes(keyword))) {
        const match = line.match(/[•\-\*]?\s*(.+)/);
        if (match && match[1]) {
          items.push(match[1].trim());
        }
      }
    });

    return items.length > 0 ? items : [
      'Demonstrates authentic self-expression',
      'Shows depth in aesthetic choices',
      'Values quality over quantity'
    ];
  }

  extractPersonalityTraits(text) {
    const commonTraits = [
      'introspective', 'creative', 'analytical', 'empathetic', 'independent',
      'curious', 'sophisticated', 'adventurous', 'methodical', 'intuitive',
      'contemplative', 'expressive', 'innovative', 'perceptive', 'authentic'
    ];

    const foundTraits = [];
    commonTraits.forEach(trait => {
      if (text.toLowerCase().includes(trait)) {
        foundTraits.push(trait);
      }
    });

    return foundTraits.length > 0 ? foundTraits : [
      'introspective', 'creative', 'independent', 'perceptive'
    ];
  }

  extractAuthenticityScore(text) {
    const scoreMatch = text.match(/(\d{1,2})\s*(?:\/100|%|\sout of 100)/);
    if (scoreMatch) {
      return parseInt(scoreMatch[1]);
    }

    // Infer from positive/negative language
    const positiveWords = ['authentic', 'genuine', 'unique', 'sophisticated', 'deep'];
    const negativeWords = ['mainstream', 'generic', 'superficial', 'common'];

    let score = 70; // baseline
    positiveWords.forEach(word => {
      if (text.toLowerCase().includes(word)) score += 5;
    });
    negativeWords.forEach(word => {
      if (text.toLowerCase().includes(word)) score -= 8;
    });

    return Math.max(30, Math.min(95, score));
  }

  /**
   * Calculate authenticity score based on multiple factors
   */
  calculateAuthenticityScore(musicalDNA, listeningBehavior) {
    let score = 50; // baseline

    // Genre uniqueness (less mainstream = more authentic)
    const avgPopularity = musicalDNA.genres.reduce((sum, genre) => {
      return sum + this.getGenrePopularityScore(genre);
    }, 0) / musicalDNA.genres.length;

    score += (100 - avgPopularity) * 0.3;

    // Emotional complexity
    if (musicalDNA.emotionalSignature.complexitySeeker) score += 15;
    if (musicalDNA.emotionalSignature.emotionalRange === 'wide') score += 10;

    // Listening behavior authenticity
    if (listeningBehavior.exploration === 'active-explorer') score += 10;
    if (listeningBehavior.consistency === 'high-novelty-seeker') score += 8;

    // Musical diversity
    if (musicalDNA.diversity > 0.7) score += 12;

    return Math.max(30, Math.min(98, Math.round(score)));
  }

  getGenrePopularityScore(genre) {
    const popularGenres = {
      'pop': 95, 'hip hop': 90, 'rock': 85, 'country': 80, 'r&b': 75,
      'electronic': 60, 'jazz': 45, 'classical': 40, 'folk': 35,
      'experimental': 20, 'ambient': 25, 'noise': 15
    };

    return popularGenres[genre.toLowerCase()] || 50;
  }

  /**
   * Calculate musical diversity score
   */
  calculateMusicalDiversity(topArtists, audioFeatures) {
    if (!topArtists || topArtists.length === 0) return 0.5;

    // Genre diversity
    const genres = new Set();
    topArtists.forEach(artist => {
      if (artist.genres) {
        artist.genres.forEach(genre => genres.add(genre));
      }
    });
    const genreDiversity = Math.min(1, genres.size / 10);

    // Audio feature variance
    let featureVariance = 0.5;
    if (audioFeatures && audioFeatures.length > 5) {
      const features = ['energy', 'valence', 'danceability', 'acousticness'];
      const variances = features.map(feature => this.calculateVariance(audioFeatures, feature));
      featureVariance = variances.reduce((sum, v) => sum + v, 0) / features.length;
    }

    return (genreDiversity * 0.6) + (featureVariance * 0.4);
  }

  calculateVariance(audioFeatures, feature) {
    const values = audioFeatures.filter(f => f && typeof f[feature] === 'number').map(f => f[feature]);
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;

    return Math.min(1, variance * 4); // Normalize variance
  }

  /**
   * Calculate confidence score based on data quality
   */
  calculateConfidence(data) {
    let confidence = 0;

    // Data completeness
    if (data.topTracks && data.topTracks.length > 10) confidence += 30;
    if (data.topArtists && data.topArtists.length > 10) confidence += 25;
    if (data.audioFeatures && data.audioFeatures.length > 10) confidence += 25;
    if (data.recentTracks && data.recentTracks.length > 20) confidence += 20;

    return Math.min(95, confidence);
  }

  /**
   * Generate fallback insights when AI analysis fails
   */
  generateFallbackInsights(domain, data) {
    return {
      uniquenessMarkers: [
        'Demonstrates thoughtful content curation',
        'Shows consistency in aesthetic preferences',
        'Values depth over surface-level entertainment'
      ],
      personalityTraits: [
        'introspective',
        'creative',
        'independent',
        'perceptive'
      ],
      authenticityScore: 75
    };
  }

  /**
   * Generate default musical DNA for edge cases
   */
  generateDefaultMusicalDNA() {
    return {
      audioProfile: {
        energy: 0.6,
        valence: 0.5,
        danceability: 0.6,
        acousticness: 0.3,
        instrumentalness: 0.1
      },
      moods: ['dynamic', 'balanced', 'versatile'],
      genres: ['alternative', 'electronic', 'indie', 'experimental'],
      emotionalSignature: {
        emotionalRange: 'moderate',
        energyPreference: 'balanced-energy',
        valenceTendency: 'emotionally-balanced',
        complexitySeeker: true
      },
      diversity: 0.6
    };
  }
}

export default PersonalityAnalyzer;