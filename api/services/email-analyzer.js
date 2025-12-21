/**
 * Email Communication Style Analyzer
 *
 * Uses Anthropic Claude to analyze email writing style and communication patterns
 * Focuses on personality traits, tone, formality, and characteristic patterns
 *
 * PRIVACY: Analyzes communication STYLE, not content
 */

import Anthropic from '@anthropic-ai/sdk';
import { analyzeCommunicationPatterns } from './gmail-extractor.js';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Analyze email writing style using Claude
 *
 * @param {Array} emailData - Array of email metadata from gmail-extractor
 * @returns {Promise<Object>} Style analysis including tone, formality, personality
 */
export async function analyzeEmailStyle(emailData) {
  try {
    console.log('🤖 [Email Analyzer] Starting Claude analysis for', emailData.length, 'emails');

    if (!emailData || emailData.length === 0) {
      return {
        error: 'No email data provided',
        analysis: null
      };
    }

    // First, extract communication patterns from metadata
    const patterns = analyzeCommunicationPatterns(emailData);

    // Prepare data for Claude analysis (anonymized)
    const analysisData = {
      totalEmails: emailData.length,
      sentCount: emailData.filter(e => e.isSent).length,
      receivedCount: emailData.filter(e => !e.isSent).length,
      replyCount: emailData.filter(e => e.isReply).length,
      // Subject line samples (no content)
      subjectPatterns: patterns.subjectPatterns,
      responsePatterns: patterns.responsePatterns,
      timingPatterns: patterns.timingPatterns,
      // Snippet samples for tone analysis (first 50 chars only)
      snippetSamples: emailData
        .filter(e => e.isSent && e.snippet)
        .slice(0, 10)
        .map(e => e.snippet.substring(0, 50))
    };

    // Create prompt for Claude
    const prompt = buildAnalysisPrompt(analysisData);

    console.log('🤖 [Email Analyzer] Sending request to Claude...');

    // Call Claude API
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const analysisText = response.content[0].text;

    console.log('✅ [Email Analyzer] Claude analysis complete');

    // Parse Claude's response into structured data
    const structuredAnalysis = parseClaudeResponse(analysisText, patterns);

    return {
      communicationStyle: structuredAnalysis,
      patterns,
      metadata: {
        analyzedAt: new Date().toISOString(),
        emailCount: emailData.length,
        model: 'claude-sonnet-4-5-20250929'
      }
    };
  } catch (error) {
    console.error('❌ [Email Analyzer] Error:', error);

    // Handle rate limiting
    if (error.status === 429) {
      throw new Error('Claude API rate limit exceeded. Please try again in a few minutes.');
    }

    // Handle API key issues
    if (error.status === 401) {
      throw new Error('Invalid Anthropic API key. Please check your configuration.');
    }

    throw new Error(`Email analysis failed: ${error.message}`);
  }
}

/**
 * Build analysis prompt for Claude
 *
 * @param {Object} data - Email patterns and metadata
 * @returns {string} Formatted prompt
 */
function buildAnalysisPrompt(data) {
  return `You are an expert communication style analyst. Analyze the following email communication patterns and provide insights into the person's writing style, personality, and communication characteristics.

**Email Statistics:**
- Total emails analyzed: ${data.totalEmails}
- Sent: ${data.sentCount}
- Received: ${data.receivedCount}
- Replies: ${data.replyCount}

**Subject Line Patterns:**
- Uses questions: ${data.subjectPatterns.usesQuestions} times
- Uses exclamations: ${data.subjectPatterns.usesExclamations} times
- Average subject length: ${data.subjectPatterns.avgSubjectLength} characters
- Average words in subject: ${data.subjectPatterns.avgSubjectWords} words

**Response Patterns:**
- Average response time: ${data.responsePatterns.avgResponseTimeHours || 'N/A'} hours
- Response rate: ${data.responsePatterns.responseRate}%
- Quick responder score: ${data.responsePatterns.quickResponderScore}/100

**Timing Patterns:**
- Peak email hours: ${data.timingPatterns.peakEmailHours.join(', ')}
- Sends emails at night: ${data.timingPatterns.sendsAtNight ? 'Yes' : 'No'}

**Sample Email Snippets (for tone analysis):**
${data.snippetSamples.map((s, i) => `${i + 1}. "${s}..."`).join('\n')}

Based on this data, provide a comprehensive analysis of this person's communication style. Focus on:

1. **Overall Tone**: (Professional, Casual, Friendly, Formal, Direct, etc.)
2. **Formality Level**: (1-10 scale, with reasoning)
3. **Communication Personality Traits**:
   - Responsiveness (how quickly they reply)
   - Verbosity (concise vs. detailed)
   - Emotional expression (reserved vs. expressive)
   - Question-asking tendency
4. **Characteristic Patterns**:
   - Common phrases or writing habits
   - Subject line style
   - Timing preferences
5. **Professional vs. Personal Balance**: Based on tone and formality
6. **Unique Communication Signature**: What makes their writing distinctive?

Provide your analysis in a structured format with clear sections. Be specific and insightful based on the data provided.`;
}

/**
 * Parse Claude's response into structured data
 *
 * @param {string} analysisText - Raw text from Claude
 * @param {Object} patterns - Original communication patterns
 * @returns {Object} Structured analysis
 */
function parseClaudeResponse(analysisText, patterns) {
  // Extract key insights from Claude's response
  // This is a simplified parser - you could make it more sophisticated

  // Determine formality level (extract number if mentioned)
  const formalityMatch = analysisText.match(/formality.*?(\d+)\/10/i);
  const formalityLevel = formalityMatch ? parseInt(formalityMatch[1]) : estimateFormalityLevel(patterns);

  // Extract tone descriptors
  const toneDescriptors = extractToneDescriptors(analysisText);

  // Determine responsiveness category
  const responsivenessCategory = categorizeResponsiveness(patterns.responsePatterns.quickResponderScore);

  return {
    // Core style attributes
    overallTone: toneDescriptors.primary || 'Professional',
    formalityLevel: formalityLevel,
    formalityDescription: getFormalityDescription(formalityLevel),

    // Personality traits
    traits: {
      responsiveness: {
        score: patterns.responsePatterns.quickResponderScore,
        category: responsivenessCategory,
        avgResponseHours: patterns.responsePatterns.avgResponseTimeHours
      },
      verbosity: estimateVerbosity(patterns.subjectPatterns),
      emotionalExpression: estimateEmotionalExpression(patterns.subjectPatterns),
      questionAsking: estimateQuestionTendency(patterns.subjectPatterns)
    },

    // Communication patterns
    characteristicPatterns: {
      subjectStyle: describeSubjectStyle(patterns.subjectPatterns),
      timingPreferences: patterns.timingPatterns,
      responseRate: patterns.responsePatterns.responseRate
    },

    // Balance assessment
    professionalPersonalBalance: estimateBalance(formalityLevel),

    // Raw Claude analysis
    rawAnalysis: analysisText,

    // Summary
    summary: generateSummary(toneDescriptors.primary, formalityLevel, responsivenessCategory)
  };
}

/**
 * Extract tone descriptors from Claude's analysis
 */
function extractToneDescriptors(text) {
  const toneKeywords = {
    professional: ['professional', 'business', 'formal'],
    casual: ['casual', 'relaxed', 'informal'],
    friendly: ['friendly', 'warm', 'approachable'],
    direct: ['direct', 'straightforward', 'concise'],
    enthusiastic: ['enthusiastic', 'energetic', 'excited']
  };

  const lowerText = text.toLowerCase();
  const foundTones = [];

  for (const [tone, keywords] of Object.entries(toneKeywords)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        foundTones.push(tone);
        break;
      }
    }
  }

  return {
    primary: foundTones[0] || 'Professional',
    secondary: foundTones.slice(1, 3)
  };
}

/**
 * Estimate formality level from patterns
 */
function estimateFormalityLevel(patterns) {
  let score = 5; // Start at neutral

  // Adjust based on subject line patterns
  if (patterns.subjectPatterns.usesExclamations > patterns.subjectPatterns.usesQuestions) {
    score -= 1; // More casual
  }

  if (patterns.subjectPatterns.avgSubjectWords > 6) {
    score += 1; // More formal (detailed subjects)
  }

  // Adjust based on response patterns
  if (patterns.responsePatterns.quickResponderScore > 70) {
    score -= 1; // Quick responders tend to be more casual
  }

  return Math.max(1, Math.min(10, score));
}

/**
 * Categorize responsiveness
 */
function categorizeResponsiveness(score) {
  if (score >= 80) return 'Highly Responsive';
  if (score >= 50) return 'Moderately Responsive';
  if (score >= 25) return 'Somewhat Responsive';
  return 'Delayed Responder';
}

/**
 * Estimate verbosity
 */
function estimateVerbosity(subjectPatterns) {
  const avgWords = subjectPatterns.avgSubjectWords;

  if (avgWords > 8) return 'Detailed';
  if (avgWords > 5) return 'Moderate';
  return 'Concise';
}

/**
 * Estimate emotional expression
 */
function estimateEmotionalExpression(subjectPatterns) {
  const exclamationRate = subjectPatterns.usesExclamations / Math.max(subjectPatterns.totalSent || 10, 1);

  if (exclamationRate > 0.3) return 'Expressive';
  if (exclamationRate > 0.1) return 'Moderately Expressive';
  return 'Reserved';
}

/**
 * Estimate question asking tendency
 */
function estimateQuestionTendency(subjectPatterns) {
  const questionRate = subjectPatterns.usesQuestions / Math.max(subjectPatterns.totalSent || 10, 1);

  if (questionRate > 0.4) return 'Frequent';
  if (questionRate > 0.2) return 'Occasional';
  return 'Rare';
}

/**
 * Describe subject line style
 */
function describeSubjectStyle(patterns) {
  const style = [];

  if (patterns.avgSubjectWords < 4) {
    style.push('Brief and to-the-point');
  } else if (patterns.avgSubjectWords > 7) {
    style.push('Detailed and descriptive');
  } else {
    style.push('Balanced length');
  }

  if (patterns.usesQuestions > 5) {
    style.push('inquiry-focused');
  }

  if (patterns.usesExclamations > 5) {
    style.push('enthusiastic');
  }

  return style.join(', ');
}

/**
 * Get formality description
 */
function getFormalityDescription(level) {
  if (level >= 8) return 'Very Formal';
  if (level >= 6) return 'Moderately Formal';
  if (level >= 4) return 'Balanced';
  if (level >= 2) return 'Casual';
  return 'Very Casual';
}

/**
 * Estimate professional/personal balance
 */
function estimateBalance(formalityLevel) {
  if (formalityLevel >= 7) return 'Primarily Professional';
  if (formalityLevel >= 5) return 'Mixed Professional & Personal';
  return 'Primarily Personal';
}

/**
 * Generate summary
 */
function generateSummary(tone, formalityLevel, responsiveness) {
  return `${tone} communication style with ${getFormalityDescription(formalityLevel).toLowerCase()} tone. ${responsiveness} to messages.`;
}
