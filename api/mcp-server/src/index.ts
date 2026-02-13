#!/usr/bin/env node
/**
 * TwinMe MCP Server Entry Point
 *
 * This is the STDIO entry point for the MCP server.
 * It can be run directly by Claude Desktop or other MCP clients.
 *
 * Usage:
 *   node dist/index.js
 *
 * Environment variables:
 *   TWINME_API_KEY - Your TwinMe API key
 *   SUPABASE_URL - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Supabase service role key
 *   ANTHROPIC_API_KEY - Anthropic API key for Claude
 */

import 'dotenv/config';
import { TwinMeMcpServer } from './server.js';

// Load environment from parent directory if not set
if (!process.env.SUPABASE_URL) {
  try {
    const dotenv = await import('dotenv');
    const path = await import('path');
    const { fileURLToPath } = await import('url');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Try to load from the main project's .env
    dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
  } catch {
    // Ignore if we can't load .env
  }
}

async function main() {
  try {
    const server = new TwinMeMcpServer();
    await server.run();
  } catch (error) {
    console.error('[TwinMe MCP] Fatal error:', error);
    process.exit(1);
  }
}

main();
