/**
 * PersonalityAnalysisEngine - AI-Powered Personality Extraction
 * Analyzes raw data to extract deep insights about user personality and behavior
 */

import {
  RawDataPoint,
  PersonalityInsight,
  WritingStyle,
  CommunicationPattern,
  ExpertiseArea,
  InsightType,
  PersonalityTrend,
  TwinEvolutionEntry
} from '@/types/data-integration';

// ====================================================================
// CORE ANALYSIS ENGINE
// ====================================================================

export class PersonalityAnalysisEngine {
  private readonly anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  private readonly openaiApiKey = process.env.OPENAI_API_KEY;

  async analyzePersonality(
    userId: string,
    rawData: RawDataPoint[]
  ): Promise<PersonalityInsight[]> {
    console.log(`🧠 Starting personality analysis for user ${userId} with ${rawData.length} data points`);

    const insights: PersonalityInsight[] = [];

    // 1. Analyze writing style from text content
    const textData = this.extractTextContent(rawData);
    if (textData.length > 0) {
      const writingStyle = await this.analyzeWritingStyle(textData);
      insights.push(this.createInsight(userId, 'writing_style', writingStyle, textData.length));
    }

    // 2. Analyze communication patterns
    const messageData = this.extractCommunicationData(rawData);
    if (messageData.length > 0) {
      const commPattern = await this.analyzeCommunicationPatterns(messageData);
      insights.push(this.createInsight(userId, 'communication_pattern', commPattern, messageData.length));
    }

    // 3. Extract expertise areas
    const expertiseAreas = await this.extractExpertiseAreas(textData);
    expertiseAreas.forEach(expertise => {
      insights.push(this.createInsight(userId, 'expertise_area', expertise, textData.length));
    });

    // 4. Identify interests and hobbies
    const interests = await this.identifyInterests(textData);
    interests.forEach(interest => {
      insights.push(this.createInsight(userId, 'interest', interest, textData.length));
    });

    // 5. Analyze work patterns (from calendar and communication timing)
    const workPattern = await this.analyzeWorkPatterns(rawData);
    if (workPattern) {
      insights.push(this.createInsight(userId, 'work_pattern', workPattern, rawData.length));
    }

    // 6. Detect emotional tone and empathy levels
    const emotionalProfile = await this.analyzeEmotionalTone(textData);
    insights.push(this.createInsight(userId, 'emotional_tone', emotionalProfile, textData.length));

    console.log(`✅ Generated ${insights.length} personality insights`);
    return insights;
  }

  // ====================================================================
  // WRITING STYLE ANALYSIS
  // ====================================================================

  private async analyzeWritingStyle(textData: string[]): Promise<WritingStyle> {
    const sampleTexts = textData.slice(0, 100); // Analyze first 100 texts for speed
    const combinedText = sampleTexts.join('\n\n');

    try {
      // Use Claude for advanced personality analysis
      const analysis = await this.callAnthropicAPI(
        this.buildWritingStylePrompt(combinedText)
      );

      return this.parseWritingStyleResponse(analysis);
    } catch (error) {
      console.warn('Claude analysis failed, using fallback analysis:', error);
      return this.fallbackWritingStyleAnalysis(sampleTexts);
    }
  }

  private buildWritingStylePrompt(text: string): string {
    return `Analyze the following text samples to determine the author's writing style and personality traits. Focus on:

1. Communication tone (professional, casual, friendly, authoritative, humorous)
2. Formality level (0-1 scale)
3. Use of humor and playfulness
4. Empathy and emotional intelligence
5. Directness vs diplomacy
6. Vocabulary sophistication
7. Sentence structure complexity
8. Emoji and informal expression usage

Text samples:
${text.substring(0, 4000)} ${text.length > 4000 ? '...[truncated]' : ''}

Return your analysis as a JSON object with these exact fields:
{
  "tone": "professional|casual|friendly|authoritative|humorous",
  "formality": 0.7,
  "hasHumor": true,
  "empathyLevel": 0.8,
  "directness": 0.6,
  "vocabulary": ["innovative", "collaboration", "efficient"],
  "sentenceStructure": "short|medium|complex",
  "emojiUsage": 0.3
}`;
  }

  private async callAnthropicAPI(prompt: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.anthropicApiKey || '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  private parseWritingStyleResponse(response: string): WritingStyle {
    try {
      const parsed = JSON.parse(response);
      return {
        tone: parsed.tone || 'professional',
        formality: parsed.formality || 0.5,
        hasHumor: parsed.hasHumor || false,
        empathyLevel: parsed.empathyLevel || 0.5,
        directness: parsed.directness || 0.5,
        vocabulary: parsed.vocabulary || [],
        sentenceStructure: parsed.sentenceStructure || 'medium',
        emojiUsage: parsed.emojiUsage || 0
      };
    } catch {
      // If parsing fails, return default style
      return this.getDefaultWritingStyle();
    }
  }

  private fallbackWritingStyleAnalysis(texts: string[]): WritingStyle {
    const combinedText = texts.join(' ').toLowerCase();
    const wordCount = combinedText.split(' ').length;

    // Simple pattern matching for style detection
    const formalWords = ['therefore', 'however', 'furthermore', 'consequently', 'regarding'];
    const casualWords = ['gonna', 'wanna', 'yeah', 'cool', 'awesome', 'hey'];
    const humorIndicators = ['lol', 'haha', '😂', '😄', 'funny', 'joke'];
    const empathyWords = ['understand', 'feel', 'sorry', 'appreciate', 'thanks'];

    const formalityScore = formalWords.filter(word => combinedText.includes(word)).length / wordCount;
    const casualScore = casualWords.filter(word => combinedText.includes(word)).length / wordCount;
    const humorScore = humorIndicators.filter(indicator => combinedText.includes(indicator)).length;
    const empathyScore = empathyWords.filter(word => combinedText.includes(word)).length / wordCount;

    return {
      tone: formalityScore > casualScore ? 'professional' : 'casual',
      formality: Math.max(0, Math.min(1, formalityScore * 10)),
      hasHumor: humorScore > 0,
      empathyLevel: Math.max(0, Math.min(1, empathyScore * 20)),
      directness: 0.6, // default
      vocabulary: this.extractCommonWords(combinedText),
      sentenceStructure: 'medium',
      emojiUsage: (combinedText.match(/[😀-🿿]/g) || []).length / wordCount
    };
  }

  // ====================================================================
  // COMMUNICATION PATTERN ANALYSIS
  // ====================================================================

  private async analyzeCommunicationPatterns(messageData: any[]): Promise<CommunicationPattern> {
    // Analyze timing patterns
    const responseTimes = this.calculateResponseTimes(messageData);
    const messageLengths = messageData.map(msg => (msg.content.text || '').length);
    const timeDistribution = this.analyzeActiveHours(messageData);

    return {
      avgResponseTime: responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 120, // default 2 hours
      avgMessageLength: messageLengths.length > 0
        ? messageLengths.reduce((a, b) => a + b, 0) / messageLengths.length
        : 100,
      questionFrequency: this.calculateQuestionFrequency(messageData),
      supportiveness: this.calculateSupportiveness(messageData),
      initiationRate: this.calculateInitiationRate(messageData),
      preferredChannels: this.identifyPreferredChannels(messageData),
      activeHours: timeDistribution
    };
  }

  private calculateResponseTimes(messages: any[]): number[] {
    // Simplified - in production, would analyze conversation threads
    return [30, 60, 90, 120, 180]; // sample response times in minutes
  }

  private calculateQuestionFrequency(messages: any[]): number {
    const questionCount = messages.filter(msg =>
      (msg.content.text || '').includes('?')
    ).length;
    return messages.length > 0 ? questionCount / messages.length : 0;
  }

  private calculateSupportiveness(messages: any[]): number {
    const supportWords = ['help', 'support', 'thanks', 'great job', 'well done', 'appreciate'];
    const supportiveMessages = messages.filter(msg =>
      supportWords.some(word => (msg.content.text || '').toLowerCase().includes(word))
    ).length;
    return messages.length > 0 ? supportiveMessages / messages.length : 0;
  }

  private calculateInitiationRate(messages: any[]): number {
    // Simplified - in production would analyze thread starters
    return 0.3; // 30% of conversations initiated by user
  }

  private identifyPreferredChannels(messages: any[]): string[] {
    const channels = messages.map(msg => msg.metadata?.channel || msg.dataType);
    const channelCounts = channels.reduce((acc, channel) => {
      acc[channel] = (acc[channel] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(channelCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([channel]) => channel);
  }

  private analyzeActiveHours(messages: any[]): { start: number; end: number } {
    const hours = messages.map(msg => new Date(msg.sourceTimestamp).getHours());
    const hourCounts = hours.reduce((acc, hour) => {
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    // Find peak activity window
    const sortedHours = Object.entries(hourCounts)
      .sort(([,a], [,b]) => b - a)
      .map(([hour]) => parseInt(hour));

    return {
      start: Math.min(...sortedHours.slice(0, 8)), // Most active 8-hour window start
      end: Math.max(...sortedHours.slice(0, 8)) // Most active 8-hour window end
    };
  }

  // ====================================================================
  // EXPERTISE AREA EXTRACTION
  // ====================================================================

  private async extractExpertiseAreas(textData: string[]): Promise<ExpertiseArea[]> {
    const combinedText = textData.join(' ').toLowerCase();

    // Domain keywords for expertise detection
    const domainKeywords = {
      'software_engineering': ['code', 'programming', 'software', 'development', 'api', 'database', 'algorithm'],
      'data_science': ['data', 'analytics', 'machine learning', 'ai', 'statistics', 'python', 'analysis'],
      'business_strategy': ['strategy', 'business', 'market', 'revenue', 'growth', 'roi', 'kpi'],
      'design': ['design', 'ui', 'ux', 'user experience', 'interface', 'visual', 'creative'],
      'marketing': ['marketing', 'brand', 'campaign', 'social media', 'engagement', 'conversion'],
      'education': ['teaching', 'learning', 'student', 'curriculum', 'education', 'training'],
      'finance': ['finance', 'investment', 'accounting', 'budget', 'financial', 'money']
    };

    const expertiseAreas: ExpertiseArea[] = [];

    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      const matchCount = keywords.filter(keyword => combinedText.includes(keyword)).length;
      const confidence = Math.min(1, matchCount / keywords.length);

      if (confidence > 0.2) { // Only include if there's reasonable evidence
        expertiseAreas.push({
          domain,
          confidenceLevel: confidence,
          keywords: keywords.filter(keyword => combinedText.includes(keyword)),
          context: this.determineExpertiseContext(domain, textData),
          recentActivity: Math.random(), // Would analyze recent mentions
          teachingAbility: Math.min(1, confidence + Math.random() * 0.3)
        });
      }
    }

    return expertiseAreas.sort((a, b) => b.confidenceLevel - a.confidenceLevel).slice(0, 5);
  }

  private determineExpertiseContext(domain: string, textData: string[]): 'work' | 'personal' | 'academic' {
    // Simple heuristic - in production would be more sophisticated
    const workIndicators = textData.join(' ').toLowerCase();
    if (workIndicators.includes('work') || workIndicators.includes('job') || workIndicators.includes('company')) {
      return 'work';
    }
    if (workIndicators.includes('research') || workIndicators.includes('study') || workIndicators.includes('university')) {
      return 'academic';
    }
    return 'personal';
  }

  // ====================================================================
  // INTEREST IDENTIFICATION
  // ====================================================================

  private async identifyInterests(textData: string[]): Promise<any[]> {
    const combinedText = textData.join(' ').toLowerCase();

    const interestCategories = {
      technology: ['tech', 'gadgets', 'software', 'innovation', 'ai', 'robotics'],
      sports: ['football', 'basketball', 'tennis', 'running', 'fitness', 'exercise'],
      arts: ['music', 'painting', 'photography', 'movies', 'books', 'theater'],
      travel: ['travel', 'vacation', 'countries', 'culture', 'adventure', 'explore'],
      food: ['cooking', 'restaurant', 'food', 'recipe', 'cuisine', 'chef'],
      gaming: ['games', 'gaming', 'playstation', 'xbox', 'nintendo', 'streaming']
    };

    const interests: any[] = [];

    for (const [category, keywords] of Object.entries(interestCategories)) {
      const matchCount = keywords.filter(keyword => combinedText.includes(keyword)).length;
      const intensity = Math.min(1, matchCount / keywords.length);

      if (intensity > 0.1) {
        interests.push({
          category,
          intensity,
          keywords: keywords.filter(keyword => combinedText.includes(keyword)),
          recentEngagement: Math.random(),
          socialSharing: Math.random() * 0.5 // How much they share about this interest
        });
      }
    }

    return interests.sort((a, b) => b.intensity - a.intensity).slice(0, 8);
  }

  // ====================================================================
  // WORK PATTERN ANALYSIS
  // ====================================================================

  private async analyzeWorkPatterns(rawData: RawDataPoint[]): Promise<any> {
    const calendarEvents = rawData.filter(d => d.dataType === 'calendar_event');
    const emails = rawData.filter(d => d.dataType === 'email');
    const messages = rawData.filter(d => d.dataType === 'slack_message');

    if (calendarEvents.length === 0 && emails.length === 0) {
      return null; // Not enough data
    }

    return {
      workingHours: this.calculateWorkingHours([...calendarEvents, ...emails, ...messages]),
      meetingFrequency: calendarEvents.length / 7, // per week
      emailVolume: emails.length / 7, // per week
      collaborationLevel: this.calculateCollaborationLevel(calendarEvents),
      workLifeBalance: this.assessWorkLifeBalance(rawData),
      productivity_peaks: this.identifyProductivityPeaks([...emails, ...messages])
    };
  }

  private calculateWorkingHours(activities: RawDataPoint[]): { start: number; end: number } {
    const hours = activities.map(activity => new Date(activity.sourceTimestamp).getHours());
    return {
      start: Math.min(...hours),
      end: Math.max(...hours)
    };
  }

  private calculateCollaborationLevel(calendarEvents: RawDataPoint[]): number {
    const meetingsWithOthers = calendarEvents.filter(event =>
      (event.content.attendees || []).length > 1
    ).length;
    return calendarEvents.length > 0 ? meetingsWithOthers / calendarEvents.length : 0;
  }

  private assessWorkLifeBalance(rawData: RawDataPoint[]): number {
    const workData = rawData.filter(d => d.metadata?.context === 'work' || d.dataType === 'calendar_event');
    const personalData = rawData.filter(d => d.metadata?.context === 'personal');

    const workRatio = workData.length / rawData.length;
    return 1 - Math.abs(workRatio - 0.7); // Ideal is ~70% work, 30% personal
  }

  private identifyProductivityPeaks(activities: RawDataPoint[]): number[] {
    // Analyze activity by hour of day
    const hourlyActivity = new Array(24).fill(0);
    activities.forEach(activity => {
      const hour = new Date(activity.sourceTimestamp).getHours();
      hourlyActivity[hour]++;
    });

    // Find peak hours
    const maxActivity = Math.max(...hourlyActivity);
    return hourlyActivity
      .map((count, hour) => ({ hour, count }))
      .filter(({ count }) => count > maxActivity * 0.7)
      .map(({ hour }) => hour);
  }

  // ====================================================================
  // EMOTIONAL TONE ANALYSIS
  // ====================================================================

  private async analyzeEmotionalTone(textData: string[]): Promise<any> {
    const combinedText = textData.join(' ').toLowerCase();

    // Simple sentiment analysis
    const positiveWords = ['great', 'awesome', 'excellent', 'love', 'amazing', 'perfect', 'wonderful'];
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'horrible', 'worst', 'annoying'];
    const empathyWords = ['understand', 'feel', 'sorry', 'appreciate', 'thank', 'grateful'];

    const positiveCount = positiveWords.filter(word => combinedText.includes(word)).length;
    const negativeCount = negativeWords.filter(word => combinedText.includes(word)).length;
    const empathyCount = empathyWords.filter(word => combinedText.includes(word)).length;

    const totalWords = combinedText.split(' ').length;

    return {
      sentiment: positiveCount > negativeCount ? 'positive' : 'negative',
      sentimentStrength: Math.abs(positiveCount - negativeCount) / totalWords,
      empathy: empathyCount / totalWords,
      emotionalRange: 'stable', // Would analyze variance in production
      expressiveness: (combinedText.match(/[!?]/g) || []).length / totalWords,
      optimism: positiveCount / (positiveCount + negativeCount + 1)
    };
  }

  // ====================================================================
  // HELPER METHODS
  // ====================================================================

  private extractTextContent(rawData: RawDataPoint[]): string[] {
    return rawData
      .filter(d => ['email', 'slack_message', 'teams_message', 'social_post'].includes(d.dataType))
      .map(d => d.content.text || d.content.body || d.content.subject || '')
      .filter(text => text.length > 10); // Filter out very short texts
  }

  private extractCommunicationData(rawData: RawDataPoint[]): any[] {
    return rawData.filter(d =>
      ['email', 'slack_message', 'teams_message'].includes(d.dataType)
    );
  }

  private extractCommonWords(text: string): string[] {
    const words = text.split(' ')
      .filter(word => word.length > 4)
      .filter(word => !['this', 'that', 'with', 'have', 'will', 'from', 'they'].includes(word));

    const wordCounts = words.reduce((acc, word) => {
      acc[word] = (acc[word] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(wordCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);
  }

  private createInsight(
    userId: string,
    insightType: InsightType,
    insightData: any,
    sourceDataCount: number
  ): PersonalityInsight {
    return {
      id: crypto.randomUUID(),
      userId,
      insightType,
      insightData,
      confidenceScore: Math.min(1, Math.max(0.3, sourceDataCount / 50)), // More data = higher confidence
      sourceDataCount,
      sourceDataIds: [], // Would be populated with actual IDs
      validFrom: new Date(),
      analysisMethod: 'ai_analysis',
      lastUpdated: new Date(),
      updateTrigger: 'new_data'
    };
  }

  private getDefaultWritingStyle(): WritingStyle {
    return {
      tone: 'professional',
      formality: 0.6,
      hasHumor: false,
      empathyLevel: 0.5,
      directness: 0.5,
      vocabulary: [],
      sentenceStructure: 'medium',
      emojiUsage: 0.1
    };
  }

  // ====================================================================
  // PERSONALITY DRIFT DETECTION
  // ====================================================================

  async detectPersonalityDrift(
    userId: string,
    oldInsights: PersonalityInsight[],
    newData: RawDataPoint[]
  ): Promise<TwinEvolutionEntry[]> {
    console.log(`🔄 Analyzing personality drift for user ${userId}`);

    const newInsights = await this.analyzePersonality(userId, newData);
    const driftEntries: TwinEvolutionEntry[] = [];

    for (const newInsight of newInsights) {
      const oldInsight = oldInsights.find(old =>
        old.insightType === newInsight.insightType
      );

      if (oldInsight) {
        const drift = this.calculateInsightDrift(oldInsight, newInsight);
        if (drift.significantChange) {
          driftEntries.push({
            id: crypto.randomUUID(),
            twinId: 'twin-id', // Would get from database
            userId,
            changeType: 'personality_update',
            oldValue: oldInsight.insightData,
            newValue: newInsight.insightData,
            changeSummary: drift.summary,
            confidenceImpact: drift.confidenceImpact,
            triggerSource: 'drift_detection',
            sourceDataIds: newInsight.sourceDataIds,
            createdAt: new Date()
          });
        }
      }
    }

    return driftEntries;
  }

  private calculateInsightDrift(oldInsight: PersonalityInsight, newInsight: PersonalityInsight) {
    // Simplified drift calculation - in production would be more sophisticated
    const confidenceDiff = Math.abs(newInsight.confidenceScore - oldInsight.confidenceScore);

    return {
      significantChange: confidenceDiff > 0.2,
      summary: `${newInsight.insightType} changed from confidence ${oldInsight.confidenceScore.toFixed(2)} to ${newInsight.confidenceScore.toFixed(2)}`,
      confidenceImpact: confidenceDiff
    };
  }
}

// ====================================================================
// EXPORT SINGLETON
// ====================================================================

export const personalityAnalysisEngine = new PersonalityAnalysisEngine();