# TwinMe MCP Server

Talk to your digital twin from Claude Desktop, ChatGPT, Gemini, or any MCP-compatible client.

## Overview

The TwinMe MCP Server exposes your digital twin functionality through the Model Context Protocol (MCP), allowing you to interact with your twin from any MCP-compatible LLM interface.

## Features

### Tools

| Tool | Description |
|------|-------------|
| `chat_with_twin` | Have a full conversation with your digital twin |
| `get_soul_signature` | Get your complete personality profile |
| `get_live_data` | Get current real-time platform data |
| `get_patterns` | Get detected behavioral patterns |
| `get_insights` | Get AI-generated insights and recommendations |
| `get_predictions` | Get behavioral predictions and forecasts |

### Resources

| URI | Description |
|-----|-------------|
| `twin://soul-signature` | Your personality profile |
| `twin://personality` | Big Five traits with scores |
| `twin://platforms` | Connected platforms status |
| `twin://recent-activity` | Last 10 platform events |

## Installation

```bash
cd api/mcp-server
npm install
npm run build
```

## Configuration

### 1. Generate an API Key

Log into TwinMe and generate an API key at Settings > API Keys, or use the API:

```bash
curl -X POST http://localhost:3001/api/keys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Claude Desktop Key"}'
```

### 2. Configure Claude Desktop

#### Windows
Add to `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "twinme": {
      "command": "node",
      "args": ["C:/path/to/twin-ai-learn/api/mcp-server/dist/index.js"],
      "env": {
        "TWINME_API_KEY": "twm_your_api_key_here",
        "SUPABASE_URL": "https://your-project.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "your_service_role_key",
        "ANTHROPIC_API_KEY": "your_anthropic_key"
      }
    }
  }
}
```

#### macOS
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "twinme": {
      "command": "node",
      "args": ["/path/to/twin-ai-learn/api/mcp-server/dist/index.js"],
      "env": {
        "TWINME_API_KEY": "twm_your_api_key_here",
        "SUPABASE_URL": "https://your-project.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "your_service_role_key",
        "ANTHROPIC_API_KEY": "your_anthropic_key"
      }
    }
  }
}
```

### 3. Restart Claude Desktop

After saving the config, restart Claude Desktop for changes to take effect.

## Usage Examples

### Quick Check-in
Ask Claude: "Hey, how am I doing today according to my twin?"

### Pattern Discovery
Ask Claude: "What patterns have you noticed about me?"

### Personality Deep Dive
Ask Claude: "What does my data reveal about my personality?"

### Live Data
Ask Claude: "What am I listening to right now?"

### Soul Signature
Ask Claude: "Get my soul signature from TwinMe"

## Development

```bash
# Build
npm run build

# Development with auto-reload
npm run dev

# Test STDIO interface
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/index.js
```

## Security

- API keys are hashed (SHA-256) before storage
- Keys are never logged or exposed in responses
- Each key is scoped to a single user
- Keys can be revoked at any time
- Optional expiration dates

## API Key Format

Keys follow the format: `twm_<24-byte-base64url>`

Example: `twm_abc123XYZ789defGHI456jklMNO`

## Troubleshooting

### "Invalid API key" error
- Verify your API key is correct
- Check that the key hasn't been revoked
- Ensure the key hasn't expired

### "Authentication failed" error
- Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set correctly
- Check that the api_keys table exists in your database

### "No platform data available" error
- Connect platforms in the TwinMe web app first
- Verify platform tokens haven't expired

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| TWINME_API_KEY | Yes | Your TwinMe API key |
| SUPABASE_URL | Yes | Supabase project URL |
| SUPABASE_SERVICE_ROLE_KEY | Yes | Supabase service role key |
| ANTHROPIC_API_KEY | Yes | Anthropic API key for Claude |
