/**
 * Stylometric Analyzer
 * Analyzes user's writing style, personality traits, and communication patterns
 */

import { createClient } from '@supabase/supabase-js';
import natural from 'natural';

// Use SUPABASE_URL (backend) - fallback to VITE_ prefix for compatibility
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const tokenizer = new natural.WordTokenizer();
const sentenceTokenizer = new natural.SentenceTokenizer();

class StylometricAnalyzer {
  /**
   * Analyze user's writing style from all text content
   */
  async analyzeUserStyle(userId) {
    console.log(`[Stylometric] Analyzing style for user ${userId}...`);

    try {
      // Fetch all text content
      const { data: textContent, error } = await supabase
        .from('user_text_content')
        .select('text_content, content_type, platform')
        .eq('user_id', userId);

      if (error || !textContent || textContent.length === 0) {
        console.log('[Stylometric] No text content found for analysis');
        return { success: false, message: 'Insufficient data for analysis' };
      }

      console.log(`[Stylometric] Analyzing ${textContent.length} text samples...`);

      // Combine all text
      const allText = textContent.map(t => t.text_content || '').join(' ').trim();

      // Check if we have actual text content
      if (!allText || allText.length < 50) {
        console.log('[Stylometric] Extracted data contains no meaningful text content');
        return {
          success: false,
          message: 'Insufficient text content for analysis. Platform data may be empty.',
          samplesAnalyzed: textContent.length,
          textLength: allText.length
        };
      }

      const words = tokenizer.tokenize(allText.toLowerCase());
      const sentences = sentenceTokenizer.tokenize(allText);

      // Additional validation
      if (words.length < 10 || sentences.length < 2) {
        console.log('[Stylometric] Text too short for meaningful analysis');
        return {
          success: false,
          message: 'Text content too short for analysis. Need at least 10 words.',
          samplesAnalyzed: textContent.length,
          wordCount: words.length
        };
      }

      // Perform analyses - wrap in try-catch to handle insufficient data
      try {
        const lexical = this.analyzeLexicalFeatures(words, allText);
        const syntactic = this.analyzeSyntacticFeatures(sentences, allText);

        // This will throw error if insufficient data
        const personality = this.predictPersonality(textContent);
        const communication = this.analyzeCommunicationStyle(textContent);
        const emotional = this.analyzeEmotionalTone(textContent);
        const behavioral = this.analyzeBehavioralPatterns(textContent);

        // Extract and store n-grams
        await this.extractNgrams(userId, words);

        // Store style profile - only if we have valid data
        await this.storeStyleProfile(userId, {
          ...lexical,
          ...syntactic,
          personality_traits: personality,
          communication_style: communication.style || 'analyzing',
          humor_style: communication.humor || 'analyzing',
          emotional_tone: emotional,
          typical_response_time: behavioral.responseTime,
          activity_patterns: behavioral.activityPatterns,
          engagement_style: behavioral.engagementStyle,
          sample_size: textContent.length,
          confidence_score: this.calculateConfidence(textContent.length),
          last_updated: new Date().toISOString()
        });

        console.log('[Stylometric] Analysis complete');
        return {
          success: true,
          samplesAnalyzed: textContent.length,
          confidence: this.calculateConfidence(textContent.length)
        };
      } catch (error) {
        console.error('[Stylometric] Analysis failed:', error.message);
        // Return error details instead of fake data
        return {
          success: false,
          message: error.message,
          samplesAnalyzed: textContent.length,
          needsMoreData: true
        };
      }
    } catch (error) {
      console.error('[Stylometric] Error in analyzeUserStyle:', error);
      throw error;
    }
  }

  /**
   * Analyze lexical features (word choices, vocabulary)
   */
  analyzeLexicalFeatures(words, text) {
    // Safety check
    if (!words || words.length === 0) {
      return {
        avg_word_length: 0,
        vocabulary_richness: 0,
        unique_words_count: 0,
        total_words_count: 0,
        common_words: {},
        rare_words: {}
      };
    }

    // Calculate word statistics
    const uniqueWords = new Set(words);
    const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
    const vocabularyRichness = uniqueWords.size / words.length; // Type-token ratio

    // Find common words (excluding stop words)
    const wordFreq = {};
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    const sortedWords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .filter(([word]) => word.length > 3); // Filter out very short words

    const commonWords = Object.fromEntries(sortedWords.slice(0, 50));
    const rareWords = Object.fromEntries(
      sortedWords.filter(([_, freq]) => freq === 1).slice(0, 20)
    );

    return {
      avg_word_length: avgWordLength,
      vocabulary_richness: vocabularyRichness,
      unique_words_count: uniqueWords.size,
      total_words_count: words.length,
      common_words: commonWords,
      rare_words: rareWords
    };
  }

  /**
   * Analyze syntactic features (sentence structure)
   */
  analyzeSyntacticFeatures(sentences, text) {
    // Safety check
    if (!sentences || sentences.length === 0) {
      return {
        avg_sentence_length: 0,
        sentence_complexity: 0,
        punctuation_patterns: {},
        grammar_patterns: {}
      };
    }

    // Calculate sentence statistics
    const sentenceLengths = sentences.map(s => tokenizer.tokenize(s).length);
    const avgSentenceLength = sentenceLengths.reduce((sum, len) => sum + len, 0) / sentences.length;

    // Sentence complexity (simple heuristic based on length and punctuation)
    const complexity = avgSentenceLength / 20; // Normalize to 0-1 scale roughly

    // Punctuation patterns
    const punctuationCounts = {
      exclamation: (text.match(/!/g) || []).length,
      question: (text.match(/\?/g) || []).length,
      comma: (text.match(/,/g) || []).length,
      semicolon: (text.match(/;/g) || []).length,
      colon: (text.match(/:/g) || []).length,
      dash: (text.match(/—|--/g) || []).length,
      ellipsis: (text.match(/\.\.\./g) || []).length
    };

    return {
      avg_sentence_length: avgSentenceLength,
      sentence_complexity: Math.min(complexity, 1),
      punctuation_patterns: punctuationCounts,
      grammar_patterns: {} // Placeholder for future grammar analysis
    };
  }

  /**
   * Predict personality traits (simplified Big Five model)
   */
  predictPersonality(textContent) {
    // This is a simplified heuristic model
    // In production, use trained ML model

    // Safety check - throw error instead of returning fake data
    if (!textContent || textContent.length === 0) {
      throw new Error('Insufficient data for personality analysis. Please connect more platforms and extract data first.');
    }

    let openness = 0.5;
    let conscientiousness = 0.5;
    let extraversion = 0.5;
    let agreeableness = 0.5;
    let neuroticism = 0.5;

    const allText = textContent.map(t => (t.text_content || '').toLowerCase()).join(' ');

    // Openness markers (curiosity, creativity)
    const opennessMarkers = ['interesting', 'creative', 'innovative', 'curious', 'explore', 'discover', 'imagine', 'wonder'];
    openness = this.scoreTraitMarkers(allText, opennessMarkers);

    // Conscientiousness markers (organization, responsibility)
    const conscientiousnessMarkers = ['plan', 'organize', 'schedule', 'complete', 'finish', 'careful', 'detail', 'precise'];
    conscientiousness = this.scoreTraitMarkers(allText, conscientiousnessMarkers);

    // Extraversion markers (social, outgoing)
    const extraversionMarkers = ['we', 'together', 'group', 'team', 'social', 'meet', 'chat', 'talk', 'party', 'friend'];
    extraversion = this.scoreTraitMarkers(allText, extraversionMarkers);

    // Agreeableness markers (cooperative, kind)
    const agreeablenessMarkers = ['help', 'support', 'agree', 'thanks', 'please', 'appreciate', 'kind', 'nice', 'friendly'];
    agreeableness = this.scoreTraitMarkers(allText, agreeablenessMarkers);

    // Neuroticism markers (anxiety, negative emotion)
    const neuroticismMarkers = ['worry', 'stress', 'anxious', 'nervous', 'afraid', 'concerned', 'problem', 'difficult'];
    neuroticism = this.scoreTraitMarkers(allText, neuroticismMarkers);

    return {
      openness: Math.min(Math.max(openness, 0), 1),
      conscientiousness: Math.min(Math.max(conscientiousness, 0), 1),
      extraversion: Math.min(Math.max(extraversion, 0), 1),
      agreeableness: Math.min(Math.max(agreeableness, 0), 1),
      neuroticism: Math.min(Math.max(neuroticism, 0), 1)
    };
  }

  /**
   * Score personality trait markers
   */
  scoreTraitMarkers(text, markers) {
    // Safety check
    if (!text || text.trim().length === 0) {
      return 0.5; // Return neutral score
    }

    const words = text.split(/\s+/);
    const totalWords = words.length;

    if (totalWords === 0) {
      return 0.5;
    }

    let markerCount = 0;

    markers.forEach(marker => {
      markerCount += (text.match(new RegExp(`\\b${marker}\\b`, 'gi')) || []).length;
    });

    // Normalize to 0-1 scale
    return 0.5 + (markerCount / totalWords) * 10; // Multiply by 10 for scaling
  }

  /**
   * Analyze communication style
   */
  analyzeCommunicationStyle(textContent) {
    // Safety check - return null instead of fake data
    if (!textContent || textContent.length === 0) {
      return { style: null, humor: null };
    }

    const allText = textContent.map(t => (t.text_content || '').toLowerCase()).join(' ').trim();

    // Additional check for empty text
    if (!allText || allText.length === 0) {
      return { style: null, humor: null };
    }

    // Formality analysis
    const formalMarkers = ['furthermore', 'moreover', 'consequently', 'therefore', 'regarding', 'respective'];
    const casualMarkers = ['lol', 'btw', 'tbh', 'gonna', 'wanna', 'yeah', 'nah', 'cool', 'awesome'];

    let formalScore = this.countMarkers(allText, formalMarkers);
    let casualScore = this.countMarkers(allText, casualMarkers);

    let style = 'balanced';
    if (casualScore > formalScore * 2) style = 'casual';
    else if (formalScore > casualScore * 2) style = 'formal';

    // Directness
    const directMarkers = ['no', 'yes', 'definitely', 'absolutely', 'exactly', 'wrong', 'right'];
    const diplomaticMarkers = ['perhaps', 'maybe', 'might', 'could', 'possibly', 'somewhat', 'rather'];

    const directScore = this.countMarkers(allText, directMarkers);
    const diplomaticScore = this.countMarkers(allText, diplomaticMarkers);

    if (directScore > diplomaticScore * 1.5) {
      style = style === 'formal' ? 'direct-formal' : 'direct';
    } else if (diplomaticScore > directScore * 1.5) {
      style = style === 'formal' ? 'diplomatic' : 'diplomatic-casual';
    }

    // Humor style analysis
    const sarcasticMarkers = [/yeah right/i, /oh wow/i, /sure thing/i, /totally/i];
    const wittyMarkers = [/pun intended/i, /clever/i, /smart/i];

    let humor = 'neutral';
    const sarcasmCount = sarcasticMarkers.filter(m => m.test(allText)).length;
    const witCount = wittyMarkers.filter(m => m.test(allText)).length;

    if (sarcasmCount > 2) humor = 'sarcastic';
    else if (witCount > 2) humor = 'witty';
    else if (casualScore > 10) humor = 'casual';

    return { style, humor };
  }

  /**
   * Count markers in text
   */
  countMarkers(text, markers) {
    let count = 0;
    markers.forEach(marker => {
      count += (text.match(new RegExp(`\\b${marker}\\b`, 'gi')) || []).length;
    });
    return count;
  }

  /**
   * Analyze emotional tone
   */
  analyzeEmotionalTone(textContent) {
    // Safety check
    if (!textContent || textContent.length === 0) {
      return {
        positive: 0.33,
        negative: 0.33,
        neutral: 0.34
      };
    }

    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'awesome', 'love', 'happy', 'thanks', 'perfect', 'nice'];
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'angry', 'sad', 'wrong', 'problem', 'issue', 'error'];

    let positiveCount = 0;
    let negativeCount = 0;
    let neutralCount = 0;

    textContent.forEach(item => {
      const text = (item.text_content || '').toLowerCase();
      let itemPositive = 0;
      let itemNegative = 0;

      positiveWords.forEach(word => {
        itemPositive += (text.match(new RegExp(`\\b${word}\\b`, 'gi')) || []).length;
      });

      negativeWords.forEach(word => {
        itemNegative += (text.match(new RegExp(`\\b${word}\\b`, 'gi')) || []).length;
      });

      if (itemPositive > itemNegative) positiveCount++;
      else if (itemNegative > itemPositive) negativeCount++;
      else neutralCount++;
    });

    const total = textContent.length;
    return {
      positive: positiveCount / total,
      negative: negativeCount / total,
      neutral: neutralCount / total
    };
  }

  /**
   * Analyze behavioral patterns
   */
  analyzeBehavioralPatterns(textContent) {
    // Safety check
    if (!textContent || textContent.length === 0) {
      return {
        responseTime: null,
        activityPatterns: {},
        engagementStyle: 'unknown',
        contentTypeDistribution: {}
      };
    }

    // Response time patterns (if timestamp data available)
    // Activity patterns (when user is most active)
    // Engagement style (proactive vs reactive)

    // Count content types
    const contentTypes = {};
    textContent.forEach(item => {
      contentTypes[item.content_type] = (contentTypes[item.content_type] || 0) + 1;
    });

    const totalItems = textContent.length;
    const messageCount = contentTypes.message || 0;
    const postCount = contentTypes.post || 0;
    const commentCount = contentTypes.comment || 0;

    // Determine engagement style
    let engagementStyle = 'balanced';
    if (postCount > commentCount * 2) engagementStyle = 'proactive';
    else if (commentCount > postCount * 2) engagementStyle = 'reactive';
    else if (totalItems < 10) engagementStyle = 'lurker';
    else if (totalItems > 100) engagementStyle = 'contributor';

    return {
      responseTime: null, // Placeholder
      activityPatterns: {}, // Placeholder
      engagementStyle,
      contentTypeDistribution: contentTypes
    };
  }

  /**
   * Extract and store n-grams
   */
  async extractNgrams(userId, words) {
    console.log('[Stylometric] Extracting n-grams...');

    // Generate bigrams
    const bigrams = [];
    for (let i = 0; i < words.length - 1; i++) {
      bigrams.push(`${words[i]} ${words[i + 1]}`);
    }

    // Generate trigrams
    const trigrams = [];
    for (let i = 0; i < words.length - 2; i++) {
      trigrams.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
    }

    // Count frequencies
    const bigramFreq = this.countFrequencies(bigrams);
    const trigramFreq = this.countFrequencies(trigrams);

    // Store top 50 bigrams
    const topBigrams = Object.entries(bigramFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50);

    for (const [ngram, frequency] of topBigrams) {
      await supabase
        .from('user_ngrams')
        .upsert({
          user_id: userId,
          ngram_type: 'word_bigram',
          ngram_value: ngram,
          frequency,
          tf_idf: null // Calculate later if needed
        }, {
          onConflict: 'user_id,ngram_type,ngram_value'
        });
    }

    // Store top 50 trigrams
    const topTrigrams = Object.entries(trigramFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50);

    for (const [ngram, frequency] of topTrigrams) {
      await supabase
        .from('user_ngrams')
        .upsert({
          user_id: userId,
          ngram_type: 'word_trigram',
          ngram_value: ngram,
          frequency,
          tf_idf: null
        }, {
          onConflict: 'user_id,ngram_type,ngram_value'
        });
    }

    console.log(`[Stylometric] Stored ${topBigrams.length} bigrams and ${topTrigrams.length} trigrams`);
  }

  /**
   * Count frequencies of items
   */
  countFrequencies(items) {
    const freq = {};
    items.forEach(item => {
      freq[item] = (freq[item] || 0) + 1;
    });
    return freq;
  }

  /**
   * Calculate confidence score based on sample size
   */
  calculateConfidence(sampleSize) {
    // More samples = higher confidence
    // Use sigmoid function for smooth curve
    if (sampleSize < 10) return 0.3;
    if (sampleSize < 50) return 0.5;
    if (sampleSize < 100) return 0.7;
    if (sampleSize < 500) return 0.85;
    return 0.95;
  }

  /**
   * Store style profile in database
   */
  async storeStyleProfile(userId, profile) {
    try {
      const { error } = await supabase
        .from('user_style_profile')
        .upsert({
          user_id: userId,
          ...profile
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error('[Stylometric] Error storing profile:', error);
        throw error;
      }

      console.log('[Stylometric] Style profile stored successfully');
    } catch (error) {
      console.error('[Stylometric] Exception storing profile:', error);
      throw error;
    }
  }

  /**
   * Get style profile for a user
   */
  async getStyleProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('user_style_profile')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        return null;
      }

      return data;
    } catch (error) {
      console.error('[Stylometric] Error getting profile:', error);
      return null;
    }
  }
}

export default new StylometricAnalyzer();
