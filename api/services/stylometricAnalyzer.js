/**
 * Stylometric Analyzer
 * Analyzes user's writing style, personality traits, and communication patterns
 */

import { createClient } from '@supabase/supabase-js';
import natural from 'natural';
import Anthropic from '@anthropic-ai/sdk';

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

      // Perform analyses
      const lexical = this.analyzeLexicalFeatures(words, allText);
      const syntactic = this.analyzeSyntacticFeatures(sentences, allText);
      const personality = await this.predictPersonality(textContent);
      const communication = this.analyzeCommunicationStyle(textContent);
      const emotional = this.analyzeEmotionalTone(textContent);
      const behavioral = this.analyzeBehavioralPatterns(textContent);

      // Extract and store n-grams
      await this.extractNgrams(userId, words);

      // Calculate confidence with behavioral data boost
      const confidence = await this.calculateConfidence(textContent.length, userId);

      // Store style profile
      await this.storeStyleProfile(userId, {
        ...lexical,
        ...syntactic,
        personality_traits: personality,
        communication_style: communication.style,
        humor_style: communication.humor,
        emotional_tone: emotional,
        typical_response_time: behavioral.responseTime,
        activity_patterns: behavioral.activityPatterns,
        engagement_style: behavioral.engagementStyle,
        sample_size: textContent.length,
        confidence_score: confidence,
        last_updated: new Date().toISOString()
      });

      console.log('[Stylometric] Analysis complete');
      return {
        success: true,
        samplesAnalyzed: textContent.length,
        confidence: confidence
      };
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
   * Predict personality traits using Claude AI (Big Five model)
   * Integrates both text content AND behavioral data from Soul Observer extension
   */
  async predictPersonality(textContent) {
    // Safety check
    if (!textContent || textContent.length === 0) {
      return {
        openness: 0.5,
        conscientiousness: 0.5,
        extraversion: 0.5,
        agreeableness: 0.5,
        neuroticism: 0.5
      };
    }

    // Combine text samples
    const allText = textContent.map(t => t.text_content || '').join('\n\n');

    // Truncate if too long (Claude has token limits - stay under 8K chars for safety)
    const textSample = allText.length > 8000 ? allText.substring(0, 8000) + '...' : allText;

    // If text is too short for meaningful analysis
    if (textSample.trim().length < 100) {
      console.log('[Stylometric] Text too short for Claude analysis, using neutral scores');
      return {
        openness: 0.5,
        conscientiousness: 0.5,
        extraversion: 0.5,
        agreeableness: 0.5,
        neuroticism: 0.5
      };
    }

    try {
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });

      // Get user ID from text content (assume all samples have same user_id)
      const userId = textContent[0]?.user_id;

      // Fetch behavioral data from Soul Observer extension
      const behavioralData = userId ? await this.getBehavioralData(userId) : null;

      console.log('[Stylometric] Analyzing personality with Claude AI (text + behavioral data)...');

      // Build enhanced prompt with behavioral data
      const prompt = this.buildEnhancedPersonalityPrompt(textSample, behavioralData);

      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1500,
        temperature: 0.3,
        system: 'You are an expert personality psychologist analyzing both writing samples AND behavioral patterns to assess Big Five personality traits. Integrate insights from both text analysis and digital behavior for accurate personality assessment.',
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const result = JSON.parse(response.content[0].text);

      console.log('[Stylometric] Claude personality analysis complete (with behavioral integration)');

      return {
        openness: Math.min(Math.max(result.openness || 0.5, 0), 1),
        conscientiousness: Math.min(Math.max(result.conscientiousness || 0.5, 0), 1),
        extraversion: Math.min(Math.max(result.extraversion || 0.5, 0), 1),
        agreeableness: Math.min(Math.max(result.agreeableness || 0.5, 0), 1),
        neuroticism: Math.min(Math.max(result.neuroticism || 0.5, 0), 1),
        reasoning: result.reasoning || {},
        data_sources: {
          text_samples: textContent.length,
          behavioral_sessions: behavioralData?.sessions || 0,
          total_events: behavioralData?.total_events || 0
        }
      };
    } catch (error) {
      console.error('[Stylometric] Claude API error:', error.message);

      // Fallback to neutral scores on error
      return {
        openness: 0.5,
        conscientiousness: 0.5,
        extraversion: 0.5,
        agreeableness: 0.5,
        neuroticism: 0.5,
        reasoning: { error: 'Analysis failed, using neutral scores' }
      };
    }
  }

  /**
   * Get behavioral data from Soul Observer extension for personality analysis
   */
  async getBehavioralData(userId) {
    try {
      // Get recent sessions with behavioral metrics
      const { data: sessions, error } = await supabase
        .from('soul_observer_sessions')
        .select('typing_speed_wpm, typing_correction_rate, mouse_movement_pattern, mouse_avg_speed, scroll_pattern, scroll_avg_speed, focus_avg_duration, multitasking_score, total_events, duration_seconds, personality_indicators')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error || !sessions || sessions.length === 0) {
        console.log('[Stylometric] No behavioral data found for user');
        return null;
      }

      // Aggregate behavioral metrics
      const totalSessions = sessions.length;
      const totalEvents = sessions.reduce((sum, s) => sum + (s.total_events || 0), 0);

      const avgTypingSpeed = sessions.reduce((sum, s) => sum + (s.typing_speed_wpm || 0), 0) / totalSessions;
      const avgCorrectionRate = sessions.reduce((sum, s) => sum + (s.typing_correction_rate || 0), 0) / totalSessions;
      const avgMouseSpeed = sessions.reduce((sum, s) => sum + (s.mouse_avg_speed || 0), 0) / totalSessions;
      const avgScrollSpeed = sessions.reduce((sum, s) => sum + (s.scroll_avg_speed || 0), 0) / totalSessions;
      const avgFocusDuration = sessions.reduce((sum, s) => sum + (s.focus_avg_duration || 0), 0) / totalSessions;
      const avgMultitasking = sessions.reduce((sum, s) => sum + (s.multitasking_score || 0), 0) / totalSessions;

      // Get most common patterns
      const mousePatterns = sessions.map(s => s.mouse_movement_pattern).filter(p => p);
      const scrollPatterns = sessions.map(s => s.scroll_pattern).filter(p => p);
      const mostCommonMousePattern = this.getMostCommon(mousePatterns);
      const mostCommonScrollPattern = this.getMostCommon(scrollPatterns);

      return {
        sessions: totalSessions,
        total_events: totalEvents,
        typing: {
          speed_wpm: Math.round(avgTypingSpeed),
          correction_rate: Math.round(avgCorrectionRate * 100) / 100
        },
        mouse: {
          pattern: mostCommonMousePattern || 'unknown',
          avg_speed: Math.round(avgMouseSpeed)
        },
        scroll: {
          pattern: mostCommonScrollPattern || 'unknown',
          avg_speed: Math.round(avgScrollSpeed)
        },
        focus: {
          avg_duration_seconds: Math.round(avgFocusDuration),
          multitasking_score: Math.round(avgMultitasking * 100) / 100
        }
      };
    } catch (error) {
      console.error('[Stylometric] Error fetching behavioral data:', error);
      return null;
    }
  }

  /**
   * Build enhanced personality analysis prompt combining text and behavioral data
   */
  buildEnhancedPersonalityPrompt(textSample, behavioralData) {
    let prompt = `Analyze this person's personality using both their writing samples AND behavioral patterns.

## Writing Samples
${textSample}

`;

    if (behavioralData) {
      prompt += `## Behavioral Data (from browser extension)

**Typing Patterns:**
- Speed: ${behavioralData.typing.speed_wpm} WPM ${behavioralData.typing.speed_wpm > 60 ? '(fast)' : behavioralData.typing.speed_wpm < 40 ? '(deliberate)' : '(moderate)'}
- Correction Rate: ${Math.round(behavioralData.typing.correction_rate * 100)}% ${behavioralData.typing.correction_rate > 0.15 ? '(frequent edits, perfectionist tendencies)' : '(confident, decisive)'}

**Mouse Behavior:**
- Movement Pattern: ${behavioralData.mouse.pattern}
- Average Speed: ${behavioralData.mouse.avg_speed} px/s

**Scroll Behavior:**
- Pattern: ${behavioralData.scroll.pattern} ${behavioralData.scroll.pattern === 'rapid_scan' ? '(impatient, goal-oriented)' : behavioralData.scroll.pattern === 'steady_read' ? '(thorough, deliberate)' : ''}
- Average Speed: ${behavioralData.scroll.avg_speed} px/s

**Focus & Attention:**
- Average Focus Duration: ${behavioralData.focus.avg_duration_seconds} seconds ${behavioralData.focus.avg_duration_seconds > 120 ? '(deep focus capacity)' : behavioralData.focus.avg_duration_seconds < 30 ? '(easily distracted or multitasking)' : '(moderate focus)'}
- Multitasking Score: ${Math.round(behavioralData.focus.multitasking_score * 100)}% ${behavioralData.focus.multitasking_score > 0.7 ? '(high multitasking)' : '(focused single-tasking)'}

**Data Quality:**
- Behavioral Sessions: ${behavioralData.sessions}
- Total Events Captured: ${behavioralData.total_events}

`;
    } else {
      prompt += `## Behavioral Data
No browser extension data available. Analysis based solely on writing samples.

`;
    }

    prompt += `## Analysis Instructions

Provide Big Five personality trait scores (0.0 to 1.0 scale) integrating BOTH writing style AND behavioral patterns:

**Openness**: Consider curiosity in writing + exploration patterns in browsing behavior
**Conscientiousness**: Consider organization in writing + correction rates + focus duration
**Extraversion**: Consider expressiveness in writing + multitasking patterns + scroll speed
**Agreeableness**: Consider tone/language in writing + patience indicators (correction rate, focus)
**Neuroticism**: Consider anxiety markers in writing + typing correction rate + erratic mouse movements

Return ONLY valid JSON in this exact format:
{
  "openness": 0.X,
  "conscientiousness": 0.X,
  "extraversion": 0.X,
  "agreeableness": 0.X,
  "neuroticism": 0.X,
  "reasoning": {
    "openness": "brief explanation integrating text and behavior",
    "conscientiousness": "brief explanation integrating text and behavior",
    "extraversion": "brief explanation integrating text and behavior",
    "agreeableness": "brief explanation integrating text and behavior",
    "neuroticism": "brief explanation integrating text and behavior"
  }
}`;

    return prompt;
  }

  /**
   * Helper: Get most common value in array
   */
  getMostCommon(arr) {
    if (!arr || arr.length === 0) return null;
    const counts = {};
    let maxCount = 0;
    let mostCommon = null;

    arr.forEach(item => {
      counts[item] = (counts[item] || 0) + 1;
      if (counts[item] > maxCount) {
        maxCount = counts[item];
        mostCommon = item;
      }
    });

    return mostCommon;
  }

  /**
   * Analyze communication style
   */
  analyzeCommunicationStyle(textContent) {
    // Safety check
    if (!textContent || textContent.length === 0) {
      return { style: 'balanced', humor: 'neutral' };
    }

    const allText = textContent.map(t => (t.text_content || '').toLowerCase()).join(' ').trim();

    // Additional check for empty text
    if (!allText || allText.length === 0) {
      return { style: 'balanced', humor: 'neutral' };
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
   * Calculate confidence score based on sample size AND behavioral data
   */
  async calculateConfidence(sampleSize, userId = null) {
    // Base confidence from text samples
    let textConfidence = 0;
    if (sampleSize < 10) textConfidence = 0.3;
    else if (sampleSize < 50) textConfidence = 0.5;
    else if (sampleSize < 100) textConfidence = 0.7;
    else if (sampleSize < 500) textConfidence = 0.85;
    else textConfidence = 0.95;

    // Boost confidence if we have behavioral data from Soul Observer extension
    if (userId) {
      try {
        const { data: sessions, error } = await supabase
          .from('soul_observer_sessions')
          .select('total_events')
          .eq('user_id', userId);

        if (!error && sessions && sessions.length > 0) {
          const totalEvents = sessions.reduce((sum, s) => sum + (s.total_events || 0), 0);

          // Behavioral data contributes up to +0.25 confidence
          let behavioralBoost = 0;
          if (totalEvents >= 5000) behavioralBoost = 0.25;        // Very high confidence boost
          else if (totalEvents >= 2000) behavioralBoost = 0.20;   // High confidence boost
          else if (totalEvents >= 1000) behavioralBoost = 0.15;   // Moderate confidence boost
          else if (totalEvents >= 500) behavioralBoost = 0.10;    // Small confidence boost
          else if (totalEvents >= 100) behavioralBoost = 0.05;    // Minimal confidence boost

          // Combine: cap total confidence at 0.98 (never 100% certain)
          return Math.min(textConfidence + behavioralBoost, 0.98);
        }
      } catch (error) {
        console.error('[Stylometric] Error checking behavioral data for confidence:', error);
      }
    }

    // Return text-only confidence if no behavioral data
    return textConfidence;
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
