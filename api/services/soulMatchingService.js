/**
 * Soul Matching Service
 * Finds compatible soul signatures using multi-dimensional personality matching
 *
 * Algorithm combines:
 * 1. Big Five personality trait similarity (cosine similarity)
 * 2. Life cluster interest overlap (Jaccard similarity)
 * 3. Communication style compatibility
 * 4. Privacy-aware matching (respects user privacy settings)
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class SoulMatchingService {
  /**
   * Find soul signature matches for a user
   * @param {string} userId - User to find matches for
   * @param {object} options - Matching options
   * @returns {Array} Array of matched users with compatibility scores
   */
  async findMatches(userId, options = {}) {
    const {
      limit = 20,
      minCompatibility = 50, // Minimum 50% compatibility
      includeOpposites = false, // Include opposite personalities
      privacyLevel = 'medium' // respect, medium, full
    } = options;

    try {
      console.log(`[SoulMatching] Finding matches for user ${userId}...`);

      // Get requesting user's soul signature
      const userSignature = await this.getSoulSignature(userId);

      if (!userSignature) {
        throw new Error('User soul signature not found');
      }

      // Get all other users' soul signatures (with privacy filtering)
      const candidateSignatures = await this.getCandidateSignatures(userId, privacyLevel);

      if (!candidateSignatures || candidateSignatures.length === 0) {
        return {
          matches: [],
          message: 'No compatible soul signatures found'
        };
      }

      console.log(`[SoulMatching] Evaluating ${candidateSignatures.length} candidates...`);

      // Calculate compatibility with each candidate
      const matches = [];

      for (const candidate of candidateSignatures) {
        const compatibility = await this.calculateCompatibility(
          userSignature,
          candidate,
          { includeOpposites }
        );

        if (compatibility.totalScore >= minCompatibility) {
          matches.push({
            userId: candidate.userId,
            userName: candidate.userName,
            avatar: candidate.avatar,
            compatibility: compatibility.totalScore,
            breakdown: compatibility.breakdown,
            sharedInterests: compatibility.sharedInterests,
            matchReason: compatibility.matchReason
          });
        }
      }

      // Sort by compatibility (highest first)
      matches.sort((a, b) => b.compatibility - a.compatibility);

      // Limit results
      const limitedMatches = matches.slice(0, limit);

      console.log(`[SoulMatching] Found ${limitedMatches.length} compatible matches`);

      return {
        matches: limitedMatches,
        totalCandidates: candidateSignatures.length,
        matchesFound: limitedMatches.length
      };

    } catch (error) {
      console.error('[SoulMatching] Error finding matches:', error);
      throw error;
    }
  }

  /**
   * Calculate compatibility between two soul signatures
   * @param {object} signature1 - First soul signature
   * @param {object} signature2 - Second soul signature
   * @param {object} options - Calculation options
   * @returns {object} Compatibility score and breakdown
   */
  async calculateCompatibility(signature1, signature2, options = {}) {
    const { includeOpposites = false } = options;

    // Component weights (must sum to 1.0)
    const weights = {
      personalityTraits: 0.4, // Big Five traits - most important
      interests: 0.3, // Shared life clusters/interests
      communicationStyle: 0.2, // Communication compatibility
      values: 0.1 // Shared values/priorities
    };

    // 1. Personality traits similarity (Big Five)
    const personalityScore = this.calculatePersonalitySimilarity(
      signature1.personalityTraits,
      signature2.personalityTraits,
      includeOpposites
    );

    // 2. Interest overlap (life clusters)
    const interestScore = this.calculateInterestOverlap(
      signature1.interests,
      signature2.interests
    );

    // 3. Communication style compatibility
    const communicationScore = this.calculateCommunicationCompatibility(
      signature1.communicationStyle,
      signature2.communicationStyle
    );

    // 4. Values similarity
    const valuesScore = this.calculateValuesSimilarity(
      signature1.values,
      signature2.values
    );

    // Calculate weighted total score (0-100)
    const totalScore = Math.round(
      personalityScore * weights.personalityTraits * 100 +
      interestScore * weights.interests * 100 +
      communicationScore * weights.communicationStyle * 100 +
      valuesScore * weights.values * 100
    );

    // Identify shared interests
    const sharedInterests = this.identifySharedInterests(
      signature1.interests,
      signature2.interests
    );

    // Generate match reason
    const matchReason = this.generateMatchReason(
      totalScore,
      personalityScore,
      interestScore,
      sharedInterests
    );

    return {
      totalScore,
      breakdown: {
        personality: Math.round(personalityScore * 100),
        interests: Math.round(interestScore * 100),
        communication: Math.round(communicationScore * 100),
        values: Math.round(valuesScore * 100)
      },
      sharedInterests,
      matchReason
    };
  }

  /**
   * Calculate personality similarity using cosine similarity on Big Five traits
   * @param {object} traits1 - First user's Big Five traits (0-1 scale)
   * @param {object} traits2 - Second user's Big Five traits (0-1 scale)
   * @param {boolean} includeOpposites - Whether to consider opposites as compatible
   * @returns {number} Similarity score (0-1)
   */
  calculatePersonalitySimilarity(traits1, traits2, includeOpposites = false) {
    if (!traits1 || !traits2) {
      return 0;
    }

    // Big Five traits: Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism
    const dimensions = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];

    // Create vectors for cosine similarity
    const vector1 = dimensions.map(dim => traits1[dim] || 0.5);
    const vector2 = dimensions.map(dim => traits2[dim] || 0.5);

    // Calculate cosine similarity
    let cosineSim = this.cosineSimilarity(vector1, vector2);

    // If including opposites, consider both similarity and complementarity
    if (includeOpposites) {
      // For some traits, opposites attract (e.g., extraversion/introversion)
      // Calculate complementarity score (inverse similarity)
      const complementarity = 1 - Math.abs(cosineSim);

      // Weight: 70% similarity, 30% complementarity
      return (cosineSim * 0.7) + (complementarity * 0.3);
    }

    return cosineSim;
  }

  /**
   * Calculate cosine similarity between two vectors
   * @param {Array} vector1 - First vector
   * @param {Array} vector2 - Second vector
   * @returns {number} Cosine similarity (0-1, where 1 is identical)
   */
  cosineSimilarity(vector1, vector2) {
    if (vector1.length !== vector2.length) {
      throw new Error('Vectors must have the same length');
    }

    // Dot product
    let dotProduct = 0;
    for (let i = 0; i < vector1.length; i++) {
      dotProduct += vector1[i] * vector2[i];
    }

    // Magnitudes
    let magnitude1 = 0;
    let magnitude2 = 0;
    for (let i = 0; i < vector1.length; i++) {
      magnitude1 += vector1[i] * vector1[i];
      magnitude2 += vector2[i] * vector2[i];
    }
    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);

    // Avoid division by zero
    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }

    // Cosine similarity
    const similarity = dotProduct / (magnitude1 * magnitude2);

    // Normalize to 0-1 range (cosine can be -1 to 1)
    return (similarity + 1) / 2;
  }

  /**
   * Calculate interest overlap using Jaccard similarity
   * @param {Array} interests1 - First user's interests/life clusters
   * @param {Array} interests2 - Second user's interests/life clusters
   * @returns {number} Overlap score (0-1)
   */
  calculateInterestOverlap(interests1, interests2) {
    if (!interests1 || !interests2 || interests1.length === 0 || interests2.length === 0) {
      return 0;
    }

    // Extract interest names/tags
    const set1 = new Set(interests1.map(i => i.name || i).map(n => n.toLowerCase()));
    const set2 = new Set(interests2.map(i => i.name || i).map(n => n.toLowerCase()));

    // Jaccard similarity: intersection / union
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    if (union.size === 0) {
      return 0;
    }

    return intersection.size / union.size;
  }

  /**
   * Calculate communication style compatibility
   * @param {object} style1 - First user's communication style
   * @param {object} style2 - Second user's communication style
   * @returns {number} Compatibility score (0-1)
   */
  calculateCommunicationCompatibility(style1, style2) {
    if (!style1 || !style2) {
      return 0.5; // Neutral if unknown
    }

    let compatibilityScore = 0;
    let factors = 0;

    // Formality match
    if (style1.formality && style2.formality) {
      const formalityMap = { formal: 1, balanced: 0.5, casual: 0 };
      const diff = Math.abs((formalityMap[style1.formality] || 0.5) - (formalityMap[style2.formality] || 0.5));
      compatibilityScore += 1 - diff;
      factors++;
    }

    // Humor match
    if (style1.humor && style2.humor) {
      const humorMap = { serious: 0, neutral: 0.5, humorous: 1 };
      const diff = Math.abs((humorMap[style1.humor] || 0.5) - (humorMap[style2.humor] || 0.5));
      compatibilityScore += 1 - diff;
      factors++;
    }

    // Directness match
    if (style1.directness && style2.directness) {
      const directMap = { direct: 1, balanced: 0.5, indirect: 0 };
      const diff = Math.abs((directMap[style1.directness] || 0.5) - (directMap[style2.directness] || 0.5));
      compatibilityScore += 1 - diff;
      factors++;
    }

    return factors > 0 ? compatibilityScore / factors : 0.5;
  }

  /**
   * Calculate values similarity
   * @param {Array} values1 - First user's values/priorities
   * @param {Array} values2 - Second user's values/priorities
   * @returns {number} Similarity score (0-1)
   */
  calculateValuesSimilarity(values1, values2) {
    if (!values1 || !values2 || values1.length === 0 || values2.length === 0) {
      return 0.5; // Neutral if unknown
    }

    // Use Jaccard similarity for values overlap
    const set1 = new Set(values1.map(v => (v.name || v).toLowerCase()));
    const set2 = new Set(values2.map(v => (v.name || v).toLowerCase()));

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    if (union.size === 0) {
      return 0.5;
    }

    return intersection.size / union.size;
  }

  /**
   * Identify shared interests between two users
   * @param {Array} interests1 - First user's interests
   * @param {Array} interests2 - Second user's interests
   * @returns {Array} Shared interests
   */
  identifySharedInterests(interests1, interests2) {
    if (!interests1 || !interests2) {
      return [];
    }

    const set1 = interests1.map(i => (i.name || i).toLowerCase());
    const set2 = new Set(interests2.map(i => (i.name || i).toLowerCase()));

    return set1.filter(interest => set2.has(interest));
  }

  /**
   * Generate human-readable match reason
   * @param {number} totalScore - Total compatibility score
   * @param {number} personalityScore - Personality similarity
   * @param {number} interestScore - Interest overlap
   * @param {Array} sharedInterests - Shared interests
   * @returns {string} Match reason
   */
  generateMatchReason(totalScore, personalityScore, interestScore, sharedInterests) {
    if (totalScore >= 90) {
      return `Exceptional match! You share ${sharedInterests.length} interests and have very similar personalities.`;
    } else if (totalScore >= 75) {
      return `Great compatibility with ${sharedInterests.length} shared interests.`;
    } else if (totalScore >= 60) {
      return `Good match based on ${sharedInterests.length > 0 ? 'shared interests in ' + sharedInterests.slice(0, 2).join(', ') : 'personality compatibility'}.`;
    } else {
      return `Moderate compatibility with some shared characteristics.`;
    }
  }

  /**
   * Get soul signature for a user
   * @param {string} userId - User ID
   * @returns {object} Soul signature data
   */
  async getSoulSignature(userId) {
    try {
      const { data, error } = await supabase
        .from('digital_twins')
        .select('soul_signature, personality_traits')
        .eq('user_id', userId)
        .eq('type', 'personal')
        .single();

      if (error || !data) {
        console.warn(`[SoulMatching] No soul signature found for user ${userId}`);
        return null;
      }

      // Get user info
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, full_name, email, profile_picture_url')
        .eq('id', userId)
        .single();

      if (userError) {
        console.warn(`[SoulMatching] Could not fetch user info for ${userId}`);
      }

      return {
        userId,
        userName: user?.full_name || user?.email || 'Anonymous',
        avatar: user?.profile_picture_url,
        personalityTraits: data.personality_traits || {},
        interests: data.soul_signature?.interests || [],
        communicationStyle: data.soul_signature?.communicationStyle || {},
        values: data.soul_signature?.values || []
      };
    } catch (error) {
      console.error(`[SoulMatching] Error fetching soul signature for ${userId}:`, error);
      return null;
    }
  }

  /**
   * Get candidate signatures for matching (privacy-aware)
   * @param {string} excludeUserId - User to exclude from results
   * @param {string} privacyLevel - Privacy filtering level
   * @returns {Array} Candidate soul signatures
   */
  async getCandidateSignatures(excludeUserId, privacyLevel = 'medium') {
    try {
      // Get all users with soul signatures (excluding current user)
      const { data, error } = await supabase
        .from('digital_twins')
        .select(`
          user_id,
          soul_signature,
          personality_traits,
          privacy_settings
        `)
        .eq('type', 'personal')
        .neq('user_id', excludeUserId);

      if (error || !data) {
        console.warn('[SoulMatching] No candidate soul signatures found');
        return [];
      }

      // Filter based on privacy settings
      const candidates = [];

      for (const twin of data) {
        // Check if user allows matching
        const privacySettings = twin.privacy_settings || {};
        const allowMatching = privacySettings.allowSoulMatching !== false;

        if (!allowMatching && privacyLevel === 'respect') {
          continue; // Skip users who opted out
        }

        // Get user info
        const { data: user } = await supabase
          .from('users')
          .select('id, full_name, email, profile_picture_url')
          .eq('id', twin.user_id)
          .single();

        candidates.push({
          userId: twin.user_id,
          userName: user?.full_name || user?.email || 'Anonymous',
          avatar: user?.profile_picture_url,
          personalityTraits: twin.personality_traits || {},
          interests: twin.soul_signature?.interests || [],
          communicationStyle: twin.soul_signature?.communicationStyle || {},
          values: twin.soul_signature?.values || []
        });
      }

      return candidates;
    } catch (error) {
      console.error('[SoulMatching] Error fetching candidate signatures:', error);
      return [];
    }
  }
}

export default new SoulMatchingService();
