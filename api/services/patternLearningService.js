/**
 * Pattern Learning Service
 * Analyzes user feedback to improve personalization
 * Uses Claude for insight generation and pattern refinement
 *
 * Integrates with memoryArchitecture.js SleepTimeCompute
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

// Lazy initialization to avoid crashes if env vars not loaded yet
let supabase = null;
let anthropic = null;

function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

function getAnthropicClient() {
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropic;
}

class PatternLearningService {
  constructor() {
    this.batchSize = 50; // Process feedback in batches
    this.confidenceDecay = 0.05; // Reduce confidence by 5% on negative feedback
    this.confidenceBoost = 0.03; // Increase confidence by 3% on positive feedback
  }

  /**
   * Process all unprocessed feedback for a user
   * Called during daily batch processing
   */
  async processUserFeedback(userId) {
    console.log(`\n🔄 [PatternLearning] Processing started for user ${userId}`);
    console.log(`   - Batch size limit: ${this.batchSize}`);
    const processingStartTime = Date.now();

    try {
      // 1. Get unprocessed feedback
      console.log(`📥 [PatternLearning] Fetching unprocessed feedback from database...`);
      const { data: feedbackItems, error } = await getSupabaseClient()
        .from('recommendation_feedback')
        .select('*')
        .eq('user_id', userId)
        .is('processed_at', null)
        .order('created_at', { ascending: true })
        .limit(this.batchSize);

      if (error) {
        console.error(`❌ [PatternLearning] Error fetching feedback:`, error);
        return { success: false, error: error.message };
      }

      if (!feedbackItems || feedbackItems.length === 0) {
        console.log(`📭 [PatternLearning] No unprocessed feedback found for user ${userId}`);
        return { success: true, processed: 0 };
      }

      console.log(`📊 [PatternLearning] Found ${feedbackItems.length} unprocessed feedback items`);
      console.log(`   - Thumbs up: ${feedbackItems.filter(f => f.thumbs_vote === 'up').length}`);
      console.log(`   - Thumbs down: ${feedbackItems.filter(f => f.thumbs_vote === 'down').length}`);
      console.log(`   - With comments: ${feedbackItems.filter(f => f.comment).length}`);

      // 2. Analyze feedback patterns
      console.log(`🔍 [PatternLearning] Analyzing feedback patterns...`);
      const feedbackSummary = await this.analyzeFeedbackPatterns(feedbackItems);
      if (feedbackSummary) {
        console.log(`   - Approval rate: ${Math.round((feedbackSummary.thumbsUp / feedbackSummary.total) * 100)}%`);
        console.log(`   - Avg star rating: ${feedbackSummary.avgStarRating?.toFixed(1) || 'N/A'}`);
      }

      // 3. Update pattern confidences
      console.log(`📈 [PatternLearning] Updating pattern confidence scores...`);
      await this.updatePatternConfidences(userId, feedbackItems);

      // 4. Generate personalized insights based on feedback
      console.log(`🧠 [PatternLearning] Calling Claude for insight generation...`);
      const newInsights = await this.generateInsightsFromFeedback(userId, feedbackSummary);

      // 5. Store generated insights
      if (newInsights && newInsights.length > 0) {
        console.log(`💡 [PatternLearning] Generated ${newInsights.length} new insights`);
        newInsights.forEach((insight, i) => {
          console.log(`   ${i + 1}. ${insight.title} (confidence: ${(insight.confidence * 100).toFixed(0)}%)`);
        });
        await this.storeGeneratedInsights(userId, newInsights);
        console.log(`💾 [PatternLearning] Insights stored in database`);
      } else {
        console.log(`ℹ️ [PatternLearning] No new insights generated (need more feedback data)`);
      }

      // 6. Mark feedback as processed
      console.log(`✓ [PatternLearning] Marking ${feedbackItems.length} feedback items as processed...`);
      const feedbackIds = feedbackItems.map(f => f.id);
      await getSupabaseClient()
        .from('recommendation_feedback')
        .update({ processed_at: new Date().toISOString() })
        .in('id', feedbackIds);

      const processingDuration = Date.now() - processingStartTime;
      console.log(`\n✅ [PatternLearning] Processing complete for user ${userId}`);
      console.log(`   - Duration: ${processingDuration}ms`);
      console.log(`   - Feedback processed: ${feedbackItems.length}`);
      console.log(`   - Insights generated: ${newInsights?.length || 0}`);
      console.log(`${'─'.repeat(50)}\n`);

      return {
        success: true,
        processed: feedbackItems.length,
        insightsGenerated: newInsights?.length || 0,
        summary: feedbackSummary
      };

    } catch (error) {
      console.error(`❌ [PatternLearning] Error processing feedback for user ${userId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Analyze feedback patterns using Claude
   */
  async analyzeFeedbackPatterns(feedbackItems) {
    if (feedbackItems.length === 0) return null;

    try {
      // Aggregate feedback stats
      const stats = {
        total: feedbackItems.length,
        thumbsUp: feedbackItems.filter(f => f.thumbs_vote === 'up').length,
        thumbsDown: feedbackItems.filter(f => f.thumbs_vote === 'down').length,
        avgStarRating: 0,
        byType: {},
        comments: []
      };

      // Calculate average star rating
      const rated = feedbackItems.filter(f => f.star_rating);
      if (rated.length > 0) {
        stats.avgStarRating = rated.reduce((sum, f) => sum + f.star_rating, 0) / rated.length;
      }

      // Group by recommendation type
      feedbackItems.forEach(f => {
        if (!stats.byType[f.recommendation_type]) {
          stats.byType[f.recommendation_type] = { up: 0, down: 0, count: 0 };
        }
        stats.byType[f.recommendation_type].count++;
        if (f.thumbs_vote === 'up') stats.byType[f.recommendation_type].up++;
        if (f.thumbs_vote === 'down') stats.byType[f.recommendation_type].down++;

        // Collect comments
        if (f.comment) {
          stats.comments.push({
            type: f.recommendation_type,
            rating: f.star_rating,
            comment: f.comment
          });
        }
      });

      // Use Claude to analyze patterns if we have comments
      if (stats.comments.length > 0) {
        const analysis = await this.analyzeCommentsWithClaude(stats);
        stats.analysis = analysis;
      }

      return stats;

    } catch (error) {
      console.error('[PatternLearning] Error analyzing feedback:', error);
      return null;
    }
  }

  /**
   * Use Claude to analyze user comments for actionable insights
   */
  async analyzeCommentsWithClaude(stats) {
    try {
      const commentsText = stats.comments
        .map(c => `[${c.type}] (${c.rating || 'no rating'}/5): "${c.comment}"`)
        .join('\n');

      const response = await getAnthropicClient().messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Analyze this user feedback on personalized recommendations and identify:
1. What types of recommendations the user finds most/least helpful
2. Specific improvements they're asking for
3. Patterns in their preferences
4. Actionable changes to improve future recommendations

Feedback Stats:
- Total feedback: ${stats.total}
- Thumbs up: ${stats.thumbsUp}, Thumbs down: ${stats.thumbsDown}
- Average star rating: ${stats.avgStarRating.toFixed(1)}/5

Comments:
${commentsText}

Return as JSON:
{
  "preferredTypes": ["type1", "type2"],
  "dislikedTypes": ["type3"],
  "improvementAreas": ["area1", "area2"],
  "userPreferences": ["pref1", "pref2"],
  "adjustmentSuggestions": ["suggestion1", "suggestion2"],
  "confidence": 0.0-1.0
}`
        }]
      });

      return JSON.parse(response.content[0].text);
    } catch (error) {
      console.error('[PatternLearning] Error analyzing with Claude:', error);
      return null;
    }
  }

  /**
   * Update pattern confidence scores based on feedback
   */
  async updatePatternConfidences(userId, feedbackItems) {
    try {
      for (const feedback of feedbackItems) {
        const adjustmentFactor = feedback.thumbs_vote === 'up'
          ? this.confidenceBoost
          : feedback.thumbs_vote === 'down'
            ? -this.confidenceDecay
            : 0;

        // Also factor in star rating if available
        let starAdjustment = 0;
        if (feedback.star_rating) {
          // 1-2 stars = negative, 3 = neutral, 4-5 = positive
          starAdjustment = (feedback.star_rating - 3) * 0.02;
        }

        const totalAdjustment = adjustmentFactor + starAdjustment;

        if (totalAdjustment !== 0 && feedback.related_pattern_ids?.length > 0) {
          // Update related patterns
          for (const patternId of feedback.related_pattern_ids) {
            await this.adjustPatternConfidence(patternId, totalAdjustment);
          }
        }

        // Update type-based confidence in core memory
        await this.updateTypeConfidence(userId, feedback.recommendation_type, totalAdjustment);
      }

    } catch (error) {
      console.error('[PatternLearning] Error updating confidences:', error);
    }
  }

  /**
   * Adjust a specific pattern's confidence
   */
  async adjustPatternConfidence(patternId, adjustment) {
    try {
      // Get current confidence
      const { data: pattern, error: fetchError } = await getSupabaseClient()
        .from('behavioral_patterns')
        .select('confidence_score')
        .eq('id', patternId)
        .single();

      if (fetchError || !pattern) return;

      // Calculate new confidence (bounded 0-1)
      const newConfidence = Math.max(0, Math.min(1, (pattern.confidence_score || 0.5) + adjustment));

      // Update
      await getSupabaseClient()
        .from('behavioral_patterns')
        .update({
          confidence_score: newConfidence,
          updated_at: new Date().toISOString()
        })
        .eq('id', patternId);

    } catch (error) {
      console.error('[PatternLearning] Error adjusting pattern confidence:', error);
    }
  }

  /**
   * Update user's preference confidence for recommendation types
   */
  async updateTypeConfidence(userId, recommendationType, adjustment) {
    try {
      // Store in core_memory table
      const preferenceKey = `recommendation_preference_${recommendationType}`;

      const { data: existing } = await getSupabaseClient()
        .from('core_memory')
        .select('preference_data, confidence_score')
        .eq('user_id', userId)
        .eq('preference_type', preferenceKey)
        .single();

      const currentConfidence = existing?.confidence_score || 0.5;
      const newConfidence = Math.max(0, Math.min(1, currentConfidence + adjustment));

      await getSupabaseClient()
        .from('core_memory')
        .upsert({
          user_id: userId,
          preference_type: preferenceKey,
          preference_data: {
            type: recommendationType,
            feedbackCount: (existing?.preference_data?.feedbackCount || 0) + 1,
            lastUpdated: new Date().toISOString()
          },
          confidence_score: newConfidence,
          last_updated: new Date().toISOString()
        }, {
          onConflict: 'user_id,preference_type'
        });

    } catch (error) {
      console.error('[PatternLearning] Error updating type confidence:', error);
    }
  }

  /**
   * Generate personalized insights based on feedback analysis
   */
  async generateInsightsFromFeedback(userId, feedbackSummary) {
    if (!feedbackSummary || feedbackSummary.total < 3) {
      // Need at least 3 feedback items to generate insights
      return [];
    }

    try {
      // Get user context for personalization
      const { data: soulData } = await getSupabaseClient()
        .from('soul_data')
        .select('extracted_patterns, platform')
        .eq('user_id', userId)
        .order('extracted_at', { ascending: false })
        .limit(5);

      const context = {
        platforms: soulData?.map(d => d.platform) || [],
        patterns: soulData?.map(d => d.extracted_patterns).filter(Boolean) || []
      };

      // Generate insights with Claude
      const response = await getAnthropicClient().messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: `Based on user feedback patterns and their data context, generate 2-3 personalized insights.

Feedback Summary:
- Approval rate: ${Math.round((feedbackSummary.thumbsUp / feedbackSummary.total) * 100)}%
- Average rating: ${feedbackSummary.avgStarRating.toFixed(1)}/5
- Preferred types: ${feedbackSummary.analysis?.preferredTypes?.join(', ') || 'unknown'}
- Areas to improve: ${feedbackSummary.analysis?.improvementAreas?.join(', ') || 'unknown'}

User Context:
- Connected platforms: ${context.platforms.join(', ')}
- Recent patterns: ${JSON.stringify(context.patterns).substring(0, 500)}

Generate insights that are:
1. Specific to the user's preferences
2. Actionable and helpful
3. Based on their feedback patterns

Return as JSON array:
[
  {
    "title": "Insight title",
    "summary": "One sentence summary",
    "detail": "Detailed explanation",
    "type": "insight|tip|pattern",
    "confidence": 0.0-1.0,
    "actionable": true/false,
    "suggestedAction": "optional action"
  }
]`
        }]
      });

      const insights = JSON.parse(response.content[0].text);
      return Array.isArray(insights) ? insights : [];

    } catch (error) {
      console.error('[PatternLearning] Error generating insights:', error);
      return [];
    }
  }

  /**
   * Store generated insights in database
   */
  async storeGeneratedInsights(userId, insights) {
    try {
      const insightRecords = insights.map(insight => ({
        user_id: userId,
        insight_type: insight.type || 'insight',
        title: insight.title,
        summary: insight.summary,
        detail: insight.detail,
        confidence_score: insight.confidence || 0.7,
        is_actionable: insight.actionable || false,
        suggested_action: insight.suggestedAction || null,
        source: 'pattern_learning',
        generated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      }));

      const { error } = await getSupabaseClient()
        .from('generated_insights')
        .insert(insightRecords);

      if (error) {
        console.error('[PatternLearning] Error storing insights:', error);
      }

    } catch (error) {
      console.error('[PatternLearning] Error in storeGeneratedInsights:', error);
    }
  }

  /**
   * Get user's learning metrics
   */
  async getUserLearningMetrics(userId) {
    try {
      // Get feedback stats
      const { data: feedback } = await getSupabaseClient()
        .from('recommendation_feedback')
        .select('thumbs_vote, star_rating, recommendation_type, created_at')
        .eq('user_id', userId);

      // Get generated insights
      const { data: insights } = await getSupabaseClient()
        .from('generated_insights')
        .select('insight_type, confidence_score, generated_at')
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString());

      // Calculate metrics
      const totalFeedback = feedback?.length || 0;
      const positiveRate = totalFeedback > 0
        ? (feedback.filter(f => f.thumbs_vote === 'up').length / totalFeedback) * 100
        : 0;
      const avgRating = feedback?.filter(f => f.star_rating)
        .reduce((sum, f, i, arr) => i === arr.length - 1
          ? (sum + f.star_rating) / arr.length
          : sum + f.star_rating, 0) || 0;

      return {
        totalFeedbackGiven: totalFeedback,
        positiveRate: Math.round(positiveRate),
        averageRating: avgRating.toFixed(1),
        activeInsights: insights?.length || 0,
        avgInsightConfidence: insights?.length > 0
          ? (insights.reduce((sum, i) => sum + i.confidence_score, 0) / insights.length).toFixed(2)
          : 0,
        learningProgress: Math.min(100, Math.round(totalFeedback * 5)) // 20 feedback = 100%
      };

    } catch (error) {
      console.error('[PatternLearning] Error getting metrics:', error);
      return null;
    }
  }

  /**
   * Run for all active users (called by cron job)
   */
  static async runForAllUsers() {
    const batchStartTime = Date.now();
    console.log(`\n${'='.repeat(60)}`);
    console.log(`⏰ [PatternLearning] Batch processing started at ${new Date().toISOString()}`);
    console.log(`${'='.repeat(60)}`);

    try {
      // Get users with unprocessed feedback
      console.log(`📋 [PatternLearning] Fetching users with pending feedback...`);
      const { data: usersWithFeedback, error } = await getSupabaseClient()
        .from('recommendation_feedback')
        .select('user_id')
        .is('processed_at', null);

      if (error) {
        console.error(`❌ [PatternLearning] Error fetching users:`, error);
        return [];
      }

      const uniqueUserIds = [...new Set(usersWithFeedback?.map(u => u.user_id) || [])];
      const totalPendingFeedback = usersWithFeedback?.length || 0;

      console.log(`📊 [PatternLearning] Batch statistics:`);
      console.log(`   - Users with pending feedback: ${uniqueUserIds.length}`);
      console.log(`   - Total pending feedback items: ${totalPendingFeedback}`);

      if (uniqueUserIds.length === 0) {
        console.log(`✅ [PatternLearning] No pending feedback to process`);
        console.log(`${'='.repeat(60)}\n`);
        return [];
      }

      const service = new PatternLearningService();
      const results = [];
      let successCount = 0;
      let totalProcessed = 0;
      let totalInsights = 0;

      // Process users in batches
      console.log(`\n🔄 [PatternLearning] Processing ${uniqueUserIds.length} users...\n`);

      for (let i = 0; i < uniqueUserIds.length; i++) {
        const userId = uniqueUserIds[i];
        console.log(`\n[${i + 1}/${uniqueUserIds.length}] Processing user ${userId}`);

        const result = await service.processUserFeedback(userId);
        results.push({ userId, ...result });

        if (result.success) {
          successCount++;
          totalProcessed += result.processed || 0;
          totalInsights += result.insightsGenerated || 0;
        }

        // Small delay between users to avoid rate limits
        if (i < uniqueUserIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      const batchDuration = Date.now() - batchStartTime;

      console.log(`\n${'='.repeat(60)}`);
      console.log(`✅ [PatternLearning] Batch processing complete!`);
      console.log(`   - Duration: ${(batchDuration / 1000).toFixed(1)}s`);
      console.log(`   - Users processed: ${uniqueUserIds.length}`);
      console.log(`   - Successful: ${successCount}/${uniqueUserIds.length}`);
      console.log(`   - Total feedback items processed: ${totalProcessed}`);
      console.log(`   - Total insights generated: ${totalInsights}`);
      console.log(`   - Completed at: ${new Date().toISOString()}`);
      console.log(`${'='.repeat(60)}\n`);

      return results;

    } catch (error) {
      console.error(`❌ [PatternLearning] Error in batch processing:`, error);
      return [];
    }
  }
}

export default new PatternLearningService();
export { PatternLearningService };
