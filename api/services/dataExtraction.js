import { google } from 'googleapis';

/**
 * MCP-style Data Extraction Service
 * Implements intelligent data extraction from connected services
 * to build accurate digital twins for educational purposes
 */

class DataExtractionService {
  constructor() {
    this.gmail = null;
    this.calendar = null;
    this.extractionPatterns = {
      teachingStyle: {
        formal: ['Dear', 'Sincerely', 'Regards', 'Professor', 'Dr.'],
        informal: ['Hi', 'Hey', 'Thanks', 'Cheers', 'Best'],
        encouraging: ['Great job', 'Excellent', 'Well done', 'Keep it up', 'Proud of you'],
        directive: ['Please', 'Must', 'Should', 'Required', 'Mandatory']
      },
      responsePatterns: {
        detailed: /\b(because|therefore|furthermore|additionally|moreover)\b/gi,
        concise: /^.{0,100}$/,
        analogy: /\b(like|similar to|imagine|think of it as|for example)\b/gi,
        technical: /\b(algorithm|function|variable|method|process|system)\b/gi
      }
    };
  }

  /**
   * Initialize Google API clients with OAuth tokens
   */
  async initializeClients(tokens) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials(tokens);

    this.gmail = google.gmail({ version: 'v1', auth });
    this.calendar = google.calendar({ version: 'v3', auth });
  }

  /**
   * Extract teaching patterns from Gmail data
   */
  async extractGmailPatterns(userId, limit = 100) {
    try {
      // Get recent emails
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults: limit,
        q: 'is:sent' // Focus on sent emails to understand teaching style
      });

      const messages = response.data.messages || [];
      const patterns = {
        communicationStyle: {},
        responseTime: [],
        subjectAnalysis: {},
        studentInteraction: {},
        contentComplexity: []
      };

      // Analyze each message
      for (const message of messages) {
        const fullMessage = await this.gmail.users.messages.get({
          userId: 'me',
          id: message.id
        });

        await this.analyzeMessage(fullMessage.data, patterns);
      }

      return this.summarizePatterns(patterns);
    } catch (error) {
      console.error('Gmail extraction error:', error);
      return null;
    }
  }

  /**
   * Analyze individual email message for teaching patterns
   */
  async analyzeMessage(message, patterns) {
    const headers = message.payload?.headers || [];
    const body = this.extractMessageBody(message);

    // Extract metadata
    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const to = headers.find(h => h.name === 'To')?.value || '';
    const date = headers.find(h => h.name === 'Date')?.value || '';

    // Analyze communication style
    this.analyzeCommunicationStyle(body, patterns.communicationStyle);

    // Analyze subject patterns
    this.analyzeSubjectPatterns(subject, patterns.subjectAnalysis);

    // Analyze response complexity
    const complexity = this.analyzeComplexity(body);
    patterns.contentComplexity.push(complexity);

    // Detect student interaction patterns
    if (to.includes('student') || to.includes('.edu')) {
      this.analyzeStudentInteraction(body, patterns.studentInteraction);
    }
  }

  /**
   * Extract message body from Gmail message
   */
  extractMessageBody(message) {
    const parts = message.payload?.parts || [];
    let body = '';

    const extractText = (part) => {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      if (part.parts) {
        return part.parts.map(extractText).join(' ');
      }
      return '';
    };

    body = extractText(message.payload);
    return body;
  }

  /**
   * Analyze communication style from email content
   */
  analyzeCommunicationStyle(body, stylePatterns) {
    const styles = {
      formal: 0,
      informal: 0,
      encouraging: 0,
      directive: 0
    };

    // Check for style indicators
    Object.entries(this.extractionPatterns.teachingStyle).forEach(([style, keywords]) => {
      keywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        const matches = body.match(regex);
        if (matches) {
          styles[style] += matches.length;
        }
      });
    });

    // Update pattern counts
    Object.entries(styles).forEach(([style, count]) => {
      stylePatterns[style] = (stylePatterns[style] || 0) + count;
    });
  }

  /**
   * Analyze subject line patterns
   */
  analyzeSubjectPatterns(subject, subjectAnalysis) {
    const patterns = {
      assignment: /\b(assignment|homework|hw|project|lab)\b/i,
      announcement: /\b(announcement|update|reminder|important)\b/i,
      feedback: /\b(feedback|grade|review|comments)\b/i,
      meeting: /\b(meeting|office hours|appointment|schedule)\b/i
    };

    Object.entries(patterns).forEach(([type, pattern]) => {
      if (pattern.test(subject)) {
        subjectAnalysis[type] = (subjectAnalysis[type] || 0) + 1;
      }
    });
  }

  /**
   * Analyze content complexity
   */
  analyzeComplexity(body) {
    const wordCount = body.split(/\s+/).length;
    const sentenceCount = body.split(/[.!?]+/).length;
    const avgWordsPerSentence = wordCount / sentenceCount;

    const hasAnalogies = this.extractionPatterns.responsePatterns.analogy.test(body);
    const hasTechnicalTerms = this.extractionPatterns.responsePatterns.technical.test(body);
    const hasDetailedExplanation = this.extractionPatterns.responsePatterns.detailed.test(body);

    return {
      wordCount,
      avgWordsPerSentence,
      hasAnalogies,
      hasTechnicalTerms,
      hasDetailedExplanation,
      complexityScore: this.calculateComplexityScore({
        wordCount,
        avgWordsPerSentence,
        hasAnalogies,
        hasTechnicalTerms,
        hasDetailedExplanation
      })
    };
  }

  /**
   * Calculate complexity score
   */
  calculateComplexityScore(factors) {
    let score = 0;

    // Length contribution
    if (factors.wordCount > 200) score += 2;
    else if (factors.wordCount > 100) score += 1;

    // Sentence complexity
    if (factors.avgWordsPerSentence > 20) score += 2;
    else if (factors.avgWordsPerSentence > 15) score += 1;

    // Content type contributions
    if (factors.hasAnalogies) score += 1;
    if (factors.hasTechnicalTerms) score += 2;
    if (factors.hasDetailedExplanation) score += 2;

    return Math.min(10, score); // Cap at 10
  }

  /**
   * Analyze student interaction patterns
   */
  analyzeStudentInteraction(body, interactionPatterns) {
    const patterns = {
      questionResponse: /\b(your question|you asked|in response to|regarding your)\b/i,
      encouragement: /\b(good job|excellent|well done|keep up|proud)\b/i,
      clarification: /\b(let me clarify|to clarify|in other words|what I mean)\b/i,
      examples: /\b(for example|for instance|such as|like when)\b/i
    };

    Object.entries(patterns).forEach(([type, pattern]) => {
      if (pattern.test(body)) {
        interactionPatterns[type] = (interactionPatterns[type] || 0) + 1;
      }
    });
  }

  /**
   * Extract calendar patterns for teaching schedule
   */
  async extractCalendarPatterns(userId, timeMin, timeMax) {
    try {
      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        timeMax: timeMax || new Date().toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });

      const events = response.data.items || [];
      const patterns = {
        meetingTypes: {},
        timePreferences: {},
        duration: [],
        preparation: {}
      };

      events.forEach(event => {
        this.analyzeCalendarEvent(event, patterns);
      });

      return this.summarizeCalendarPatterns(patterns);
    } catch (error) {
      console.error('Calendar extraction error:', error);
      return null;
    }
  }

  /**
   * Analyze calendar event for teaching patterns
   */
  analyzeCalendarEvent(event, patterns) {
    const summary = event.summary || '';
    const duration = this.calculateDuration(event.start, event.end);
    const hour = new Date(event.start.dateTime || event.start.date).getHours();

    // Categorize event type
    if (/\b(class|lecture|teach)\b/i.test(summary)) {
      patterns.meetingTypes.teaching = (patterns.meetingTypes.teaching || 0) + 1;
    } else if (/\b(office hours|student meeting)\b/i.test(summary)) {
      patterns.meetingTypes.studentSupport = (patterns.meetingTypes.studentSupport || 0) + 1;
    } else if (/\b(meeting|conference|committee)\b/i.test(summary)) {
      patterns.meetingTypes.administrative = (patterns.meetingTypes.administrative || 0) + 1;
    }

    // Track time preferences
    const timeSlot = this.categorizeTimeSlot(hour);
    patterns.timePreferences[timeSlot] = (patterns.timePreferences[timeSlot] || 0) + 1;

    // Track duration patterns
    patterns.duration.push(duration);
  }

  /**
   * Calculate event duration in minutes
   */
  calculateDuration(start, end) {
    const startTime = new Date(start.dateTime || start.date);
    const endTime = new Date(end.dateTime || end.date);
    return (endTime - startTime) / (1000 * 60); // Duration in minutes
  }

  /**
   * Categorize time slot
   */
  categorizeTimeSlot(hour) {
    if (hour < 9) return 'earlyMorning';
    if (hour < 12) return 'morning';
    if (hour < 14) return 'midday';
    if (hour < 17) return 'afternoon';
    if (hour < 20) return 'evening';
    return 'night';
  }

  /**
   * Summarize extracted patterns into teaching profile
   */
  summarizePatterns(patterns) {
    const totalEmails = patterns.contentComplexity.length;
    const avgComplexity = patterns.contentComplexity.reduce((sum, c) => sum + c.complexityScore, 0) / totalEmails;

    // Determine primary communication style
    const styleScores = Object.entries(patterns.communicationStyle);
    const primaryStyle = styleScores.sort((a, b) => b[1] - a[1])[0]?.[0] || 'balanced';

    // Calculate interaction preferences
    const interactionTypes = Object.entries(patterns.studentInteraction);
    const preferredInteraction = interactionTypes.sort((a, b) => b[1] - a[1])[0]?.[0] || 'general';

    return {
      communicationProfile: {
        primaryStyle,
        formalityLevel: this.calculateFormalityLevel(patterns.communicationStyle),
        encouragementFrequency: patterns.communicationStyle.encouraging / totalEmails,
        directiveness: patterns.communicationStyle.directive / totalEmails
      },
      contentDelivery: {
        averageComplexity: avgComplexity,
        usesAnalogies: patterns.contentComplexity.filter(c => c.hasAnalogies).length / totalEmails,
        technicalDepth: patterns.contentComplexity.filter(c => c.hasTechnicalTerms).length / totalEmails,
        explanationStyle: patterns.contentComplexity.filter(c => c.hasDetailedExplanation).length > totalEmails / 2 ? 'detailed' : 'concise'
      },
      studentInteraction: {
        preferredType: preferredInteraction,
        responsivenessScore: this.calculateResponsiveness(patterns),
        supportiveScore: patterns.studentInteraction.encouragement || 0,
        clarificationFrequency: patterns.studentInteraction.clarification || 0
      },
      emailPatterns: {
        subjectTypes: patterns.subjectAnalysis,
        totalAnalyzed: totalEmails
      }
    };
  }

  /**
   * Summarize calendar patterns
   */
  summarizeCalendarPatterns(patterns) {
    const totalEvents = Object.values(patterns.meetingTypes).reduce((sum, count) => sum + count, 0);
    const avgDuration = patterns.duration.reduce((sum, d) => sum + d, 0) / patterns.duration.length;

    return {
      schedulePreferences: {
        primaryTimeSlot: Object.entries(patterns.timePreferences).sort((a, b) => b[1] - a[1])[0]?.[0] || 'flexible',
        averageMeetingDuration: avgDuration,
        teachingVsAdmin: patterns.meetingTypes.teaching / (patterns.meetingTypes.administrative || 1)
      },
      availability: {
        officeHoursFrequency: patterns.meetingTypes.studentSupport || 0,
        totalScheduledHours: patterns.duration.reduce((sum, d) => sum + d, 0) / 60
      }
    };
  }

  /**
   * Calculate formality level
   */
  calculateFormalityLevel(styles) {
    const formal = styles.formal || 0;
    const informal = styles.informal || 0;
    const total = formal + informal;

    if (total === 0) return 5; // Neutral
    return Math.round((formal / total) * 10);
  }

  /**
   * Calculate responsiveness score
   */
  calculateResponsiveness(patterns) {
    const responses = patterns.studentInteraction.questionResponse || 0;
    const examples = patterns.studentInteraction.examples || 0;
    const clarifications = patterns.studentInteraction.clarification || 0;

    return responses + examples + clarifications;
  }

  /**
   * Generate instant twin profile from extracted data
   */
  async generateInstantTwinProfile(gmailData, calendarData, userData) {
    return {
      personalityProfile: {
        name: userData.name,
        email: userData.email,
        teachingPhilosophy: this.inferTeachingPhilosophy(gmailData),
        communicationStyle: gmailData.communicationProfile,
        interactionPreferences: gmailData.studentInteraction
      },
      teachingPatterns: {
        contentDelivery: gmailData.contentDelivery,
        schedulePreferences: calendarData?.schedulePreferences || {},
        availability: calendarData?.availability || {}
      },
      extractedInsights: {
        primaryTeachingStyle: this.determineTeachingStyle(gmailData),
        studentEngagementLevel: this.calculateEngagementLevel(gmailData),
        workLifeBalance: this.assessWorkLifeBalance(calendarData),
        recommendedImprovements: this.suggestImprovements(gmailData, calendarData)
      },
      dataQuality: {
        emailsAnalyzed: gmailData.emailPatterns.totalAnalyzed,
        calendarEventsAnalyzed: calendarData ? Object.values(calendarData.schedulePreferences).length : 0,
        confidenceScore: this.calculateConfidenceScore(gmailData, calendarData)
      }
    };
  }

  /**
   * Infer teaching philosophy from communication patterns
   */
  inferTeachingPhilosophy(data) {
    const style = data.communicationProfile.primaryStyle;
    const encouragement = data.communicationProfile.encouragementFrequency;
    const complexity = data.contentDelivery.averageComplexity;

    if (style === 'encouraging' && encouragement > 0.3) {
      return 'Student-centered approach focused on building confidence and encouraging exploration';
    } else if (style === 'formal' && complexity > 7) {
      return 'Rigorous academic approach emphasizing deep understanding and technical mastery';
    } else if (data.contentDelivery.usesAnalogies > 0.5) {
      return 'Practical teaching philosophy using real-world examples and relatable analogies';
    } else {
      return 'Balanced approach adapting to student needs while maintaining academic standards';
    }
  }

  /**
   * Determine primary teaching style
   */
  determineTeachingStyle(data) {
    const factors = {
      facilitator: 0,
      expert: 0,
      coach: 0,
      delegator: 0
    };

    // Analyze factors
    if (data.studentInteraction.preferredType === 'questionResponse') factors.facilitator += 2;
    if (data.contentDelivery.technicalDepth > 0.6) factors.expert += 2;
    if (data.communicationProfile.encouragementFrequency > 0.3) factors.coach += 2;
    if (data.communicationProfile.directiveness < 0.3) factors.delegator += 2;

    // Find dominant style
    const dominant = Object.entries(factors).sort((a, b) => b[1] - a[1])[0];
    return dominant[0];
  }

  /**
   * Calculate student engagement level
   */
  calculateEngagementLevel(data) {
    const responsiveness = data.studentInteraction.responsivenessScore;
    const support = data.studentInteraction.supportiveScore;
    const total = responsiveness + support;

    if (total > 20) return 'Very High';
    if (total > 10) return 'High';
    if (total > 5) return 'Moderate';
    return 'Low';
  }

  /**
   * Assess work-life balance
   */
  assessWorkLifeBalance(calendarData) {
    if (!calendarData) return 'Unknown';

    const totalHours = calendarData.availability.totalScheduledHours;
    const ratio = calendarData.schedulePreferences.teachingVsAdmin;

    if (totalHours > 40) return 'Heavy workload - consider delegation';
    if (ratio > 2) return 'Teaching-focused with good balance';
    if (ratio < 0.5) return 'Admin-heavy - may impact teaching quality';
    return 'Balanced schedule';
  }

  /**
   * Suggest improvements based on patterns
   */
  suggestImprovements(gmailData, calendarData) {
    const suggestions = [];

    if (gmailData.contentDelivery.usesAnalogies < 0.3) {
      suggestions.push('Consider using more analogies and real-world examples');
    }

    if (gmailData.communicationProfile.encouragementFrequency < 0.2) {
      suggestions.push('Increase positive reinforcement in student communications');
    }

    if (calendarData && calendarData.availability.officeHoursFrequency < 2) {
      suggestions.push('Consider adding more office hours for student support');
    }

    if (gmailData.contentDelivery.explanationStyle === 'concise' && gmailData.contentDelivery.averageComplexity < 5) {
      suggestions.push('Some topics may benefit from more detailed explanations');
    }

    return suggestions;
  }

  /**
   * Calculate confidence score for the generated profile
   */
  calculateConfidenceScore(gmailData, calendarData) {
    let score = 0;
    const maxScore = 100;

    // Email analysis contribution (60%)
    const emailScore = Math.min(60, gmailData.emailPatterns.totalAnalyzed * 0.6);
    score += emailScore;

    // Calendar analysis contribution (20%)
    if (calendarData) {
      const calendarScore = Math.min(20, Object.values(calendarData.schedulePreferences).length * 2);
      score += calendarScore;
    }

    // Pattern diversity contribution (20%)
    const diversityScore = this.calculateDiversityScore(gmailData);
    score += Math.min(20, diversityScore);

    return Math.round((score / maxScore) * 100);
  }

  /**
   * Calculate diversity score
   */
  calculateDiversityScore(data) {
    let diversity = 0;

    // Check for variety in communication styles
    const styles = Object.values(data.communicationProfile);
    if (styles.filter(v => v > 0).length > 2) diversity += 10;

    // Check for variety in content types
    const subjects = Object.keys(data.emailPatterns.subjectTypes);
    if (subjects.length > 3) diversity += 10;

    return diversity;
  }
}

export default DataExtractionService;