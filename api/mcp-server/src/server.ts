/**
 * TwinMe MCP Server - Simplified
 *
 * ONE tool: chat_with_twin
 * The twin fetches all your data (Spotify, Calendar, Whoop, Soul Signature)
 * and responds conversationally. No menus, no complexity - just chat.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { authenticateRequest } from './auth/api-key-auth.js';
import {
  getSoulSignature,
  getPlatformData,
  getMoltbotContext,
  buildTwinSystemPrompt,
  getAnthropicClient,
  getConnectedPlatforms,
  logConversation,
  getUserWritingProfile,
  getRecentConversations,
} from './utils/service-adapters.js';

// Single tool schema
const ChatWithTwinSchema = z.object({
  message: z.string().describe('What you want to say to your twin'),
  api_key: z.string().optional().describe('TwinMe API key (uses env if not provided)'),
});

export class TwinMeMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'twinme',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
          // No resources - everything through chat
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandler();
  }

  private setupHandlers(): void {
    // List tools - just ONE
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'chat_with_twin',
            description: `Talk to your digital twin. Your twin knows you through your connected platforms:

- **Spotify**: What you're listening to, recent tracks, favorite artists & genres
- **Google Calendar**: Today's events, upcoming schedule
- **Whoop**: Recovery score, sleep quality, HRV, resting heart rate
- **Soul Signature**: Your personality profile and unique traits
- **Memory**: Past conversations and learned facts about you

Just chat naturally. Ask things like:
- "How am I doing today?"
- "What should I focus on based on my recovery?"
- "What does my music say about my mood?"
- "What's on my schedule?"
- "Tell me something interesting about myself"`,
            inputSchema: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  description: 'Your message to your digital twin',
                },
              },
              required: ['message'],
            },
          },
        ],
      };
    });

    // Handle the ONE tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name !== 'chat_with_twin') {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }

      try {
        return await this.handleChat(args);
      } catch (error) {
        if (error instanceof McpError) throw error;

        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private setupErrorHandler(): void {
    this.server.onerror = (error) => {
      console.error('[TwinMe MCP] Error:', error);
    };
  }

  private async handleChat(args: unknown) {
    const parsed = ChatWithTwinSchema.parse(args);

    // Authenticate
    const authResult = await authenticateRequest(parsed.api_key);
    if (!authResult.success || !authResult.userId) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        authResult.error || 'Authentication failed. Check your API key.'
      );
    }

    const authUserId = authResult.userId;

    // Map auth.users.id to public.users.id (platform connections use public.users)
    const { getPublicUserId } = await import('./utils/service-adapters.js');
    const userId = await getPublicUserId(authUserId);

    // Fetch ALL context in parallel
    console.error('[TwinMe MCP] Fetching data for user:', userId, '(auth:', authUserId, ')');

    const [soulSignature, platformData, moltbotContext, connectedPlatforms, writingProfile, recentConversations] = await Promise.all([
      getSoulSignature(userId).catch(err => {
        console.error('[TwinMe MCP] Soul signature fetch error:', err);
        return null;
      }),
      getPlatformData(userId, ['spotify', 'calendar', 'whoop']).catch(err => {
        console.error('[TwinMe MCP] Platform data fetch error:', err);
        return {};
      }),
      getMoltbotContext(userId).catch(err => {
        console.error('[TwinMe MCP] Moltbot context fetch error:', err);
        return null;
      }),
      getConnectedPlatforms(userId).catch(err => {
        console.error('[TwinMe MCP] Connected platforms fetch error:', err);
        return [];
      }),
      getUserWritingProfile(userId).catch(err => {
        console.error('[TwinMe MCP] Writing profile fetch error:', err);
        return null;
      }),
      getRecentConversations(userId, 5).catch(err => {
        console.error('[TwinMe MCP] Recent conversations fetch error:', err);
        return [];
      }),
    ]);

    // Log what data we have
    console.error('[TwinMe MCP] Data fetched:', {
      hasSoulSignature: !!soulSignature,
      platforms: Object.keys(platformData),
      connectedPlatforms: connectedPlatforms.map(p => p.platform),
      hasMemory: !!moltbotContext,
      hasWritingProfile: !!writingProfile,
      recentConversationCount: recentConversations.length,
      spotifyData: platformData.spotify ? {
        currentlyPlaying: !!platformData.spotify.currentlyPlaying,
        recentTracks: platformData.spotify.recentTracks?.length || 0,
        topArtists: platformData.spotify.topArtists?.length || 0,
      } : null,
      calendarData: platformData.calendar ? {
        todayEvents: platformData.calendar.todayEvents?.length || 0,
        upcomingEvents: platformData.calendar.upcomingEvents?.length || 0,
      } : null,
      whoopData: platformData.whoop ? {
        recovery: platformData.whoop.recovery,
        sleepHours: platformData.whoop.sleepHours,
      } : null,
    });

    // Build system prompt with all context
    const systemPrompt = buildTwinSystemPrompt(soulSignature, platformData, moltbotContext);

    // Add data availability note to help the twin respond appropriately
    const dataNote = this.buildDataAvailabilityNote(platformData, soulSignature, connectedPlatforms);

    // Add writing profile context so twin can match user's communication style
    let writingContext = '';
    if (writingProfile) {
      writingContext = `\n## User's Communication Style (learned from ${writingProfile.totalConversations || 0} conversations)\n`;
      writingContext += `- Style: ${writingProfile.communicationStyle}\n`;
      writingContext += `- Message length: ${writingProfile.messageLength}\n`;
      writingContext += `- Vocabulary: ${writingProfile.vocabularyRichness}\n`;
      if (writingProfile.usesEmojis) writingContext += `- Uses emojis\n`;
      if (writingProfile.asksQuestions) writingContext += `- Frequently asks questions\n`;
      if (writingProfile.commonTopics && Array.isArray(writingProfile.commonTopics) && writingProfile.commonTopics.length > 0) {
        writingContext += `- Common topics: ${writingProfile.commonTopics.slice(0, 5).join(', ')}\n`;
      }
      writingContext += `\nIMPORTANT: Mirror the user's communication style - if they're casual, be casual. If they're formal, be more formal.\n`;
    }

    // Add recent conversation history for continuity
    let conversationHistory = '';
    if (recentConversations.length > 0) {
      conversationHistory = `\n## Recent Conversation History\n`;
      conversationHistory += `The user has had ${recentConversations.length} recent conversations with you. Here are the last few:\n\n`;
      recentConversations.slice(0, 3).reverse().forEach((conv, i) => {
        conversationHistory += `[${i + 1}] User: "${conv.userMessage.substring(0, 100)}${conv.userMessage.length > 100 ? '...' : ''}"\n`;
        conversationHistory += `    Twin: "${conv.twinResponse.substring(0, 100)}${conv.twinResponse.length > 100 ? '...' : ''}"\n\n`;
      });
      conversationHistory += `Use this history to maintain continuity and reference past discussions when relevant.\n`;
    }

    const enhancedPrompt = systemPrompt + '\n\n' + writingContext + conversationHistory + dataNote;

    // Call Claude API
    const anthropic = getAnthropicClient();

    console.error('[TwinMe MCP] Sending to Claude...');
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1000,
      temperature: 0.7,
      system: enhancedPrompt,
      messages: [{ role: 'user', content: parsed.message }],
    });

    const assistantMessage = response.content[0]?.type === 'text'
      ? response.content[0].text
      : 'I could not generate a response.';

    console.error('[TwinMe MCP] Response generated successfully');

    // Log the conversation for learning (async, don't block response)
    logConversation({
      userId,
      userMessage: parsed.message,
      twinResponse: assistantMessage,
      platformsContext: {
        spotify: !!platformData.spotify,
        calendar: !!platformData.calendar,
        whoop: !!platformData.whoop,
        connectedPlatforms: connectedPlatforms.map(p => p.platform),
      },
      brainStats: moltbotContext?.stats || {},
    }).catch(err => {
      console.error('[TwinMe MCP] Failed to log conversation:', err);
    });

    return {
      content: [
        {
          type: 'text',
          text: assistantMessage,
        },
      ],
    };
  }

  private buildDataAvailabilityNote(
    platformData: Record<string, unknown>,
    soulSignature: unknown,
    connectedPlatforms: Array<{ platform: string }>
  ): string {
    const available: string[] = [];
    const missing: string[] = [];

    // Check Spotify
    if (platformData.spotify && Object.keys(platformData.spotify).length > 0) {
      available.push('Spotify (music)');
    } else if (connectedPlatforms.some(p => p.platform === 'spotify')) {
      missing.push('Spotify (connected but no recent data)');
    } else {
      missing.push('Spotify (not connected)');
    }

    // Check Calendar
    if (platformData.calendar && Object.keys(platformData.calendar).length > 0) {
      available.push('Google Calendar');
    } else if (connectedPlatforms.some(p => p.platform === 'google_calendar')) {
      missing.push('Calendar (connected but no events)');
    } else {
      missing.push('Calendar (not connected)');
    }

    // Check Whoop
    if (platformData.whoop && Object.keys(platformData.whoop).length > 0) {
      available.push('Whoop (health)');
    } else if (connectedPlatforms.some(p => p.platform === 'whoop')) {
      missing.push('Whoop (connected but no recent data)');
    } else {
      missing.push('Whoop (not connected)');
    }

    // Check Soul Signature
    if (soulSignature) {
      available.push('Soul Signature');
    }

    let note = '\n## Current Data Availability\n';
    if (available.length > 0) {
      note += `Available: ${available.join(', ')}\n`;
    }
    if (missing.length > 0) {
      note += `Not available: ${missing.join(', ')}\n`;
    }
    note += '\nIMPORTANT: If data is missing, acknowledge it naturally and offer to help the user connect their platforms at twinme.app\n';

    return note;
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[TwinMe MCP] Server running - chat_with_twin ready');
  }
}
