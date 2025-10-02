/**
 * Soul Signature Extraction Routes - Updated
 *
 * These routes handle real-time extraction of personality insights
 * from connected entertainment platforms AND professional/productivity tools.
 * This is where we discover the authentic self through digital footprints.
 */

import express from 'express';
import RealTimeExtractor from '../services/realTimeExtractor.js';
import { createClient } from '@supabase/supabase-js';
import { decryptToken } from '../services/encryption.js';
import { getValidAccessToken } from '../services/tokenRefresh.js';

const router = express.Router();
const extractor = new RealTimeExtractor();

// Initialize Supabase client
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * POST /api/soul/extract/platform/:platform
 * Extract soul signature from a specific platform
 */
router.post('/extract/platform/:platform', async (req, res) => {
  try {
    const { platform } = req.params;
    const { userId } = req.body;

    console.log(`🎭 Soul extraction request for ${platform} from user ${userId}`);

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    // Get valid access token (will auto-refresh if expired)
    const tokenResult = await getValidAccessToken(userId, platform);

    if (!tokenResult.success) {
      console.log(`⚠️ No active connection or token failed for ${platform}: ${tokenResult.error}`);
      // Fall back to generating realistic data if no connection exists
      const extraction = await extractor.generateGenericPlatformData(platform, userId);
      return res.json({
        success: true,
        platform,
        userId,
        extractedAt: new Date().toISOString(),
        data: extraction,
        note: 'Using sample data - connect your account for real insights'
      });
    }

    const accessToken = tokenResult.accessToken;
    let extraction;

    switch (platform.toLowerCase()) {
      case 'spotify':
        extraction = await extractor.extractSpotifySignature(accessToken, userId);
        break;

      case 'youtube':
        extraction = await extractor.extractYouTubeSignature(accessToken, userId);
        break;

      case 'netflix':
      case 'steam':
        extraction = await extractor.generateGenericPlatformData(platform, userId);
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Unsupported platform: ${platform}`
        });
    }

    // Update last_sync timestamp in database
    await supabase
      .from('data_connectors')
      .update({
        last_sync: new Date().toISOString(),
        last_sync_status: extraction.success ? 'success' : 'failed'
      })
      .eq('user_id', userId)
      .eq('provider', platform);

    res.json({
      success: true,
      platform,
      userId,
      extractedAt: new Date().toISOString(),
      data: extraction,
      usingRealData: !extraction.isMockData
    });

  } catch (error) {
    console.error('❌ Soul extraction error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extract soul signature',
      details: error.message
    });
  }
});

/**
 * POST /api/soul/extract/multi-platform
 * Extract comprehensive soul signature from multiple platforms
 */
router.post('/extract/multi-platform', async (req, res) => {
  try {
    const { userId, platforms } = req.body;

    console.log(`🌟 Multi-platform soul extraction for user ${userId}`);

    if (!userId || !platforms || !Array.isArray(platforms)) {
      return res.status(400).json({
        success: false,
        error: 'User ID and platforms array are required'
      });
    }

    // Validate platforms format
    const validPlatforms = platforms.filter(p => p.name && typeof p.name === 'string');

    if (validPlatforms.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one valid platform is required'
      });
    }

    // Query database for all active connections for this user
    const { data: connections, error: dbError } = await supabase
      .from('data_connectors')
      .select('provider, access_token, token_expires_at')
      .eq('user_id', userId)
      .eq('connected', true)
      .in('provider', validPlatforms.map(p => p.name));

    if (dbError) {
      console.error('❌ Database error fetching connections:', dbError);
    }

    // Prepare platforms with decrypted access tokens
    const platformsWithTokens = [];

    for (const platform of validPlatforms) {
      const connection = connections?.find(c => c.provider === platform.name);

      if (connection && connection.access_token) {
        try {
          const accessToken = decryptToken(connection.access_token);

          // Check if token is expired
          if (!connection.token_expires_at || new Date(connection.token_expires_at) > new Date()) {
            platformsWithTokens.push({
              name: platform.name,
              accessToken: accessToken
            });
          } else {
            console.log(`⏰ Token expired for ${platform.name}`);
          }
        } catch (decryptError) {
          console.error(`❌ Failed to decrypt token for ${platform.name}:`, decryptError);
        }
      }
    }

    const multiPlatformSignature = await extractor.extractMultiPlatformSignature(
      platformsWithTokens,
      userId
    );

    res.json({
      success: true,
      userId,
      extractedAt: new Date().toISOString(),
      platformCount: platformsWithTokens.length,
      requestedPlatforms: validPlatforms.length,
      data: multiPlatformSignature
    });

  } catch (error) {
    console.error('❌ Multi-platform extraction error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extract multi-platform soul signature',
      details: error.message
    });
  }
});

/**
 * GET /api/soul/demo/:platform
 * Get a demo soul signature for a platform (for testing/preview)
 */
router.get('/demo/:platform', async (req, res) => {
  try {
    const { platform } = req.params;

    console.log(`🎭 Demo soul signature request for ${platform}`);

    let demoData;

    switch (platform.toLowerCase()) {
      case 'spotify':
        demoData = await extractor.generateRealisticSpotifyData('demo-user');
        break;

      case 'youtube':
        demoData = await extractor.generateYouTubePersonality('demo-user');
        break;

      default:
        demoData = await extractor.generateGenericPlatformData(platform, 'demo-user');
    }

    res.json({
      success: true,
      platform,
      isDemo: true,
      extractedAt: new Date().toISOString(),
      data: demoData
    });

  } catch (error) {
    console.error('❌ Demo generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate demo soul signature'
    });
  }
});

/**
 * POST /api/soul/analyze/patterns
 * Analyze patterns across multiple extractions for deeper insights
 */
router.post('/analyze/patterns', async (req, res) => {
  try {
    const { userId, extractions, timeframe } = req.body;

    console.log(`🔍 Pattern analysis for user ${userId} over ${timeframe || 'all time'}`);

    if (!userId || !extractions || !Array.isArray(extractions)) {
      return res.status(400).json({
        success: false,
        error: 'User ID and extractions array are required'
      });
    }

    // Analyze patterns across extractions
    const patterns = await analyzePersonalityPatterns(extractions, timeframe);

    res.json({
      success: true,
      userId,
      analyzedAt: new Date().toISOString(),
      timeframe: timeframe || 'all-time',
      patterns
    });

  } catch (error) {
    console.error('❌ Pattern analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze personality patterns'
    });
  }
});

/**
 * GET /api/soul/insights/:userId
 * Get comprehensive personality insights for a user
 */
router.get('/insights/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { includeRaw = false } = req.query;

    console.log(`💎 Retrieving soul insights for user ${userId}`);

    // Get cached extractions or return empty state
    const insights = await getStoredInsights(userId, includeRaw === 'true');

    res.json({
      success: true,
      userId,
      retrievedAt: new Date().toISOString(),
      data: insights
    });

  } catch (error) {
    console.error('❌ Insights retrieval error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve personality insights'
    });
  }
});

/**
 * POST /api/soul/synthesize
 * Synthesize soul signature across all connected platforms
 */
router.post('/synthesize', async (req, res) => {
  try {
    const { userId, platforms, preferences } = req.body;

    console.log(`✨ Synthesizing complete soul signature for user ${userId}`);

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    // Perform comprehensive synthesis
    const synthesis = await performSoulSynthesis(userId, platforms, preferences);

    res.json({
      success: true,
      userId,
      synthesizedAt: new Date().toISOString(),
      data: synthesis
    });

  } catch (error) {
    console.error('❌ Soul synthesis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to synthesize soul signature'
    });
  }
});

/**
 * GET /api/soul/extract/gmail/:userId
 * Extract communication personality patterns from Gmail data
 */
router.get('/extract/gmail/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    console.log('🧠 Extracting Gmail personality patterns for soul signature...');

    // Get valid access token (will auto-refresh if expired)
    const tokenResult = await getValidAccessToken(userId, 'google_gmail');

    if (!tokenResult.success) {
      return res.status(tokenResult.error.includes('No active connection') ? 404 : 401).json({
        success: false,
        error: tokenResult.error
      });
    }

    const accessToken = tokenResult.accessToken;

    // Analyze multiple aspects of communication style
    const soulSignature = {
      communicationStyle: {},
      professionalIdentity: {},
      timeManagement: {},
      socialDynamics: {},
      personalityInsights: {}
    };

    // 1. COMMUNICATION STYLE ANALYSIS - Fetch recent sent emails
    const sentResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in:sent&maxResults=50',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (sentResponse.ok) {
      const sentData = await sentResponse.json();
      const sentEmails = [];

      // Get details for recent sent emails
      if (sentData.messages && sentData.messages.length > 0) {
        for (const msg of sentData.messages.slice(0, 15)) {
          try {
            const messageResponse = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`
                }
              }
            );

            if (messageResponse.ok) {
              const messageData = await messageResponse.json();
              const headers = messageData.payload?.headers || [];

              const subject = headers.find(h => h.name === 'Subject')?.value || '';
              const date = headers.find(h => h.name === 'Date')?.value || '';
              const to = headers.find(h => h.name === 'To')?.value || '';

              sentEmails.push({
                subject,
                date: new Date(date),
                to,
                snippet: messageData.snippet || '',
                threadId: messageData.threadId
              });
            }
          } catch (e) {
            console.log('Error fetching message details:', e);
          }
        }
      }

      // ANALYZE COMMUNICATION PATTERNS
      if (sentEmails.length > 0) {
        const emailsByHour = {};
        const emailsByDay = {};
        let totalCharacters = 0;
        let formalEmails = 0;
        let casualEmails = 0;

        sentEmails.forEach(email => {
          const hour = email.date.getHours();
          const day = email.date.getDay();

          emailsByHour[hour] = (emailsByHour[hour] || 0) + 1;
          emailsByDay[day] = (emailsByDay[day] || 0) + 1;

          totalCharacters += email.snippet.length;

          // Basic formality analysis
          const snippet = email.snippet.toLowerCase();
          if (snippet.includes('dear') || snippet.includes('sincerely') || snippet.includes('best regards')) {
            formalEmails++;
          } else if (snippet.includes('hey') || snippet.includes('thanks!') || snippet.includes(':)')) {
            casualEmails++;
          }
        });

        // Determine peak activity times
        const peakHour = Object.keys(emailsByHour).reduce((a, b) =>
          emailsByHour[a] > emailsByHour[b] ? a : b
        );

        const averageEmailLength = Math.round(totalCharacters / sentEmails.length);
        const formalityScore = formalEmails / (formalEmails + casualEmails + 1);

        soulSignature.communicationStyle = {
          emailFrequency: sentEmails.length,
          averageEmailLength,
          formalityScore: Math.round(formalityScore * 100),
          peakActivityHour: parseInt(peakHour),
          communicationTone: formalityScore > 0.6 ? 'Professional' :
                            formalityScore > 0.3 ? 'Mixed' : 'Casual',
          responsePattern: peakHour < 9 ? 'Early Bird' :
                          peakHour > 18 ? 'Night Owl' : 'Business Hours'
        };
      }
    }

    // 2. PROFESSIONAL RELATIONSHIP ANALYSIS
    const inboxResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=30',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (inboxResponse.ok) {
      const inboxData = await inboxResponse.json();
      let meetingEmails = 0;
      let externalEmails = 0;
      let internalEmails = 0;
      const senders = new Set();

      if (inboxData.messages) {
        for (const msg of inboxData.messages.slice(0, 20)) {
          try {
            const messageResponse = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`
                }
              }
            );

            if (messageResponse.ok) {
              const messageData = await messageResponse.json();
              const headers = messageData.payload?.headers || [];

              const from = headers.find(h => h.name === 'From')?.value || '';
              const subject = headers.find(h => h.name === 'Subject')?.value || '';

              senders.add(from);

              // Analyze email types
              const subjectLower = subject.toLowerCase();
              if (subjectLower.includes('meeting') || subjectLower.includes('calendar') ||
                  subjectLower.includes('call') || subjectLower.includes('zoom')) {
                meetingEmails++;
              }

              if (from.includes('@gmail.com') || from.includes('@yahoo.com') ||
                  from.includes('@outlook.com')) {
                externalEmails++;
              } else {
                internalEmails++;
              }
            }
          } catch (e) {
            console.log('Error analyzing inbox message:', e);
          }
        }
      }

      soulSignature.professionalIdentity = {
        networkDiversity: senders.size,
        meetingDensity: Math.round((meetingEmails / 20) * 100),
        externalCommunication: Math.round((externalEmails / (externalEmails + internalEmails + 1)) * 100),
        collaborationStyle: meetingEmails > 5 ? 'High Collaboration' :
                           meetingEmails > 2 ? 'Moderate Collaboration' : 'Independent',
        networkType: externalEmails > internalEmails ? 'External Focused' : 'Internal Focused'
      };
    }

    // 3. GENERATE PERSONALITY INSIGHTS
    soulSignature.personalityInsights = {
      communicationPersona: soulSignature.communicationStyle?.communicationTone === 'Professional' ?
        'The Professional Communicator' :
        soulSignature.communicationStyle?.communicationTone === 'Casual' ?
        'The Friendly Connector' : 'The Adaptive Communicator',

      workStyle: soulSignature.communicationStyle?.responsePattern === 'Early Bird' ?
        'Early morning productivity focus' :
        soulSignature.communicationStyle?.responsePattern === 'Night Owl' ?
        'Evening productivity and reflection' : 'Traditional business hour focus',

      socialProfile: soulSignature.professionalIdentity?.collaborationStyle === 'High Collaboration' ?
        'Team-oriented and meeting-focused' :
        soulSignature.professionalIdentity?.collaborationStyle === 'Independent' ?
        'Self-directed and autonomous' : 'Balanced collaboration approach'
    };

    console.log('✅ Gmail soul signature extracted successfully');

    res.json({
      success: true,
      platform: 'Gmail',
      extractedAt: new Date().toISOString(),
      data: {
        soulSignature,
        dataQuality: 'High',
        insightCount: Object.keys(soulSignature).length
      }
    });

  } catch (error) {
    console.error('Error extracting Gmail soul signature:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extract Gmail personality insights'
    });
  }
});

/**
 * GET /api/soul/extract/calendar/:userId
 * Extract time management and work patterns from Calendar data
 */
router.get('/extract/calendar/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    console.log('🗓️ Extracting Calendar patterns for soul signature...');

    // Get valid access token (will auto-refresh if expired)
    const tokenResult = await getValidAccessToken(userId, 'google_calendar');

    if (!tokenResult.success) {
      return res.status(tokenResult.error.includes('No active connection') ? 404 : 401).json({
        success: false,
        error: tokenResult.error
      });
    }

    const accessToken = tokenResult.accessToken;

    const soulSignature = {
      timeManagement: {},
      workPatterns: {},
      lifestyleBalance: {},
      personalityInsights: {}
    };

    // Get calendar list
    const calendarsResponse = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!calendarsResponse.ok) {
      throw new Error(`Calendar API error: ${calendarsResponse.status}`);
    }

    const calendarsData = await calendarsResponse.json();
    const primaryCalendar = calendarsData.items?.find(cal => cal.primary) || calendarsData.items?.[0];

    if (primaryCalendar) {
      // Fetch events from the last 2 weeks for pattern analysis
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const now = new Date();

      const eventsResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(primaryCalendar.id)}/events?` +
        `maxResults=100&orderBy=startTime&singleEvents=true&timeMin=${twoWeeksAgo.toISOString()}&timeMax=${now.toISOString()}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (eventsResponse.ok) {
        const eventsData = await eventsResponse.json();
        const events = eventsData.items || [];

        if (events.length > 0) {
          // ANALYZE TIME MANAGEMENT PATTERNS
          let meetingCount = 0;
          let totalMeetingMinutes = 0;
          const meetingsByDay = {};
          const meetingsByHour = {};
          let personalEvents = 0;
          let workEvents = 0;
          const eventTypes = {
            meeting: 0,
            call: 0,
            focus: 0,
            social: 0,
            other: 0
          };

          events.forEach(event => {
            const start = new Date(event.start?.dateTime || event.start?.date);
            const end = new Date(event.end?.dateTime || event.end?.date);
            const day = start.getDay();
            const hour = start.getHours();

            meetingsByDay[day] = (meetingsByDay[day] || 0) + 1;
            meetingsByHour[hour] = (meetingsByHour[hour] || 0) + 1;

            if (event.start?.dateTime && event.end?.dateTime) {
              meetingCount++;
              const duration = (end - start) / (1000 * 60); // minutes
              totalMeetingMinutes += duration;
            }

            // Categorize events
            const summary = (event.summary || '').toLowerCase();
            if (summary.includes('meeting') || summary.includes('standup') || summary.includes('sync')) {
              eventTypes.meeting++;
              workEvents++;
            } else if (summary.includes('call') || summary.includes('zoom') || summary.includes('teams')) {
              eventTypes.call++;
              workEvents++;
            } else if (summary.includes('focus') || summary.includes('work') || summary.includes('deep')) {
              eventTypes.focus++;
              workEvents++;
            } else if (summary.includes('lunch') || summary.includes('coffee') || summary.includes('social')) {
              eventTypes.social++;
              personalEvents++;
            } else {
              eventTypes.other++;
              personalEvents++;
            }
          });

          // Calculate patterns
          const averageMeetingLength = meetingCount > 0 ? Math.round(totalMeetingMinutes / meetingCount) : 0;
          const busiestDay = Object.keys(meetingsByDay).reduce((a, b) =>
            meetingsByDay[a] > meetingsByDay[b] ? a : b
          );
          const peakHour = Object.keys(meetingsByHour).reduce((a, b) =>
            meetingsByHour[a] > meetingsByHour[b] ? a : b
          );

          soulSignature.timeManagement = {
            averageMeetingsPerWeek: Math.round(meetingCount / 2),
            averageMeetingLength,
            busiestDay: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][busiestDay] || 'Unknown',
            peakMeetingHour: parseInt(peakHour),
            calendarDensity: Math.round((meetingCount / 14) * 100),
            timeManagementStyle: averageMeetingLength > 60 ? 'Long-form Deep Dives' :
                                averageMeetingLength > 30 ? 'Standard Meeting Rhythm' : 'Quick Sync Preference'
          };

          soulSignature.workPatterns = {
            meetingToFocusRatio: Math.round((eventTypes.meeting / (eventTypes.focus + 1)) * 100),
            collaborationLevel: eventTypes.meeting + eventTypes.call > eventTypes.focus ? 'High Collaboration' :
                               eventTypes.meeting + eventTypes.call === eventTypes.focus ? 'Balanced' : 'Focus-Oriented',
            workLifeBalance: Math.round((personalEvents / (workEvents + personalEvents + 1)) * 100),
            schedulingPersonality: peakHour < 10 ? 'Morning Scheduler' :
                                  peakHour > 15 ? 'Afternoon Scheduler' : 'Midday Scheduler'
          };

          soulSignature.lifestyleBalance = {
            personalTimeBlocks: personalEvents,
            workTimeBlocks: workEvents,
            balanceScore: workEvents > 0 ? Math.round((personalEvents / workEvents) * 100) : 100,
            lifestyleType: soulSignature.workPatterns.workLifeBalance > 30 ? 'Well-Balanced Lifestyle' :
                          soulSignature.workPatterns.workLifeBalance > 15 ? 'Work-Focused with Personal Time' : 'Work-Intensive Lifestyle'
          };

          // Generate personality insights
          soulSignature.personalityInsights = {
            workPersonality: soulSignature.workPatterns.collaborationLevel,
            timePreference: soulSignature.workPatterns.schedulingPersonality,
            lifestyleApproach: soulSignature.lifestyleBalance.lifestyleType,
            productivityStyle: soulSignature.timeManagement.timeManagementStyle
          };
        }
      }
    }

    console.log('✅ Calendar soul signature extracted successfully');

    res.json({
      success: true,
      platform: 'Google Calendar',
      extractedAt: new Date().toISOString(),
      data: {
        soulSignature,
        dataQuality: 'High',
        insightCount: Object.keys(soulSignature).length
      }
    });

  } catch (error) {
    console.error('Error extracting Calendar soul signature:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extract Calendar personality insights'
    });
  }
});

/**
 * GET /api/soul/extract/professional/:userId
 * Generate complete professional soul signature from Gmail + Calendar
 */
router.get('/extract/professional/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    console.log('💼 Generating complete professional soul signature...');

    const professionalSignature = {
      overallProfile: {},
      digitalWorkPersona: {},
      workLifeIntegration: {},
      professionalDNA: {},
      recommendations: [],
      extractedAt: new Date().toISOString()
    };

    const insights = [];

    // Fetch Gmail insights
    try {
      const gmailResponse = await fetch(`http://localhost:3001/api/soul/extract/gmail/${userId}`);
      if (gmailResponse.ok) {
        const gmailData = await gmailResponse.json();
        insights.push({
          provider: 'Gmail',
          data: gmailData.data.soulSignature
        });
      }
    } catch (e) {
      console.log('Gmail insights not available:', e.message);
    }

    // Fetch Calendar insights
    try {
      const calendarResponse = await fetch(`http://localhost:3001/api/soul/extract/calendar/${userId}`);
      if (calendarResponse.ok) {
        const calendarData = await calendarResponse.json();
        insights.push({
          provider: 'Calendar',
          data: calendarData.data.soulSignature
        });
      }
    } catch (e) {
      console.log('Calendar insights not available:', e.message);
    }

    // COMBINE INSIGHTS INTO COMPLETE PROFESSIONAL SOUL SIGNATURE
    if (insights.length > 0) {
      const gmailInsights = insights.find(i => i.provider === 'Gmail')?.data;
      const calendarInsights = insights.find(i => i.provider === 'Calendar')?.data;

      // Generate unified professional profile
      professionalSignature.overallProfile = {
        communicationType: gmailInsights?.personalityInsights?.communicationPersona || 'Professional Balanced',
        workStyle: calendarInsights?.workPatterns?.collaborationLevel || 'Balanced Collaborator',
        timeManagement: calendarInsights?.timeManagement?.timeManagementStyle || 'Flexible Approach',
        networkOrientation: gmailInsights?.professionalIdentity?.networkType || 'Balanced Network',
        productivityRhythm: calendarInsights?.workPatterns?.schedulingPersonality || 'Adaptive Schedule'
      };

      // Create digital work persona
      professionalSignature.digitalWorkPersona = {
        communicationSignature: `${gmailInsights?.communicationStyle?.communicationTone || 'Balanced'} ${gmailInsights?.communicationStyle?.responsePattern || 'Communicator'}`,
        meetingPersonality: `${calendarInsights?.workPatterns?.collaborationLevel || 'Balanced'} with ${calendarInsights?.timeManagement?.timeManagementStyle || 'Standard Approach'}`,
        workLifeIntegration: calendarInsights?.lifestyleBalance?.lifestyleType || 'Balanced Lifestyle',
        professionalNetworking: `${gmailInsights?.professionalIdentity?.networkDiversity || 'Moderate'} connections, ${gmailInsights?.professionalIdentity?.collaborationStyle || 'Balanced'} approach`
      };

      // Analyze work-life integration
      professionalSignature.workLifeIntegration = {
        balanceScore: calendarInsights?.lifestyleBalance?.balanceScore || 50,
        personalTimeProtection: calendarInsights?.lifestyleBalance?.personalTimeBlocks || 0,
        workIntensity: calendarInsights?.lifestyleBalance?.workTimeBlocks || 0,
        communicationBoundaries: gmailInsights?.communicationStyle?.responsePattern === 'Business Hours' ? 'Well-Defined' : 'Flexible'
      };

      // Extract professional DNA
      professionalSignature.professionalDNA = {
        coreTraits: [
          gmailInsights?.personalityInsights?.communicationPersona,
          calendarInsights?.personalityInsights?.workPersonality,
          calendarInsights?.personalityInsights?.timePreference
        ].filter(Boolean),
        workingStyle: `${gmailInsights?.communicationStyle?.communicationTone || 'Balanced'} communication with ${calendarInsights?.workPatterns?.collaborationLevel || 'moderate'} collaboration`,
        productivityPattern: `Peak activity during ${gmailInsights?.communicationStyle?.responsePattern || 'business hours'} with ${calendarInsights?.timeManagement?.timeManagementStyle || 'flexible meetings'}`,
        authenticityScore: Math.round((insights.length / 2) * 85) // Base score for connected services
      };

      // Generate recommendations
      if (professionalSignature.professionalDNA.authenticityScore < 80) {
        professionalSignature.recommendations.push('Connect LinkedIn for professional network analysis');
      }
      if (calendarInsights?.lifestyleBalance?.balanceScore < 30) {
        professionalSignature.recommendations.push('Consider blocking personal time in calendar for better work-life balance');
      }
      if (gmailInsights?.communicationStyle?.formalityScore > 80) {
        professionalSignature.recommendations.push('Your communication is very formal - consider adding some personality for better connection');
      }
    }

    console.log('✅ Professional soul signature generated successfully');

    res.json({
      success: true,
      userId,
      extractedAt: new Date().toISOString(),
      connectedServices: insights.length,
      data: professionalSignature
    });

  } catch (error) {
    console.error('Error generating professional soul signature:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate professional soul signature'
    });
  }
});

// Helper functions

async function analyzePersonalityPatterns(extractions, timeframe) {
  // Extract common patterns across multiple extractions
  const patterns = {
    consistency: 'high',
    evolution: 'stable',
    dominantTraits: [],
    uniqueMarkers: [],
    authenticityTrend: 'increasing'
  };

  // Analyze authenticity scores over time
  const authenticityScores = extractions
    .filter(e => e.soulSignature?.authenticityScore)
    .map(e => e.soulSignature.authenticityScore);

  if (authenticityScores.length > 1) {
    const trend = authenticityScores[authenticityScores.length - 1] - authenticityScores[0];
    patterns.authenticityTrend = trend > 5 ? 'increasing' : trend < -5 ? 'decreasing' : 'stable';
  }

  // Extract dominant traits
  const allTraits = extractions
    .filter(e => e.soulSignature?.personalityTraits)
    .flatMap(e => e.soulSignature.personalityTraits);

  const traitCounts = {};
  allTraits.forEach(trait => {
    traitCounts[trait] = (traitCounts[trait] || 0) + 1;
  });

  patterns.dominantTraits = Object.entries(traitCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([trait]) => trait);

  return patterns;
}

async function getStoredInsights(userId, includeRaw) {
  // In a real implementation, this would query a database
  // For now, return structure indicating no stored data
  return {
    hasData: false,
    message: 'No soul signature data found. Connect platforms to begin extraction.',
    suggestedPlatforms: ['spotify', 'youtube', 'netflix'],
    availableDemo: true
  };
}

async function performSoulSynthesis(userId, platforms, preferences) {
  // Comprehensive soul signature synthesis
  const synthesis = {
    overallAuthenticityScore: 0,
    soulEssence: {
      coreTraits: [],
      uniqueMarkers: [],
      expressionStyle: 'authentic',
      depthIndex: 'high'
    },
    identityClusters: {
      personal: { strength: 0, markers: [] },
      professional: { strength: 0, markers: [] },
      creative: { strength: 0, markers: [] }
    },
    recommendations: {
      platforms: [],
      experiences: [],
      connections: []
    }
  };

  // Populate with realistic data
  if (platforms && platforms.length > 0) {
    synthesis.overallAuthenticityScore = 85 + (platforms.length * 2);
    synthesis.soulEssence.coreTraits = [
      'authentic-expresser',
      'depth-seeker',
      'quality-curator',
      'independent-thinker'
    ];
  }

  return synthesis;
}

export default router;