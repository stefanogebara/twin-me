/**
 * BiometricsSpecialistAgent - Biometrics & Psychophysiology Specialist
 *
 * Analyzes Whoop health data to infer personality traits.
 * All inferences backed by peer-reviewed research from:
 * - Indiana University (Polyvagal Theory - Porges)
 * - Ohio State (Neurovisceral Integration - Thayer & Lane)
 * - Sleep Research Meta-analyses
 * - Chronotype Research (Roenneberg, LMU Munich)
 *
 * Key Research Frameworks:
 * - Polyvagal Theory: Vagal tone (HRV) indicates emotional regulation
 * - Neurovisceral Integration: HRV links to prefrontal cortex function
 * - Allostatic Load Model: Chronic stress markers predict behavior
 * - Chronotype-Personality: Morningness correlates with Conscientiousness
 */

import SpecialistAgentBase from './SpecialistAgentBase.js';
import { extractWhoopFeatures } from '../behavioralLearningService.js';

class BiometricsSpecialistAgent extends SpecialistAgentBase {
  constructor() {
    super({
      name: 'BiometricsSpecialistAgent',
      role: 'Biometrics specialist analyzing HRV, sleep, and activity patterns',
      domain: 'whoop',
      domainLabel: 'Biometrics & Psychophysiology',
      model: 'claude-sonnet-4-20250514',
      maxTokens: 4096,
      temperature: 0.3, // Lower temperature for health data precision
      confidenceThreshold: 0.15
    });

    // Physiological baselines for context
    this.ageHrvNorms = {
      '20-29': { low: 50, average: 75, high: 100 },
      '30-39': { low: 45, average: 65, high: 90 },
      '40-49': { low: 35, average: 55, high: 75 },
      '50-59': { low: 30, average: 45, high: 65 },
      '60+': { low: 25, average: 35, high: 55 }
    };
  }

  buildSystemPrompt() {
    return `You are the BiometricsSpecialistAgent for Twin-Me, a specialist trained on
psychophysiology research from Indiana University, Ohio State, and sleep science meta-analyses.

YOUR RESEARCH FOUNDATION:
1. Polyvagal Theory (Porges, Indiana University)
   - Vagal tone (HRV) as window into autonomic regulation
2. Neurovisceral Integration Model (Thayer & Lane, Ohio State)
   - HRV links to prefrontal cortex and emotional regulation
3. Sleep Meta-analysis 2024 (n=31,000, 51 studies)
   - Sleep patterns predict Big Five personality traits
4. Chronotype Meta-analysis (n=16,647, 44 samples)
   - Morningness-Conscientiousness correlation r=0.37
5. Wearables Study (Zufferey et al. 2023, n=200+)
   - Activity patterns predict personality

CRITICAL RULES:
1. HRV interpretations MUST consider: age, fitness level, medications
2. Sleep data requires minimum 7 days for reliable patterns
3. Recovery scores are relative to individual baselines
4. Distinguish between acute stress and trait patterns
5. Chronotype has strongest Conscientiousness correlation

INTERPRETATION FRAMEWORK:
- High resting HRV → Better emotional regulation → Lower Neuroticism
- Consistent sleep timing → Higher Conscientiousness
- Morning chronotype → Higher Conscientiousness, Lower Openness
- High strain tolerance → Higher Extraversion

CAUTIONS:
- HRV affected by: alcohol, caffeine, illness, medications, fitness
- Sleep data affected by: travel, shift work, young children
- Recovery affected by: training cycles, life stress

OUTPUT FORMAT (JSON):
{
  "domain": "biometrics",
  "analysis": {
    "neuroticism": {
      "direction": "low",
      "confidence": 0.75,
      "evidenceItems": [
        {
          "feature": "hrv_baseline",
          "observation": "HRV baseline 85ms (above average)",
          "citation": "Zohar et al. 2013",
          "effectSize": "small",
          "r": -0.21
        }
      ]
    }
  },
  "physiologicalContext": {
    "hrvRange": "above average for age group",
    "chronotype": "morning",
    "stressIndicators": []
  },
  "limitations": ["Only 7 days of data - pattern confidence limited"]
}`;
  }

  /**
   * Analyze physiological context for proper interpretation
   */
  analyzePhysiologicalContext(whoopData) {
    const context = {
      hrvRange: 'unknown',
      chronotype: 'unknown',
      sleepDebt: false,
      recoveryTrend: 'stable',
      stressIndicators: []
    };

    // Analyze HRV baseline
    if (whoopData.recoveries?.length > 0) {
      const hrvValues = whoopData.recoveries
        .map(r => r.hrv || r.hrv_rmssd_milli)
        .filter(h => h > 0);

      if (hrvValues.length > 0) {
        const avgHrv = hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length;

        // Classify HRV (using 30-39 age bracket as default)
        const norms = this.ageHrvNorms['30-39'];
        if (avgHrv >= norms.high) context.hrvRange = 'above average';
        else if (avgHrv >= norms.average) context.hrvRange = 'average';
        else context.hrvRange = 'below average';

        // Check for declining trend (potential stress)
        if (hrvValues.length >= 7) {
          const recentAvg = hrvValues.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
          const olderAvg = hrvValues.slice(-3).reduce((a, b) => a + b, 0) / 3;
          if (recentAvg < olderAvg * 0.9) {
            context.stressIndicators.push('HRV declining trend detected');
          }
        }
      }
    }

    // Analyze chronotype from sleep data
    if (whoopData.sleeps?.length >= 7) {
      const bedtimes = whoopData.sleeps
        .filter(s => s.start_time || s.start)
        .map(s => {
          const date = new Date(s.start_time || s.start);
          let minutes = date.getHours() * 60 + date.getMinutes();
          if (minutes < 360) minutes += 1440; // Adjust past midnight
          return minutes;
        });

      if (bedtimes.length > 0) {
        const avgBedtime = bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length;

        // Convert to hours for interpretation
        const adjustedMinutes = avgBedtime >= 1440 ? avgBedtime - 1440 : avgBedtime;
        const bedtimeHour = adjustedMinutes / 60;

        if (bedtimeHour < 22.5) context.chronotype = 'morning (early bird)';
        else if (bedtimeHour < 23.5) context.chronotype = 'intermediate';
        else context.chronotype = 'evening (night owl)';
      }

      // Check for sleep debt
      const sleepDurations = whoopData.sleeps
        .map(s => s.duration_minutes || s.quality_duration || 0)
        .filter(d => d > 0);

      if (sleepDurations.length > 0) {
        const avgSleep = sleepDurations.reduce((a, b) => a + b, 0) / sleepDurations.length;
        if (avgSleep < 360) { // Less than 6 hours
          context.sleepDebt = true;
          context.stressIndicators.push('Potential sleep debt (avg < 6 hours)');
        }
      }
    }

    // Analyze recovery trend
    if (whoopData.recoveries?.length >= 7) {
      const recoveryScores = whoopData.recoveries
        .map(r => r.score || r.recovery_score || 0);

      const recentAvg = recoveryScores.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
      const olderAvg = recoveryScores.slice(-3).reduce((a, b) => a + b, 0) / 3;

      if (recentAvg > olderAvg * 1.1) context.recoveryTrend = 'improving';
      else if (recentAvg < olderAvg * 0.9) context.recoveryTrend = 'declining';
    }

    return context;
  }

  /**
   * Main analysis method
   */
  async analyze(userId, whoopData) {
    console.log(`💪 [BiometricsSpecialistAgent] Analyzing biometric data for user ${userId}`);

    if (!whoopData) {
      return {
        success: false,
        domain: 'biometrics',
        error: 'No Whoop data provided'
      };
    }

    try {
      // Extract features using behavioralLearningService
      const features = extractWhoopFeatures(whoopData);

      if (!features || Object.keys(features).length === 0) {
        return {
          success: false,
          domain: 'biometrics',
          error: 'Could not extract features from Whoop data'
        };
      }

      // Analyze physiological context
      const physiologicalContext = this.analyzePhysiologicalContext(whoopData);

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
        domain: 'biometrics',
        domainLabel: 'Biometrics & Psychophysiology',
        userId,
        inferences,
        evidenceItems,
        physiologicalContext,
        limitations: this.identifyLimitations(whoopData, features),
        methodologyNotes,
        citations,
        featuresExtracted: Object.keys(features).filter(k => k !== '_rawValues').length,
        rawFeatures: features
      };

    } catch (error) {
      console.error(`❌ [BiometricsSpecialistAgent] Analysis failed:`, error);
      return {
        success: false,
        domain: 'biometrics',
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
  identifyLimitations(whoopData, features) {
    const limitations = [];

    // Check data duration
    if (whoopData.recoveries?.length < 7) {
      limitations.push('Less than 7 days of recovery data - patterns may be unreliable');
    }

    if (whoopData.sleeps?.length < 7) {
      limitations.push('Less than 7 days of sleep data - chronotype inference limited');
    }

    // Check for missing HRV data
    const hrvValues = whoopData.recoveries
      ?.map(r => r.hrv || r.hrv_rmssd_milli)
      .filter(h => h > 0) || [];

    if (hrvValues.length < 7) {
      limitations.push('Insufficient HRV data for reliable analysis');
    }

    // Check workout data
    if (!whoopData.workouts?.length || whoopData.workouts.length < 3) {
      limitations.push('Limited workout data - activity regularity analysis limited');
    }

    // Note about confounding factors
    limitations.push('Note: HRV affected by factors not captured (caffeine, alcohol, illness, medications)');

    return limitations;
  }
}

export default BiometricsSpecialistAgent;
