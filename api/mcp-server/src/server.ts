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
import { registerBridgeHandlers } from './tools/twin-tools-bridge.js';

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
    // Define the native tools handler (chat_with_twin)
    const nativeListTools = async () => ({
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
    });

    // Define the native call handler (chat_with_twin)
    const nativeCallTool = async (request: { params: { name: string; arguments?: Record<string, unknown> } }) => {
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
    };

    // Register the bridge: merges toolRegistry.js tools with native tools
    registerBridgeHandlers(this.server, nativeListTools, nativeCallTool);
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

    // Fetch ALL context via shared builder (unified with twin-chat.js)
    console.error('[TwinMe MCP] Fetching data for user:', userId, '(auth:', authUserId, ')');

    // @ts-expect-error Dynamic import of JS service (runs via tsx, not tsc)
    const { fetchTwinContext } = await import('../../services/twinContextBuilder.js');
    const twinContext = await fetchTwinContext(userId, parsed.message, {
      platforms: ['spotify', 'calendar', 'whoop', 'web'],
    });

    const { soulSignature, platformData, personalityScores, writingProfile, memories, twinSummary, proactiveInsights } = twinContext;

    // Log what data we have
    console.error('[TwinMe MCP] Data fetched:', {
      hasSoulSignature: !!soulSignature,
      platforms: Object.keys(platformData),
      hasPersonality: !!personalityScores,
      hasWritingProfile: !!writingProfile,
      memoryCount: memories?.length || 0,
      hasTwinSummary: !!twinSummary,
      proactiveInsightCount: proactiveInsights?.length || 0,
    });

    // Build system prompt using legacy adapter (still works for MCP string format)
    const systemPrompt = buildTwinSystemPrompt(soulSignature, platformData, null);

    // Add writing profile context so twin can match user's communication style
    let additionalContext = '';
    if (writingProfile) {
      additionalContext += `\n## User's Communication Style (learned from ${(writingProfile as Record<string, unknown>).totalConversations || 0} conversations)\n`;
      additionalContext += `- Style: ${(writingProfile as Record<string, unknown>).communicationStyle}\n`;
      additionalContext += `- Message length: ${(writingProfile as Record<string, unknown>).messageLength}\n`;
      additionalContext += `- Vocabulary: ${(writingProfile as Record<string, unknown>).vocabularyRichness}\n`;
      if ((writingProfile as Record<string, unknown>).usesEmojis) additionalContext += `- Uses emojis\n`;
      if ((writingProfile as Record<string, unknown>).asksQuestions) additionalContext += `- Frequently asks questions\n`;
      const commonTopics = (writingProfile as Record<string, unknown>).commonTopics;
      if (commonTopics && Array.isArray(commonTopics) && commonTopics.length > 0) {
        additionalContext += `- Common topics: ${commonTopics.slice(0, 5).join(', ')}\n`;
      }
      additionalContext += `\nIMPORTANT: Mirror the user's communication style - if they're casual, be casual. If they're formal, be more formal.\n`;
    }

    // Add twin summary for high-level personality overview
    if (twinSummary) {
      additionalContext += `\n## Twin Summary\n${twinSummary}\n`;
    }

    // Add unified memory stream results (reflections + observations)
    if (memories && memories.length > 0) {
      const reflections = memories.filter((m: { memory_type?: string }) => m.memory_type === 'reflection');
      const observations = memories.filter((m: { memory_type?: string }) => m.memory_type !== 'reflection');

      if (reflections.length > 0) {
        additionalContext += `\n## Deep Patterns I've Noticed\n${reflections.map((r: { content: string }) => `- ${r.content.substring(0, 250)}`).join('\n')}\n`;
      }
      if (observations.length > 0) {
        additionalContext += `\n## Relevant Memories\n${observations.slice(0, 8).map((m: { content: string }) => `- ${m.content.substring(0, 200)}`).join('\n')}\n`;
      }
    }

    // Add proactive insights
    if (proactiveInsights && proactiveInsights.length > 0) {
      additionalContext += `\n## Things I Noticed (bring up naturally)\n`;
      proactiveInsights.forEach((insight: { insight: string; urgency?: string }) => {
        additionalContext += `- ${insight.insight}${insight.urgency === 'high' ? ' [important]' : ''}\n`;
      });
    }

    // Add personality scores context
    if (personalityScores) {
      const ps = personalityScores as Record<string, number>;
      additionalContext += `\n## Personality Profile (Big Five)\n`;
      additionalContext += `Openness: ${Math.round(ps.openness || 0)}, Conscientiousness: ${Math.round(ps.conscientiousness || 0)}, `;
      additionalContext += `Extraversion: ${Math.round(ps.extraversion || 0)}, Agreeableness: ${Math.round(ps.agreeableness || 0)}, `;
      additionalContext += `Neuroticism: ${Math.round(ps.neuroticism || 0)}\n`;
    }

    const enhancedPrompt = systemPrompt + '\n\n' + additionalContext;

    // Call Claude API
    const anthropic = getAnthropicClient();

    console.error('[TwinMe MCP] Sending to Claude...');
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4.5',
      max_tokens: 1000,
      temperature: 0.7,
      system: enhancedPrompt,
      messages: [{ role: 'user', content: parsed.message }],
    });

    const assistantMessage = response.content[0]?.type === 'text'
      ? response.content[0].text
      : 'I could not generate a response.';

    console.error('[TwinMe MCP] Response generated successfully');

    // Log the conversation for MCP analytics (async, don't block response)
    logConversation({
      userId,
      userMessage: parsed.message,
      twinResponse: assistantMessage,
      platformsContext: {
        spotify: !!platformData.spotify,
        calendar: !!platformData.calendar,
        whoop: !!platformData.whoop,
        platforms_included: Object.keys(platformData),
      },
      brainStats: {
        has_soul_signature: !!soulSignature,
        has_memory_stream: memories?.length > 0,
        has_writing_profile: !!writingProfile,
      },
    }).catch(err => {
      console.error('[TwinMe MCP] Failed to log conversation:', err);
    });

    // Store in unified memory stream (async, don't block response)
    // @ts-expect-error Dynamic import of JS service (runs via tsx, not tsc)
    import('../../services/memoryStreamService.js').then(({ addConversationMemory }: any) => {
      addConversationMemory(userId, parsed.message, assistantMessage, {
        chatSource: 'mcp',
        platforms: Object.keys(platformData),
        hasSoulSignature: !!soulSignature,
      }).catch((err: Error) => {
        console.error('[TwinMe MCP] Failed to store in memory stream:', err.message);
      });
    }).catch(() => {});

    // Trigger reflection check (async, don't block response)
    // @ts-expect-error Dynamic import of JS service (runs via tsx, not tsc)
    import('../../services/reflectionEngine.js').then(({ shouldTriggerReflection, generateReflections }: any) => {
      shouldTriggerReflection(userId).then((shouldReflect: boolean) => {
        if (shouldReflect) {
          console.error('[TwinMe MCP] Triggering background reflection for user', userId);
          generateReflections(userId).catch((err: Error) =>
            console.error('[TwinMe MCP] Background reflection failed:', err.message)
          );
        }
      }).catch(() => {});
    }).catch(() => {});

    // Mark proactive insights as delivered (async, don't block response)
    if (proactiveInsights && proactiveInsights.length > 0) {
      // @ts-expect-error Dynamic import of JS service (runs via tsx, not tsc)
      import('../../services/proactiveInsights.js').then(({ markInsightsDelivered }: any) => {
        const insightIds = proactiveInsights.map((i: { id: string }) => i.id);
        markInsightsDelivered(insightIds).catch((err: Error) =>
          console.error('[TwinMe MCP] Failed to mark insights delivered:', err.message)
        );
      }).catch(() => {});
    }

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
