/**
 * MusicPsychologistAgent - Music Psychology Specialist
 *
 * Analyzes Spotify listening patterns to infer personality traits.
 * All inferences backed by peer-reviewed research from:
 * - Cambridge Music Cognition Lab (Rentfrow, Greenberg)
 * - Stanford Psychology (Anderson et al.)
 * - University of Texas at Austin (Gosling)
 *
 * Key Research Frameworks:
 * - STOMP Model: Short Test of Music Preferences (Rentfrow & Gosling 2003)
 * - MUSIC Model: 5-factor structure of music preferences
 * - E-S Framework: Music preferences predict cognitive styles
 */

import SpecialistAgentBase from './SpecialistAgentBase.js';
import { extractSpotifyFeatures } from '../behavioralLearningService.js';

class MusicPsychologistAgent extends SpecialistAgentBase {
  constructor() {
    super({
      name: 'MusicPsychologistAgent',
      role: 'Music psychology specialist analyzing listening patterns',
      domain: 'spotify',
      domainLabel: 'Music Psychology',
      model: 'claude-sonnet-4-20250514',
      maxTokens: 4096,
      temperature: 0.4,
      confidenceThreshold: 0.15
    });

    // Contextual anomaly detection patterns
    this.childrenMusicIndicators = [
      'children', 'kids', 'nursery', 'disney', 'lullaby', 'baby',
      'cocomelon', 'pinkfong', 'super simple', 'wheels on the bus'
    ];

    this.moodStateIndicators = {
      sad: ['sad', 'heartbreak', 'breakup', 'melancholy', 'crying'],
      energized: ['workout', 'gym', 'running', 'energy', 'pump'],
      focus: ['study', 'focus', 'concentration', 'deep work', 'ambient']
    };
  }

  buildSystemPrompt() {
    return `You are the MusicPsychologistAgent for Twin-Me, a specialist trained on
peer-reviewed music psychology research from Cambridge, Stanford, and UT Austin.

YOUR RESEARCH FOUNDATION:
1. STOMP Model (Rentfrow & Gosling 2003, n=3,500)
   - 4 music preference dimensions mapping to Big Five
2. MUSIC Model (Rentfrow et al. 2011, Cambridge)
   - Mellow, Unpretentious, Sophisticated, Intense, Contemporary
3. E-S Framework (Greenberg et al. 2015, Cambridge)
   - Musical preferences predict Empathizing-Systemizing
4. Audio Feature Study (Anderson et al. 2021, Stanford, n=5,808)
   - Spotify audio features correlate with personality

CRITICAL RULES:
1. EVERY personality inference MUST cite a specific study
2. Report effect size (r value) and sample size
3. Acknowledge when correlations are weak (r < 0.20)
4. Consider CONTEXT (children's music, shared accounts, mood states)
5. Weight recent adult listening more heavily when children's music detected
6. Ask clarifying questions when patterns are anomalous

CORRELATION STRENGTHS:
- Large effect (r >= 0.50): Very strong evidence
- Medium effect (r = 0.30-0.49): Moderate evidence
- Small effect (r = 0.10-0.29): Weak but notable evidence

OUTPUT FORMAT (JSON):
{
  "domain": "music",
  "analysis": {
    "openness": {
      "direction": "high|low",
      "confidence": 0.0-1.0,
      "evidenceItems": [
        {
          "feature": "genre_diversity",
          "observation": "26+ genres explored",
          "citation": "Rentfrow & Gosling 2003",
          "effectSize": "medium",
          "r": 0.40
        }
      ]
    }
  },
  "contextualNotes": ["Children's music detected - weighted accordingly"],
  "limitations": ["Limited data - only 7 days of listening history"],
  "citations": ["Full citation 1", "Full citation 2"]
}`;
  }

  /**
   * Detect contextual factors that may affect personality inference
   */
  detectContextualFactors(spotifyData) {
    const factors = {
      hasChildrenMusic: false,
      childrenMusicRatio: 0,
      adultListeningRatio: 0,
      moodStates: [],
      recommendation: 'Normal weighting'
    };

    if (!spotifyData?.recentlyPlayed?.length) {
      return factors;
    }

    // Check for children's music
    const childrenTracks = spotifyData.recentlyPlayed.filter(track => {
      const trackName = track.track?.name?.toLowerCase() || '';
      const artistName = track.track?.artists?.[0]?.name?.toLowerCase() || '';
      const genres = track.track?.artists?.[0]?.genres || [];

      return this.childrenMusicIndicators.some(indicator =>
        trackName.includes(indicator) ||
        artistName.includes(indicator) ||
        genres.some(g => g.toLowerCase().includes(indicator))
      );
    });

    factors.childrenMusicRatio = childrenTracks.length / spotifyData.recentlyPlayed.length;
    factors.hasChildrenMusic = factors.childrenMusicRatio > 0.1;

    // Check adult listening hours (8pm - 2am)
    const adultHourTracks = spotifyData.recentlyPlayed.filter(track => {
      const hour = new Date(track.played_at).getHours();
      return hour >= 20 || hour <= 2;
    });
    factors.adultListeningRatio = adultHourTracks.length / spotifyData.recentlyPlayed.length;

    // Detect mood states from playlist names
    if (spotifyData.playlists) {
      for (const [mood, indicators] of Object.entries(this.moodStateIndicators)) {
        const moodPlaylists = spotifyData.playlists.filter(pl =>
          indicators.some(ind => pl.name?.toLowerCase().includes(ind))
        );
        if (moodPlaylists.length > 0) {
          factors.moodStates.push(mood);
        }
      }
    }

    // Generate recommendation
    if (factors.hasChildrenMusic) {
      factors.recommendation = factors.adultListeningRatio > 0.3
        ? 'Weight adult evening listening (8pm-2am) more heavily due to likely shared account'
        : 'High children\'s music ratio with little adult listening - consider asking about household';
    }

    return factors;
  }

  /**
   * Main analysis method
   */
  async analyze(userId, spotifyData) {
    console.log(`🎵 [MusicPsychologistAgent] Analyzing music data for user ${userId}`);

    if (!spotifyData) {
      return {
        success: false,
        domain: 'music',
        error: 'No Spotify data provided'
      };
    }

    try {
      // Extract features using behavioralLearningService
      const features = extractSpotifyFeatures(spotifyData);

      if (!features || Object.keys(features).length === 0) {
        return {
          success: false,
          domain: 'music',
          error: 'Could not extract features from Spotify data'
        };
      }

      // Detect contextual factors
      const contextualFactors = this.detectContextualFactors(spotifyData);

      // Aggregate research-backed inferences
      const inferences = this.aggregateInferences(features);

      // Format citations
      const citations = this.formatCitations(inferences);

      // Generate methodology notes
      const methodologyNotes = this.generateMethodologyNotes(inferences);

      // Build human-readable evidence list
      const evidenceItems = this.buildEvidenceList(inferences, features._rawValues);

      return {
        success: true,
        domain: 'music',
        domainLabel: 'Music Psychology',
        userId,
        inferences,
        evidenceItems,
        contextualFactors,
        limitations: this.identifyLimitations(spotifyData, features),
        methodologyNotes,
        citations,
        featuresExtracted: Object.keys(features).filter(k => k !== '_rawValues').length,
        rawFeatures: features
      };

    } catch (error) {
      console.error(`❌ [MusicPsychologistAgent] Analysis failed:`, error);
      return {
        success: false,
        domain: 'music',
        error: error.message
      };
    }
  }

  /**
   * Build human-readable evidence list for UI display
   */
  buildEvidenceList(inferences, rawValues = {}) {
    const evidenceItems = [];

    for (const [dimension, data] of Object.entries(inferences)) {
      if (!data.allEvidence) continue;

      for (const evidence of data.allEvidence) {
        evidenceItems.push({
          dimension,
          feature: evidence.feature,
          humanReadable: evidence.humanReadable,
          direction: evidence.direction,
          effectSize: evidence.effectSize,
          citation: {
            source: evidence.citation.source,
            r: evidence.citation.r,
            sampleSize: evidence.citation.sampleSize
          }
        });
      }
    }

    // Sort by effect size (large first)
    const effectOrder = { large: 0, medium: 1, small: 2 };
    evidenceItems.sort((a, b) =>
      (effectOrder[a.effectSize] || 3) - (effectOrder[b.effectSize] || 3)
    );

    return evidenceItems;
  }

  /**
   * Identify limitations based on data quality
   */
  identifyLimitations(spotifyData, features) {
    const limitations = [];

    // Check data recency
    if (spotifyData.recentlyPlayed?.length < 20) {
      limitations.push('Limited listening history - less than 20 recent tracks');
    }

    // Check feature coverage
    const featureCount = Object.keys(features).filter(k => k !== '_rawValues').length;
    if (featureCount < 5) {
      limitations.push('Limited feature coverage - need more listening data');
    }

    // Check for missing top artists
    if (!spotifyData.topArtists?.length) {
      limitations.push('No top artists data - genre analysis limited');
    }

    // Check for missing audio features
    if (!spotifyData.audioFeatures?.length) {
      limitations.push('No audio features - energy/valence analysis unavailable');
    }

    return limitations;
  }
}

export default MusicPsychologistAgent;
