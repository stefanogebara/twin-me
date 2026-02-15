/**
 * TwinMe MCP HTTP Server
 *
 * Exposes the MCP server over HTTP for web-based LLM clients.
 * This allows ChatGPT, Gemini, or any HTTP client to use TwinMe tools.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';

import { authenticateRequest } from './auth/api-key-auth.js';
import {
  getSoulSignature,
  getPlatformData,
  getMoltbotContext,
  buildTwinSystemPrompt,
  getAnthropicClient,
  getConnectedPlatforms,
  getPatterns,
  getInsights,
  getPredictions,
} from './utils/service-adapters.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.MCP_HTTP_PORT || 3002;

// Middleware to authenticate requests
async function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
  const apiKey = req.headers['x-api-key'] as string || req.body?.api_key;

  const authResult = await authenticateRequest(apiKey);
  if (!authResult.success || !authResult.userId) {
    return res.status(401).json({ error: authResult.error || 'Unauthorized' });
  }

  (req as any).userId = authResult.userId;
  next();
}

// List available tools
app.get('/tools', (req, res) => {
  res.json({
    tools: [
      {
        name: 'chat_with_twin',
        description: 'Have a conversation with your TwinMe digital twin',
        parameters: {
          message: { type: 'string', required: true },
          platforms: { type: 'array', items: 'string', default: ['spotify', 'calendar', 'whoop'] },
          include_memory: { type: 'boolean', default: true }
        }
      },
      {
        name: 'get_soul_signature',
        description: 'Get your complete personality profile'
      },
      {
        name: 'get_live_data',
        description: 'Get current real-time platform data',
        parameters: {
          platforms: { type: 'array', items: 'string', default: ['spotify', 'calendar', 'whoop'] }
        }
      },
      {
        name: 'get_patterns',
        description: 'Get detected behavioral patterns'
      },
      {
        name: 'get_insights',
        description: 'Get AI-generated insights and recommendations'
      },
      {
        name: 'get_predictions',
        description: 'Get behavioral predictions'
      }
    ]
  });
});

// Execute a tool
app.post('/tools/:toolName', authenticate, async (req, res) => {
  const { toolName } = req.params;
  const userId = (req as any).userId;
  const args = req.body;

  try {
    let result: any;

    switch (toolName) {
      case 'chat_with_twin': {
        const message = args.message;
        if (!message) {
          return res.status(400).json({ error: 'message is required' });
        }

        const platforms = args.platforms || ['spotify', 'calendar', 'whoop'];
        const includeMemory = args.include_memory !== false;

        const [soulSignature, platformData, moltbotContext] = await Promise.all([
          getSoulSignature(userId),
          getPlatformData(userId, platforms),
          includeMemory ? getMoltbotContext(userId) : Promise.resolve(null),
        ]);

        const systemPrompt = buildTwinSystemPrompt(soulSignature, platformData, moltbotContext);

        const anthropic = getAnthropicClient();
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4.5',
          max_tokens: 1000,
          temperature: 0.7,
          system: systemPrompt,
          messages: [{ role: 'user', content: message }],
        });

        result = {
          response: response.content[0]?.type === 'text' ? response.content[0].text : '',
          context: {
            hasSoulSignature: !!soulSignature,
            platforms: Object.keys(platformData),
            hasMemory: !!moltbotContext
          }
        };
        break;
      }

      case 'get_soul_signature': {
        const signature = await getSoulSignature(userId);
        result = signature || { message: 'No soul signature found' };
        break;
      }

      case 'get_live_data': {
        const platforms = args.platforms || ['spotify', 'calendar', 'whoop'];
        result = await getPlatformData(userId, platforms);
        break;
      }

      case 'get_patterns': {
        result = await getPatterns(userId);
        break;
      }

      case 'get_insights': {
        result = await getInsights(userId);
        break;
      }

      case 'get_predictions': {
        result = await getPredictions(userId);
        break;
      }

      default:
        return res.status(404).json({ error: `Unknown tool: ${toolName}` });
    }

    res.json({ success: true, result });
  } catch (error) {
    console.error(`[MCP HTTP] Error executing ${toolName}:`, error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal error'
    });
  }
});

// Resources endpoints
app.get('/resources', (req, res) => {
  res.json({
    resources: [
      { uri: 'twin://soul-signature', name: 'Soul Signature' },
      { uri: 'twin://personality', name: 'Personality Traits' },
      { uri: 'twin://platforms', name: 'Connected Platforms' },
      { uri: 'twin://recent-activity', name: 'Recent Activity' }
    ]
  });
});

app.get('/resources/:resourceName', authenticate, async (req, res) => {
  const { resourceName } = req.params;
  const userId = (req as any).userId;

  try {
    let result: any;

    switch (resourceName) {
      case 'soul-signature':
        result = await getSoulSignature(userId);
        break;
      case 'personality':
        const context = await getMoltbotContext(userId);
        result = context?.clusterPersonality?.personality || null;
        break;
      case 'platforms':
        result = await getConnectedPlatforms(userId);
        break;
      case 'recent-activity':
        const ctx = await getMoltbotContext(userId);
        result = ctx?.recentMemories || [];
        break;
      default:
        return res.status(404).json({ error: `Unknown resource: ${resourceName}` });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error(`[MCP HTTP] Error reading ${resourceName}:`, error);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', server: 'twinme-mcp', version: '1.0.0' });
});

// Start server
app.listen(PORT, () => {
  console.log(`[TwinMe MCP] HTTP server running on http://localhost:${PORT}`);
  console.log(`[TwinMe MCP] Tools: GET /tools, POST /tools/:name`);
  console.log(`[TwinMe MCP] Resources: GET /resources, GET /resources/:name`);
});

export default app;
