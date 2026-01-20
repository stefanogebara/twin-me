/**
 * Professional Universe Builder
 * Aggregates professional data from LinkedIn, CV, Origin, Calendar, and GitHub
 * to build the professional component of the Soul Signature
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

let supabase = null;
function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

class ProfessionalUniverseBuilder {
  /**
   * Build professional universe from all professional data sources
   */
  async buildProfessionalUniverse(userId) {
    console.log(`[ProfessionalUniverse] Building professional universe for user: ${userId}`);

    try {
      // 1. Get LinkedIn data
      const linkedInData = await this.getLinkedInData(userId);

      // 2. Get Origin data (career, education, values)
      const originData = await this.getOriginData(userId);

      // 3. Get GitHub data (for technical professionals)
      const githubData = await this.getGitHubData(userId);

      // 4. Get Calendar patterns (work style insights)
      const calendarPatterns = await this.getCalendarPatterns(userId);

      // Check if we have any data
      const hasData = linkedInData || originData || githubData || calendarPatterns;

      if (!hasData) {
        return {
          available: false,
          message: 'No professional data available. Connect LinkedIn or provide Origin data.'
        };
      }

      // 5. Build career trajectory
      const careerTrajectory = this.buildCareerTrajectory(linkedInData, originData);

      // 6. Analyze professional style
      const professionalStyle = await this.analyzeProfessionalStyle(
        linkedInData,
        originData,
        githubData,
        calendarPatterns
      );

      // 7. Extract industry expertise
      const industryExpertise = this.extractIndustryExpertise(linkedInData, originData, githubData);

      // 8. Assess growth mindset
      const growthMindset = await this.assessGrowthMindset(originData, githubData);

      // 9. Build complete professional universe
      const professionalUniverse = {
        available: true,
        career_trajectory: careerTrajectory,
        professional_style: professionalStyle,
        industry_expertise: industryExpertise,
        growth_mindset: growthMindset,
        origin_context: this.extractOriginContext(originData),
        data_sources: this.getDataSources(linkedInData, originData, githubData, calendarPatterns),
        completeness_score: this.calculateCompletenessScore(linkedInData, originData, githubData, calendarPatterns),
        generated_at: new Date().toISOString()
      };

      // 10. Store professional universe
      await this.storeProfessionalUniverse(userId, professionalUniverse);

      console.log('[ProfessionalUniverse] Professional universe built successfully');
      return professionalUniverse;
    } catch (error) {
      console.error('[ProfessionalUniverse] Error building professional universe:', error);
      throw error;
    }
  }

  /**
   * Get LinkedIn data from database
   */
  async getLinkedInData(userId) {
    try {
      const { data, error } = await getSupabaseClient()
        .from('user_platform_data')
        .select('platform, data_type, raw_data')
        .eq('user_id', userId)
        .eq('platform', 'linkedin');

      if (error || !data || data.length === 0) {
        return null;
      }

      // Parse LinkedIn data
      const profile = data.find(d => d.data_type === 'profile');

      return {
        profile: profile?.raw_data || null,
        available: true
      };
    } catch (error) {
      console.error('[ProfessionalUniverse] Error fetching LinkedIn data:', error);
      return null;
    }
  }

  /**
   * Get Origin data from database
   */
  async getOriginData(userId) {
    try {
      const { data, error } = await getSupabaseClient()
        .from('origin_data')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('[ProfessionalUniverse] Error fetching origin data:', error);
        return null;
      }

      return data || null;
    } catch (error) {
      console.error('[ProfessionalUniverse] Exception fetching origin data:', error);
      return null;
    }
  }

  /**
   * Get GitHub data from database
   */
  async getGitHubData(userId) {
    try {
      const { data, error } = await getSupabaseClient()
        .from('user_platform_data')
        .select('platform, data_type, raw_data')
        .eq('user_id', userId)
        .eq('platform', 'github');

      if (error || !data || data.length === 0) {
        return null;
      }

      // Group GitHub data by type
      const repos = data.filter(d => d.data_type === 'repository');
      const commits = data.filter(d => d.data_type === 'commit');
      const profile = data.find(d => d.data_type === 'profile');

      return {
        repositories: repos.map(r => r.raw_data),
        commits: commits.map(c => c.raw_data),
        profile: profile?.raw_data || null,
        available: true
      };
    } catch (error) {
      console.error('[ProfessionalUniverse] Error fetching GitHub data:', error);
      return null;
    }
  }

  /**
   * Get Calendar patterns from database
   */
  async getCalendarPatterns(userId) {
    try {
      const { data, error } = await getSupabaseClient()
        .from('user_platform_data')
        .select('platform, data_type, raw_data')
        .eq('user_id', userId)
        .eq('platform', 'google_calendar');

      if (error || !data || data.length === 0) {
        return null;
      }

      const events = data.filter(d => d.data_type === 'event');

      return {
        events: events.map(e => e.raw_data),
        available: true
      };
    } catch (error) {
      console.error('[ProfessionalUniverse] Error fetching calendar data:', error);
      return null;
    }
  }

  /**
   * Build career trajectory from LinkedIn and Origin data
   */
  buildCareerTrajectory(linkedInData, originData) {
    const trajectory = {
      current_stage: null,
      industry: null,
      years_experience: null,
      career_goals: null,
      progression_indicators: []
    };

    // From Origin data (user-provided)
    if (originData) {
      trajectory.current_stage = originData.career_stage;
      trajectory.industry = originData.industry;
      trajectory.years_experience = originData.years_experience;
      trajectory.career_goals = originData.career_goals;
    }

    // From LinkedIn data (if available - note: basic profile only via OpenID Connect)
    if (linkedInData?.profile) {
      // LinkedIn basic profile may include industry info
      if (!trajectory.industry && linkedInData.profile.industry) {
        trajectory.industry = linkedInData.profile.industry;
      }
    }

    // Calculate progression indicators
    if (trajectory.years_experience && trajectory.current_stage) {
      trajectory.progression_indicators.push(
        this.assessCareerProgression(trajectory.years_experience, trajectory.current_stage)
      );
    }

    return trajectory;
  }

  /**
   * Assess career progression based on experience and stage
   */
  assessCareerProgression(yearsExperience, careerStage) {
    const stageYearsMap = {
      student: 0,
      early_career: 3,
      mid_career: 8,
      senior: 12,
      executive: 15,
      entrepreneur: null // Variable
    };

    const expectedYears = stageYearsMap[careerStage];

    if (expectedYears === null || expectedYears === undefined) {
      return { type: 'unique_path', description: 'Non-traditional career progression' };
    }

    if (yearsExperience < expectedYears - 2) {
      return { type: 'fast_track', description: 'Accelerated career progression' };
    } else if (yearsExperience > expectedYears + 3) {
      return { type: 'deep_expertise', description: 'Deep expertise development path' };
    }

    return { type: 'standard', description: 'Typical career progression' };
  }

  /**
   * Analyze professional style from all data sources
   */
  async analyzeProfessionalStyle(linkedInData, originData, githubData, calendarPatterns) {
    const style = {
      work_preference: null,
      collaboration_style: 'unknown',
      technical_depth: 'unknown',
      communication_approach: 'unknown'
    };

    // From Origin data
    if (originData) {
      style.work_preference = originData.work_style;
      style.learning_style = originData.learning_style;
    }

    // From GitHub data (technical professionals)
    if (githubData?.repositories?.length > 0) {
      const avgStars = githubData.repositories.reduce((sum, r) => sum + (r.stargazers_count || 0), 0) / githubData.repositories.length;
      const hasCollaborative = githubData.repositories.some(r => r.fork || r.collaborators_count > 1);

      style.technical_depth = githubData.repositories.length > 10 ? 'deep' : githubData.repositories.length > 3 ? 'moderate' : 'emerging';
      style.collaboration_style = hasCollaborative ? 'collaborative' : 'independent';

      if (avgStars > 10) {
        style.impact_indicator = 'community_influencer';
      }
    }

    // From Calendar patterns
    if (calendarPatterns?.events?.length > 0) {
      const meetingCount = calendarPatterns.events.length;
      const avgPerWeek = meetingCount / 4; // Assuming 4 weeks of data

      if (avgPerWeek > 20) {
        style.collaboration_style = 'highly_collaborative';
      } else if (avgPerWeek > 10) {
        style.collaboration_style = 'balanced';
      } else {
        style.collaboration_style = 'focused_independent';
      }
    }

    return style;
  }

  /**
   * Extract industry expertise from professional data
   */
  extractIndustryExpertise(linkedInData, originData, githubData) {
    const expertise = {
      primary_industry: null,
      technical_skills: [],
      domain_knowledge: [],
      expertise_level: 'unknown'
    };

    // From Origin data
    if (originData) {
      expertise.primary_industry = originData.industry;
      if (originData.field_of_study) {
        expertise.domain_knowledge.push(originData.field_of_study);
      }
    }

    // From GitHub (programming languages and technologies)
    if (githubData?.repositories?.length > 0) {
      const languages = new Map();

      githubData.repositories.forEach(repo => {
        if (repo.language) {
          languages.set(repo.language, (languages.get(repo.language) || 0) + 1);
        }
      });

      // Sort by frequency
      expertise.technical_skills = Array.from(languages.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([lang]) => lang);

      // Assess expertise level
      if (githubData.repositories.length > 20) {
        expertise.expertise_level = 'expert';
      } else if (githubData.repositories.length > 5) {
        expertise.expertise_level = 'proficient';
      } else {
        expertise.expertise_level = 'developing';
      }
    }

    return expertise;
  }

  /**
   * Assess growth mindset from Origin and GitHub data
   */
  async assessGrowthMindset(originData, githubData) {
    const growthIndicators = {
      learning_orientation: 'unknown',
      adaptability: 'unknown',
      goal_clarity: 'unknown',
      indicators: []
    };

    // From Origin data
    if (originData) {
      // Learning style indicates learning orientation
      if (originData.learning_style) {
        growthIndicators.learning_orientation = 'active';
        growthIndicators.indicators.push(`Identified learning style: ${originData.learning_style}`);
      }

      // Career goals indicate goal clarity
      if (originData.career_goals) {
        growthIndicators.goal_clarity = 'high';
        growthIndicators.indicators.push('Has articulated career goals');
      }

      // Core values related to growth
      if (originData.core_values?.includes('growth') || originData.core_values?.includes('knowledge')) {
        growthIndicators.indicators.push('Values personal growth and learning');
      }
    }

    // From GitHub (continuous learning indicators)
    if (githubData?.repositories?.length > 0) {
      // Check for diverse language usage (learning new technologies)
      const languages = new Set(githubData.repositories.map(r => r.language).filter(Boolean));
      if (languages.size > 3) {
        growthIndicators.adaptability = 'high';
        growthIndicators.indicators.push('Works across multiple programming languages');
      }

      // Check for recent activity (continued learning)
      const recentRepos = githubData.repositories.filter(r => {
        const updated = new Date(r.updated_at);
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        return updated > threeMonthsAgo;
      });

      if (recentRepos.length > 0) {
        growthIndicators.indicators.push('Active in technical development');
      }
    }

    // Determine overall assessment
    const indicatorCount = growthIndicators.indicators.length;
    growthIndicators.overall = indicatorCount > 3 ? 'strong' : indicatorCount > 1 ? 'moderate' : 'emerging';

    return growthIndicators;
  }

  /**
   * Extract origin context for soul signature integration
   */
  extractOriginContext(originData) {
    if (!originData) {
      return null;
    }

    return {
      geographic: {
        birthplace: originData.birthplace_country
          ? `${originData.birthplace_city || ''} ${originData.birthplace_country}`.trim()
          : null,
        current_location: originData.current_country
          ? `${originData.current_city || ''} ${originData.current_country}`.trim()
          : null,
        cultural_influences: originData.cultural_background || [],
        languages: originData.languages_spoken || [],
        mobility_score: originData.places_lived?.length || 0
      },
      education: {
        level: originData.highest_education,
        field: originData.field_of_study,
        learning_style: originData.learning_style
      },
      values: {
        core_values: originData.core_values || [],
        life_priorities: originData.life_priorities || {},
        life_motto: originData.life_motto
      },
      personal: {
        defining_experiences: originData.defining_experiences
      }
    };
  }

  /**
   * Get list of available data sources
   */
  getDataSources(linkedInData, originData, githubData, calendarPatterns) {
    const sources = [];

    if (linkedInData?.available) sources.push('linkedin');
    if (originData) sources.push('origin');
    if (githubData?.available) sources.push('github');
    if (calendarPatterns?.available) sources.push('calendar');

    return sources;
  }

  /**
   * Calculate completeness score for professional universe
   */
  calculateCompletenessScore(linkedInData, originData, githubData, calendarPatterns) {
    let score = 0;
    const weights = {
      origin: 0.4, // Origin data is most important (user-provided context)
      linkedin: 0.25,
      github: 0.2,
      calendar: 0.15
    };

    // Origin data completeness
    if (originData) {
      const originFields = [
        originData.career_stage,
        originData.industry,
        originData.highest_education,
        originData.core_values?.length > 0,
        originData.career_goals
      ];
      const originCompleteness = originFields.filter(Boolean).length / originFields.length;
      score += originCompleteness * weights.origin;
    }

    // LinkedIn completeness
    if (linkedInData?.available) {
      score += weights.linkedin;
    }

    // GitHub completeness
    if (githubData?.available) {
      const hasRepos = githubData.repositories?.length > 0;
      const hasProfile = !!githubData.profile;
      score += ((hasRepos ? 0.7 : 0) + (hasProfile ? 0.3 : 0)) * weights.github;
    }

    // Calendar completeness
    if (calendarPatterns?.available) {
      score += weights.calendar;
    }

    return Math.round(score * 100) / 100;
  }

  /**
   * Store professional universe in database
   */
  async storeProfessionalUniverse(userId, professionalUniverse) {
    try {
      // Store in soul_signature_profile as professional_universe field
      const { error } = await getSupabaseClient()
        .from('soul_signature_profile')
        .upsert({
          user_id: userId,
          professional_universe: professionalUniverse,
          last_updated: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error('[ProfessionalUniverse] Error storing professional universe:', error);
      }
    } catch (error) {
      console.error('[ProfessionalUniverse] Exception storing professional universe:', error);
    }
  }

  /**
   * Generate AI-powered professional insights
   */
  async generateProfessionalInsights(professionalUniverse) {
    if (!professionalUniverse.available) {
      return null;
    }

    try {
      const context = JSON.stringify({
        career: professionalUniverse.career_trajectory,
        style: professionalUniverse.professional_style,
        expertise: professionalUniverse.industry_expertise,
        growth: professionalUniverse.growth_mindset,
        origin: professionalUniverse.origin_context
      }, null, 2);

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `Based on this professional profile, provide 3 key insights about this person's professional identity and potential. Be specific and insightful.

Professional Profile:
${context}

Respond with a JSON object containing:
{
  "professional_archetype": "A 2-3 word descriptor",
  "key_strengths": ["strength1", "strength2", "strength3"],
  "growth_opportunities": ["opportunity1", "opportunity2"],
  "unique_positioning": "One sentence about what makes this professional unique"
}

Respond ONLY with valid JSON.`
        }]
      });

      const responseText = message.content[0].text;
      return JSON.parse(responseText);
    } catch (error) {
      console.error('[ProfessionalUniverse] Error generating AI insights:', error);
      return null;
    }
  }
}

export default new ProfessionalUniverseBuilder();
