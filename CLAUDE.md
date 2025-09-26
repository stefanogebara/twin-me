# Twin AI Learn - Claude Development Guide

## Project Overview

**Twin AI Learn** is an educational platform that enables teachers to create conversational AI twins of themselves. The platform transforms traditional teaching methods by allowing educators to build interactive, voice-enabled digital twins that can engage students in natural conversations while maintaining their unique personality, teaching philosophy, and expertise.

## Core Architecture

### Technology Stack

**Frontend:**
- **React 18.3.1** with TypeScript
- **Vite 5.4.19** for build tooling
- **Tailwind CSS 3.4.17** with custom design system
- **shadcn/ui** components with Radix UI primitives
- **React Router DOM 6.30.1** for routing
- **TanStack React Query 5.83.0** for state management
- **Framer Motion 12.23.13** for animations
- **Claude's Dark Mode Color Palette** for consistent theming

**Backend:**
- **Node.js** with **Express 5.1.0**
- **Supabase** for database and authentication backend
- **Clerk** for frontend authentication
- **Express Rate Limiting** and **Helmet** for security
- **Multer** for file upload handling
- **PDF-parse** and **Mammoth** for document processing

**AI & Voice:**
- **Anthropic Claude API** (claude-3-5-sonnet model)
- **OpenAI API** for backup AI processing
- **ElevenLabs API** for voice synthesis and cloning
- Custom voice ID: `1SM7GgM6IMuvQlz2BwM3`

### Key Design Principles

1. **User Experience First**: Every feature prioritizes maximum user experience and intuitive interaction
2. **Personality vs Content Separation**: Teacher personality (humor, tone, philosophy) remains consistent while content varies by subject/class
3. **Conversational Interface**: Natural, engaging interactions replace traditional form-heavy interfaces
4. **Progressive Disclosure**: Complex processes broken into simple, guided steps
5. **Instant Value Delivery**: The first setup should be as fast as possible, delivering immediate working value

## Critical User Experience Philosophy

### Instant Twin Creation Strategy

**Speed-First Approach**: The platform should deliver value to users super quickly - within just a minute of setup. The core hypothesis is that as soon as a user provides access to their tools (APIs, email, Teams, Slack, Discord), they should immediately receive a working digital twin.

**Two Primary Approaches**:
1. **Instant Data Integration**: User connects their data sources (Google, email, messaging) → System immediately generates a functional digital twin from existing data
2. **Conversational Building**: User engages in guided conversation → System builds the twin through natural interaction

**Photo vs Film Analogy**:
- **Photo Approach**: Capture many interactions, conversations, and data access points, then deliver a comprehensive digital twin from these "snapshots"
- **Film Approach**: Continuous, real-time building where the twin evolves and improves as the user interacts more

**Key Principle**: The more the user interacts with the platform, the more the digital twin learns, masters, and becomes an accurate representation of them. However, the initial value must be delivered immediately, not after extensive setup.

## Development Environment

### Environment Configuration

```bash
# Development servers
Frontend: http://localhost:8084 (Vite dev server)
Backend: http://localhost:3001 (Express API)

# Start development
npm run dev          # Frontend only
npm run server:dev   # Backend only
npm run dev:full     # Both frontend and backend
```

### Environment Variables (.env)

**Database & Authentication:**
```env
VITE_SUPABASE_URL="https://lurebwaudisfilhuhmnj.supabase.co"
VITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
VITE_CLERK_PUBLISHABLE_KEY="pk_test_Y2xpbWJpbmctaHVtcGJhY2stOTAuY2xlcmsuYWNjb3VudHMuZGV2JA"
CLERK_SECRET_KEY="sk_test_xS9o79miaLJ2cDaeNkc8B1Rf8uCb2mbsa2b7lm7kC3"
```

**AI & Voice APIs:**
```env
ANTHROPIC_API_KEY="sk-ant-api03-VAX6b0ibtJYolr0o_eKr1B6qQrj0DXNNqnrfL58lC2g..."
OPENAI_API_KEY="sk-proj-5U_iYHSoXN4EVRUlvUWXUX09yXwSthKUWyP6UaoqYC..."
ELEVENLABS_API_KEY="9bc9bec411dede5aa204741d9664a3d23250ad5b0bdc84ab90d6afe217e33405"
VITE_ELEVENLABS_API_KEY="9bc9bec411dede5aa204741d9664a3d23250ad5b0bdc84ab90d6afe217e33405"
```

**Server Configuration:**
```env
PORT=3001
NODE_ENV=development
VITE_APP_URL=http://localhost:8084
VITE_API_URL=http://localhost:3001/api
```

## Core Features & Implementation

### 1. Conversational Twin Builder

**Location:** `src/pages/ConversationalTwinBuilder.tsx`
**Route:** `/twin-builder`

**Revolution:** Replaced 20+ form fields with 4 natural conversation questions:

1. **Teaching Philosophy**: How do you approach education?
2. **Student Interaction**: How do you connect with students?
3. **Communication Style**: What's your teaching personality?
4. **Expertise Areas**: What subjects do you specialize in?

**Key Features:**
- **Voice-First Interface**: ElevenLabs integration with voice ID `1SM7GgM6IMuvQlz2BwM3`
- **Multi-Input Support**: Text typing, voice recording, file upload
- **Real-time Voice Playback**: Questions spoken naturally by AI assistant
- **Progress Tracking**: Visual step indicator with completion states
- **Claude Dark Mode Theme**: Consistent color palette throughout

**Technical Implementation:**
```typescript
interface PersonalityData {
  teachingPhilosophy: string;
  studentInteraction: string;
  humorStyle: string;
  communicationStyle: string;
  expertise: string[];
}

const questions = [
  {
    id: 'philosophy',
    text: "Let's start with your teaching philosophy. How do you approach education?",
    field: 'teachingPhilosophy'
  },
  // ... 3 more questions
];
```

**Recording Logic:**
```typescript
const startRecording = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;

    const audioChunks: Blob[] = [];
    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };

    mediaRecorder.start();
    setIsRecording(true);
  } catch (error) {
    console.error('Error starting recording:', error);
  }
};
```

### 2. Voice Integration System

**ElevenLabs Configuration:**
- Voice ID: `1SM7GgM6IMuvQlz2BwM3`
- Automatic question playback on page load
- Real-time audio synthesis for conversational flow
- Simplified recording with visual feedback (no volume visualization)

**Audio Processing:**
```typescript
const playAudio = async (text: string) => {
  try {
    const response = await fetch(`${VITE_API_URL}/synthesize-speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice_id: '1SM7GgM6IMuvQlz2BwM3'
      })
    });

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    await audio.play();
  } catch (error) {
    console.error('Error playing audio:', error);
  }
};
```

### 3. Design System - Claude's Dark Mode

**Color Palette (CSS Custom Properties):**
```css
:root {
  --claude-bg: 210 11% 7%;           /* #111319 - Main background */
  --claude-surface: 213 11% 11%;     /* #191d26 - Card surfaces */
  --claude-surface-raised: 213 14% 16%; /* #252a36 - Elevated surfaces */
  --claude-border: 215 14% 20%;      /* #343a47 - Borders */
  --claude-text: 0 0% 90%;           /* #e5e5e5 - Primary text */
  --claude-text-muted: 218 11% 65%;  /* #9ca3af - Secondary text */
  --claude-accent: 31 81% 56%;       /* #d97706 - Orange accents */
}
```

**Implementation in Components:**
```tsx
<div className="min-h-screen bg-[hsl(var(--claude-bg))] text-[hsl(var(--claude-text))]">
  <div className="bg-[hsl(var(--claude-surface))] border border-[hsl(var(--claude-border))]">
    <p className="text-[hsl(var(--claude-text-muted))]">Secondary text</p>
    <button className="bg-[hsl(var(--claude-accent))] text-white">Action</button>
  </div>
</div>
```

### 4. File Upload & Processing

**Supported Formats:**
- **Audio**: WAV, MP3, M4A for voice samples
- **Documents**: PDF, DOCX, TXT for content materials
- **Drag & Drop Interface** with visual feedback

**Backend Processing:**
```javascript
// api/routes/twins.js
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'audio/wav', 'audio/mpeg', 'audio/mp4',
      'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    cb(null, allowedTypes.includes(file.mimetype));
  }
});
```

### 5. Authentication & Security

**Multi-Provider Setup:**
- **Clerk** for frontend user management
- **Supabase** for database authentication and RLS (Row Level Security)
- **Express Rate Limiting** for API protection

**Security Middleware:**
```javascript
// API rate limiting
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// Helmet for security headers
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.VITE_APP_URL,
  credentials: true
}));
```

## Routing Architecture

### Main Application Routes

**Public Routes:**
- `/` - Landing page (Index)
- `/auth` - Authentication page
- `/contact` - Contact form with FAQs

**Protected Routes (Require Authentication):**
- `/twin-builder` - **Conversational Twin Builder** (Primary)
- `/legacy-twin-builder` - Original form-based builder (Fallback)
- `/talk-to-twin` - Enhanced twin interaction interface
- `/chat/:twinId` - Individual twin chat interface
- `/voice-settings` - Voice configuration management
- `/get-started` - Onboarding flow
- `/professor-dashboard` - Teacher management dashboard
- `/student-dashboard` - Student interaction dashboard
- `/personal-twin-builder` - Personal twin creation
- `/watch-demo` - Product demonstration
- `/twin-activation` - Twin deployment interface

### Route Protection Pattern

```tsx
<Route path="/twin-builder" element={
  <>
    <SignedIn>
      <ConversationalTwinBuilder />
    </SignedIn>
    <SignedOut>
      <Auth />
    </SignedOut>
  </>
} />
```

## Database Schema

### Core Tables

**digital_twins**
```sql
CREATE TABLE digital_twins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  teaching_philosophy TEXT,
  student_interaction TEXT,
  humor_style TEXT,
  communication_style TEXT,
  expertise TEXT[],
  voice_id TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**conversations**
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twin_id UUID REFERENCES digital_twins(id),
  user_id TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**messages**
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  role TEXT CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## API Endpoints

### Core API Routes

**Authentication & Users:**
```
GET  /api/health              - Health check
POST /api/auth/verify         - Verify authentication token
```

**Digital Twins:**
```
GET    /api/twins             - List user's twins
POST   /api/twins             - Create new twin
GET    /api/twins/:id         - Get specific twin
PUT    /api/twins/:id         - Update twin
DELETE /api/twins/:id         - Delete twin
POST   /api/twins/:id/upload  - Upload twin documents
```

**Conversations:**
```
GET  /api/conversations/:twinId     - Get twin conversations
POST /api/conversations             - Create conversation
GET  /api/conversations/:id/messages - Get conversation messages
POST /api/conversations/:id/messages - Send message to twin
```

**Voice & AI:**
```
POST /api/synthesize-speech    - Generate voice audio
POST /api/process-audio        - Process uploaded audio
POST /api/chat                 - Direct AI interaction
```

## Development Workflows

### Adding New Features

1. **Plan with TodoWrite Tool**: Always use TodoWrite for complex features
2. **Follow Design System**: Use Claude's color palette and existing patterns
3. **Test Voice Integration**: Ensure ElevenLabs API works with new features
4. **Authentication Check**: Verify proper route protection
5. **Database Updates**: Use Supabase migrations for schema changes

### Code Standards

**TypeScript Interfaces:**
```typescript
// Always define interfaces for data structures
interface TwinData {
  id: string;
  name: string;
  teachingPhilosophy: string;
  expertise: string[];
  voiceId?: string;
}

// Use proper typing for API responses
type APIResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};
```

**Error Handling:**
```typescript
// Consistent error handling pattern
try {
  const response = await fetch('/api/twins');
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  return data;
} catch (error) {
  console.error('Error fetching twins:', error);
  // Handle error appropriately
}
```

## Troubleshooting Guide

### Common Issues

**1. AudioLevel Undefined Error**
```typescript
// Issue: References to removed audioLevel variable
// Solution: Remove or replace with static values
// Before:
transform: `scale(${1 + (audioLevel / 100) * 0.3})`
// After:
className="animate-pulse" // Use CSS animation instead
```

**2. Voice Playback Not Working**
```typescript
// Check ElevenLabs API key configuration
// Verify voice ID: 1SM7GgM6IMuvQlz2BwM3
// Ensure CORS headers allow audio requests
```

**3. Recording Button Not Stopping**
```typescript
// Simplified recording stop logic:
const stopRecording = () => {
  if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
    mediaRecorderRef.current.stop();
  }
  if (streamRef.current) {
    streamRef.current.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }
  setIsRecording(false);
};
```

### Development Commands

```bash
# Start development servers
npm run dev:full                    # Full stack development
npm run dev                         # Frontend only
npm run server:dev                  # Backend only

# Build and deploy
npm run build                       # Production build
npm run preview                     # Preview production build

# Code quality
npm run lint                        # Lint code
```

### Environment Debugging

**Check Environment Variables:**
```bash
# Verify all required environment variables are set
node -e "console.log(process.env.VITE_SUPABASE_URL)"
node -e "console.log(process.env.ANTHROPIC_API_KEY)"
node -e "console.log(process.env.ELEVENLABS_API_KEY)"
```

**Database Connection:**
```javascript
// Test Supabase connection
import { supabase } from './lib/supabase';
const { data, error } = await supabase.from('digital_twins').select('count');
console.log('Database connection:', error ? 'Failed' : 'Success');
```

## Performance Optimizations

### Frontend Optimizations

1. **Code Splitting**: Route-based code splitting with React.lazy
2. **Image Optimization**: Use WebP format with fallbacks
3. **API Caching**: TanStack Query for intelligent caching
4. **Bundle Analysis**: Regular bundle size monitoring

### Backend Optimizations

1. **Database Indexing**: Proper indexes on frequently queried columns
2. **Rate Limiting**: Prevent API abuse with express-rate-limit
3. **File Upload Limits**: Reasonable file size and type restrictions
4. **Connection Pooling**: Efficient database connection management

## Deployment Checklist

### Pre-Deployment

- [ ] All environment variables configured
- [ ] Database migrations applied
- [ ] API endpoints tested
- [ ] Voice integration verified
- [ ] Authentication flow working
- [ ] File upload tested
- [ ] Error handling implemented
- [ ] Security headers configured
- [ ] Rate limiting active

### Production Environment

```env
NODE_ENV=production
VITE_APP_URL=https://yourdomain.com
VITE_API_URL=https://api.yourdomain.com
```

## Future Roadmap

### Planned Features

1. **Advanced Voice Cloning**: Multiple voice samples for better accuracy
2. **Content Management**: Visual interface for managing twin knowledge
3. **Analytics Dashboard**: Usage metrics and engagement tracking
4. **Multi-Language Support**: Internationalization for global use
5. **Mobile Application**: Native mobile experience
6. **Integration APIs**: LMS and third-party integrations

### Technical Improvements

1. **Microservices Architecture**: Split into focused services
2. **Real-time Features**: WebSocket integration for live conversations
3. **AI Model Fine-tuning**: Custom models trained on educational data
4. **Advanced Security**: OAuth2, API versioning, enhanced monitoring
5. **Performance Monitoring**: APM integration and real-time metrics

---

## Contact & Support

**Primary Developer Contact:**
- Issues: Report bugs and feature requests via project issues
- Documentation: Update this file for any architectural changes
- Code Reviews: All changes must follow established patterns

**Key Principles to Remember:**
- **User Experience First**: Every decision should prioritize user experience
- **Conversational Over Forms**: Natural interaction patterns preferred
- **Personality Consistency**: Teacher personality remains constant across subjects
- **Voice-Enabled**: Always consider voice interaction in new features
- **Security-First**: Authentication and data protection are paramount

This project revolutionizes educational technology by making AI teacher twins as natural and engaging as talking to the actual educator. The conversational interface has transformed user engagement from 20+ tedious form fields to 4 natural questions, creating an intuitive experience that educators actually want to use.