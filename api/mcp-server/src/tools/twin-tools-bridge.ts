/**
 * Twin Tools Bridge — Connects toolRegistry.js tools to the MCP server
 * =====================================================================
 * Dynamically loads all registered tools from the JS toolRegistry and
 * exposes them as MCP tool definitions. When an MCP client calls a tool,
 * the bridge resolves the user from the MCP auth context (API key) and
 * delegates to the tool's executor function.
 *
 * This is a one-way bridge: toolRegistry is the source of truth.
 * The MCP server simply exposes those tools over the MCP protocol.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { authenticateRequest } from '../auth/api-key-auth.js';

// ---- Types mirroring the JS toolRegistry shape ----

interface ToolParameter {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
}

interface RegisteredTool {
  name: string;
  platform: string | null;
  description: string;
  category: string;
  parameters: ToolParameter;
  executor: (userId: string, params: Record<string, unknown>) => Promise<unknown>;
  requiresConnection: boolean;
  registeredAt?: string;
}

type ToolRegistry = Map<string, RegisteredTool>;

// ---- Dynamic import of the JS registry ----

let cachedRegistry: ToolRegistry | null = null;
let cachedExecuteTool: ((userId: string, toolName: string, params: Record<string, unknown>) => Promise<unknown>) | null = null;

/**
 * Dynamically import the JS toolRegistry module.
 * Uses the relative path from the compiled dist location back to the JS services.
 * When running via tsx the path resolves the same way as in server.ts.
 */
async function loadRegistry(): Promise<{
  registry: ToolRegistry;
  executeTool: (userId: string, toolName: string, params: Record<string, unknown>) => Promise<unknown>;
}> {
  if (cachedRegistry && cachedExecuteTool) {
    return { registry: cachedRegistry, executeTool: cachedExecuteTool };
  }

  // @ts-expect-error Dynamic import of JS service (runs via tsx, not tsc)
  const mod = await import('../../../../services/toolRegistry.js');

  cachedRegistry = mod.registry as ToolRegistry;
  cachedExecuteTool = mod.executeTool as (userId: string, toolName: string, params: Record<string, unknown>) => Promise<unknown>;

  return { registry: cachedRegistry, executeTool: cachedExecuteTool };
}

/**
 * Resolve userId from API key in the MCP call arguments.
 * The MCP STDIO transport uses TWINME_API_KEY from env.
 * Tools may also pass an explicit `api_key` argument.
 */
async function resolveUserId(args: Record<string, unknown>): Promise<string> {
  const apiKey = (args?.api_key as string) || undefined;
  const authResult = await authenticateRequest(apiKey);

  if (!authResult.success || !authResult.userId) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      authResult.error || 'Authentication failed. Check your API key.'
    );
  }

  // Map auth.users.id to public.users.id
  const { getPublicUserId } = await import('../utils/service-adapters.js');
  return getPublicUserId(authResult.userId);
}

// ---- Public API ----

/**
 * Get the list of all registered tools formatted as MCP tool definitions.
 * Used by both the MCP ListTools handler and the REST /api/mcp/tools endpoint.
 */
export async function getMcpToolDefinitions(): Promise<Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  category?: string;
  platform?: string | null;
}>> {
  const { registry } = await loadRegistry();

  const tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    category?: string;
    platform?: string | null;
  }> = [];

  for (const [, tool] of registry) {
    tools.push({
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: 'object',
        properties: {
          ...(tool.parameters?.properties || {}),
          api_key: {
            type: 'string',
            description: 'TwinMe API key (uses env TWINME_API_KEY if not provided)',
          },
        },
        required: tool.parameters?.required || [],
      },
      category: tool.category,
      platform: tool.platform,
    });
  }

  return tools;
}

/**
 * Handle an MCP CallTool request for a registry tool.
 * Returns null if the tool name is not in the registry (so the caller
 * can fall through to other handlers like chat_with_twin).
 */
export async function handleRegistryToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean } | null> {
  const { registry, executeTool } = await loadRegistry();

  if (!registry.has(toolName)) {
    return null; // Not a registry tool — let other handlers try
  }

  try {
    const userId = await resolveUserId(args);

    // Strip api_key from the params passed to the executor
    const { api_key: _apiKey, ...toolParams } = args;

    const result = await executeTool(userId, toolName, toolParams);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    if (error instanceof McpError) throw error;

    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error executing ${toolName}: ${message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Register the bridge tool handlers on the MCP server.
 * This wraps the existing ListTools and CallTool handlers to include
 * registry tools alongside any tools already defined (like chat_with_twin).
 */
export function registerBridgeHandlers(
  server: Server,
  existingListToolsHandler: () => Promise<{ tools: Array<Record<string, unknown>> }>,
  existingCallToolHandler: (request: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>
): void {
  // Combined ListTools: existing tools + registry tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const [existingResult, bridgeTools] = await Promise.all([
      existingListToolsHandler(),
      getMcpToolDefinitions(),
    ]);

    // Deduplicate: registry tools that share a name with existing tools are skipped
    const existingNames = new Set(existingResult.tools.map((t: Record<string, unknown>) => t.name));
    const newTools = bridgeTools
      .filter(t => !existingNames.has(t.name))
      .map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));

    return {
      tools: [...existingResult.tools, ...newTools],
    };
  });

  // Combined CallTool: try registry first, then fall through to existing handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Try the registry bridge first
    const bridgeResult = await handleRegistryToolCall(name, (args || {}) as Record<string, unknown>);
    if (bridgeResult !== null) {
      return bridgeResult;
    }

    // Fall through to existing handler (chat_with_twin, etc.)
    return existingCallToolHandler(request);
  });
}
