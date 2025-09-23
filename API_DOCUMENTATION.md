# Twin AI Learn - API Documentation

## Overview
This documentation covers the API endpoints and configuration requirements for the Twin AI Learn platform.

## Base URL
- Development: `http://localhost:3001/api`
- Production: Configure `VITE_API_URL` environment variable

## Authentication
All API endpoints require authentication using Clerk JWT tokens. Include the token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

## API Endpoints

### Conversations

#### POST /api/conversations
Create a new conversation between a student and digital twin.

**Request Body:**
```json
{
  "twin_id": "uuid",
  "title": "Optional conversation title"
}
```

**Response:**
```json
{
  "id": "uuid",
  "student_id": "uuid",
  "twin_id": "uuid",
  "title": "string",
  "started_at": "ISO string",
  "last_message_at": "ISO string"
}
```

#### GET /api/conversations
Get all conversations for the authenticated user.

**Response:**
```json
[
  {
    "id": "uuid",
    "student_id": "uuid",
    "twin_id": "uuid",
    "title": "string",
    "started_at": "ISO string",
    "last_message_at": "ISO string"
  }
]
```

#### GET /api/conversations/:id
Get a specific conversation by ID.

#### POST /api/conversations/:id/messages
Add a message to a conversation.

**Request Body:**
```json
{
  "content": "string",
  "is_user_message": true,
  "message_type": "text"
}
```

#### DELETE /api/conversations/:id
Delete a conversation (requires professor role).

### Digital Twins

#### GET /api/twins
Get digital twins accessible to the user.

**Query Parameters:**
- `type`: Filter by twin type ('professor' or 'personal')

**Response:**
```json
[
  {
    "id": "uuid",
    "creator_id": "uuid",
    "name": "string",
    "description": "string",
    "subject_area": "string",
    "twin_type": "professor",
    "is_active": true,
    "voice_profile_id": "string",
    "personality_traits": {},
    "teaching_style": {},
    "common_phrases": [],
    "favorite_analogies": [],
    "knowledge_base_status": "string",
    "created_at": "ISO string",
    "updated_at": "ISO string"
  }
]
```

#### POST /api/twins
Create a new digital twin (requires authentication).

**Request Body:**
```json
{
  "name": "string",
  "description": "string",
  "subject_area": "string",
  "twin_type": "professor",
  "personality_traits": {},
  "teaching_style": {},
  "common_phrases": [],
  "favorite_analogies": []
}
```

#### GET /api/twins/:id
Get a specific digital twin by ID.

#### PUT /api/twins/:id
Update a digital twin (must be owner).

#### DELETE /api/twins/:id
Delete a digital twin (must be owner).

#### POST /api/twins/:id/activate
Activate/deactivate a digital twin (requires professor role).

**Request Body:**
```json
{
  "is_active": true
}
```

### Chat

#### POST /api/chat
Send a message to a digital twin and get AI response.

**Request Body:**
```json
{
  "twinId": "uuid",
  "message": "string",
  "conversationId": "uuid",
  "professorContext": {
    "full_name": "string",
    "university": "string",
    "department": "string"
  }
}
```

**Response:**
```json
{
  "response": "string",
  "audioUrl": "string (optional)"
}
```

### Voice

#### GET /api/voice/voices
Get available ElevenLabs voices.

**Response:**
```json
{
  "success": true,
  "voices": [
    {
      "id": "string",
      "name": "string",
      "description": "string",
      "category": "string"
    }
  ]
}
```

#### POST /api/voice/generate
Generate speech from text.

**Request Body:**
```json
{
  "text": "string",
  "voiceId": "string (optional)",
  "options": {
    "stability": 0.5,
    "similarity_boost": 0.8,
    "style": 0.0,
    "use_speaker_boost": true
  }
}
```

#### POST /api/voice/clone
Clone a voice (requires professor role).

**Form Data:**
- `name`: Voice name
- `description`: Voice description
- `audio`: Audio file

### Documents

#### POST /api/documents/upload
Upload and process a document for a digital twin.

**Form Data:**
- `document`: File (PDF, Word, or text)
- `twinId`: UUID
- `title`: Optional title
- `description`: Optional description

**Response:**
```json
{
  "success": true,
  "message": "Document processed successfully",
  "result": {
    "fileName": "string",
    "chunksProcessed": 0,
    "totalCharacters": 0,
    "processedAt": "ISO string"
  }
}
```

#### GET /api/documents/stats/:twinId
Get document statistics for a twin.

#### POST /api/documents/search
Search for relevant context in processed documents.

**Request Body:**
```json
{
  "twinId": "uuid",
  "query": "string",
  "maxResults": 5
}
```

#### DELETE /api/documents/clear/:twinId
Clear all documents for a twin (requires professor role).

#### GET /api/documents/twins
List all twins with processed documents (requires professor role).

## Configuration Requirements

### Environment Variables

Create a `.env` file in the root directory with the following variables:

#### Required - Supabase Configuration
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

#### Required - Clerk Authentication
```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key
CLERK_SECRET_KEY=sk_test_your_clerk_secret_key
```

#### Required - AI API Keys (Server-side only)
```env
ANTHROPIC_API_KEY=sk-ant-api03-your_anthropic_key
OPENAI_API_KEY=sk-proj-your_openai_key
ELEVENLABS_API_KEY=your_elevenlabs_key
```

#### Optional - Server Configuration
```env
PORT=3001
NODE_ENV=development
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
JWT_SECRET=your_jwt_secret_here_change_this_in_production
```

#### Optional - App Configuration
```env
VITE_APP_URL=http://localhost:8085
VITE_API_URL=http://localhost:3001/api
VITE_ENVIRONMENT=development
```

### Database Setup

1. **Supabase Project Setup:**
   - Create a new Supabase project
   - Enable Row Level Security (RLS)
   - Run the migration files in `/supabase/migrations/`

2. **Required Tables:**
   - `profiles` - User profile information
   - `digital_twins` - Digital twin configurations
   - `conversations` - Chat conversations
   - `messages` - Individual chat messages
   - `training_materials` - Uploaded documents
   - `student_profiles` - Student learning preferences
   - `voice_profiles` - Voice cloning data

### Authentication Setup

1. **Clerk Configuration:**
   - Create a Clerk application
   - Configure sign-in/sign-up methods
   - Set up JWT templates
   - Configure allowed origins for development/production

### API Service Setup

1. **Anthropic (Claude):**
   - Sign up for Anthropic API access
   - Get API key for Claude models
   - Note: Claude Sonnet 3.5 v2 is being deprecated, upgrade to Claude Sonnet 4

2. **OpenAI:**
   - Create OpenAI account
   - Generate API key
   - Used for document embeddings and RAG functionality

3. **ElevenLabs:**
   - Sign up for ElevenLabs account
   - Get API key for voice synthesis
   - Configure voice settings

## Rate Limiting

The API implements rate limiting to prevent abuse:
- Default: 100 requests per 15 minutes per IP
- User-specific endpoints: 50 requests per 15 minutes per user
- File uploads: Additional restrictions apply

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error type",
  "message": "Detailed error message",
  "details": ["Array of validation errors (if applicable)"]
}
```

## Security Features

1. **Authentication**: All endpoints require valid Clerk JWT tokens
2. **Authorization**: Role-based access control (student/professor)
3. **Rate Limiting**: Prevents API abuse
4. **CORS**: Configured for allowed origins only
5. **Input Validation**: Request body validation using express-validator
6. **File Upload Security**: File type and size restrictions
7. **Row Level Security**: Database-level access control

## Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables
4. Run database migrations
5. Start development servers:
   - Frontend: `npm run dev`
   - Backend: `npm run server:dev`
   - Both: `npm run dev:full`

## Production Deployment

1. Set production environment variables
2. Build the frontend: `npm run build`
3. Deploy backend to your hosting service
4. Deploy frontend build to CDN/static hosting
5. Configure domain and SSL certificates
6. Update CORS settings for production URLs

## Troubleshooting

### Common Issues

1. **Database connection errors**: Check Supabase credentials and RLS policies
2. **Authentication failures**: Verify Clerk configuration and JWT settings
3. **API key errors**: Ensure all API keys are valid and have proper permissions
4. **CORS errors**: Check allowed origins in backend configuration
5. **File upload errors**: Verify file size limits and allowed types

### Debugging

Enable development mode logging by setting `NODE_ENV=development` to get detailed error messages and stack traces.