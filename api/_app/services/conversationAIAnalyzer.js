/**
 * Conversation AI Analyzer
 *
 * Uses Claude Sonnet for deep analysis of conversations to extract:
 * - Engagement level (low, medium, high, very_high)
 * - Conversation depth (surface, moderate, deep, expert)
 * - Tone profile (professional, casual, emotional, analytical) 0-100 each
 * - Context signals (trigger, user need, emotional state)
 * - Conversation arc (stage, progression pattern)
 * - Subject matter (primary domain, specific topics)
 *
 * Cost: ~$0.003 per conversation analysis with Claude Sonnet
 */

import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('ConversationAIAnalyzer');

/**
 * Analysis prompt template for Claude Sonnet
 */
const ANALYSIS_PROMPT = `You are an expert conversation analyst. Analyze the following user message and provide a structured analysis.

USER MESSAGE:
"""
{user_message}
"""

{context_section}

Analyze this message and respond with ONLY a valid JSON object (no markdown, no explanation) with this exact structure:

{
  "engagement": {
    "level": "low|medium|high|very_high",
    "indicators": ["list of 2-3 specific indicators from the message"],
    "reasoning": "Brief explanation of engagement level"
  },
  "depth": {
    "level": "surface|moderate|deep|expert",
    "reasoning": "Brief explanation of depth level",
    "technicalLevel": 0-100
  },
  "tone": {
    "professional": 0-100,
    "casual": 0-100,
    "emotional": 0-100,
    "analytical": 0-100,
    "dominant": "professional|casual|emotional|analytical"
  },
  "context": {
    "likelyTrigger": "What likely prompted this message",
    "userNeed": "What the user appears to need",
    "emotionalState": "neutral|positive|negative|mixed|curious|frustrated|excited|anxious",
    "urgency": "low|medium|high"
  },
  "arc": {
    "stage": "opening|exploration|deep_dive|resolution|closing",
    "progressionPattern": "seeking_help|problem_solving|learning|venting|planning|reflecting",
    "continuesPrevious": true|false
  },
  "subjectMatter": {
    "primaryDomain": "The main topic area",
    "specificTopics": ["list of 2-4 specific topics"],
    "technicalTerms": ["any technical or domain-specific terms used"]
  }
}

Engagement levels:
- low: Short, vague, or minimal effort message
- medium: Clear message with some detail
- high: Detailed message showing active engagement
- very_high: Extensive, thoughtful message with deep engagement

Depth levels:
- surface: Basic question or comment, no expertise shown
- moderate: Shows some understanding, asks follow-up questions
- deep: Demonstrates significant knowledge, nuanced questions
- expert: Expert-level discourse, advanced terminology

Respond with ONLY the JSON object.`;

/**
 * Analyze a conversation using Claude Sonnet
 * @param {string} userMessage - The user's message to analyze
 * @param {Object} context - Optional context (previous messages, session info)
 * @returns {Object} Analysis result
 */
export async function analyzeConversation(userMessage, context = {}) {
  const startTime = Date.now();

  try {
    // Build context section if we have previous messages
    let contextSection = '';
    if (context.previousMessages && context.previousMessages.length > 0) {
      contextSection = `CONTEXT FROM PREVIOUS MESSAGES:\n`;
      context.previousMessages.slice(-3).forEach((msg, i) => {
        contextSection += `- Turn ${i + 1}: "${msg.substring(0, 100)}${msg.length > 100 ? '...' : ''}"\n`;
      });
      contextSection += '\n';
    }

    if (context.sessionTopics && context.sessionTopics.length > 0) {
      contextSection += `SESSION TOPICS SO FAR: ${context.sessionTopics.join(', ')}\n\n`;
    }

    const prompt = ANALYSIS_PROMPT
      .replace('{user_message}', userMessage)
      .replace('{context_section}', contextSection);

    const result = await complete({
      tier: TIER_ANALYSIS,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      maxTokens: 1024,
      serviceName: 'conversationAIAnalyzer'
    });

    const responseText = result.content.trim();

    // Parse JSON response
    let analysis;
    try {
      analysis = JSON.parse(responseText);
    } catch (parseError) {
      // Try to extract JSON from the response if wrapped in markdown
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse AI response as JSON');
      }
    }

    const processingTimeMs = Date.now() - startTime;
    const tokensUsed = result.usage?.input_tokens + result.usage?.output_tokens;

    log.info('Analysis completed:', {
      engagement: analysis.engagement?.level,
      depth: analysis.depth?.level,
      dominantTone: analysis.tone?.dominant,
      stage: analysis.arc?.stage,
      processingTimeMs,
      tokensUsed
    });

    return {
      success: true,
      analysis,
      metadata: {
        model: result.model,
        processingTimeMs,
        tokensUsed,
        analyzedAt: new Date().toISOString()
      }
    };

  } catch (error) {
    log.error('Analysis failed:', error);
    return {
      success: false,
      error: error.message,
      metadata: {
        processingTimeMs: Date.now() - startTime,
        analyzedAt: new Date().toISOString()
      }
    };
  }
}

/**
 * Analyze and update a conversation log in the database
 * @param {string} conversationLogId - UUID of the mcp_conversation_logs entry
 * @returns {Object} Analysis result
 */
export async function analyzeAndUpdateConversationLog(conversationLogId) {
  try {
    // Fetch the conversation log
    const { data: log, error: fetchError } = await supabaseAdmin
      .from('mcp_conversation_logs')
      .select('*')
      .eq('id', conversationLogId)
      .single();

    if (fetchError || !log) {
      throw new Error(`Conversation log not found: ${conversationLogId}`);
    }

    // Get previous messages for context
    const { data: previousLogs } = await supabaseAdmin
      .from('mcp_conversation_logs')
      .select('user_message, topics_detected')
      .eq('user_id', log.user_id)
      .eq('session_id', log.session_id)
      .lt('created_at', log.created_at)
      .order('created_at', { ascending: false })
      .limit(3);

    const context = {
      previousMessages: previousLogs?.map(l => l.user_message) || [],
      sessionTopics: [...new Set((previousLogs || []).flatMap(l => l.topics_detected || []))]
    };

    // Run AI analysis
    const result = await analyzeConversation(log.user_message, context);

    if (!result.success) {
      // Update job status as failed
      const { error: failUpdateErr } = await supabaseAdmin
        .from('conversation_analysis_jobs')
        .update({
          status: 'failed',
          error_message: result.error,
          completed_at: new Date().toISOString()
        })
        .eq('conversation_log_id', conversationLogId);
      if (failUpdateErr) log.warn('Failed to mark job as failed:', failUpdateErr.message);

      return result;
    }

    // Update the conversation log with analysis results
    const { error: updateError } = await supabaseAdmin
      .from('mcp_conversation_logs')
      .update({
        engagement_level: result.analysis.engagement?.level,
        conversation_depth: result.analysis.depth?.level,
        tone_profile: result.analysis.tone,
        context_signals: result.analysis.context,
        conversation_arc: result.analysis.arc,
        subject_matter: result.analysis.subjectMatter,
        ai_analysis: {
          ...result.analysis,
          ...result.metadata
        }
      })
      .eq('id', conversationLogId);

    if (updateError) {
      log.error('Failed to update log:', updateError);
      throw updateError;
    }

    log.info('Conversation log updated:', conversationLogId);

    return result;

  } catch (error) {
    log.error('Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Analyze a session and generate a summary
 * @param {string} sessionId - UUID of the conversation_sessions entry
 * @returns {Object} Session analysis result
 */
export async function analyzeSession(sessionId) {
  try {
    // Fetch all messages in the session
    const { data: messages, error } = await supabaseAdmin
      .from('mcp_conversation_logs')
      .select('user_message, twin_response, topics_detected, engagement_level, conversation_depth')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error || !messages || messages.length === 0) {
      throw new Error(`No messages found for session: ${sessionId}`);
    }

    // Build conversation summary for analysis
    const conversationText = messages.map((m, i) => {
      return `User: ${m.user_message}\nAssistant: ${m.twin_response?.substring(0, 200) || '[no response]'}`;
    }).join('\n\n');

    const prompt = `Analyze this conversation session and provide a brief summary.

CONVERSATION:
${conversationText}

Respond with ONLY a valid JSON object:
{
  "summary": "2-3 sentence summary of what was discussed and accomplished",
  "primaryTopics": ["list of 2-4 main topics"],
  "overallEngagement": "low|medium|high|very_high",
  "overallDepth": "surface|moderate|deep|expert",
  "sessionArc": {
    "type": "problem_solving|learning|exploration|venting|planning",
    "resolution": "resolved|ongoing|abandoned|unclear",
    "userSatisfaction": "satisfied|neutral|unsatisfied|unknown"
  },
  "keyInsights": ["list of 1-3 key insights about the user from this session"]
}`;

    const sessionResult = await complete({
      tier: TIER_ANALYSIS,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 512,
      serviceName: 'conversationAIAnalyzer'
    });

    const responseText = sessionResult.content.trim();
    let analysis;

    try {
      analysis = JSON.parse(responseText);
    } catch {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse session analysis');
      }
    }

    // Update the session with summary
    const { error: sessionUpdateErr } = await supabaseAdmin
      .from('conversation_sessions')
      .update({
        session_summary: analysis.summary,
        primary_topics: analysis.primaryTopics,
        overall_engagement: analysis.overallEngagement,
        overall_depth: analysis.overallDepth,
        session_arc: analysis.sessionArc,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId);
    if (sessionUpdateErr) log.warn('Failed to update session summary:', sessionUpdateErr.message);

    log.info('Session analyzed:', sessionId);

    return {
      success: true,
      analysis
    };

  } catch (error) {
    log.error('Session analysis failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create an analysis job for a conversation
 * @param {string} userId - User UUID
 * @param {string} conversationLogId - Conversation log UUID
 * @param {string} sessionId - Optional session UUID
 * @param {number} priority - Job priority (lower = higher priority)
 * @returns {Object} Created job
 */
export async function createAnalysisJob(userId, conversationLogId, sessionId = null, priority = 5) {
  try {
    const { data, error } = await supabaseAdmin
      .from('conversation_analysis_jobs')
      .insert({
        user_id: userId,
        conversation_log_id: conversationLogId,
        session_id: sessionId,
        status: 'pending',
        priority,
        queued_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    log.info('Analysis job created:', data.id);
    return { success: true, jobId: data.id };

  } catch (error) {
    log.error('Failed to create job:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Process pending analysis jobs
 * @param {number} limit - Maximum number of jobs to process
 * @returns {Object} Processing result
 */
export async function processPendingJobs(limit = 10) {
  try {
    // Fetch pending jobs ordered by priority and queue time
    const { data: jobs, error } = await supabaseAdmin
      .from('conversation_analysis_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('priority', { ascending: true })
      .order('queued_at', { ascending: true })
      .limit(limit);

    if (error) {
      throw error;
    }

    if (!jobs || jobs.length === 0) {
      return { success: true, processed: 0, message: 'No pending jobs' };
    }

    log.info(`Processing ${jobs.length} pending jobs`);

    let processed = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        // Mark as processing
        const { error: processingErr } = await supabaseAdmin
          .from('conversation_analysis_jobs')
          .update({
            status: 'processing',
            started_at: new Date().toISOString()
          })
          .eq('id', job.id);
        if (processingErr) log.warn('Failed to mark job as processing:', processingErr.message);

        // Process the job
        const startTime = Date.now();
        const result = await analyzeAndUpdateConversationLog(job.conversation_log_id);
        const processingTimeMs = Date.now() - startTime;

        if (result.success) {
          const { error: completedErr } = await supabaseAdmin
            .from('conversation_analysis_jobs')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              processing_time_ms: processingTimeMs,
              model_used: result.metadata?.model,
              tokens_used: result.metadata?.tokensUsed,
              analysis_result: result.analysis
            })
            .eq('id', job.id);
          if (completedErr) log.warn('Failed to mark job as completed:', completedErr.message);

          processed++;
        } else {
          throw new Error(result.error);
        }

      } catch (jobError) {
        const { error: jobFailErr } = await supabaseAdmin
          .from('conversation_analysis_jobs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: jobError.message
          })
          .eq('id', job.id);
        if (jobFailErr) log.warn('Failed to mark job as failed:', jobFailErr.message);

        failed++;
      }

      // Small delay between jobs to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    log.info(`Processed ${processed} jobs, ${failed} failed`);

    return {
      success: true,
      processed,
      failed,
      total: jobs.length
    };

  } catch (error) {
    log.error('Job processing failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get analysis statistics for a user
 * @param {string} userId - User UUID
 * @returns {Object} Statistics
 */
export async function getAnalysisStats(userId) {
  try {
    const { data: logs } = await supabaseAdmin
      .from('mcp_conversation_logs')
      .select('engagement_level, conversation_depth, tone_profile, context_signals')
      .eq('user_id', userId)
      .not('ai_analysis', 'is', null);

    if (!logs || logs.length === 0) {
      return { analyzed: 0 };
    }

    // Calculate engagement distribution
    const engagementCounts = { low: 0, medium: 0, high: 0, very_high: 0 };
    const depthCounts = { surface: 0, moderate: 0, deep: 0, expert: 0 };
    const toneTotals = { professional: 0, casual: 0, emotional: 0, analytical: 0 };

    logs.forEach(log => {
      if (log.engagement_level) engagementCounts[log.engagement_level]++;
      if (log.conversation_depth) depthCounts[log.conversation_depth]++;
      if (log.tone_profile) {
        toneTotals.professional += log.tone_profile.professional || 0;
        toneTotals.casual += log.tone_profile.casual || 0;
        toneTotals.emotional += log.tone_profile.emotional || 0;
        toneTotals.analytical += log.tone_profile.analytical || 0;
      }
    });

    const count = logs.length;

    return {
      analyzed: count,
      engagement: {
        distribution: engagementCounts,
        primary: Object.entries(engagementCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
      },
      depth: {
        distribution: depthCounts,
        primary: Object.entries(depthCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
      },
      toneAverages: {
        professional: Math.round(toneTotals.professional / count),
        casual: Math.round(toneTotals.casual / count),
        emotional: Math.round(toneTotals.emotional / count),
        analytical: Math.round(toneTotals.analytical / count)
      }
    };

  } catch (error) {
    log.error('Stats error:', error);
    return { error: error.message };
  }
}

export default {
  analyzeConversation,
  analyzeAndUpdateConversationLog,
  analyzeSession,
  createAnalysisJob,
  processPendingJobs,
  getAnalysisStats
};
