# Twin Chat System - Quick Start Guide

## What is Twin Chat?

Twin Chat is an AI-powered conversational system that creates authentic digital twins from your connected platform data. Chat with an AI that truly knows you - your music taste, coding style, communication patterns, and more.

## Quick Start

### 1. Apply Database Migration

```bash
# View instructions
node api/scripts/apply-twin-chat-migration.js

# Then apply via Supabase Dashboard:
# Copy SQL from: database/supabase/migrations/20250105000000_create_twin_chat_tables.sql
# Paste in: https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new
# Run it!
```

### 2. Start Services

```bash
# Terminal 1: Backend
npm run server:dev

# Terminal 2: Frontend
npm run dev
```

### 3. Use Twin Chat

1. Go to `http://localhost:8086/talk-to-twin`
2. Connect platforms (Spotify, GitHub, Discord, etc.)
3. Start chatting!

## Twin Modes

**Twin Mode**: AI speaks AS you
> "I've been on a Synthwave kick lately! The Midnight is my go-to for late-night coding 😎"

**Tutor Mode**: AI teaches you about yourself
> "You tend to be most productive between 10pm-2am. Your music choice shifts to electronic during these hours."

**Analyst Mode**: AI analyzes your patterns
> "Analysis shows 87% of GitHub commits occur 10pm-2am, correlating with Synthwave listening patterns."

## API Endpoints

### Chat
```bash
POST /api/twin/chat
```

### Conversations
```bash
GET /api/twin/conversations
GET /api/twin/conversation/:id
DELETE /api/twin/conversation/:id
```

### Stats
```bash
GET /api/twin/stats
GET /api/twin/usage?period=30d
```

## Features

- ✅ Authentic personality based on real user data
- ✅ Three modes: Twin, Tutor, Analyst
- ✅ Context-aware responses
- ✅ Conversation history
- ✅ Token usage tracking
- ✅ Rate limiting (50 msg/hr)
- ✅ Cost estimation
- ✅ Message ratings

## Cost Estimate

- **Per Message**: ~$0.012
- **Per Hour** (50 messages): ~$0.60
- **Per Month** (8 hrs/day): ~$144

## Files Created

### Backend
- `api/services/twinPersonality.js` - Personality engine
- `api/services/anthropicService.js` - Claude API integration
- `api/services/conversationManager.js` - Conversation management
- `api/routes/twin-chat.js` - API endpoints

### Database
- `database/supabase/migrations/20250105000000_create_twin_chat_tables.sql`

### Docs
- `TWIN_CHAT_IMPLEMENTATION.md` - Complete guide (66KB)
- `TWIN_CHAT_SUMMARY.md` - Implementation summary
- `TWIN_CHAT_README.md` - This file

## Testing

```bash
# Run test suite
node test-twin-chat.js
```

Tests:
- Environment variables
- Service imports
- Database connection
- Anthropic API
- Personality profile logic
- Rate limiting

## Troubleshooting

**Issue**: Empty AI responses
**Fix**: Connect more platforms, verify data extraction

**Issue**: Rate limit exceeded
**Fix**: Wait 60 minutes or adjust limit in `anthropicService.js`

**Issue**: Generic responses
**Fix**: Force refresh personality profile, check soul_data table

**Issue**: Database tables not found
**Fix**: Apply migration via Supabase Dashboard

## Security

- JWT authentication required
- Row Level Security (RLS) enabled
- Input validation and sanitization
- Rate limiting per user
- Environment variable security

## Next Steps

1. **Apply migration** - Required before first use
2. **Test system** - Run `node test-twin-chat.js`
3. **Start servers** - Backend + Frontend
4. **Connect platforms** - Spotify, GitHub, Discord
5. **Chat with your twin!** - Navigate to /talk-to-twin

## Support

For detailed information, see:
- `TWIN_CHAT_IMPLEMENTATION.md` - Complete technical guide
- `TWIN_CHAT_SUMMARY.md` - Implementation summary

For issues or questions, check the documentation or create an issue in the repository.

---

**Built with:**
- Anthropic Claude 3.5 Sonnet
- Supabase (PostgreSQL)
- Express.js
- React + TypeScript

**Status:** Production-ready ✅
