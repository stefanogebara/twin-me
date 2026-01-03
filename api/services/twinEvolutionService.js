/**
 * TwinEvolutionService
 *
 * Tracks personality evolution over time by:
 * - Recording snapshots of personality scores
 * - Detecting significant changes in any dimension
 * - Generating AI insights to explain personality shifts
 * - Maintaining an evolution timeline
 *
 * The service helps users understand how their digital twin
 * evolves as they connect more data and as their behaviors change.
 */

import { supabaseAdmin } from './database.js';
import { generateChatResponse } from './anthropicService.js';

// Thresholds for detecting significant changes
const CHANGE_THRESHOLDS = {
  MINOR: 5,      // 5% change - noted but not highlighted
  MODERATE: 10,  // 10% change - worth mentioning
  SIGNIFICANT: 15 // 15%+ change - generate insight
};

class TwinEvolutionService {
  constructor() {
    this.SNAPSHOT_INTERVAL_HOURS = 24; // Minimum time between snapshots
  }

  /**
   * Record a new personality snapshot
   */
  async recordSnapshot(userId, scores, metadata = {}) {
    try {
      // Check if we already have a recent snapshot
      const { data: recentSnapshot } = await supabaseAdmin
        .from('personality_scores')
        .select('*')
        .eq('user_id', userId)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .single();

      const now = new Date();

      // If recent snapshot exists and is too recent, skip
      if (recentSnapshot && recentSnapshot.calculated_at) {
        const lastSnapshot = new Date(recentSnapshot.calculated_at);
        const hoursSinceLastSnapshot = (now - lastSnapshot) / (1000 * 60 * 60);

        if (hoursSinceLastSnapshot < this.SNAPSHOT_INTERVAL_HOURS) {
          return {
            success: false,
            reason: 'Too soon for new snapshot',
            hoursSinceLastSnapshot: Math.round(hoursSinceLastSnapshot),
            nextSnapshotIn: Math.round(this.SNAPSHOT_INTERVAL_HOURS - hoursSinceLastSnapshot)
          };
        }
      }

      // Create snapshot record
      const snapshotData = {
        user_id: userId,
        openness: scores.openness?.score || scores.openness || 50,
        conscientiousness: scores.conscientiousness?.score || scores.conscientiousness || 50,
        extraversion: scores.extraversion?.score || scores.extraversion || 50,
        agreeableness: scores.agreeableness?.score || scores.agreeableness || 50,
        neuroticism: scores.neuroticism?.score || scores.neuroticism || 50,
        source: metadata.source || 'behavioral',
        confidence_level: metadata.confidenceLevel || 'medium',
        calculated_at: now.toISOString()
      };

      const { data, error } = await supabaseAdmin
        .from('personality_scores')
        .insert(snapshotData)
        .select();

      if (error) throw error;

      // Check for significant changes
      if (recentSnapshot) {
        const changes = await this.detectSignificantChanges(userId, scores, recentSnapshot);

        if (changes.hasSignificantChange) {
          // Log evolution event
          await this.logEvolutionEvent(userId, {
            type: 'personality_shift',
            changes: changes.significantChanges,
            previousSnapshot: recentSnapshot,
            newSnapshot: snapshotData
          });

          return {
            success: true,
            snapshot: data[0],
            changes,
            evolutionDetected: true
          };
        }
      }

      return {
        success: true,
        snapshot: data[0],
        evolutionDetected: false
      };

    } catch (error) {
      console.error('[TwinEvolutionService] Error recording snapshot:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Detect significant changes compared to previous snapshot
   */
  async detectSignificantChanges(userId, newScores, previousSnapshot) {
    const dimensions = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];
    const changes = [];
    let hasSignificantChange = false;

    for (const dim of dimensions) {
      const newValue = newScores[dim]?.score || newScores[dim] || 50;
      const oldValue = previousSnapshot[dim] || 50;
      const change = newValue - oldValue;
      const absChange = Math.abs(change);

      if (absChange >= CHANGE_THRESHOLDS.MINOR) {
        const changeInfo = {
          dimension: dim,
          previousValue: Math.round(oldValue * 100) / 100,
          newValue: Math.round(newValue * 100) / 100,
          change: Math.round(change * 100) / 100,
          direction: change > 0 ? 'increased' : 'decreased',
          magnitude: this.getChangeMagnitude(absChange)
        };

        changes.push(changeInfo);

        if (absChange >= CHANGE_THRESHOLDS.SIGNIFICANT) {
          hasSignificantChange = true;
        }
      }
    }

    return {
      hasSignificantChange,
      significantChanges: changes.filter(c => c.magnitude === 'significant'),
      allChanges: changes
    };
  }

  /**
   * Get the magnitude label for a change
   */
  getChangeMagnitude(absChange) {
    if (absChange >= CHANGE_THRESHOLDS.SIGNIFICANT) return 'significant';
    if (absChange >= CHANGE_THRESHOLDS.MODERATE) return 'moderate';
    return 'minor';
  }

  /**
   * Generate AI insight explaining a personality shift
   */
  async generateEvolutionInsight(userId, change) {
    try {
      const systemPrompt = `You are an insightful personality evolution analyst.
Your role is to explain personality changes in a warm, validating way.
Focus on potential reasons for the change and what it might mean.
Be brief (2-3 sentences) and use second person ("You...").`;

      const userPrompt = `A user's ${change.dimension} score ${change.direction} from ${change.previousValue}% to ${change.newValue}% (a ${Math.abs(change.change)}% shift).

What might explain this change in their ${change.dimension.replace('ness', '')} level?
Consider behavioral factors like lifestyle changes, new habits, or life circumstances.`;

      const response = await generateChatResponse({
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 150,
        temperature: 0.7
      });

      return {
        insight: response.content,
        generatedAt: new Date().toISOString(),
        model: response.model
      };

    } catch (error) {
      console.error('[TwinEvolutionService] Error generating insight:', error);
      return {
        insight: this.getFallbackInsight(change),
        error: error.message
      };
    }
  }

  /**
   * Log an evolution event to the database
   */
  async logEvolutionEvent(userId, eventData) {
    try {
      const { type, changes, previousSnapshot, newSnapshot } = eventData;

      // Generate insights for significant changes
      const insightsPromises = changes.map(change =>
        this.generateEvolutionInsight(userId, change)
      );
      const insights = await Promise.all(insightsPromises);

      const evolutionRecord = {
        user_id: userId,
        event_type: type,
        old_scores: {
          openness: previousSnapshot.openness,
          conscientiousness: previousSnapshot.conscientiousness,
          extraversion: previousSnapshot.extraversion,
          agreeableness: previousSnapshot.agreeableness,
          neuroticism: previousSnapshot.neuroticism
        },
        new_scores: {
          openness: newSnapshot.openness,
          conscientiousness: newSnapshot.conscientiousness,
          extraversion: newSnapshot.extraversion,
          agreeableness: newSnapshot.agreeableness,
          neuroticism: newSnapshot.neuroticism
        },
        changes: changes.map((change, i) => ({
          ...change,
          insight: insights[i]?.insight || null
        })),
        insight: insights[0]?.insight || null, // Primary insight
        recorded_at: new Date().toISOString()
      };

      const { data, error } = await supabaseAdmin
        .from('twin_evolution_log')
        .insert(evolutionRecord)
        .select();

      if (error) throw error;

      return { success: true, data };

    } catch (error) {
      console.error('[TwinEvolutionService] Error logging evolution event:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get evolution history for a user
   */
  async getEvolutionHistory(userId, options = {}) {
    try {
      const { limit = 10, timeRange = null } = options;

      let query = supabaseAdmin
        .from('twin_evolution_log')
        .select('*')
        .eq('user_id', userId)
        .order('recorded_at', { ascending: false })
        .limit(limit);

      if (timeRange) {
        const startDate = new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000);
        query = query.gte('recorded_at', startDate.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;

      return {
        success: true,
        events: data || [],
        count: data?.length || 0
      };

    } catch (error) {
      console.error('[TwinEvolutionService] Error getting evolution history:', error);
      return { success: false, error: error.message, events: [] };
    }
  }

  /**
   * Get personality score timeline for charting
   */
  async getScoreTimeline(userId, options = {}) {
    try {
      const { limit = 30, dimension = null } = options;

      const { data: snapshots, error } = await supabaseAdmin
        .from('personality_scores')
        .select('*')
        .eq('user_id', userId)
        .order('calculated_at', { ascending: true })
        .limit(limit);

      if (error) throw error;

      if (!snapshots || snapshots.length === 0) {
        return { success: true, timeline: [], hasData: false };
      }

      // Format for charting
      const dimensions = dimension
        ? [dimension]
        : ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];

      const timeline = snapshots.map(snapshot => {
        const point = {
          date: snapshot.calculated_at,
          timestamp: new Date(snapshot.calculated_at).getTime()
        };

        for (const dim of dimensions) {
          point[dim] = snapshot[dim];
        }

        return point;
      });

      // Calculate overall trend for each dimension
      const trends = {};
      for (const dim of dimensions) {
        if (snapshots.length >= 2) {
          const first = snapshots[0][dim];
          const last = snapshots[snapshots.length - 1][dim];
          const change = last - first;

          trends[dim] = {
            direction: change > 0 ? 'increasing' : change < 0 ? 'decreasing' : 'stable',
            change: Math.round(change * 100) / 100,
            startValue: first,
            endValue: last
          };
        }
      }

      return {
        success: true,
        timeline,
        trends,
        hasData: true,
        snapshotCount: snapshots.length
      };

    } catch (error) {
      console.error('[TwinEvolutionService] Error getting score timeline:', error);
      return { success: false, error: error.message, timeline: [] };
    }
  }

  /**
   * Get evolution summary for dashboard
   */
  async getEvolutionSummary(userId) {
    try {
      // Get recent evolution events
      const historyResult = await this.getEvolutionHistory(userId, { limit: 5, timeRange: 30 });

      // Get score timeline
      const timelineResult = await this.getScoreTimeline(userId, { limit: 10 });

      // Get latest snapshot
      const { data: latestSnapshot } = await supabaseAdmin
        .from('personality_scores')
        .select('*')
        .eq('user_id', userId)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .single();

      const summary = {
        hasEvolutionData: historyResult.events.length > 0 || timelineResult.hasData,
        recentEvents: historyResult.events,
        eventCount: historyResult.count,
        trends: timelineResult.trends || {},
        latestSnapshot,
        lastUpdated: latestSnapshot?.calculated_at || null
      };

      // Determine overall evolution status
      if (historyResult.events.length > 0) {
        summary.status = 'evolving';
        summary.message = `Your personality has shown ${historyResult.count} notable shifts recently.`;
      } else if (timelineResult.snapshotCount > 1) {
        summary.status = 'stable';
        summary.message = 'Your personality has remained relatively stable.';
      } else {
        summary.status = 'new';
        summary.message = 'Your twin is just getting started. More insights will emerge over time.';
      }

      return {
        success: true,
        summary
      };

    } catch (error) {
      console.error('[TwinEvolutionService] Error getting evolution summary:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Fallback insight when AI generation fails
   */
  getFallbackInsight(change) {
    const dimensionDescriptions = {
      openness: 'openness to new experiences',
      conscientiousness: 'organization and discipline',
      extraversion: 'social energy',
      agreeableness: 'cooperation with others',
      neuroticism: 'emotional sensitivity'
    };

    const dimDesc = dimensionDescriptions[change.dimension] || change.dimension;

    if (change.direction === 'increased') {
      return `Your ${dimDesc} has increased, which might reflect new habits, experiences, or life changes that are expanding this aspect of your personality.`;
    } else {
      return `Your ${dimDesc} has decreased, which could indicate a shift in priorities or circumstances affecting how you express this trait.`;
    }
  }
}

// Export singleton instance
const twinEvolutionService = new TwinEvolutionService();
export default twinEvolutionService;
