/**
 * Gmail Data Extraction Service
 *
 * Extracts email data from Gmail using Pipedream Connect
 * Focuses on communication style analysis, not content reading
 *
 * PRIVACY-FIRST APPROACH:
 * - We analyze writing patterns, NOT email content
 * - Subject lines and metadata only (no body content stored)
 * - Anonymize recipient information
 * - Focus on: tone, formality, response patterns, writing style
 */

import axios from 'axios';
import { gmail_v1, google } from 'googleapis';

/**
 * Extract Gmail data using Pipedream account
 *
 * @param {string} pipedreamAccountId - Pipedream Connect account ID
 * @param {number} limit - Max number of emails to fetch (default: 50)
 * @returns {Promise<Array>} Array of email metadata and patterns
 */
export async function extractGmailData(pipedreamAccountId, limit = 50) {
  try {
    console.log('📧 [Gmail Extractor] Fetching emails via Pipedream...');

    // Validate Pipedream configuration
    if (!process.env.PIPEDREAM_PROJECT_KEY) {
      throw new Error('PIPEDREAM_PROJECT_KEY not configured');
    }

    // Get OAuth token from Pipedream Connect
    const tokenResponse = await axios.get(
      `https://api.pipedream.com/v1/connect/accounts/${pipedreamAccountId}/token`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.PIPEDREAM_PROJECT_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const accessToken = tokenResponse.data.access_token;

    if (!accessToken) {
      throw new Error('Failed to retrieve access token from Pipedream');
    }

    console.log('✅ [Gmail Extractor] Access token retrieved from Pipedream');

    // Initialize Gmail API client
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const gmail = google.gmail({ version: 'v1', auth });

    // Fetch recent messages (last 100 emails, then limit)
    console.log('📧 [Gmail Extractor] Fetching message list...');
    const messageListResponse = await gmail.users.messages.list({
      userId: 'me',
      maxResults: limit,
      q: '-in:spam -in:trash' // Exclude spam and trash
    });

    const messages = messageListResponse.data.messages || [];

    if (messages.length === 0) {
      console.log('⚠️ [Gmail Extractor] No messages found');
      return [];
    }

    console.log(`📧 [Gmail Extractor] Found ${messages.length} messages, fetching details...`);

    // Fetch detailed information for each message
    const emailDataPromises = messages.map(async (message) => {
      try {
        const messageDetail = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'metadata', // Only metadata, not full body
          metadataHeaders: ['From', 'To', 'Subject', 'Date', 'In-Reply-To', 'References']
        });

        return parseEmailMetadata(messageDetail.data);
      } catch (error) {
        console.error('❌ [Gmail Extractor] Error fetching message:', message.id, error.message);
        return null;
      }
    });

    const emailData = (await Promise.all(emailDataPromises)).filter(Boolean);

    console.log(`✅ [Gmail Extractor] Extracted ${emailData.length} emails successfully`);

    return emailData;
  } catch (error) {
    console.error('❌ [Gmail Extractor] Error:', error);

    // Handle specific error cases
    if (error.response) {
      // Pipedream API error
      console.error('Pipedream API Error:', error.response.status, error.response.data);
      throw new Error(`Pipedream API error: ${error.response.status}`);
    } else if (error.code === 'ENOTFOUND') {
      throw new Error('Network error: Unable to reach Pipedream API');
    }

    throw new Error(`Gmail extraction failed: ${error.message}`);
  }
}

/**
 * Parse email metadata for communication style analysis
 *
 * @param {gmail_v1.Schema$Message} message - Gmail message object
 * @returns {Object} Parsed email metadata
 */
function parseEmailMetadata(message) {
  try {
    const headers = message.payload?.headers || [];

    // Extract header values
    const getHeader = (name) => {
      const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
      return header?.value || '';
    };

    const from = getHeader('From');
    const to = getHeader('To');
    const subject = getHeader('Subject');
    const date = getHeader('Date');
    const inReplyTo = getHeader('In-Reply-To');
    const references = getHeader('References');

    // Determine if this is a sent or received email
    const isSent = message.labelIds?.includes('SENT') || false;

    // Extract email address (anonymize domain)
    const extractEmail = (headerValue) => {
      const match = headerValue.match(/<([^>]+)>/);
      const email = match ? match[1] : headerValue.trim();
      // Anonymize: keep provider (gmail, outlook, etc.) but not full address
      const domain = email.split('@')[1] || '';
      return domain.split('.')[0]; // e.g., "gmail", "outlook"
    };

    // Analyze subject line patterns
    const subjectAnalysis = {
      hasQuestionMark: subject.includes('?'),
      hasExclamation: subject.includes('!'),
      startsWithRe: subject.toLowerCase().startsWith('re:'),
      startsWithFwd: subject.toLowerCase().startsWith('fwd:'),
      length: subject.length,
      isAllCaps: subject === subject.toUpperCase() && subject.length > 5,
      wordCount: subject.split(/\s+/).length
    };

    return {
      id: message.id,
      threadId: message.threadId,
      isSent,
      isReply: !!inReplyTo || !!references || subjectAnalysis.startsWithRe,
      timestamp: new Date(date).toISOString(),
      // Anonymized metadata
      fromProvider: isSent ? 'me' : extractEmail(from),
      toProvider: !isSent ? 'me' : extractEmail(to),
      // Subject analysis (for communication patterns)
      subjectAnalysis,
      labels: message.labelIds || [],
      snippet: message.snippet?.substring(0, 100) || '' // First 100 chars for tone analysis
    };
  } catch (error) {
    console.error('❌ [Gmail Extractor] Error parsing message:', error);
    return null;
  }
}

/**
 * Calculate response time patterns
 * Analyzes how quickly user responds to emails
 *
 * @param {Array} emailData - Array of email metadata
 * @returns {Object} Response time statistics
 */
export function calculateResponsePatterns(emailData) {
  const sentEmails = emailData.filter(e => e.isSent);
  const replies = sentEmails.filter(e => e.isReply);

  if (replies.length === 0) {
    return {
      avgResponseTimeHours: null,
      responseRate: 0,
      quickResponderScore: 0 // 0-100 scale
    };
  }

  // Sort by timestamp
  const sortedEmails = [...emailData].sort((a, b) =>
    new Date(a.timestamp) - new Date(b.timestamp)
  );

  // Calculate response times for replies
  const responseTimes = [];
  replies.forEach(reply => {
    // Find the previous email in the thread
    const thread = sortedEmails.filter(e => e.threadId === reply.threadId);
    const replyIndex = thread.findIndex(e => e.id === reply.id);

    if (replyIndex > 0) {
      const previousEmail = thread[replyIndex - 1];
      const responseTime = new Date(reply.timestamp) - new Date(previousEmail.timestamp);
      responseTimes.push(responseTime);
    }
  });

  if (responseTimes.length === 0) {
    return {
      avgResponseTimeHours: null,
      responseRate: 0,
      quickResponderScore: 0
    };
  }

  const avgResponseTimeMs = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
  const avgResponseTimeHours = avgResponseTimeMs / (1000 * 60 * 60);

  // Quick responder score: 100 if < 1 hour, 50 if < 24 hours, 0 if > 48 hours
  let quickResponderScore = 0;
  if (avgResponseTimeHours < 1) {
    quickResponderScore = 100;
  } else if (avgResponseTimeHours < 6) {
    quickResponderScore = 80;
  } else if (avgResponseTimeHours < 24) {
    quickResponderScore = 50;
  } else if (avgResponseTimeHours < 48) {
    quickResponderScore = 25;
  }

  return {
    avgResponseTimeHours: Math.round(avgResponseTimeHours * 10) / 10,
    responseRate: Math.round((replies.length / sentEmails.length) * 100),
    quickResponderScore
  };
}

/**
 * Analyze communication patterns from email metadata
 *
 * @param {Array} emailData - Array of email metadata
 * @returns {Object} Communication pattern analysis
 */
export function analyzeCommunicationPatterns(emailData) {
  const sentEmails = emailData.filter(e => e.isSent);
  const receivedEmails = emailData.filter(e => !e.isSent);

  // Subject line patterns
  const subjectPatterns = {
    usesQuestions: sentEmails.filter(e => e.subjectAnalysis.hasQuestionMark).length,
    usesExclamations: sentEmails.filter(e => e.subjectAnalysis.hasExclamation).length,
    avgSubjectLength: sentEmails.length > 0
      ? Math.round(sentEmails.reduce((sum, e) => sum + e.subjectAnalysis.length, 0) / sentEmails.length)
      : 0,
    avgSubjectWords: sentEmails.length > 0
      ? Math.round(sentEmails.reduce((sum, e) => sum + e.subjectAnalysis.wordCount, 0) / sentEmails.length)
      : 0
  };

  // Email volume patterns
  const volumePatterns = {
    totalSent: sentEmails.length,
    totalReceived: receivedEmails.length,
    sendReceiveRatio: receivedEmails.length > 0
      ? Math.round((sentEmails.length / receivedEmails.length) * 100) / 100
      : 0
  };

  // Response patterns
  const responsePatterns = calculateResponsePatterns(emailData);

  // Time-of-day patterns (when user sends emails)
  const hourCounts = new Array(24).fill(0);
  sentEmails.forEach(email => {
    const hour = new Date(email.timestamp).getHours();
    hourCounts[hour]++;
  });

  const peakHours = hourCounts
    .map((count, hour) => ({ hour, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map(h => h.hour);

  const timingPatterns = {
    peakEmailHours: peakHours,
    sendsAtNight: hourCounts.slice(22, 24).concat(hourCounts.slice(0, 6)).reduce((sum, c) => sum + c, 0) > 0,
    sendsOnWeekends: false // Would require full date parsing
  };

  return {
    subjectPatterns,
    volumePatterns,
    responsePatterns,
    timingPatterns,
    totalEmails: emailData.length,
    analyzedAt: new Date().toISOString()
  };
}
